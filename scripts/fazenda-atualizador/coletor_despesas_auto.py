# -*- coding: utf-8 -*-
"""Coleta automática das Despesas por ÓRGÃO (total e por secretaria, mês a mês).

Substitui o "modo vigia" do coletor_despesas.py: um navegador automático
(Playwright, sem janela) abre wmdespesas?0,0, escolhe o mês, clica em Buscar
e depois no Excel — a mesma coisa que uma pessoa faria. Cada mês do ano
corrente é recoletado a cada execução (meses fechados podem ser revisados).

Grava no MESMO formato que o painel já lê (dados_despesas.json):
  anos → ano → mês → {ini, atual, emp, liq, pag, orgaos:[[nome, ini, atual,
  emp, liq, pag], ...]}
Meses que não foram recoletados (ex.: ainda sem execução) ficam como estavam.

Conferência: a soma das secretarias tem de bater com a linha TOTAL do arquivo,
senão o mês é descartado. Códigos de saída: 0 ok | 2 nada coletado.
"""
import datetime, json, os, sys, time
from playwright.sync_api import sync_playwright
from coletor_natureza import le_xls, exporta, log, MESES, TOL, CACHE, RAIZ

BASE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(BASE, 'dados_despesas.json')
URL = RAIZ % '0'


def main():
    os.makedirs(CACHE, exist_ok=True)
    dados = json.load(open(DEST, encoding='utf-8')) if os.path.exists(DEST) else {'coletado_em': '', 'anos': {}}
    hoje = datetime.date.today()
    ano = hoje.year
    novos = {}

    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = nav.new_context(accept_downloads=True, locale='pt-BR')
        page = ctx.new_page()
        page.set_default_timeout(120000)
        page.goto(URL, wait_until='networkidle')
        for mes in range(1, hoje.month + 1):
            rotulo = '%s/%d' % (MESES[mes - 1], ano)
            arq = os.path.join(CACHE, 'orgao_%d_%02d.xls' % (ano, mes))
            try:
                exporta(page, ano, mes, arq)
            except Exception as e:
                log('  %s: falhou ao exportar (%s)' % (rotulo, str(e).splitlines()[0]))
                continue
            info = le_xls(arq, 'órgão', 1)
            if not info:
                log('  %s: arquivo ilegível, ignorado' % rotulo)
                continue
            a, m, linhas, tot = info
            if (a, m) != (ano, mes):
                log('  %s: o arquivo veio de %d/%02d, ignorado' % (rotulo, a, m))
                continue
            if abs(tot[2] + tot[3] + tot[4]) < TOL:
                log('  %s: sem execução ainda, ignorado' % rotulo)
                continue
            soma = [round(sum(l[1 + i] for l in linhas), 2) for i in range(5)]
            if any(abs(soma[i] - tot[i]) > TOL for i in range(5)):
                log('  %s: soma das secretarias não bate com o TOTAL do arquivo, ignorado' % rotulo)
                continue
            novos[str(mes)] = {'ini': tot[0], 'atual': tot[1], 'emp': tot[2], 'liq': tot[3],
                               'pag': tot[4], 'orgaos': linhas}
            log('  %s: %d órgãos | empenho R$ %s | pago R$ %s'
                % (rotulo, len(linhas), format(tot[2], ',.2f'), format(tot[4], ',.2f')))
            time.sleep(3)
        nav.close()

    if not novos:
        log('Nada coletado — dados anteriores mantidos.')
        return 2
    dados.setdefault('anos', {}).setdefault(str(ano), {}).update(novos)
    dados['coletado_em'] = hoje.isoformat()
    json.dump(dados, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    log('gravado: %s' % DEST)
    return 0


if __name__ == '__main__':
    sys.exit(main())
