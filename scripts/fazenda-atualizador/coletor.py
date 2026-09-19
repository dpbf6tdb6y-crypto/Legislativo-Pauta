# -*- coding: utf-8 -*-
"""Coleta a receita do Portal da Transparência de Nova Lima e valida contra os totalizadores.

Endpoint:  .../servlet/appmontaarquivopdfreceita?<ano>,<mes>     mes 0 = ano inteiro
Regra:     somar apenas as linhas-folha (sem desdobramento abaixo), nunca "3 últimos dígitos != 000".
"""
import io, json, os, re, sys, time, datetime
import requests, pdfplumber

URL   = 'https://mgnl.abaco.com.br/transparencia/servlet/appmontaarquivopdfreceita?%d,%d'
BASE  = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(BASE, '_cache')
HOJE  = datetime.date.today()
ANO0  = 2020

BLOCOS = {'1': ('correntes', '1000000000'),
          '2': ('capital',   '2000000000'),
          '9': ('deducoes',  '91000000000')}

ses = requests.Session()
ses.headers.update({'User-Agent': 'Mozilla/5.0'})


def baixa(ano, mes):
    """Baixa o PDF do ano/mês. Usa cache, exceto para o exercício corrente."""
    os.makedirs(CACHE, exist_ok=True)
    arq = os.path.join(CACHE, 'receita_%d_%02d.pdf' % (ano, mes))
    if os.path.exists(arq) and ano < HOJE.year:
        return open(arq, 'rb').read()
    for tent in range(3):
        try:
            r = ses.get(URL % (ano, mes), timeout=180)
            if r.status_code == 200 and r.content[:4] == b'%PDF':
                open(arq, 'wb').write(r.content)
                return r.content
        except Exception as e:
            if tent == 2:
                raise
        time.sleep(2 + tent * 3)
    raise RuntimeError('falha ao baixar %d/%d' % (ano, mes))


LINHA = re.compile(r'^(\d{10,11})\s+(.*?)\s+((?:R\$ -?[\d\.\,]+\s*){5})$')

def extrai(conteudo):
    """Lê o PDF e devolve {codigo: {desc, orc_ini, orc_atual, per_ant, no_per, ate_per}}."""
    linhas = {}
    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        for pg in pdf.pages:
            for ln in (pg.extract_text() or '').split('\n'):
                m = LINHA.match(ln.strip())
                if not m:
                    continue
                v = [float(x.replace('.', '').replace(',', '.'))
                     for x in re.findall(r'R\$ (-?[\d\.\,]+)', m.group(3))]
                linhas[m.group(1)] = {'desc': m.group(2).strip(), 'orc_ini': v[0],
                                      'orc_atual': v[1], 'per_ant': v[2],
                                      'no_per': v[3], 'ate_per': v[4]}
    return linhas


def folhas(cods):
    """Códigos que não têm nenhum código mais específico abaixo deles."""
    cods = list(cods)
    sig = lambda c: len(c.rstrip('0'))
    prefixos = {}
    for c in cods:
        prefixos.setdefault(len(c), set()).add((sig(c), c[:sig(c)]))
    out = []
    for c in cods:
        s = sig(c)
        tem = any(ss > s and pp[:s] == c[:s] for ss, pp in prefixos[len(c)])
        if not tem:
            out.append(c)
    return out


def tipo_do(cod, linhas):
    """Tipo = espécie (3 dígitos) quando a origem é 11; senão a origem (2 dígitos).
    Reproduz a classificação usada na planilha original."""
    if not cod.startswith('1'):
        return ''
    origem = cod[:2].ljust(10, '0')
    especie = cod[:3].ljust(10, '0')
    alvo = especie if cod[:2] == '11' else origem
    d = linhas.get(alvo, {}).get('desc') or linhas.get(origem, {}).get('desc') or ''
    d = re.sub(r'\s*-\s*PRINCIPAL$', '', d, flags=re.I).strip()
    if d.isupper():
        miudas = {'de','da','do','das','dos','e','a','o','em','para','por','sobre'}
        d = ' '.join(w.capitalize() if (i == 0 or w.lower() not in miudas) else w.lower()
                     for i, w in enumerate(d.split()))
    return d


