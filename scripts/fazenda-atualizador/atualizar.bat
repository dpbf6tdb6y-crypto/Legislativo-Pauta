@echo off
cd /d "%~dp0"
echo =================================================
echo  Atualizando o Painel - Prefeitura de Nova Lima
echo =================================================
echo.
echo [1/4] Receita (ano e mes a mes)...
python coletor.py
if errorlevel 1 goto erro
echo.
echo [2/4] Contratos...
python coletor_contratos.py
if errorlevel 1 goto erro
echo.
echo [3/4] Folha de pessoal...
python coletor_folha.py
if errorlevel 2 echo    (segue sem atualizar a folha - veja a mensagem acima)
echo.
echo [4/4] Montando o painel...
python gerar_painel.py
if errorlevel 1 goto erro
echo.
echo Pronto. Abra o Painel_Receita_Despesas.html na pasta de cima.
pause
exit /b 0
:erro
echo.
echo *** Algo falhou. Confira as mensagens acima. ***
pause
exit /b 1
