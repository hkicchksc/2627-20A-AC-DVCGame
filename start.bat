@echo off
cd /d "%~dp0"
echo Ways of Tuning game view: http://127.0.0.1:5174/
echo Backstage: http://127.0.0.1:5174/backstage
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:5174/"
where node >nul 2>&1 || goto missing
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*2627-20A-AC-DVCGame*serve.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
node "%~dp0serve.mjs"
goto :eof
:missing
echo Node.js was not found. Install it from https://nodejs.org and run this file again.
pause
