@echo off
chcp 65001 >nul
title UltraChat para OBS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install --omit=dev
)
node --no-warnings src\server.js
pause
