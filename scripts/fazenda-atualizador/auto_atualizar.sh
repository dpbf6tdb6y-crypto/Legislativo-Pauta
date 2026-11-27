#!/bin/bash
# Atualização automática dos DADOS do painel Fazenda (Compliance > Painel
# anterior) — roda por cron no VPS.
#
# NÃO baixa código, NÃO compila e NÃO reinicia o sistema: publicar versão nova
# é sempre manual. O código usado aqui é o que já está no servidor.
#
# Sequência: coleta os dados → gera o painel → troca o arquivo
# private/fazenda/painel.html → confere se o sistema enxerga o painel novo →
# devolve os arquivos de dados ao estado do último commit, pra não conflitar
# com o "git pull" da próxima publicação manual.
#
# O sistema lê esse arquivo do disco a cada acesso: o docker-compose monta
# ./private do servidor dentro do container (somente leitura).
#
# A coleta de Pessoal usa navegador automático (Playwright) e pode falhar
# se o portal estiver instável — nesse caso o painel é gerado com os dados
# de Pessoal que já existiam (a planilha RH_*.xls fica só no disco do
# servidor, fora do git, nunca comitada).
set -e
cd /app-segov
LOG=/app-segov/scripts/fazenda-atualizador/auto_atualizar.log
echo "===== $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG"

# Devolve só os arquivos de dados ao estado do commit (um por um: um arquivo que
# ainda não esteja no git não impede os outros). Outras mudanças no disco ficam.
devolver_dados() {
  for nome in receita contratos pessoal natureza funcao despesas rreo siconfi; do
    git -C /app-segov checkout -- "scripts/fazenda-atualizador/dados_$nome.json" >> "$LOG" 2>&1 || true
  done
}
devolver_dados          # sobra de uma execução interrompida
trap devolver_dados EXIT

cd scripts/fazenda-atualizador
# Falha de coleta (portal lento/fora do ar) não impede a geração do painel:
# ele segue com os dados que já existiam e o aviso fica no log.
# Receita e despesas por órgão: arquivos XML do portal (filtro conferido, soma conferida, SHA-256 guardado).
# Se a coleta por XML falhar, cai nos coletores antigos (PDF de receita / Excel de despesas) como reserva.
.venv/bin/python3 coletor_xml.py receita >> "$LOG" 2>&1 || {
  echo "AVISO: coleta de Receita por XML falhou — usando o coletor antigo (PDF)" >> "$LOG"
  .venv/bin/python3 coletor.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Receita falhou — mantendo os dados anteriores" >> "$LOG"
}
.venv/bin/python3 coletor_xml.py contratos >> "$LOG" 2>&1 || {
  echo "AVISO: coleta de Contratos por XML falhou — usando o coletor antigo (PDF)" >> "$LOG"
  .venv/bin/python3 coletor_contratos.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Contratos falhou — mantendo os dados anteriores" >> "$LOG"
}
.venv/bin/python3 coletor_pessoal.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Pessoal falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 coletor_xml.py despesas >> "$LOG" 2>&1 || {
  echo "AVISO: coleta de Despesas por XML falhou — usando o coletor antigo (Excel)" >> "$LOG"
  .venv/bin/python3 coletor_despesas_auto.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Despesas por órgão falhou — mantendo os dados anteriores" >> "$LOG"
}
.venv/bin/python3 coletor_natureza.py >> "$LOG" 2>&1 || echo "AVISO: coleta de Natureza falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 coletor_natureza.py funcao >> "$LOG" 2>&1 || echo "AVISO: coleta de Função falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 coletor_rreo.py >> "$LOG" 2>&1 || echo "AVISO: coleta do RREO falhou — mantendo os dados anteriores" >> "$LOG"
.venv/bin/python3 coletor_siconfi.py >> "$LOG" 2>&1 || echo "AVISO: coleta do SICONFI falhou — mantendo os dados anteriores" >> "$LOG"
# testes dos cálculos e dos leitores: só avisam no log (não impedem a geração do painel)
.venv/bin/python3 -m unittest discover -s tests >> "$LOG" 2>&1 || echo "AVISO: testes dos calculos do painel falharam — conferir o log acima" >> "$LOG"
.venv/bin/python3 gerar_painel.py >> "$LOG" 2>&1
mkdir -p ../../private/fazenda
# troca de uma vez só, para ninguém abrir um painel pela metade; 644 = o usuário do container consegue ler
cp ../Painel_Receita_Despesas.html ../../private/fazenda/painel.html.novo
chmod 644 ../../private/fazenda/painel.html.novo
mv -f ../../private/fazenda/painel.html.novo ../../private/fazenda/painel.html

cd /app-segov
no_disco=$(sha256sum private/fazenda/painel.html | cut -d' ' -f1)
no_sistema=$(docker compose exec -T app sha256sum /app/private/fazenda/painel.html 2>> "$LOG" | cut -d' ' -f1) || true
if [ "$no_disco" = "$no_sistema" ]; then
  echo "conferido: o sistema já lê o painel novo" >> "$LOG"
  echo "concluído" >> "$LOG"
else
  echo "AVISO: o painel foi gerado, mas não deu para confirmar que o sistema o lê — conferir o container app" >> "$LOG"
  exit 1
fi
