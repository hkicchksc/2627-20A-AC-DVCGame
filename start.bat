@echo off
cd /d "%~dp0"
if /i "%~1"=="openchrome" goto openchrome
echo Ways of Tuning game view: http://127.0.0.1:5174/
echo Backstage: http://127.0.0.1:5174/backstage
set "URL=http://127.0.0.1:5174/"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME echo Chrome was not found.
start "" cmd /c timeout /t 1 /nobreak ^>nul ^& call "%~f0" openchrome
where node >nul 2>&1 || goto missing
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*2627-20A-AC-DVCGame*serve.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
node "%~dp0serve.mjs"
goto :eof
:openchrome
if not defined CHROME goto openfallback
start "" "%CHROME%" --new-window --start-fullscreen "%URL%"
goto :eof
:openfallback
start "" "%URL%"
goto :eof
:missing
echo Node.js was not found. Install it from https://nodejs.org and run this file again.
pause
