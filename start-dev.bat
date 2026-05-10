@echo off
title Acai Rapidola - Dev (API + Frontend)
echo ========================================
echo   Acai Rapidola - Modo Desenvolvimento
echo ========================================
echo.
echo Iniciando servidor na porta 3001...
echo Frontend na porta 5173...
echo.
cd /d "%~dp0"
start "Acai API" cmd /c "cd server && npm run dev"
start "Acai Frontend" cmd /c "cd client && npx vite --host"
echo.
echo Aguarde os servidores iniciarem...
echo API: http://localhost:3001
echo Frontend: http://localhost:5173
pause
