#!/bin/bash
# Coleta noturna da Gestão $$$ no servidor (cron às 02:30, depois que o portal se atualiza, ~01:45).
#   30 2 * * * /bin/bash /app-segov/scripts/financas/coletar.sh
# Carga inicial (uma vez, demora horas):
#   /bin/bash /app-segov/scripts/financas/coletar.sh --inicial
# Anos fechados (uma vez, demora horas):
#   /bin/bash /app-segov/scripts/financas/coletar.sh --historico 2020-2025
#
# - flock: uma coleta de cada vez (a carga inicial pode durar mais que um dia).
# - limite de tempo: a noturna para em 6h e a carga inicial/histórico em 24h (LIMITE_COLETA=12h muda numa execução).
#   Sem isso, uma coleta travada (ex.: download da folha parado) segurava o flock para sempre e todas as
#   seguintes eram ignoradas sem aviso. Ao estourar o limite, o contêiner é removido e o log registra o motivo.
# - o contêiner "coletor" só existe enquanto a coleta roda (--rm).
# - no fim, apaga do disco os arquivos baixados com mais de 30 dias (o SHA-256 fica no banco).
set -u
cd /app-segov
mkdir -p dados-financas/logs
LOG=/app-segov/dados-financas/logs/coleta-$(date '+%Y-%m-%d').log

exec 9>/tmp/segov-financas-coleta.lock
if ! flock -n 9; then
  echo "$(date '+%F %T') outra coleta da Gestão \$\$\$ ainda está rodando: esta foi ignorada" >> "$LOG"
  exit 0
fi

echo "===== $(date '+%F %T') =====" >> "$LOG"
# reconstrói a imagem só se o código mudou (cache do Docker); falha aqui não apaga a imagem anterior
docker compose --profile coletor build coletor >> "$LOG" 2>&1 || echo "AVISO: build do coletor falhou, usando a imagem anterior" >> "$LOG"
LIMITE=${LIMITE_COLETA:-6h}
case " $* " in *" --inicial "*|*" --historico "*) LIMITE=${LIMITE_COLETA:-24h} ;; esac
NOME=segov-coletor-coleta
docker rm -f "$NOME" > /dev/null 2>&1   # sobra de uma execução anterior (o flock garante que nenhuma coleta está viva)
timeout -k 60 "$LIMITE" docker compose --profile coletor run --rm -T --name "$NOME" coletor npx tsx scripts/financas/coletar.ts "$@" >> "$LOG" 2>&1
STATUS=$?
if [ "$STATUS" -eq 124 ] || [ "$STATUS" -eq 137 ]; then
  echo "ERRO: a coleta passou do limite de $LIMITE e foi encerrada" >> "$LOG"
  docker rm -f "$NOME" >> "$LOG" 2>&1   # encerrar o cliente do docker não garante parar o contêiner
fi
docker compose --profile coletor run --rm -T coletor npx tsx scripts/financas/limpar-brutos.ts --dias 30 >> "$LOG" 2>&1 \
  || echo "AVISO: limpeza dos arquivos antigos falhou" >> "$LOG"
echo "$(date '+%F %T') fim (código $STATUS)" >> "$LOG"

# logs da coleta: guarda 90 dias
find /app-segov/dados-financas/logs -name 'coleta-*.log' -mtime +90 -delete 2>/dev/null
exit $STATUS
