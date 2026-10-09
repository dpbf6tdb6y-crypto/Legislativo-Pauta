# -*- coding: utf-8 -*-
"""Coleta automática da Despesa por NATUREZA (ou por FUNÇÃO) do Portal da Transparência.

Uso:  python coletor_natureza.py            → natureza (dados_natureza.json)
      python coletor_natureza.py funcao     → função/subfunção (dados_funcao.json)


Mesma tela das Despesas por órgão (wmdespesas), só que na visão "Natureza"
(wmdespesas?17,0): um navegador automático (Playwright, sem janela) escolhe o
mês, clica em Buscar e depois no Excel. Cada mês do ano corrente é recoletado
a cada execução (meses fechados podem ser revisados).

Grava dados_natureza.json (só totais por natureza — sem dado pessoal, pode ir
pro git): { coletado_em, anos: { ano: { mes: { linhas:[[natureza, inicial,
atual, empenho, liquidação, pagamento]...], total:[...] } } } }.

Conferência: a soma das linhas tem de bater com a linha TOTAL do arquivo, senão
o mês é descartado. Diferença frente ao total de Despesas por órgão
(dados_despesas.json, coletado à parte) só gera aviso.

Códigos de saída: 0 tudo certo | 2 nada coletado (dados anteriores mantidos).
"""
import datetime, json, os, sys, time
import pandas as pd
from playwright.sync_api import sync_playwright

BASE  = os.path.dirname(os.path.abspath(__file__))
DESP  = os.path.join(BASE, 'dados_despesas.json')
CACHE = os.path.join(BASE, '_cache')
RAIZ  = 'https://mgnl.abaco.com.br/transparencia/servlet/wmdespesas?%s,0'
# visão → (código na URL, cabeçalho da 1ª coluna, nº de colunas de rótulo, arquivo)
VISOES = {
    'natureza': ('17', 'natureza', 1, 'dados_natureza.json'),
    'funcao':   ('15', 'função',   2, 'dados_funcao.json'),
}
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
         'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
TOL = 1.0   # R$ de tolerância nas conferências


def log(msg):
    print(msg, flush=True)


def le_xls(caminho, cab='natureza', nlab=1):
    """Devolve (ano, mes, linhas, total) do .xls exportado, ou None."""
    try:
        bruto = pd.read_excel(caminho, header=None)
    except Exception as e:
        log('   não consegui abrir o arquivo: %s' % e)
        return None
    try:
        ano = int(str(bruto.iat[1, 1]).strip())
        mestxt = str(bruto.iat[2, 1]).strip().upper()
    except Exception:
        return None
    nomes_mes = [m.upper() for m in MESES]
    if mestxt not in nomes_mes:
        return None
    mes = nomes_mes.index(mestxt) + 1
    if str(bruto.iat[5, 0]).strip().lower() != cab:
        log('   layout inesperado (cabeçalho não é "%s")' % cab)
        return None
    linha_total = next((i for i in range(len(bruto))
                        if str(bruto.iat[i, 0]).strip().upper().rstrip(':') == 'TOTAL'), None)
    if linha_total is None:
        return None
    tot = [round(float(v), 2) for v in pd.to_numeric(bruto.iloc[linha_total, nlab:nlab + 5], errors='coerce')]
    linhas = []
    for i in range(6, linha_total):
        rot = [str(bruto.iat[i, k]).strip() for k in range(nlab)]
        if not rot[0] or rot[0].lower() == 'nan':
            continue
        vals = pd.to_numeric(bruto.iloc[i, nlab:nlab + 5], errors='coerce')
        if vals.isna().any():
            continue
        linhas.append(rot + [round(float(v), 2) for v in vals])
    return ano, mes, linhas, tot


def exporta(page, ano, mes, destino):
    page.select_option('#W0053vFILTROANO', value=str(ano))
    page.select_option('#W0053vFILTROMES', value=str(mes))
    page.click('input[type=image][alt="Buscar"]')
    page.wait_for_load_state('networkidle', timeout=120000)
    page.wait_for_timeout(1500)
    with page.expect_download(timeout=240000) as dl:
        page.click('input[type=image][alt="Excel"]')
    dl.value.save_as(destino)


