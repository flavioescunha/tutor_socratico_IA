@echo off
title Tutor Socrático IA - Servidor Local
echo Iniciando o Tutor Socrático IA...
echo.

IF NOT EXIST venv (
    echo [1/3] Criando ambiente virtual - aguarde, isso so acontece na primeira vez...
    python -m venv venv
)

echo [2/3] Ativando ambiente e verificando dependencias (aguarde)...
call venv\Scripts\activate.bat
pip install -r requirements.txt > nul

echo [3/3] Iniciando o servidor web...
echo.
echo =========================================================
echo APLICACAO RODANDO!
echo.
echo Para acessar como ALUNO:     http://localhost:8000
echo Para acessar como PROFESSOR: http://localhost:8000/admin/login
echo.
echo Mantenha esta janela aberta enquanto estiver testando.
echo Para desligar o servidor, clique na janela e pressione Ctrl+C
echo =========================================================
echo.
uvicorn app.main:app --reload

echo.
echo O servidor foi encerrado ou ocorreu um erro.
pause
