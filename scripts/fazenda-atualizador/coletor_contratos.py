# -*- coding: utf-8 -*-
"""Coleta os contratos do Portal da Transparência de Nova Lima.

Endpoint: .../servlet/appmontaarquivopdfcontratos          (todos)
          .../servlet/appmontaarquivopdfcontratos?0,0,V    (só os de status "Vigente")
A vigência aqui é calculada pelas datas de início e fim, que é o critério estável.
"""
import io, json, os, re, sys, time, datetime
import requests, pdfplumber

URL   = 'https://mgnl.abaco.com.br/transparencia/servlet/appmontaarquivopdfcontratos'
BASE  = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(BASE, '_cache')
HOJE  = datetime.date.today()

# limites em x de cada coluna no PDF (medidos no cabeçalho do relatório)
COLS = [(0, 100, 'num'), (100, 150, 'ini'), (150, 200, 'fim'), (200, 408, 'credor'),
        (408, 805, 'descetipo'), (805, 9999, 'valor')]

TIPOS = ['AQUISIÇÃO DE MATERIAIS / PRESTAÇÃO DE SERVIÇOS', 'AQUISIÇÃO DE MATERIAIS',
         'ARRENDAMENTO', 'COMPRAS E OUTROS SERVIÇOS', 'CONCESSÃO',
         'CONTRATO (TERMO INICIAL)', 'CONTRATOS DE ALUGUÉIS',
         'CONTRATOS DE FORNECIMENTO DE BENS', 'OBRAS E SERVIÇOS DE ENGENHARIA',
         'OUTROS TIPOS DE CONTRATOS']

ses = requests.Session()
ses.headers.update({'User-Agent': 'Mozilla/5.0'})


def baixa(forcar=False):
    os.makedirs(CACHE, exist_ok=True)
    arq = os.path.join(CACHE, 'contratos_%s.pdf' % HOJE.isoformat())
    if os.path.exists(arq) and not forcar:
        return open(arq, 'rb').read()
    for tent in range(3):
        r = ses.get(URL, timeout=300)
        if r.status_code == 200 and r.content[:4] == b'%PDF':
            open(arq, 'wb').write(r.content)
            return r.content
        time.sleep(3 + tent * 4)
    raise RuntimeError('não consegui baixar o relatório de contratos')


def separa_desc_tipo(texto):
    """No PDF a ultima palavra da descricao e a primeira do tipo vem coladas
    (ex.: "...POLIESPORCOMPRAS E OUTROS SERVI"), e o tipo ainda vem truncado.
    Por isso o tipo e reconhecido pelo FIM do texto, casando com a lista oficial."""
    texto = re.sub(r'\s*R\$\s*$', '', texto).strip()
    melhor = (0, '', texto)
    for oficial in TIPOS:
        for L in range(len(oficial), 6, -1):
            if texto.endswith(oficial[:L]) and L > melhor[0]:
                melhor = (L, oficial, texto[:-L].strip())
                break
    return melhor[2], melhor[1]


def extrai(conteudo):
    regs = []
    with pdfplumber.open(io.BytesIO(conteudo)) as pdf:
        for pg in pdf.pages:
            # agrupa palavras em linhas por proximidade vertical (tolerância de 3,5 px)
            palavras = sorted(pg.extract_words(), key=lambda w: (w['top'], w['x0']))
            linhas, atual, topo = [], [], None
            for w in palavras:
                if topo is None or abs(w['top'] - topo) <= 3.5:
                    atual.append(w)
                    topo = w['top'] if topo is None else topo
                else:
                    linhas.append(atual)
                    atual, topo = [w], w['top']
            if atual:
                linhas.append(atual)
            for ws in linhas:
                campo = {k: [] for _, _, k in COLS}
                for w in sorted(ws, key=lambda w: w['x0']):
                    for a, b, k in COLS:
                        if a <= w['x0'] < b:
                            campo[k].append(w['text'])
                            break
                desc, tipo = separa_desc_tipo(' '.join(campo['descetipo']))
                num = ' '.join(campo['num']).strip()
                ini = ' '.join(campo['ini']).strip()
                fim = ' '.join(campo['fim']).strip()
                if not re.match(r'^\S+/\d{4}$', num):
                    continue
                if not re.match(r'^\d{2}/\d{2}/\d{4}$', ini):
                    continue
                try:
                    valor = float(' '.join(campo['valor']).replace('R$', '')
                                  .replace('.', '').replace(',', '.').strip())
                except ValueError:
                    continue
                regs.append({
                    'num': num, 'ini': ini, 'fim': fim,
                    'credor': ' '.join(campo['credor']).strip(),
                    'desc': desc,
                    'tipo': tipo,
                    'valor': valor,
                })
    return regs


def situacao(r):
    d = lambda s: datetime.datetime.strptime(s, '%d/%m/%Y').date()
    try:
        ini, fim = d(r['ini']), d(r['fim'])
    except ValueError:
        return 'sem data'
    if ini > HOJE:
        return 'a iniciar'
    if fim < HOJE:
        return 'encerrado'
    return 'vigente'


if __name__ == '__main__':
    print('Coletando contratos do Portal da Transparência de Nova Lima')
    regs = extrai(baixa('--forcar' in sys.argv))
    for r in regs:
        r['sit'] = situacao(r)
        try:
            fim = datetime.datetime.strptime(r['fim'], '%d/%m/%Y').date()
            r['dias'] = (fim - HOJE).days
        except ValueError:
            r['dias'] = None

    por = {}
    for r in regs:
        por.setdefault(r['sit'], []).append(r)
    print('  contratos lidos: %d   valor total R$ %s'
          % (len(regs), f"{sum(r['valor'] for r in regs):,.2f}"))
    for k in ('vigente', 'a iniciar', 'encerrado', 'sem data'):
        if k in por:
            print('    %-10s %5d   R$ %18s'
                  % (k, len(por[k]), f"{sum(r['valor'] for r in por[k]):,.2f}"))
    venc = [r for r in regs if r['sit'] == 'vigente' and r['dias'] is not None and r['dias'] <= 90]
    print('    vencendo em até 90 dias: %d contratos, R$ %s'
          % (len(venc), f"{sum(r['valor'] for r in venc):,.2f}"))
    semtipo = [r for r in regs if not r['tipo']]
    if semtipo:
        print('    aviso: %d contratos sem tipo identificado' % len(semtipo))

    saida = os.path.join(BASE, 'dados_contratos.json')
    json.dump({'coletado_em': HOJE.isoformat(), 'contratos': regs},
              open(saida, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('  gravado:', saida)
