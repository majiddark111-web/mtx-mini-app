#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Setup', 'Backup', 'Verify', 'Export', 'SelfTest')][string]$Mode = 'Backup',
    [string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$backupRoot = Join-Path $env:LOCALAPPDATA 'MTX\Backups'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$entropy = [Text.Encoding]::UTF8.GetBytes('MTX local backup v1')
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
$limit = 64MB

function New-PrivateDirectory([string]$Path) {
    if (Test-Path -LiteralPath $Path) { throw 'DIRECTORY_ALREADY_EXISTS' }
    $null = New-Item -ItemType Directory -Path $Path
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-PrivateDirectory([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_POINT_REFUSED' }
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) { throw 'PRIVATE_PERMISSIONS_REQUIRED' }
    $allowed = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'PRIVATE_PERMISSIONS_REQUIRED' }
    }
}
function Invoke-Pg([string]$Name, [string[]]$Arguments, [hashtable]$Variables = @{}) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $pgBin ($Name + '.exe')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $quoted = foreach ($argument in $Arguments) {
        if ($argument.Contains('"') -or $argument.EndsWith('\')) { throw 'UNSAFE_ARGUMENT' }
        '"' + $argument + '"'
    }
    $start.Arguments = $quoted -join ' '
    # Ignore ambient PG settings, service files and passwords from other tasks.
    foreach ($key in @($start.EnvironmentVariables.Keys)) { if ($key -like 'PG*') { $start.EnvironmentVariables.Remove($key) } }
    foreach ($key in $Variables.Keys) { $start.EnvironmentVariables[$key] = [string]$Variables[$key] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        $null = $process.Start()
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(300000)) { $process.Kill(); $process.WaitForExit(); throw 'PROCESS_TIMEOUT' }
        $text = $output.GetAwaiter().GetResult()
        $null = $errors.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) { throw 'POSTGRES_COMMAND_FAILED' }
        return $text
    } finally { $start.EnvironmentVariables.Clear(); $process.Dispose() }
}
function Check-Archive([string]$Path) {
    $file = Get-Item -LiteralPath $Path
    if ($file.Length -lt 5 -or $file.Length -gt $limit) { throw 'ARCHIVE_SIZE_LIMIT' }
    $null = Invoke-Pg 'pg_restore' @('--list', $Path)
    # Decode all archive contents without connecting to or writing to a database.
    $null = Invoke-Pg 'pg_restore' @('--file=NUL', $Path)
}
function Protect-Archive([string]$Source, [string]$Destination) {
    if ((Get-Item -LiteralPath $Source).Length -gt $limit) { throw 'ARCHIVE_SIZE_LIMIT' }
    $plain = [IO.File]::ReadAllBytes($Source)
    try {
        $cipher = [Security.Cryptography.ProtectedData]::Protect($plain, $entropy, $scope)
        $stream = [IO.File]::Open($Destination, 'CreateNew', 'Write', 'None')
        try { $stream.Write($cipher, 0, $cipher.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    } finally { [Array]::Clear($plain, 0, $plain.Length) }
}
function Unprotect-Archive([string]$Source, [string]$Destination) {
    if ((Get-Item -LiteralPath $Source).Length -gt ($limit + 1MB)) { throw 'ARCHIVE_SIZE_LIMIT' }
    $plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Source), $entropy, $scope)
    try {
        $stream = [IO.File]::Open($Destination, 'CreateNew', 'Write', 'None')
        try { $stream.Write($plain, 0, $plain.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    } finally { [Array]::Clear($plain, 0, $plain.Length) }
}
function Remove-WorkDirectory([string]$Path, [string]$ParentPath) {
    $full = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath($ParentPath).TrimEnd('\') + '\'
    if (-not $full.StartsWith($parent, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($full) -notmatch '^work-[a-f0-9]{32}$') { throw 'CLEANUP_PATH_REFUSED' }
    # Only remove files created by this invocation. Never recurse into anything.
    foreach ($name in @('source.backup', 'check.backup', 'test.mtxdpapi', 'tampered.mtxdpapi', 'fixture.bin', 'fixture-check.bin')) {
        $file = Join-Path $full $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    }
    [IO.Directory]::Delete($full, $false)
}

$work = $null
$workParent = $null
$lock = $null
try {
    if ($env:OS -ne 'Windows_NT') { throw 'WINDOWS_REQUIRED' }
    if ($Mode -eq 'SelfTest') {
        $workParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.build-verification'))
        $null = New-Item -ItemType Directory -Path $workParent -Force
        $work = Join-Path $workParent ('work-' + [Guid]::NewGuid().ToString('N'))
        New-PrivateDirectory $work
        Assert-PrivateDirectory $work
        $fixture = Join-Path $work 'fixture.bin'
        [IO.File]::WriteAllBytes($fixture, [Text.Encoding]::UTF8.GetBytes('synthetic backup verification; no live data'))
        $encrypted = Join-Path $work 'test.mtxdpapi'
        $checked = Join-Path $work 'fixture-check.bin'
        Protect-Archive $fixture $encrypted
        Unprotect-Archive $encrypted $checked
        if ((Get-FileHash $fixture).Hash -ne (Get-FileHash $checked).Hash) { throw 'ROUNDTRIP_FAILED' }
        $originalHash = (Get-FileHash $encrypted).Hash
        $rejected = $false
        try { Protect-Archive $fixture $encrypted } catch { $rejected = $true }
        if (-not $rejected -or (Get-FileHash $encrypted).Hash -ne $originalHash) { throw 'OVERWRITE_ACCEPTED' }
        $bytes = [IO.File]::ReadAllBytes($encrypted); $bytes[$bytes.Length - 1] = $bytes[$bytes.Length - 1] -bxor 1
        $tampered = Join-Path $work 'tampered.mtxdpapi'; [IO.File]::WriteAllBytes($tampered, $bytes)
        $rejected = $false
        try { Unprotect-Archive $tampered (Join-Path $work 'check.backup') } catch { $rejected = $true }
        if (-not $rejected) { throw 'TAMPER_ACCEPTED' }
        $rejected = $false
        try { Check-Archive $fixture } catch { $rejected = $true }
        if (-not $rejected) { throw 'INVALID_ARCHIVE_ACCEPTED' }
        if ($ArchivePath) {
            Check-Archive $ArchivePath
            Remove-Item -LiteralPath $encrypted
            Remove-Item -LiteralPath $checked
            Protect-Archive $ArchivePath $encrypted
            Unprotect-Archive $encrypted $checked
            if ((Get-FileHash $ArchivePath).Hash -ne (Get-FileHash $checked).Hash) { throw 'ARCHIVE_ROUNDTRIP_FAILED' }
            Check-Archive $checked
        }
        Write-Output 'MTX_LOCAL_BACKUP_SELFTEST_PASS: encryption roundtrip, tamper/overwrite rejection, invalid archive rejection, private permissions'
    } else {
        if (-not (Test-Path -LiteralPath $backupRoot)) {
            if ($Mode -ne 'Setup') { throw 'SETUP_REQUIRED' }
            New-PrivateDirectory $backupRoot
        }
        Assert-PrivateDirectory $backupRoot
        $lock = [IO.File]::Open((Join-Path $backupRoot 'run.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
        $credentialPath = Join-Path $backupRoot 'connection.clixml'
        $rootsPath = Join-Path $backupRoot 'trusted-roots.pem'
        if ($Mode -eq 'Setup') {
            # The user enters this locally, never in chat, argv, or a connection URL.
            $password = Read-Host 'Current Neon password for neondb_owner (hidden)' -AsSecureString
            if ($password.Length -eq 0) { throw 'EMPTY_PASSWORD' }
            $credential = [Management.Automation.PSCredential]::new('neondb_owner', $password)
            $credential | Export-Clixml -LiteralPath $credentialPath
            $certificates = foreach ($location in @('CurrentUser', 'LocalMachine')) {
                $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', $location)
                try {
                    $store.Open('ReadOnly')
                    foreach ($cert in $store.Certificates) {
                        "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----"
                    }
                } finally { $store.Dispose() }
            }
            if (-not $certificates) { throw 'TRUST_ROOTS_MISSING' }
            [IO.File]::WriteAllText($rootsPath, ($certificates -join "`n"))
            Write-Output 'MTX_LOCAL_BACKUP_SETUP_SAVED: connection not yet tested'
        } else {
            $workParent = $backupRoot
            $work = Join-Path $backupRoot ('work-' + [Guid]::NewGuid().ToString('N'))
            New-PrivateDirectory $work
            $checked = Join-Path $work 'check.backup'
            if ($Mode -in @('Verify', 'Export')) {
                $path = [IO.Path]::GetFullPath($ArchivePath)
                if ([IO.Path]::GetDirectoryName($path) -ne [IO.Path]::GetFullPath($backupRoot) -or [IO.Path]::GetExtension($path) -ne '.mtxdpapi') { throw 'VERIFY_PATH_REFUSED' }
                Unprotect-Archive $path $checked
                Check-Archive $checked
                if ($Mode -eq 'Export') {
                    $export = Join-Path $backupRoot ('recovered-' + [Guid]::NewGuid().ToString('N') + '.backup')
                    [IO.File]::Move($checked, $export)
                    Write-Output ('MTX_LOCAL_BACKUP_EXPORT_PASS ' + $export)
                    Write-Output 'This export is plaintext in the private folder. Restore only into a NEW EMPTY isolated database.'
                } else { Write-Output 'MTX_LOCAL_BACKUP_VERIFY_PASS: decrypted and fully decoded; not a database restore' }
            } else {
                if (-not (Test-Path -LiteralPath $credentialPath) -or -not (Test-Path -LiteralPath $rootsPath)) { throw 'SETUP_REQUIRED' }
                $total = (Get-ChildItem -LiteralPath $backupRoot -Recurse -File | Measure-Object Length -Sum).Sum
                if ($total -ge 2GB) { throw 'STORAGE_LIMIT_REVIEW_REQUIRED' }
                $version = Invoke-Pg 'pg_dump' @('--version')
                if ($version -notmatch 'PostgreSQL\) 18\.') { throw 'POSTGRES_18_REQUIRED' }
                $credential = Import-Clixml -LiteralPath $credentialPath
                $variables = @{
                    PGHOST = 'ep-shy-frost-aoj2cl9v.c-2.ap-southeast-1.aws.neon.tech'; PGPORT = '5432'
                    PGDATABASE = 'mtx_final_20261101'; PGUSER = 'neondb_owner'
                    PGPASSWORD = $credential.GetNetworkCredential().Password
                    PGSSLMODE = 'verify-full'; PGSSLROOTCERT = $rootsPath; PGCHANNELBINDING = 'require'
                    PGCONNECT_TIMEOUT = '15'; PGAPPNAME = 'mtx-local-backup'
                    PGTZ = 'UTC'
                    PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=240000'
                }
                $source = Join-Path $work 'source.backup'
                try { $null = Invoke-Pg 'pg_dump' @('--no-password', '--format=custom', '--lock-wait-timeout=10000', '--file', $source) $variables }
                finally { $variables.Clear(); $credential = $null }
                Check-Archive $source
                $id = 'mtx-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
                $partial = Join-Path $backupRoot ($id + '.partial')
                Protect-Archive $source $partial
                Unprotect-Archive $partial $checked
                if ((Get-FileHash $source).Hash -ne (Get-FileHash $checked).Hash) { throw 'ARCHIVE_ROUNDTRIP_FAILED' }
                Check-Archive $checked
                $final = Join-Path $backupRoot ($id + '.mtxdpapi')
                [IO.File]::Move($partial, $final)
                $report = @{ completedUtc = [DateTime]::UtcNow.ToString('o'); file = [IO.Path]::GetFileName($final); sha256 = (Get-FileHash $final).Hash; bytes = (Get-Item $final).Length; archiveDecoded = $true; databaseRestored = $false }
                [IO.File]::WriteAllText(($final + '.json'), ($report | ConvertTo-Json))
                Write-Output ('MTX_LOCAL_BACKUP_PASS ' + $final)
                Write-Output 'Archive and encryption verified. A separate isolated restore drill is still required.'
            }
        }
    }
} catch {
    $code = $_.Exception.Message
    if ($code -notmatch '^[A-Z][A-Z0-9_]+$') { $code = 'LOCAL_OPERATION_FAILED' }
    Write-Output ('MTX_LOCAL_BACKUP_FAIL ' + $code)
    exit 1
} finally {
    if ($work) { Remove-WorkDirectory $work $workParent }
    if ($lock) { $lock.Dispose() }
}