def coleta(anos, mensal=True, log=print):
    dados = {'coletado_em': HOJE.isoformat(), 'anos': {}, 'mensal': {},
             'nomes': {}, 'tipos': {}, 'validacao': []}
    for ano in anos:
        L = extrai(baixa(ano, 0))
        f = [c for c in folhas(L) if c not in [b[1] for b in BLOCOS.values()]]
        reg = {}
        for c in f:
            reg[c] = {'orc_ini': L[c]['orc_ini'], 'orc_atual': L[c]['orc_atual'],
                      'no_per': L[c]['no_per'], 'ate_per': L[c]['ate_per']}
            dados['nomes'].setdefault(c, L[c]['desc'])
            t = tipo_do(c, L)
            if t:
                dados['tipos'].setdefault(c, t)
        dados['anos'][str(ano)] = reg

        for pre, (nome, tot) in BLOCOS.items():
            soma = sum(reg[c]['ate_per'] for c in reg if c.startswith(pre))
            oficial = L.get(tot, {}).get('ate_per', 0.0)
            dif = round(soma - oficial, 2)
            dados['validacao'].append({'ano': ano, 'bloco': nome, 'soma_folhas': round(soma, 2),
                                       'totalizador': round(oficial, 2), 'diferenca': dif})
            log('  %d %-10s folhas=%-4d soma=%18s oficial=%18s %s'
                % (ano, nome, len([c for c in reg if c.startswith(pre)]),
                   f'{soma:,.2f}', f'{oficial:,.2f}',
                   'OK' if abs(dif) < 0.01 else '*** DIFERE em %.2f ***' % dif))

        if mensal:
            ate = 12 if ano < HOJE.year else HOJE.month
            mm = {}
            for mes in range(1, ate + 1):
                Lm = extrai(baixa(ano, mes))
                mm[str(mes)] = {c: Lm[c]['no_per'] for c in Lm
                                if c in reg and abs(Lm[c]['no_per']) > 0.004}
            dados['mensal'][str(ano)] = mm
            somam = sum(v for m in mm.values() for v in m.values())
            somaa = sum(r['ate_per'] for r in reg.values())
            log('  %d mensal    %d meses, soma dos meses=%s (anual=%s, dif=%s)'
                % (ano, len(mm), f'{somam:,.2f}', f'{somaa:,.2f}', f'{somam-somaa:,.2f}'))
    return dados


if __name__ == '__main__':
    anos = range(ANO0, HOJE.year + 1)
    if len(sys.argv) > 1:
        anos = [int(a) for a in sys.argv[1:] if a.isdigit()]
    print('Coletando receita do Portal da Transparência de Nova Lima')
    print('anos:', list(anos))
    d = coleta(anos)
    saida = os.path.join(BASE, 'dados_receita.json')

    # se ja existe coleta anterior, mescla em vez de substituir
    if os.path.exists(saida):
        try:
            antigo = json.load(open(saida, encoding='utf-8'))
            for chave in ('anos', 'mensal', 'nomes', 'tipos'):
                base = dict(antigo.get(chave) or {})
                base.update(d.get(chave) or {})
                d[chave] = base
            colhidos = {v['ano'] for v in d['validacao']}
            d['validacao'] = [v for v in (antigo.get('validacao') or [])
                              if v['ano'] not in colhidos] + d['validacao']
            d['validacao'].sort(key=lambda v: (v['ano'], v['bloco']))
        except Exception as e:
            print('aviso: nao consegui mesclar com a coleta anterior (%s); gravando so o que foi coletado agora' % e)

    json.dump(d, open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    ruins = [v for v in d['validacao'] if abs(v['diferenca']) >= 0.01]
    print('\ngravado:', saida)
    print('validação: %d blocos conferidos, %d com diferença' % (len(d['validacao']), len(ruins)))
