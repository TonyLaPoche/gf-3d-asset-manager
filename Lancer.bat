@echo off
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo Installez Node.js 20 ou plus recent : https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm install
if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
if errorlevel 1 (
  echo L'installation a echoue.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 pause
