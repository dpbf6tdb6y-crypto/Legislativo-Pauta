# -*- coding: utf-8 -*-
"""Coleta as Despesas (Empenho/Liquidação/Pagamento por mês) do Portal da Transparência.

Diferente da Receita (que tem um endpoint de PDF direto por ano/mês), a tela de
Despesas é dinâmica — só dá pra pegar o total certo escolhendo o filtro na tela
e exportando. Por isso este script funciona em MODO VIGIA, do mesmo jeito que o
coletor_folha.py: você mexe no portal, ele fica de olho na pasta pública onde o
arquivo exportado aparece.

Como usar (repita pra cada mês que quiser atualizar):
  1) rode este script (ele fica esperando, avisa a cada arquivo novo encontrado)
  2) abra https://mgnl.abaco.com.br/transparencia/servlet/wmdespesas?0,0
  3) escolha Ano e Mês, clique em "Buscar" e depois no ícone do Excel
  4) espere o script confirmar e escolha o próximo mês (ou Ctrl+C pra parar)

O nome do arquivo exportado (DESPESA<dia>_<mes>_<ano>.xls) é a DATA DO CLIQUE,
não o filtro escolhido — por isso o script lê o Ano/Mês de dentro do próprio
arquivo (linhas 2 e 3) em vez de confiar no nome.
"""
import glob, json, os, sys, time, datetime
import pandas as pd
import requests

BASE   = os.path.dirname(os.path.abspath(__file__))
DEST   = os.path.join(BASE, 'dados_despesas.json')
URLDIR = 'https://mgnl.abaco.com.br/transparencia/PublicTempStorage/xls/'
PORTAL = 'https://mgnl.abaco.com.br/transparencia/servlet/wmdespesas?0,0'
MESES  = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

ses = requests.Session()
ses.headers.update({'User-Agent': 'Mozilla/5.0'})


def carrega():
    if os.path.exists(DEST):
        return json.load(open(DEST, encoding='utf-8'))
    return {'coletado_em': '', 'anos': {}}


def salva(d):
    d['coletado_em'] = datetime.date.today().isoformat()
    json.dump(d, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


def le(conteudo):
    """Devolve (ano, mes, totais) a partir do .xls exportado, ou None."""
    try:
        bruto = pd.read_excel(conteudo, header=None)
    except Exception:
        return None
    try:
        ano = int(str(bruto.iat[1, 1]).strip())
    except Exception:
        return None
    mestxt = str(bruto.iat[2, 1]).strip().upper()
    nomes_mes = [m.upper() for m in MESES]
    if mestxt not in nomes_mes:
        print('   mês "TODOS" ou não identificado no arquivo - ignorado (rode com um mês específico)')
        return None
    mes = nomes_mes.index(mestxt) + 1

    # O próprio arquivo já traz uma linha "TOTAL:" no rodapé com a soma de
    # todos os órgãos — usa ela direto, em vez de somar de novo (evita
    # contar em dobro se o layout do relatório mudar de alguma forma).
    linha_total = None
    for i in range(len(bruto)):
        if str(bruto.iat[i, 0]).strip().upper().rstrip(':') == 'TOTAL':
            linha_total = i
            break
    if linha_total is None:
        return None
    tot = pd.to_numeric(bruto.iloc[linha_total, 1:6], errors='coerce')
    n_orgaos = bruto.iloc[6:linha_total, 0].notna().sum()

    return ano, mes, {
        'ini':   round(float(tot.iloc[0]), 2),
        'atual': round(float(tot.iloc[1]), 2),
        'emp':   round(float(tot.iloc[2]), 2),
        'liq':   round(float(tot.iloc[3]), 2),
        'pag':   round(float(tot.iloc[4]), 2),
        'n_orgaos': int(n_orgaos),
    }


def candidato_de_hoje():
    hoje = datetime.date.today()
    nome = 'DESPESA%d_%d_%d.xls' % (hoje.day, hoje.month, hoje.year)
    try:
        ses.head(PORTAL, timeout=30)  # garante o cookie de sessão (ROUTEID)
        r = ses.get(URLDIR + nome, timeout=60)
        if r.status_code == 200 and r.content[:4] in (b'\xd0\xcf\x11\xe0', b'PK\x03\x04'):
            return nome, r.content
    except Exception:
        pass
    return None, None


if __name__ == '__main__':
    print('Vigiando a exportação de Despesas do Portal da Transparência...')
    print('Abra %s, escolha Ano/Mês, Buscar e depois o ícone do Excel.' % PORTAL)
    print('(Ctrl+C pra parar quando terminar os meses que precisa.)\n')

    dados = carrega()
    visto = None
    try:
        while True:
            nome, conteudo = candidato_de_hoje()
            if conteudo and conteudo != visto:
                visto = conteudo
                info = le(conteudo)
                if info is None:
                    print('   arquivo novo encontrado, mas não consegui ler - ignorado')
                else:
                    ano, mes, totais = info
                    dados.setdefault('anos', {}).setdefault(str(ano), {})[str(mes)] = {
                        k: v for k, v in totais.items() if k != 'n_orgaos'
                    }
                    salva(dados)
                    print('  ✓ %s/%d gravado (%d órgãos, empenho R$ %.2f)'
                          % (MESES[mes - 1], ano, totais['n_orgaos'], totais['emp']))
                    print('    pode mudar o filtro pro próximo mês e clicar no Excel de novo')
            time.sleep(4)
    except KeyboardInterrupt:
        print('\nEncerrado. dados_despesas.json atualizado com o que foi coletado.')