def total_orgaos(ano, mes):
    """Empenho e pagamento do mês no coletor de Despesas por órgão (ou None)."""
    try:
        d = json.load(open(DESP, encoding='utf-8'))['anos'][str(ano)][str(mes)]
        return d['emp'], d['pag']
    except Exception:
        return None


def main(visao='natureza'):
    cod, cab, nlab, arq_dest = VISOES[visao]
    URL = RAIZ % cod
    DEST = os.path.join(BASE, arq_dest)
    os.makedirs(CACHE, exist_ok=True)
    dados = json.load(open(DEST, encoding='utf-8')) if os.path.exists(DEST) else {'coletado_em': '', 'anos': {}}
    hoje = datetime.date.today()
    ano = hoje.year
    novos = {}
    alvos = [(ano, m) for m in range(1, hoje.month + 1)]
    if visao == 'natureza':
        # Despesa com pessoal usa janela móvel de 12 meses (LRF art. 18, §2º): os meses
        # do ano anterior que entram na janela também são coletados (uma vez só —
        # mês de ano anterior já fechado não é recoletado).
        _ja = dados.get('anos', {}).get(str(ano - 1), {})
        alvos = [(ano - 1, m) for m in range(hoje.month, 13) if str(m) not in _ja] + alvos

    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = nav.new_context(accept_downloads=True, locale='pt-BR')
        page = ctx.new_page()
        page.set_default_timeout(120000)
        page.goto(URL, wait_until='networkidle')
        for ano_i, mes in alvos:
            rotulo = '%s/%d' % (MESES[mes - 1], ano_i)
            arq = os.path.join(CACHE, '%s_%d_%02d.xls' % (visao, ano_i, mes))
            try:
                exporta(page, ano_i, mes, arq)
            except Exception as e:
                log('  %s: falhou ao exportar (%s)' % (rotulo, str(e).splitlines()[0]))
                continue
            info = le_xls(arq, cab, nlab)
            if not info:
                log('  %s: arquivo ilegível, ignorado' % rotulo)
                continue
            a, m, linhas, tot = info
            if (a, m) != (ano_i, mes):
                log('  %s: o arquivo veio de %d/%02d, ignorado' % (rotulo, a, m))
                continue
            if abs(tot[2] + tot[3] + tot[4]) < TOL:
                log('  %s: sem execução ainda, ignorado' % rotulo)
                continue
            soma = [round(sum(l[nlab + i] for l in linhas), 2) for i in range(5)]
            if any(abs(soma[i] - tot[i]) > TOL for i in range(5)):
                log('  %s: soma das linhas não bate com o TOTAL do arquivo, ignorado' % rotulo)
                continue
            ref = total_orgaos(ano_i, mes)
            if ref and (abs(ref[0] - tot[2]) > TOL or abs(ref[1] - tot[4]) > TOL):
                # dados_despesas.json (órgãos) é coletado à parte e pode estar defasado
                # — só avisa; a conferência que descarta é a soma das linhas = TOTAL.
                log('  AVISO %s: empenho/pagamento (%.2f / %.2f) diferem do total por órgão já coletado (%.2f / %.2f)'
                    % (rotulo, tot[2], tot[4], ref[0], ref[1]))
            novos.setdefault(str(ano_i), {})[str(mes)] = {'linhas': linhas, 'total': tot}
            log('  %s: %d linhas | empenho R$ %s' % (rotulo, len(linhas), format(tot[2], ',.2f')))
            time.sleep(3)
        nav.close()

    if not novos:
        log('Nada coletado — dados anteriores mantidos.')
        return 2
    for a_, meses_ in novos.items():
        dados.setdefault('anos', {}).setdefault(a_, {}).update(meses_)
    dados['coletado_em'] = hoje.isoformat()
    json.dump(dados, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    log('gravado: %s' % DEST)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else 'natureza'))
