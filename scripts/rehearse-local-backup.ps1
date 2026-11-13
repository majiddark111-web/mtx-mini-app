#requires -Version 7.0
param([Parameter(Mandatory)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = Get-Item -LiteralPath $ArchivePath
if ($source.Extension -ne '.mtxdpapi' -or $source.Length -gt 65MB -or ($source.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'INVALID_ENCRYPTED_ARCHIVE' }
$manifest = Get-Content -LiteralPath ($source.FullName + '.json') -Raw | ConvertFrom-Json
$hash = (Get-FileHash -LiteralPath $source.FullName).Hash
if ($hash -ne $manifest.sha256 -or $source.Name -ne $manifest.file -or $source.Length -ne $manifest.bytes) { throw 'BACKUP_MANIFEST_MISMATCH' }
$parent = Join-Path $repo '.build-verification'
$null = New-Item -ItemType Directory -Path $parent -Force
$work = Join-Path $parent ('restore-drill-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $work
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
Set-Acl -LiteralPath $work -AclObject $acl
$actualAcl = Get-Acl -LiteralPath $work
$allowedSids = @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18')
if (-not $actualAcl.AreAccessRulesProtected) { throw 'PRIVATE_PERMISSIONS_REQUIRED' }
foreach ($rule in $actualAcl.Access) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $allowedSids) { throw 'PRIVATE_PERMISSIONS_REQUIRED' }
}
[IO.File]::WriteAllText((Join-Path $work 'private-directory.marker'), 'MTX_PRIVATE_RESTORE')
$plain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($source.FullName), [Text.Encoding]::UTF8.GetBytes('MTX local backup v1'), [Security.Cryptography.DataProtectionScope]::CurrentUser)
try { [IO.File]::WriteAllBytes((Join-Path $work 'source.backup'), $plain) }
finally { [Array]::Clear($plain, 0, $plain.Length) }
Push-Location $repo
try {
    & (Join-Path $repo '.build-verification/runtime-node22/node-v22.23.3-win-x64/node.exe') (Join-Path $PSScriptRoot 'rehearse-local-backup.mjs') $work
    if ($LASTEXITCODE -ne 0) { throw 'RESTORE_FAILED_PRIVATE_ARTIFACTS_RETAINED' }
} finally { Pop-Location }
$report = Get-Content -LiteralPath (Join-Path $work 'restore-pass.json') -Raw | ConvertFrom-Json
if (-not $report.localClusterStopped) { throw 'CLEANUP_STOP_NOT_CONFIRMED' }
# Delete only this successfully stopped, randomly named rehearsal directory.
$resolved = (Resolve-Path -LiteralPath $work).Path
if ([IO.Path]::GetDirectoryName($resolved) -ne (Resolve-Path -LiteralPath $parent).Path -or [IO.Path]::GetFileName($resolved) -notmatch '^restore-drill-[a-f0-9]{32}$') { throw 'CLEANUP_PATH_REFUSED' }
if (@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw 'CLEANUP_REPARSE_REFUSED' }
Remove-Item -LiteralPath $resolved -Recurse -Force
Write-Output ('MTX_LOCAL_RESTORE_CLEANUP_PASS encrypted_sha256=' + $hash)
