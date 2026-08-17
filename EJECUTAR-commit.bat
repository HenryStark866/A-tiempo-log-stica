@echo off
title Commitear el trabajo de hoy
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0commitear-el-trabajo-de-hoy.ps1"
echo.
pause
