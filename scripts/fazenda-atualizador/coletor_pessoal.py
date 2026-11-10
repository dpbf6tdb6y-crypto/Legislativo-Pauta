# -*- coding: utf-8 -*-
"""Coleta automática dos totais de Pessoal do Portal da Transparência.

A tela de Servidores (wmservidores) é dinâmica (GeneXus, com sessão) e só
entrega o dado completo pelo ícone do Excel — por isso aqui um navegador
automático (Playwright, sem janela) faz o que uma pessoa faria: escolhe
ano/mês, clica em Buscar e depois no Excel, e o arquivo é baixado direto.

Coleta o mês mais recente publicado (o próprio portal já abre nele) e os anteriores;
os 2 mais recentes são revistos a cada execução. Grava:
  dados_pessoal.json   só totais por mês (servidores, vencimentos, bruto, líquido,
                       vencimento médio) — sem nomes nem salários individuais;
                       esse arquivo pode ir pro git.
  RH_<ano>_<mm>.xls    exportação em Excel do mês mais recente (1 linha por servidor);
                       fica só no disco (ver .gitignore), nunca no git.
  RHX_<ano>_<mm>.csv   TELA COMPLETA do mês mais recente (todos os lançamentos, inclusive os
                       sem vencimento que o Excel não traz), usada pelo gerar_painel.py;
                       só no disco, nunca no git.

Por que ler a tela: a exportação em Excel/XML deixa de fora os lançamentos sem vencimento
(benefícios e pagamentos extras), que a tela do portal mostra e que somam milhões por mês.
A leitura da tela só vale se passar na conferência (grade_pessoal.valida): mesmo número de
registros que o portal informa, sem linhas repetidas, mês certo e coincidência com o Excel.
Se falhar, o mês fica só com os dados do Excel e marcado como incompleto ('completo': false).

A leitura completa é lenta (o servidor do portal leva ~50 ms por linha: 8 a 15 min por mês),
então só é feita para o mês mais recente e os MESES_COMPLETOS-1 anteriores (os que o painel
mostra) e só se algo mudou (nº de registros ou totais) ou passou REVALIDA_DIAS dias.

Códigos de saída: 0 tudo certo | 2 o mês mais recente falhou na validação
(os dados anteriores são mantidos).
"""
import datetime, glob, json, os, sys, time
import pandas as pd
from playwright.sync_api import sync_playwright
import grade_pessoal

BASE  = os.path.dirname(os.path.abspath(__file__))
DEST  = os.path.join(BASE, 'dados_pessoal.json')
CACHE = os.path.join(BASE, '_cache')
URL   = 'https://mgnl.abaco.com.br/transparencia/servlet/wmservidores?0'
JANELA = 13             # mês mais recente + 12 anteriores (histórico pro painel; meses antigos só são baixados uma vez)
MIN_SERVIDORES = 1000   # abaixo disso o arquivo certamente veio filtrado/incompleto
VARIACAO_MAX = 0.20     # mês a mês, mais que isso é suspeito
MESES_COMPLETOS = 4     # tela completa para o mês mais recente + 3 anteriores (os que o painel exibe)
REVALIDA_DIAS = 7       # refaz a leitura completa de um mês já completo depois de tanto tempo
ORCAMENTO_MIN = 90      # passou disso, os meses que faltam ficam para a próxima execução
if '--so-recente' in sys.argv:   # teste rápido: tela completa só do mês mais recente
    MESES_COMPLETOS = 1
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
         'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']


def log(msg):
    print(msg, flush=True)


def le_xls(caminho):
    """Devolve (ano, mes, servidores, vencimentos, bruto) do .xls exportado, ou None."""
    try:
        bruto = pd.read_excel(caminho, header=None, nrows=15)
    except Exception as e:
        log('   não consegui abrir o arquivo: %s' % e)
        return None
    linha = None
    for i in range(len(bruto)):
        cel = [str(v).strip().lower() for v in bruto.iloc[i].tolist()]
        if 'nome' in cel and 'cargo' in cel:
            linha = i
            break
    if linha is None:
        return None
    df = pd.read_excel(caminho, header=linha)
    col_nome = next((c for c in df.columns if str(c).strip().lower() == 'nome'), None)
    col_ref = next((c for c in df.columns if str(c).strip().lower().startswith('ano')), None)
    if col_nome is None or col_ref is None:
        return None
    df = df[df[col_nome].notna()]
    refs = {str(v) for v in df[col_ref].dropna().unique() if '/' in str(v)}
    if len(refs) != 1:   # arquivo misturando meses = não é o recorte que pedimos
        log('   arquivo com referências misturadas: %s' % sorted(refs))
        return None
    ano, mes = (int(x) for x in refs.pop().split('/')[:2])
    venc = float(pd.to_numeric(df['Vencimentos'], errors='coerce').fillna(0).sum())
    brut = float(pd.to_numeric(df['Bruto'], errors='coerce').fillna(0).sum())
    return ano, mes, int(len(df)), round(venc, 2), round(brut, 2)


