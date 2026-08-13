@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Git Commit - Tutor Socratico IA
echo ========================================
echo.
set /p "MSG=Mensagem do commit: "
if "%MSG%"=="" (
    echo Mensagem vazia. Operacao cancelada.
    pause
    exit /b 1
)
git add -A
git commit -m "%MSG%"
echo.
pause
