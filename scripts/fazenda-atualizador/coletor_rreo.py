# -*- coding: utf-8 -*-
"""Coleta o RREO (Relatório Resumido da Execução Orçamentária) mais recente do Portal
da Transparência e extrai a apuração OFICIAL de Educação, FUNDEB e Saúde.

O portal publica um PDF por bimestre (formato SICONFI). A "Tabela 14.0 - Demonstrativo
Simplificado" traz, já calculados pela contabilidade:
  - MDE: despesa com manutenção e desenvolvimento do ensino / receita de impostos (mín. 25%)
  - FUNDEB: parcela aplicada na remuneração dos profissionais da educação (mín. 70%)
  - ASPS: despesa com ações e serviços públicos de saúde com recursos de impostos (mín. 15%)

Grava dados_rreo.json (só totais públicos; sem dado pessoal). Se a coleta ou a leitura
falhar, o arquivo anterior é mantido. Código de saída: 0 ok | 2 nada novo/erro.
"""
import datetime, json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(BASE, 'dados_rreo.json')
URL = 'https://mgnl.abaco.com.br/transparencia/servlet/wmcontaspublicas?LRF'
NO = 'RELATÓRIO RESUMIDO DA EXECUÇÃO ORÇAMENTÁRIA'


def log(m):
    print(m, flush=True)


def num(s):
    return float(s.replace('.', '').replace(',', '.'))


def texto_paginas(caminho):
    try:
        import pdfplumber
        with pdfplumber.open(caminho) as pdf:
            return [(p.extract_text() or '') for p in pdf.pages]
    except ImportError:
        from pypdf import PdfReader
        return [(p.extract_text() or '') for p in PdfReader(caminho).pages]


TRIPLA = re.compile(r'(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3},\d{2})\s+(\d{1,3},\d{2})')


def extrai(paginas):
    tudo = '\n'.join(paginas)
    ano = re.search(r'Exerc[ií]cio:\s*(\d{4})', tudo)
    bim = re.search(r'Per[ií]odo de refer[êe]ncia:\s*(\d)º bimestre', tudo)
    if not (ano and bim):
        raise ValueError('não achei exercício/bimestre no RREO')
    ano, bim = int(ano.group(1)), int(bim.group(1))
    # a Tabela 14.0 tem as seções de ensino e de saúde — procura nas páginas que as contêm
    ens = next((p for p in paginas if 'Apuração das Despesas com Ensino' in p), None)
    sau = next((p for p in paginas if 'Apuração das Despesas com Saúde' in p), None)
    if not ens or not sau:
        raise ValueError('seções de ensino/saúde não encontradas')
    ens_txt = ens[ens.index('Apuração das Despesas com Ensino'):]
    sau_txt = sau[sau.index('Apuração das Despesas com Saúde'):]
    t_ens = TRIPLA.findall(ens_txt)
    t_sau = TRIPLA.findall(sau_txt)
    if len(t_ens) < 2 or not t_sau:
        raise ValueError('valores de MDE/FUNDEB/ASPS não encontrados')
    mde, fundeb, asps = t_ens[0], t_ens[1], t_sau[0]
    out = {}
    for nome, t, mn in (('mde', mde, 25.0), ('fundeb70', fundeb, 70.0), ('asps', asps, 15.0)):
        v, minimo, pct = num(t[0]), num(t[1]), num(t[2])
        if abs(minimo - mn) > 0.001:
            raise ValueError('%s: mínimo %.2f diferente do esperado %.2f — layout mudou?' % (nome, minimo, mn))
        out[nome] = {'valor': round(v, 2), 'minimo': minimo, 'pct': pct}
    fim = {1: '28/02', 2: '30/04', 3: '30/06', 4: '31/08', 5: '31/10', 6: '31/12'}[bim]
    out.update({'ano': ano, 'bimestre': bim, 'posicao': '%s/%d' % (fim, ano),
                'fonte': 'RREO · Tabela 14.0 (Demonstrativo Simplificado)'})
    return out


def baixa_mais_recente():
    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = nav.new_context(accept_downloads=True, locale='pt-BR')
        page = ctx.new_page()
        page.set_default_timeout(90000)
        page.goto(URL, wait_until='networkidle')
        page.get_by_text(NO, exact=True).first.click()
        page.wait_for_timeout(1500)
        itens = page.locator('span.NodeTextDecoration', has_text=NO + ' - ').all_inner_texts()
        achados = []
        for t in itens:
            m = re.search(r'(\d)º BI/(\d{4})', t)
            if m:
                achados.append(((int(m.group(2)), int(m.group(1))), t))
        if not achados:
            raise RuntimeError('nenhum RREO listado')
        _, rotulo = max(achados)
        log('RREO mais recente: %s' % rotulo)
        alvo = page.get_by_text(rotulo, exact=True).first
        with page.expect_download(timeout=120000) as dl:
            alvo.click()
        destino = os.path.join(tempfile.mkdtemp(), 'rreo.pdf')
        dl.value.save_as(destino)
        nav.close()
        return destino


def main():
    try:
        pdf = baixa_mais_recente()
        dados = extrai(texto_paginas(pdf))
    except Exception as e:
        log('RREO: %s — mantendo o arquivo anterior' % str(e).splitlines()[0])
        return 2
    atual = json.load(open(DEST, encoding='utf-8')) if os.path.exists(DEST) else {'historico': {}}
    atual.setdefault('historico', {})['%d-%d' % (dados['ano'], dados['bimestre'])] = dados
    atual['ultimo'] = dados
    atual['coletado_em'] = datetime.date.today().isoformat()
    json.dump(atual, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    log('gravado: %s | MDE %.2f%% | FUNDEB %.2f%% | ASPS %.2f%% (%dº bimestre/%d)'
        % (DEST, dados['mde']['pct'], dados['fundeb70']['pct'], dados['asps']['pct'], dados['bimestre'], dados['ano']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