def meses_alvo(page):
    """Mês que o portal abre por padrão (o mais recente publicado) + os anteriores."""
    ano = int(page.eval_on_selector('#W0044vFILTROANO', 'e => e.value') or 0)
    mes = int(page.eval_on_selector('#W0044vFILTROMES', 'e => e.value') or 0)
    if not ano or not mes:   # "TODOS" selecionado: cai no mês anterior ao de hoje
        d = datetime.date.today().replace(day=1) - datetime.timedelta(days=1)
        ano, mes = d.year, d.month
    alvo = []
    for _ in range(JANELA):
        alvo.append((ano, mes))
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    return alvo


def exporta(page, ano, mes, destino):
    page.select_option('#W0044vFILTROANO', value=str(ano))
    page.select_option('#W0044vFILTROMES', value=str(mes))
    page.click('input[type=image][alt="Buscar"]')
    page.wait_for_load_state('networkidle', timeout=120000)
    page.wait_for_timeout(1500)
    with page.expect_download(timeout=240000) as dl:
        page.click('input[type=image][alt="Excel"]')
    dl.value.save_as(destino)


ESTADO = os.path.join(BASE, 'estado_pessoal_completo.json')   # fora do git (ver .gitignore)


def carrega():
    """Totais já coletados. O dados_pessoal.json é restaurado ao estado do commit depois de cada deploy
    (auto_atualizar.sh), o que apagaria a marca 'completo' dos meses já conferidos e refaria a leitura
    demorada todo dia; por isso os meses completos também ficam em ESTADO, que o git não toca."""
    dados = json.load(open(DEST, encoding='utf-8')) if os.path.exists(DEST) else {'coletado_em': '', 'meses': {}}
    if os.path.exists(ESTADO):
        try:
            for k, v in json.load(open(ESTADO, encoding='utf-8')).get('meses', {}).items():
                if v.get('completo'):
                    dados.setdefault('meses', {})[k] = v
        except Exception as e:
            log('   estado dos meses completos ilegível (%s) — ignorado' % e)
    return dados


def chave(ano, mes):
    return '%d-%02d' % (ano, mes)


def anterior(ano, mes):
    return (ano - 1, 12) if mes == 1 else (ano, mes - 1)


