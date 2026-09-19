# -*- coding: utf-8 -*-
"""Busca a folha de pessoal mais recente publicada pelo Portal da Transparência.

Como funciona: quando alguém clica em "Imagem Excel" na tela de Servidores, o portal
grava um arquivo público em PublicTempStorage/xls/PESSOAL<dia>_<mes>_<ano>.xls, e ele
FICA lá. Este script procura os arquivos publicados nos últimos dias.

ATENÇÃO: o arquivo herda os filtros de quem clicou. Um arquivo gerado com filtro de
secretaria traz só parte dos servidores. Por isso aqui não basta pegar o mais recente:
entre os candidatos do mês de referência mais novo, fica o que tiver MAIS servidores.
"""
import datetime, io, os, sys
import pandas as pd
import requests

BASE   = os.path.dirname(os.path.abspath(__file__))
DESTRH = os.path.abspath(os.path.join(BASE, '..', '..', 'RH'))
URLDIR = 'https://mgnl.abaco.com.br/transparencia/PublicTempStorage/xls/'
PORTAL = 'https://mgnl.abaco.com.br/transparencia/servlet/wmservidores?0'
DIAS       = 45   # janela de busca para trás
MAX_BAIXAR = 8    # quantos candidatos chegam a ser baixados e conferidos
MESES  = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

ses = requests.Session()
ses.headers.update({'User-Agent': 'Mozilla/5.0'})


def le(conteudo):
    """Devolve (ano, mes, n_servidores) do arquivo, ou None se não der para ler."""
    try:
        bruto = pd.read_excel(io.BytesIO(conteudo), header=None, nrows=15)
    except Exception:
        return None
    linha = None
    for i in range(len(bruto)):
        cel = [str(v).strip().lower() for v in bruto.iloc[i].tolist()]
        if 'nome' in cel and 'cargo' in cel:
            linha = i
            break
    if linha is None:
        return None
    df = pd.read_excel(io.BytesIO(conteudo), header=linha)
    col_ano = next((c for c in df.columns if str(c).strip().lower().startswith('ano')), None)
    col_nome = next((c for c in df.columns if str(c).strip().lower() == 'nome'), None)
    if col_ano is None or col_nome is None:
        return None
    df = df[df[col_nome].notna()]
    vals = [str(v) for v in df[col_ano].dropna().unique() if '/' in str(v)]
    if not vals:
        return None
    chave = lambda v: (int(v.split('/')[0]), int(v.split('/')[1]))
    ano, mes = chave(sorted(vals, key=chave)[-1])
    return ano, mes, len(df)


def candidatos():
    hoje = datetime.date.today()
    achados = []
    for k in range(DIAS + 1):
        if len(achados) >= MAX_BAIXAR:
            break
        d = hoje - datetime.timedelta(days=k)
        nome = 'PESSOAL%d_%d_%d.xls' % (d.day, d.month, d.year)
        try:
            if ses.head(URLDIR + nome, timeout=30).status_code != 200:
                continue
        except Exception:
            continue
        try:
            c = ses.get(URLDIR + nome, timeout=180).content
        except Exception:
            continue
        info = le(c)
        if not info:
            print('   %-22s publicado em %s - ilegível, ignorado'
                  % (nome, d.strftime('%d/%m')))
            continue
        ano, mes, n = info
        print('   %-22s publicado em %s -> %s/%d, %d servidores'
              % (nome, d.strftime('%d/%m'), MESES[mes - 1], ano, n))
        achados.append({'nome': nome, 'conteudo': c, 'ano': ano, 'mes': mes, 'n': n})
    return achados


if __name__ == '__main__':
    print('Procurando as folhas de pessoal publicadas no portal')
    achados = candidatos()
    if not achados:
        print('\n  Nenhum arquivo publicado nos últimos %d dias.' % DIAS)
        print('  O que fazer (leva 15 segundos, uma vez só):')
        print('    1) abra  %s' % PORTAL)
        print('    2) escolha o mês desejado (deixe os demais filtros em TODOS)')
        print('    3) clique no ícone do Excel')
        print('    4) rode este script de novo')
        sys.exit(2)

    ref = max((a['ano'], a['mes']) for a in achados)
    doMes = [a for a in achados if (a['ano'], a['mes']) == ref]
    melhor = max(doMes, key=lambda a: a['n'])
    if len(doMes) > 1:
        print('  %d arquivos de %s/%d; fico com o mais completo (%d servidores)'
              % (len(doMes), MESES[ref[1] - 1], ref[0], melhor['n']))

    os.makedirs(DESTRH, exist_ok=True)
    destino = os.path.join(DESTRH, '%d_%d.xls' % (ref[1], ref[0]))

    if os.path.exists(destino):
        atual = le(open(destino, 'rb').read())
        if atual and atual[2] >= melhor['n']:
            print('  o arquivo local %s já tem %d servidores - mantido como está'
                  % (os.path.basename(destino), atual[2]))
            sys.exit(0)

    open(destino, 'wb').write(melhor['conteudo'])
    print('  gravado: %s  ->  %s/%d, %d servidores'
          % (destino, MESES[ref[1] - 1], ref[0], melhor['n']))
