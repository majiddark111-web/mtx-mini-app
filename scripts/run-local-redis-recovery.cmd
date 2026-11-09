@echo off
setlocal
rem Explicitly target only the dedicated local test Redis. Never use REDIS_URL.
set "MTX_LOCAL_REDIS_TEST_ALLOW_WRITE=true"
set "MTX_LOCAL_REDIS_TEST_URL=redis://127.0.0.1:56379/0"
set "MTX_RECOVERY_NODE=%~dp0..\.build-verification\runtime-node22\node-v22.23.3-win-x64\node.exe"
set "MTX_RECOVERY_SCRIPT=%~dp0..\server\integration\redisRecovery.mjs"
if not exist "%MTX_RECOVERY_NODE%" (
  echo MTX_LOCAL_REDIS_LAUNCH_FAIL NODE_RUNTIME_NOT_FOUND
  exit /b 1
)
if not exist "%MTX_RECOVERY_SCRIPT%" (
  echo MTX_LOCAL_REDIS_LAUNCH_FAIL TEST_SCRIPT_NOT_FOUND
  exit /b 1
)
"%MTX_RECOVERY_NODE%" --experimental-strip-types "%MTX_RECOVERY_SCRIPT%"
exit /b %errorlevel%