def main():
    os.makedirs(CACHE, exist_ok=True)
    dados = carrega()
    novos = {}
    mais_recente_ok = None
    tela_completa = None      # (ano, mes, linhas) do mês mais recente, se a leitura completa passou na conferência

    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = nav.new_context(accept_downloads=True, locale='pt-BR')
        page = ctx.new_page()
        page.set_default_timeout(120000)
        page.goto(URL, wait_until='networkidle')
        alvo = meses_alvo(page)
        log('Meses a coletar: %s' % ', '.join('%s/%d' % (MESES[m - 1], a) for a, m in alvo))

        inicio = time.time()
        hoje = datetime.date.today()
        for i, (ano, mes) in enumerate(alvo):
            guardado = dados.get('meses', {}).get(chave(ano, mes))
            quer_completo = i < MESES_COMPLETOS
            if i >= 2 and guardado and not (quer_completo and not guardado.get('completo')):
                continue   # mês fechado já coletado (e, se o painel o exibe, já completo): só os 2 mais recentes são revistos
            rotulo = '%s/%d' % (MESES[mes - 1], ano)
            arq = os.path.join(CACHE, 'pessoal_%d_%02d.xls' % (ano, mes))
            try:
                exporta(page, ano, mes, arq)
            except Exception as e:
                log('  %s: falhou ao exportar (%s)' % (rotulo, str(e).splitlines()[0]))
                continue
            info = le_xls(arq)
            if not info:
                log('  %s: arquivo ilegível, ignorado' % rotulo)
                continue
            a, m, n, venc, brut = info
            if (a, m) != (ano, mes):
                log('  %s: o arquivo veio de %d/%02d, ignorado' % (rotulo, a, m))
                continue
            if n < MIN_SERVIDORES:
                log('  %s: só %d servidores (arquivo incompleto?), ignorado' % (rotulo, n))
                continue
            reg = {
                'ano': ano, 'mes': mes, 'servidores': n, 'servidores_venc': n,
                'vencimentos': venc, 'bruto': brut,
                'media': round(venc / n, 2), 'completo': False,
            }
            log('  %s: exportação: %d servidores | vencimentos R$ %s | bruto R$ %s'
                % (rotulo, n, format(venc, ',.2f'), format(brut, ',.2f')))

            # --- tela completa (inclui os lançamentos sem vencimento, que o Excel não traz) ---
            if quer_completo:
                try:
                    n_reg = int(page.eval_on_selector('#W0044vNREGISTROS', 'e => e.value') or 0)
                    csv_ok = i > 0 or os.path.exists(os.path.join(BASE, 'RHX_%d_%02d.csv' % (ano, mes)))
                    muda = (not guardado or not guardado.get('completo') or guardado.get('registros') != n_reg
                            or abs(guardado.get('vencimentos', 0) - venc) > 0.05 or not csv_ok
                            or (hoje - datetime.date.fromisoformat(guardado.get('completo_em', '2000-01-01'))).days >= REVALIDA_DIAS)
                    if not muda:
                        reg = dict(guardado)      # nada mudou: mantém o que já foi conferido
                        log('  %s: tela completa já conferida (%d registros) — mantida' % (rotulo, n_reg))
                    elif (time.time() - inicio) / 60 > ORCAMENTO_MIN:
                        log('  %s: tempo de coleta esgotado — a tela completa fica para a próxima execução' % rotulo)
                    else:
                        t0 = time.time()
                        log('  %s: lendo a tela completa (%d registros)…' % (rotulo, n_reg))
                        linhas = grade_pessoal.le_grade(page, n_reg, log)
                        erros = grade_pessoal.valida(linhas, n_reg, ano, mes, excel=(n, venc, brut))
                        if erros:
                            log('  %s: tela completa REJEITADA — %s' % (rotulo, '; '.join(erros)))
                        else:
                            tot = grade_pessoal.resume(linhas)
                            reg.update(tot)
                            reg['servidores_venc'] = n
                            reg['completo'] = True
                            reg['completo_em'] = hoje.isoformat()
                            if i == 0:
                                tela_completa = (ano, mes, linhas)
                            log('  %s: tela completa conferida em %.0f min | %d registros | %d matrículas | bruto R$ %s '
                                '(lançamentos sem vencimento: %d, R$ %s)'
                                % (rotulo, (time.time() - t0) / 60, tot['registros'], tot['servidores'],
                                   format(tot['bruto'], ',.2f'), tot['lancamentos_extras'], format(tot['bruto_extras'], ',.2f')))
                except Exception as e:
                    log('  %s: não consegui ler a tela completa (%s) — fica só a exportação' % (rotulo, str(e).splitlines()[0]))
                    if guardado and guardado.get('completo'):
                        reg = dict(guardado)

            novos[chave(ano, mes)] = reg
            if mais_recente_ok is None:
                mais_recente_ok = (ano, mes, arq)
            time.sleep(3)
        nav.close()

    # Sanidade mês a mês: salto grande no nº de servidores = provável export filtrado.
    todos = {**dados.get('meses', {}), **novos}
    for k in sorted(novos):
        ant = todos.get(chave(*anterior(novos[k]['ano'], novos[k]['mes'])))
        if ant and abs(novos[k]['servidores'] - ant['servidores']) > VARIACAO_MAX * ant['servidores']:
            log('  AVISO: %s variou mais de %d%% frente ao mês anterior (%d → %d) — conferir'
                % (k, VARIACAO_MAX * 100, ant['servidores'], novos[k]['servidores']))

    if not novos:
        log('Nada coletado — dados anteriores mantidos.')
        return 2

    dados['meses'] = todos
    dados['coletado_em'] = datetime.date.today().isoformat()
    json.dump(dados, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)
    log('gravado: %s' % DEST)
    json.dump({'meses': {k: v for k, v in todos.items() if v.get('completo')}},
              open(ESTADO, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)

    # Tela completa do mês mais recente (com nomes) → gerar_painel.py (fora do git).
    if tela_completa:
        a, m, linhas = tela_completa
        destino_x = os.path.join(BASE, 'RHX_%d_%02d.csv' % (a, m))
        grade_pessoal.grava_csv(linhas, destino_x)
        for velho in glob.glob(os.path.join(BASE, 'RHX_*.csv')):
            if os.path.abspath(velho) != os.path.abspath(destino_x):
                os.remove(velho)
        log('tela completa do mês mais recente: %s' % os.path.basename(destino_x))

    # Planilha completa do mês mais recente → gerar_painel.py (fora do git).
    if mais_recente_ok:
        a, m, arq = mais_recente_ok
        existentes = sorted(glob.glob(os.path.join(BASE, 'RH_*.xls')))
        if existentes and os.path.basename(existentes[-1]) > 'RH_%d_%02d.xls' % (a, m):
            log('já existe planilha mais nova (%s) — mantida' % os.path.basename(existentes[-1]))
            return 0 if chave(*alvo[0]) in novos else 2
        destino = os.path.join(BASE, 'RH_%d_%02d.xls' % (a, m))
        with open(arq, 'rb') as f, open(destino, 'wb') as g:
            g.write(f.read())
        for velho in glob.glob(os.path.join(BASE, 'RH_*.xls')):
            if os.path.abspath(velho) != os.path.abspath(destino):
                os.remove(velho)
        log('planilha do mês mais recente: %s' % os.path.basename(destino))

    # O mês mais recente tem de ser o primeiro da lista — senão a coleta ficou manca.
    return 0 if chave(*alvo[0]) in novos else 2


if __name__ == '__main__':
    sys.exit(main())
