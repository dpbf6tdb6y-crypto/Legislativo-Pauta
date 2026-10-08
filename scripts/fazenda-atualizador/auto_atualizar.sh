#!/bin/bash
# Atualização automática do painel Fazenda (Receita, Contratos e Pessoal) —
# roda por cron no VPS. Despesas continua manual por enquanto (ver
# LEIA-ME.txt).
#
# Sequência: puxa o código mais novo → coleta Receita/Contratos/Pessoal →
# gera o painel → builda e reinicia o container → devolve os arquivos
# gerados ao estado do último commit, pra não conflitar com o próximo "git
# pull" de quem for fazer deploy manual de outra coisa depois.
#
# A coleta de Pessoal usa navegador automático (Playwright) e pode falhar
# se o portal estiver instável — nesse caso o painel é gerado com os dados
# de Pessoal que já existiam (a planilha RH_*.xls fica só no disco do
# servidor, fora do git, nunca comitada).
set -e
cd /app-segov
LOG=/app-segov/scripts/fazenda-atualizador/auto_atualizar.log
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG"

git checkout -- . >> "$LOG" 2>&1
git pull >> "$LOG" 2>&1

cd scripts/fazenda-atualizador
.venv/bin/python3 coletor.py >> "$LOG" 2>&1
.venv/bin/python3 coletor_contratos.py >> "$LOG" 2>&1
.venv/bin/python3 coletor_pessoal.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Pessoal falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 coletor_natureza.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Natureza falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 gerar_painel.py >> "$LOG" 2>&1
mkdir -p ../../private/fazenda
cp ../Painel_Receita_Despesas.html ../../private/fazenda/painel.html

cd /app-segov
docker compose build app >> "$LOG" 2>&1
docker compose up -d app >> "$LOG" 2>&1
sleep 15
docker compose ps app >> "$LOG" 2>&1
curl -s -o /dev/null -w 'health check: HTTP %{http_code}\n' http://localhost:3002/api/health >> "$LOG" 2>&1

# Devolve os arquivos regenerados ao estado do commit — o container já foi
# construído com a versão nova, isso é só pra manter o "git status" limpo.
git checkout -- scripts/fazenda-atualizador/dados_receita.json \
                scripts/fazenda-atualizador/dados_contratos.json \
                scripts/fazenda-atualizador/dados_pessoal.json \
                scripts/fazenda-atualizador/dados_natureza.json >> "$LOG" 2>&1

echo "concluído" >> "$LOG"
