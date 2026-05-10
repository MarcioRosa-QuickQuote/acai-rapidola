@echo off
title Acai Rapidola - Servidor
cd /d "%~dp0server"
echo ========================================
echo   Acai Rapidola - Iniciando servidor
echo ========================================
echo.
call npm run dev
pause
