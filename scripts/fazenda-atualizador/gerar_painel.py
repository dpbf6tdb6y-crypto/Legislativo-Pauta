# -*- coding: utf-8 -*-
"""Dashboard de Receita — layout claro, leve e responsivo (substitui a lâmina 1280x720)."""
import json, math, os, re
import pandas as pd
from vinculacao import classifica, area as area_vinc
from despesa_obrigatoria import classifica as classifica_desp, _norm as _norm_desp

BASE = os.path.dirname(os.path.abspath(__file__))

def num(v):
    try:
        f = float(v)
        return 0.0 if math.isnan(f) else f
    except Exception:
        return 0.0

def txt(v):
    if v is None: return ''
    if isinstance(v, float) and math.isnan(v): return ''
    return str(v).strip()

# ---------------------------------------------------------------- dados
D      = json.load(open(os.path.join(BASE, 'dados_receita.json'), encoding='utf-8'))
try:
    CURTO = json.load(open(os.path.join(BASE, 'nomes_curtos.json'), encoding='utf-8'))
except Exception:
    CURTO = {}

def bonito(desc):
    """Descrição do PDF vem em CAIXA ALTA e truncada; deixa legível."""
    d = re.sub(r'\s*-\s*PRINCIPAL$', '', desc, flags=re.I).strip()
    if d.isupper():
        miudas = {'de','da','do','das','dos','e','a','o','em','para','por','sobre','na','no'}
        d = ' '.join(w.capitalize() if (i == 0 or w.lower() not in miudas) else w.lower()
                     for i, w in enumerate(d.split()))
    return d

def nome(cod):
    return CURTO.get(cod) or bonito(D['nomes'].get(cod, cod))

def bloco(pre):
    out = []
    for ano, reg in D['anos'].items():
        for cod, v in reg.items():
            if cod.startswith(pre):
                # [ano, tipo, nome, valor, % vinculada por lei (100/0/null), lei]
                pct, lei = classifica(cod, D['tipos'].get(cod, ''), D['nomes'].get(cod, ''))
                out.append([int(ano), D['tipos'].get(cod, ''), nome(cod), v['ate_per'], pct, lei,
                            area_vinc(cod, D['tipos'].get(cod, ''), D['nomes'].get(cod, ''))])
    return out

# mensal por bloco / ano / mês / código, para o clique no mês filtrar as listas
MENSAL = {}
for pre, chave in [('1','rc'), ('2','cap'), ('9','ded')]:
    porAno = {}
    for ano, meses in D.get('mensal', {}).items():
        pm = {}
        for mes, regs in meses.items():
            acc = {c: round(v, 2) for c, v in regs.items() if c.startswith(pre)}
            if acc:
                pm[mes] = acc
        if pm:
            porAno[ano] = pm
    MENSAL[chave] = porAno

# nome e tipo de cada código, para remontar as linhas a partir do mensal
META = {cod: [nome(cod), D['tipos'].get(cod, '')] + list(classifica(cod, D['tipos'].get(cod, ''), D['nomes'].get(cod, '')))
        + [area_vinc(cod, D['tipos'].get(cod, ''), D['nomes'].get(cod, ''))]
        for cod in D['nomes']}

try:
    _ct = json.load(open(os.path.join(BASE, 'dados_contratos.json'), encoding='utf-8'))
    CONTRATOS = [[c['num'], c['ini'], c['fim'], c['credor'], c['desc'][:110],
                  c['tipo'], round(c['valor'], 2), c['sit'], c['dias']]
                 for c in _ct['contratos']]
    CT_COLETA = _ct.get('coletado_em', '')
except Exception:
    CONTRATOS, CT_COLETA = [], ''
print('contratos carregados:', len(CONTRATOS))

import glob
_rh = glob.glob(os.path.join(BASE, '..', '..', 'RH', '*.xls')) + glob.glob(os.path.join(BASE, 'RH_*.xls'))
if not _rh:
    raise SystemExit('Nao encontrei a planilha de RH (../../RH/*.xls ou RH_*.xls)')
def le_folha(caminho):
    """Acha a linha de cabecalho (a que tem Nome e Cargo) e le a partir dela."""
    bruto = pd.read_excel(caminho, header=None, nrows=15)
    linha = None
    for i in range(len(bruto)):
        celulas = [str(v).strip().lower() for v in bruto.iloc[i].tolist()]
        if 'nome' in celulas and 'cargo' in celulas:
            linha = i
            break
    df = pd.read_excel(caminho, header=linha if linha is not None else 0)
    col_nome = next((c for c in df.columns if str(c).strip().lower() == 'nome'), None)
    if col_nome is not None:
        df = df[df[col_nome].notna()]
    return df.reset_index(drop=True)

def ref_tupla(df):
    """(ano, mes) da coluna Ano/Mes (ex.: '2026/8'), ou (0, 0)."""
    col = next((c for c in df.columns if str(c).strip().lower().startswith('ano')), None)
    vals = [str(v) for v in df[col].dropna().unique() if '/' in str(v)] if col is not None else []
    if not vals:
        return (0, 0)
    return max((int(v.split('/')[0]), int(v.split('/')[1])) for v in vals)

# Entre as planilhas disponiveis vale a de referencia mais recente — pelo
# conteudo, nao pelo nome (nomes como 10_2026 ordenavam antes de 3_2026).
_cands = []
for _f in _rh:
    _d = le_folha(_f)
    _cands.append((ref_tupla(_d), _f, _d))
_cands.sort(key=lambda c: c[0])
RH_TUPLA, _arq_rh, rh = _cands[-1]
print('folha de pessoal:', os.path.basename(_arq_rh), RH_TUPLA)
rh['Secretaria'] = rh['Lotação'].astype(str).str.split(' - ').str[0].str.strip()

MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
            'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

def referencia_folha(df):
    """Le a coluna Ano/Mes (ex.: '2026/8') e devolve 'referência agosto/2026'."""
    col = next((c for c in df.columns if str(c).strip().lower().startswith('ano')), None)
    if col is None:
        return ''
    vals = [str(v) for v in df[col].dropna().unique() if '/' in str(v)]
    if not vals:
        return ''
    def chave(v):
        a, m = v.split('/')[:2]
        return (int(a), int(m))
    ano, mes = chave(sorted(vals, key=chave)[-1])
    return 'referência %s/%d' % (MESES_PT[mes - 1], ano)

RH_REF = referencia_folha(rh)

def _mes_anterior(a, m):
    return (a - 1, 12) if m == 1 else (a, m - 1)
try:
    _pj = json.load(open(os.path.join(BASE, 'dados_pessoal.json'), encoding='utf-8')).get('meses', {})
except Exception:
    _pj = {}
PESSOAL_HIST = []
_a, _m = RH_TUPLA
for _ in range(3):
    _a, _m = _mes_anterior(_a, _m)
    _r = _pj.get('%d-%02d' % (_a, _m))
    if _r:
        PESSOAL_HIST.append({'ano': _a, 'mes': _m, 'servidores': _r['servidores'],
                             'vencimentos': _r['vencimentos'], 'bruto': _r['bruto'],
                             'media': _r['media']})
print('historico de pessoal (meses anteriores):', [(h['ano'], h['mes']) for h in PESSOAL_HIST])
print('referência da folha:', RH_REF or '(não identificada)')

try:
    _dp = json.load(open(os.path.join(BASE, 'dados_despesas.json'), encoding='utf-8'))
    # linha por mês: [mês(1-12), empenho, liquidação, pagamento] — só do ano
    # mais recente com dado coletado; "total por mês" é o que foi pedido,
    # sem detalhar por secretaria.
    _ano_desp = max(_dp.get('anos', {}), default=None)
    DESPESAS = {
        'ano': int(_ano_desp) if _ano_desp else None,
        'meses': [[int(m), v['emp'], v['liq'], v['pag']]
                  for m, v in sorted(_dp['anos'][_ano_desp].items(), key=lambda kv: int(kv[0]))]
                 if _ano_desp else [],
        # por órgão, só nos meses em que o coletor trouxe o detalhamento —
        # usado na tabela que aparece ao clicar num mês no gráfico.
        'orgaos_por_mes': {m: v['orgaos'] for m, v in _dp['anos'][_ano_desp].items() if v.get('orgaos')}
                          if _ano_desp else {},
    }
    # Dotação atual do ano: no portal, o "Valor Atual" de cada mês é o inicial mais as
    # alterações DAQUELE mês; a visão do ano inteiro é o inicial + a soma das alterações
    # de todos os meses (conferido com o portal: Educação, Administração, Procuradoria).
    _dot_o, _dot_t = {}, [0.0, 0.0]
    for _m in sorted(_dp['anos'][_ano_desp], key=int) if _ano_desp else []:
        _v = _dp['anos'][_ano_desp][_m]
        if not _v.get('orgaos'):
            continue
        if not _dot_t[0]:
            _dot_t[0] = _dot_t[1] = _v['ini']
        else:
            _dot_t[1] += _v['atual'] - _v['ini']
        for _o in _v['orgaos']:
            _d = _dot_o.setdefault(_o[0], [_o[1], _o[1]])
            _d[1] += _o[2] - _o[1]
    _dm, _acum = {}, None
    for _m in sorted(_dp['anos'][_ano_desp], key=int) if _ano_desp else []:
        _v = _dp['anos'][_ano_desp][_m]
        if not _v.get('orgaos'):
            continue
        _acum = _v['ini'] if _acum is None else _acum + (_v['atual'] - _v['ini'])
        _dm[_m] = [round(_v['ini'], 2), round(_acum, 2)]
    DESPESAS['dot_mes'] = _dm        # mês -> [valor inicial, valor atual acumulado até o mês]
    DESPESAS['dot_orgaos'] = {k: [round(a, 2), round(b, 2)] for k, (a, b) in _dot_o.items()}
    DESPESAS['dot_total'] = [round(_dot_t[0], 2), round(_dot_t[1], 2)]
    DP_COLETA = _dp.get('coletado_em', '')
except Exception:
    DESPESAS, DP_COLETA = {'ano': None, 'meses': []}, ''

# Despesa por natureza (obrigatória x discricionária): por mês, mesma natureza
# repetida em categorias econômicas diferentes é somada e classificada pelo nome.
NATUREZA = {'ano': None, 'por_mes': {}}
try:
    _dn = json.load(open(os.path.join(BASE, 'dados_natureza.json'), encoding='utf-8'))
    _ano_nat = max(_dn.get('anos', {}), default=None)
    if _ano_nat:
        NATUREZA['ano'] = int(_ano_nat)
        for _m, _v in _dn['anos'][_ano_nat].items():
            # o portal escreve a mesma natureza ora com acento, ora sem — junta pelo nome normalizado
            _ac, _nm = {}, {}
            for _l in _v['linhas']:
                _k = _norm_desp(_l[0])
                _a = _ac.setdefault(_k, [0.0] * 5)
                for _i in range(5):
                    _a[_i] += _l[_i + 1]
                if _k not in _nm or sum(ord(c) > 127 for c in _l[0]) > sum(ord(c) > 127 for c in _nm[_k]):
                    _nm[_k] = _l[0]
            # linha: [nome, ini, atual, emp, liq, pag, tipo, grupo, lei, entra_no_limite_pessoal, chave]
            NATUREZA['por_mes'][_m] = [[_nm[_k]] + [round(x, 2) for x in _a] + list(classifica_desp(_nm[_k])) + [_k]
                                       for _k, _a in _ac.items()]
        # dotação atual por natureza: inicial + soma das alterações mensais (mesma regra do órgão)
        _dot = {}
        for _m in sorted(_dn['anos'][_ano_nat], key=int):
            _mm = {}
            for _l in _dn['anos'][_ano_nat][_m]['linhas']:
                _x = _mm.setdefault(_norm_desp(_l[0]), [0.0, 0.0])
                _x[0] += _l[1]; _x[1] += _l[2]
            for _k, (_i, _a) in _mm.items():
                _d = _dot.setdefault(_k, [_i, _i])
                _d[1] += _a - _i
        NATUREZA['dot'] = {k: [round(v[0], 2), round(v[1], 2)] for k, v in _dot.items()}
    # ---- Despesa total com pessoal: janela móvel de 12 meses (mês de referência + 11
    # anteriores), pela despesa LIQUIDADA (competência), sobre a RCL dos mesmos 12 meses.
    # O mês de referência é o último mês FECHADO. Entram: vencimentos, encargos, inativos e
    # pensionistas, contratação temporária e terceirização que substitui servidores; ficam
    # de fora as exclusões do art. 19, §1º (ver despesa_obrigatoria.py).
    _hoje_p = __import__('datetime').date.today()
    _fim = (_hoje_p.year - 1, 12) if _hoje_p.month == 1 else (_hoje_p.year, _hoje_p.month - 1)
    _janela = []
    _y, _mm = _fim
    for _ in range(12):
        _janela.append((_y, _mm))
        _mm -= 1
        if _mm == 0:
            _y, _mm = _y - 1, 12
    _janela.reverse()
    def _pessoal_mes(y, m):
        _meses = _dn.get('anos', {}).get(str(y), {}).get(str(m))
        if not _meses:
            return None
        return sum(l[4] for l in _meses['linhas'] if classifica_desp(l[0])[3])
    def _rcl_mes(y, m):
        _rc = MENSAL.get('rc', {}).get(str(y), {}).get(str(m))
        if not _rc:
            return None
        return sum(_rc.values()) - sum(MENSAL.get('ded', {}).get(str(y), {}).get(str(m), {}).values())
    _pes = _rcl = 0.0
    _faltam = []
    for _y, _mm in _janela:
        _a, _b = _pessoal_mes(_y, _mm), _rcl_mes(_y, _mm)
        if _a is None or _b is None:
            _faltam.append('%02d/%d' % (_mm, _y))
            continue      # janela incompleta: só somam meses que têm numerador E denominador
        _pes += _a
        _rcl += _b
    # séries mensais pro Painel de Comando (janela móvel de qualquer mês escolhido)
    SERIE = {'pes': {}, 'rcl': {}}
    for _y2, _ms2 in _dn.get('anos', {}).items():
        for _m2 in _ms2:
            _v2 = _pessoal_mes(int(_y2), int(_m2))
            _r2 = _rcl_mes(int(_y2), int(_m2))
            if _v2 is not None and _r2 is not None:
                SERIE['pes']['%s-%02d' % (_y2, int(_m2))] = round(_v2, 2)
                SERIE['rcl']['%s-%02d' % (_y2, int(_m2))] = round(_r2, 2)
    for _yy in (_ano_nat, str(int(_ano_nat) - 1)):
        for _mm2 in range(1, 13):
            _r3 = _rcl_mes(int(_yy), _mm2)
            if _r3 is None:
                continue
            _liq = (sum(MENSAL.get('rc', {}).get(_yy, {}).get(str(_mm2), {}).values())
                    + sum(MENSAL.get('cap', {}).get(_yy, {}).get(str(_mm2), {}).values())
                    - sum(MENSAL.get('ded', {}).get(_yy, {}).get(str(_mm2), {}).values()))
            SERIE.setdefault('rec', {})['%s-%02d' % (_yy, _mm2)] = round(_liq, 2)
    NATUREZA['serie'] = SERIE
    NATUREZA['pessoal12'] = {
        'de': '%02d/%d' % (_janela[0][1], _janela[0][0]), 'ate': '%02d/%d' % (_janela[-1][1], _janela[-1][0]),
        'pessoal': round(_pes, 2), 'rcl': round(_rcl, 2), 'meses': 12 - len(_faltam), 'faltam': _faltam}
    print('pessoal 12 meses %s a %s: %.2f / RCL %.2f = %.2f%% (%d meses%s)'
          % (NATUREZA['pessoal12']['de'], NATUREZA['pessoal12']['ate'], _pes, _rcl,
             (_pes / _rcl * 100) if _rcl else 0, 12 - len(_faltam),
             ', faltam ' + ', '.join(_faltam) if _faltam else ''))
except Exception as _e:
    print('natureza não carregada:', _e)

# ---------------------------------------------------- gastos exigidos por lei
# Mínimos/tetos que a lei impõe ao gasto (educação 25%, saúde 15%, pessoal 60%
# da RCL, Câmara 6%). Por mês: base de cálculo da receita (impostos e
# transferências constitucionais), RCL aproximada, repasses que NÃO são
# imposto (descontados do gasto em educação/saúde) e o empenhado por função.
# Aproximação gerencial — não substitui SIOPE/SIOPS/RREO.
_TRANSF_IMPOSTOS = {'1711511100', '1711512100', '1711520100', '1721500100', '1721510100', '1721520100'}
_LEIS_EDU_FED = {'CF art. 212, §5º', 'Leis do FNDE (PNAE/PNATE)'}
_GLOSA = {'EDUCAÇÃO': ['ALIMENT', 'PREVID', 'APOSENT', 'PENS', 'INATIV'],
          'SAÚDE': ['ALIMENT', 'PREVID', 'APOSENT', 'PENS', 'INATIV', 'SANEAMENTO', 'LIMPEZA']}
LEI = {'ano': None, 'meses': {}, 'fechado': None}
try:
    _df = json.load(open(os.path.join(BASE, 'dados_funcao.json'), encoding='utf-8'))
    _ano_f = max(_df.get('anos', {}), default=None)
    if _ano_f:
        LEI['ano'] = int(_ano_f)
        _h = __import__('datetime').date.today()
        LEI['fechado'] = (_h.month - 1) if int(_ano_f) == _h.year and _h.month > 1 else 12
        for _m, _v in _df['anos'][_ano_f].items():
            _rc = MENSAL.get('rc', {}).get(_ano_f, {}).get(_m)
            if not _rc:
                continue   # sem receita do mês ainda — não há base de cálculo
            _ded = sum(MENSAL.get('ded', {}).get(_ano_f, {}).get(_m, {}).values())
            _f, _g = {}, {'EDUCAÇÃO': 0.0, 'SAÚDE': 0.0}
            for _l in _v['linhas']:
                _f[_l[0]] = _f.get(_l[0], 0.0) + _l[5]       # LIQUIDADO por função (regime de competência)
                # glosa: gasto que a lei não deixa contar no mínimo (inativos/pensionistas, alimentação
                # e, na saúde, saneamento e limpeza urbana) — LDB art. 71 e LC 141/2012 art. 4º
                if _l[0] in _g and any(k in _norm_desp(_l[1]) for k in _GLOSA[_l[0]]):
                    _g[_l[0]] += _l[5]
            LEI['meses'][_m] = {
                'rit': round(sum(x for c, x in _rc.items()
                                 if D['tipos'].get(c) == 'Impostos' or c in _TRANSF_IMPOSTOS), 2),
                'rcl': round(sum(_rc.values()) - _ded, 2),
                'edu_fed': round(sum(x for c, x in _rc.items()
                                     if classifica(c, D['tipos'].get(c, ''), D['nomes'].get(c, ''))[1] in _LEIS_EDU_FED), 2),
                'saude_fed': round(sum(x for c, x in _rc.items()
                                       if classifica(c, D['tipos'].get(c, ''), D['nomes'].get(c, ''))[1] == 'LC 141/2012'), 2),
                'edu': round(_f.get('EDUCAÇÃO', 0.0) - _g['EDUCAÇÃO'], 2),
                'saude': round(_f.get('SAÚDE', 0.0) - _g['SAÚDE'], 2),
                'edu_glosa': round(_g['EDUCAÇÃO'], 2), 'saude_glosa': round(_g['SAÚDE'], 2),
            }
except Exception as _e:
    print('gastos por lei não carregados:', _e)
print('despesas carregadas:', len(DESPESAS['meses']), 'meses de', DESPESAS['ano'])

# Receita x Despesas — só o ano de 2026 (o mesmo ano coletado em Despesas),
# mês a mês: Receita líquida (Corrente + Capital − Deduções) contra o que
# foi Empenhado e o que foi de fato Pago, pra enxergar o equilíbrio
# financeiro do município.
ANO_EQUILIBRIO = str(DESPESAS['ano']) if DESPESAS.get('ano') else '2026'
def _receita_liquida_mes(mes):
    def soma(chave):
        return sum(MENSAL.get(chave, {}).get(ANO_EQUILIBRIO, {}).get(str(mes), {}).values())
    return soma('rc') + soma('cap') - soma('ded')
EQUILIBRIO = {
    'ano': int(ANO_EQUILIBRIO),
    'meses': [[m, round(_receita_liquida_mes(m), 2), emp, pag]
              for m, emp, liq, pag in DESPESAS['meses']],
}

# ---------------------------------------------------------------- Art. 29-A
# Teto constitucional de repasse à Câmara (CF, art. 29-A): 6% (faixa de
# 100.001 a 300.000 habitantes) sobre a Receita Tributária própria + as
# transferências dos arts. 153 §5º, 158 e 159 da CF, EFETIVAMENTE REALIZADAS
# no exercício ANTERIOR (2025) — nunca a RCL, nunca orçado, nunca o ano
# atual. Valores brutos (antes da dedução do FUNDEB) — ponto que varia de
# orientação entre Tribunais de Contas; validar com a contabilidade do
# município se precisar bater com o RGF oficial.
CODIGOS_ART29A = [
    # Receita Tributária própria (Impostos + Taxas)
    '1112500100', '1112500200', '1112500300', '1112500400',        # IPTU
    '1112530100', '1112530300', '1112530400',                      # ITBI
    '1113031100', '1113034100',                                    # IRRF retido na fonte (art.158,I)
    '1114511100', '1114511200', '1114511300', '1114511400',        # ISSQN
    '1121010100', '1121010300', '1121010400',                      # Taxas de fiscalização
    '1121022300', '1121022400', '1121040100', '1121500100',        # Taxas de fiscalização (outras)
    '1122010101', '1122010102', '1122010110', '1122010300',        # Taxas de serviços
    '1122530100', '1122530300', '1122530400',                      # Taxas de serviços (limpeza)
    # Transferências constitucionais (art. 158 e 159)
    '1711511100', '1711512100',                                    # Cota-parte FPM
    '1711520100',                                                  # Cota-parte ITR
    '1721500100',                                                  # Cota-parte ICMS
    '1721510100',                                                  # Cota-parte IPVA
    '1721520100',                                                  # Cota-parte IPI-Municípios
    '1721530100',                                                  # Cota-parte CIDE
]
_receita_2025 = D.get('anos', {}).get('2025', {})
BASE_ART29A_2025 = sum(_receita_2025.get(c, {}).get('ate_per', 0) for c in CODIGOS_ART29A)
TETO_CAMARA_2026 = BASE_ART29A_2025 * 0.06

_orgpm = DESPESAS.get('orgaos_por_mes', {})
_CAM_RE = __import__('re').compile(r'^C.MARA')
_emp_camara = sum(o[3] for m in _orgpm.values() for o in m if _CAM_RE.match(o[0]))
_pag_camara = sum(o[5] for m in _orgpm.values() for o in m if _CAM_RE.match(o[0]))
# Valor Inicial (LOA) da Câmara — mesmo pra qualquer mês (é o orçado no ano),
# só como referência ao lado do teto constitucional calculado; não muda a
# conta do teto em si.
_loa_camara = next((o[1] for m in _orgpm.values() for o in m if _CAM_RE.match(o[0])), 0)
ART29A = {
    'base_2025': round(BASE_ART29A_2025, 2),
    'teto_2026': round(TETO_CAMARA_2026, 2),
    'emp_camara_2026': round(_emp_camara, 2),
    'pag_camara_2026': round(_pag_camara, 2),
    'loa_camara_2026': round(_loa_camara, 2),
    'meses_coletados': len(_orgpm),
    # empenhado da Câmara mês a mês (pro Painel de Comando acumular até o mês escolhido)
    'camara_mes': {m: round(sum(o[3] for o in v if _CAM_RE.match(o[0])), 2) for m, v in _orgpm.items()},
}
print('Art. 29-A — base 2025: %.2f | teto 2026 (6%%): %.2f | Câmara empenhado: %.2f | Câmara pago: %.2f | LOA Câmara: %.2f'
      % (BASE_ART29A_2025, TETO_CAMARA_2026, _emp_camara, _pag_camara, _loa_camara))

# ------------------------------------------------------- Visão do Prefeito
# Números que só existem pra essa tela: dotação (LOA atualizada), arrecadação
# comparada ao mesmo período do ano anterior (só meses FECHADOS) e o gasto
# por função de governo.
PREFEITO = {'dot_ini': 0, 'dot_atual': 0, 'comp': None, 'funcoes': []}
try:
    if DESPESAS.get('dot_total') and DESPESAS['dot_total'][1]:
        PREFEITO['dot_ini'], PREFEITO['dot_atual'] = DESPESAS['dot_total']
    _anos_dp = _dp['anos'][_ano_desp]
    _ult = max((int(m) for m, v in _anos_dp.items() if v.get('emp')), default=None)
    if _ult and not PREFEITO['dot_atual']:
        # o mês corrente ainda está em andamento (a dotação "atual" dele pode não
        # refletir os remanejamentos) — vale o último mês fechado
        _hoje = __import__('datetime').date.today()
        if int(_ano_desp) == _hoje.year and _ult == _hoje.month and _ult > 1:
            _ult -= 1
        PREFEITO['dot_ini'] = _anos_dp[str(_ult)]['ini']
        PREFEITO['dot_atual'] = _anos_dp[str(_ult)]['atual']
except Exception as _e:
    print('dotação não carregada:', _e)
try:
    _a, _ap = ANO_EQUILIBRIO, str(int(ANO_EQUILIBRIO) - 1)
    _M = max(int(m) for m in MENSAL['rc'][_a])
    def _liq(ano, ate):
        t = 0.0
        for _m in range(1, ate + 1):
            for chave, sinal in (('rc', 1), ('cap', 1), ('ded', -1)):
                t += sinal * sum(MENSAL.get(chave, {}).get(ano, {}).get(str(_m), {}).values())
        return t
    if _M >= 2:
        PREFEITO['comp'] = {'ate': _M - 1, 'atual': round(_liq(_a, _M - 1), 2),
                            'anterior': round(_liq(_ap, _M - 1), 2), 'ano': int(_a)}
except Exception as _e:
    print('comparativo de arrecadação não calculado:', _e)
try:
    _fx = {}
    for _m, _v in _df['anos'][_ano_f].items():
        for _l in _v['linhas']:
            _fx[_l[0]] = _fx.get(_l[0], 0.0) + _l[4]
    PREFEITO['func_mes'] = {_m: {} for _m in _df['anos'][_ano_f]}
    for _m, _v in _df['anos'][_ano_f].items():
        for _l in _v['linhas']:
            PREFEITO['func_mes'][_m][_l[0]] = round(PREFEITO['func_mes'][_m].get(_l[0], 0.0) + _l[4], 2)
    PREFEITO['funcoes'] = [[k, round(v, 2)] for k, v in sorted(_fx.items(), key=lambda kv: -kv[1]) if v > 0][:9]
except Exception as _e:
    print('gasto por função não carregado:', _e)

# Receitas com destino obrigatório (só as classificadas em 100% por lei, pela
# coluna Destinação da aba de receita), somadas nos meses coletados do ano.
VINCULADAS = {'ano': int(ANO_EQUILIBRIO), 'bruta': 0.0, 'areas': {}, 'mes': {}, 'bruta_mes': {}, 'livre_mes': {}, 'nc_mes': {}}
try:
    for _chave in ('rc', 'cap'):
        for _m, _regs in MENSAL.get(_chave, {}).get(ANO_EQUILIBRIO, {}).items():
            for _c, _x in _regs.items():
                VINCULADAS['bruta'] += _x
                VINCULADAS['bruta_mes'][_m] = VINCULADAS['bruta_mes'].get(_m, 0.0) + _x
                _tp, _lei = classifica(_c, D['tipos'].get(_c, ''), D['nomes'].get(_c, ''))
                if _tp == 0:
                    VINCULADAS['livre_mes'][_m] = VINCULADAS['livre_mes'].get(_m, 0.0) + _x
                elif _tp is None:
                    VINCULADAS['nc_mes'][_m] = VINCULADAS['nc_mes'].get(_m, 0.0) + _x
                if _tp != 100:
                    continue
                _ar = area_vinc(_c, D['tipos'].get(_c, ''), D['nomes'].get(_c, '')) or 'Outras'
                _a = VINCULADAS['areas'].setdefault(_ar, {'recebido': 0.0, 'leis': []})
                _a['recebido'] += _x
                _mm_ = VINCULADAS['mes'].setdefault(_m, {})
                _mm_[_ar] = _mm_.get(_ar, 0.0) + _x
                if _lei and _lei not in _a['leis']:
                    _a['leis'].append(_lei)
    VINCULADAS['bruta'] = round(VINCULADAS['bruta'], 2)
    VINCULADAS['bruta_mes'] = {k: round(v, 2) for k, v in VINCULADAS['bruta_mes'].items()}
    VINCULADAS['livre_mes'] = {k: round(v, 2) for k, v in VINCULADAS['livre_mes'].items()}
    VINCULADAS['nc_mes'] = {k: round(v, 2) for k, v in VINCULADAS['nc_mes'].items()}
    VINCULADAS['mes'] = {m: {k: round(v, 2) for k, v in d.items()} for m, d in VINCULADAS['mes'].items()}
    for _a in VINCULADAS['areas'].values():
        _a['recebido'] = round(_a['recebido'], 2)
    PREFEITO['func_all'] = {k: round(v, 2) for k, v in _fx.items() if v > 0}
except Exception as _e:
    print('receitas vinculadas não calculadas:', _e)

try:
    RREO = json.load(open(os.path.join(BASE, 'dados_rreo.json'), encoding='utf-8'))
except Exception:
    RREO = {}

DATA = {
    'rc':  bloco('1'),
    'cap': bloco('2'),
    'ded': bloco('9'),
    'mensal': MENSAL,
    'meta': META,
    'coleta': D.get('coletado_em', ''),
    'contratos': CONTRATOS,
    'ct_coleta': CT_COLETA,
    'rh_ref': RH_REF,
    'pessoal_hist': PESSOAL_HIST,
    'despesas': DESPESAS,
    'natureza': NATUREZA,
    'lei': LEI,
    'prefeito': PREFEITO,
    'rreo': RREO,
    'serie': NATUREZA.get('serie', {'pes': {}, 'rcl': {}}),
    'vinculadas': VINCULADAS,
    'equilibrio': EQUILIBRIO,
    'art29a': ART29A,
    'dp_coleta': DP_COLETA,
    'rh':  [[txt(r['Nome']), txt(r['Cargo']), txt(r['Tipo']), txt(r['Situação']),
             txt(r['Secretaria']), num(r['Vencimentos']), num(r['Bruto']), num(r['Líquido'])]
            for _, r in rh.iterrows()],
}

HTML = r'''<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receita · Nova Lima</title>
<style>
  :root{
    --bg:#FFFFFF; --sup:#F7F8FA;
    --t1:#14161A; --t2:#4A5160; --t3:#6B7280;
    --linha:#E7E9ED; --trilho:#EFF1F5;
    --acento:#1F6FEB; --acento-fraco:#CFE0FB;
    --alta:#12805C; --baixa:#C4272D; --parcial:#B07600;
    --r:10px;
  }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:var(--bg); color:var(--t1); font-size:14px;
        font-family:"Segoe UI",Segoe,-apple-system,Helvetica,sans-serif;
        -webkit-font-smoothing:antialiased; }
  .env{ max-width:1680px; margin:0 auto; padding:0 48px 72px; }
  @media (max-width:1400px){ .env{ max-width:100%; padding:0 40px 64px; } }
  @media (max-width:760px){ .env{ padding:0 20px 48px; } }

  .rot{ font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--t3); }
  .sep{ height:1px; background:var(--linha); }

  /* ---------------- topo ---------------- */
  header{ position:sticky; top:0; z-index:20; background:rgba(255,255,255,.92);
          backdrop-filter:blur(8px); border-bottom:1px solid var(--linha); }
  .topo{ max-width:1680px; margin:0 auto; padding:0 48px;
         display:flex; align-items:center; gap:24px; height:60px; flex-wrap:nowrap; }
  .topo nav{ flex-wrap:nowrap; min-width:0; gap:16px; }
  @media (max-width:1180px){ .topo{ flex-wrap:wrap; height:auto; padding-top:10px; padding-bottom:10px; } .topo nav{ flex-wrap:wrap; } }
  @media (max-width:1400px){ .topo{ max-width:100%; padding:0 40px; } }
  @media (max-width:760px){ .topo{ padding:0 20px; gap:18px; height:auto;
                                   padding-top:12px; padding-bottom:12px; } }
  .marca{ font-size:15px; font-weight:700; letter-spacing:-.01em; white-space:nowrap;
          color:var(--t1); }
  nav{ display:flex; align-items:center; gap:22px; flex-wrap:wrap; }
  nav b{ font-size:13.5px; font-weight:400; color:var(--t3); cursor:pointer;
         padding:6px 0; border-bottom:2px solid transparent; user-select:none;
         white-space:nowrap; }
  nav b:hover{ color:var(--t2); }
  nav b.on{ color:var(--t1); font-weight:600; border-bottom-color:var(--acento); }
  nav b.grupoLabel{ font-weight:700; color:var(--t1); cursor:default; padding:6px 0; }
  nav b.grupoLabel:hover{ color:var(--t1); }
  nav .espaco{ width:14px; }
  #btnAuditoria{ display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--t2); cursor:pointer;
                 padding:7px 14px; border:1px solid var(--linha); border-radius:100px; background:var(--bg); white-space:nowrap; user-select:none; }
  #btnAuditoria:hover{ border-color:#B9BFC9; color:var(--t1); }
  #audModal{ display:none; position:fixed; inset:0; z-index:100; background:rgba(15,23,42,.45); overflow:auto; padding:28px 16px; }
  #audModal.on{ display:block; }
  .audCaixa{ max-width:900px; margin:0 auto; background:var(--bg); border-radius:14px; padding:22px 26px 26px; box-shadow:0 18px 60px rgba(15,23,42,.35); }
  .audTopo{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; border-bottom:1px solid var(--linha); padding-bottom:14px; }
  .audTit{ font-size:21px; font-weight:700; color:var(--t1); }
  .audSub{ font-size:12.5px; color:var(--t3); margin-top:3px; line-height:1.5; }
  .audBtns{ display:flex; gap:8px; flex:none; }
  .audBtns button{ font:inherit; font-size:12.5px; font-weight:600; padding:8px 14px; border-radius:100px; border:1px solid var(--linha); background:var(--bg); color:var(--t2); cursor:pointer; }
  .audBtns button:hover{ border-color:#B9BFC9; color:var(--t1); }
  .audResumo{ display:flex; gap:22px; flex-wrap:wrap; margin:14px 0 4px; font-size:13.5px; color:var(--t1); }
  .audResumo span{ display:inline-flex; align-items:center; gap:7px; font-weight:600; }
  .audGrupo{ margin:18px 0 4px; font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--t2); font-weight:700; }
  .audItem{ display:grid; grid-template-columns:14px 1fr auto; gap:12px; padding:9px 0; border-bottom:1px solid var(--linha); break-inside:avoid; }
  .audItem:last-child{ border-bottom:0; }
  .audItem .tt{ font-size:14px; color:var(--t1); line-height:1.45; }
  .audItem .dd{ font-size:12.5px; color:var(--t3); line-height:1.5; margin-top:2px; }
  .audItem .vv{ font-size:13px; font-weight:700; white-space:nowrap; color:var(--t1); font-variant-numeric:tabular-nums; }
  .bol{ width:12px; height:12px; border-radius:50%; margin-top:4px; display:inline-block; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bol.v{ background:#D92D20; } .bol.l{ background:#F79009; } .bol.o{ background:#12B76A; }
  .audRodape{ margin-top:18px; padding-top:12px; border-top:1px solid var(--linha); font-size:11.5px; color:var(--t3); line-height:1.55; }
  @media print{
    body > header, body > .env{ display:none !important; }
    #audModal{ position:static !important; display:block !important; background:none !important; padding:0 !important; overflow:visible !important; }
    .audCaixa{ box-shadow:none !important; max-width:none !important; padding:0 !important; border-radius:0 !important; }
    .audBtns{ display:none !important; }
    @page{ margin:14mm 12mm; }
  }
  .acoes{ margin-left:auto; display:flex; align-items:center; gap:8px; }
  #btnLimpar{ display:none; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:var(--t2);
              cursor:pointer; padding:7px 14px; border:1px solid var(--linha); border-radius:100px; background:var(--bg);
              white-space:nowrap; user-select:none; }
  #btnLimpar:hover{ border-color:#B9BFC9; }
  #btnAtualizar{ margin-left:0; display:flex; align-items:center; justify-content:center;
                 width:34px; height:34px; font-size:18px; line-height:1; font-weight:600; color:var(--t2); cursor:pointer;
                 border:1px solid var(--linha); border-radius:50%;
                 background:var(--bg); user-select:none; }
  #btnAtualizar:hover{ border-color:#B9BFC9; color:var(--t1); }

  /* ---------------- título da página ---------------- */
  .topopag{ display:flex; align-items:flex-end; justify-content:space-between;
            gap:28px; padding:32px 0 0; flex-wrap:wrap; }
  .cab{ display:flex; align-items:flex-end; gap:32px; flex-wrap:wrap; }
  h1{ font-size:24px; font-weight:600; letter-spacing:-.02em; line-height:1.15; }
  /* Título e subtítulo na mesma linha (ganha altura); se o subtítulo for
     comprido demais pra caber ao lado, ele quebra pra baixo sozinho. */
  .cab > div{ display:flex; align-items:baseline; flex-wrap:wrap; gap:4px 16px; }
  .cab p{ color:var(--t3); font-size:12.5px; margin-top:0; }
  .topopag .filtros{ padding:0; justify-content:flex-end; }
  .topopag .filtros .resumo{ margin-left:10px; }

  /* ---------------- filtro de anos ---------------- */
  .filtros{ display:flex; align-items:center; gap:8px; flex-wrap:wrap;
            padding:20px 0 0; }
  .ano{ font-size:12.5px; color:var(--t2); cursor:pointer; user-select:none;
        padding:6px 14px; border:1px solid var(--linha); border-radius:100px;
        background:var(--bg); transition:.12s; white-space:nowrap; }
  .ano:hover{ border-color:#B9BFC9; }
  .ano.on{ background:var(--acento); border-color:var(--acento); color:#fff;
           font-weight:600; }
  .ano.parcial::after{ content:'·'; color:var(--parcial); margin-left:5px;
                       font-weight:700; }
  .ano.on.parcial::after{ color:#FFE9B0; }
  .resumo{ margin-left:auto; font-size:12.5px; color:var(--t3); white-space:nowrap; }
  .resumo b{ color:var(--t2); font-weight:600; }
  .resumo u{ text-decoration:none; color:var(--acento); }

  /* ---------------- indicadores ---------------- */
  .kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:30px;
         padding:26px 0 4px; }
  @media (max-width:900px){ .kpis{ grid-template-columns:repeat(2,1fr); gap:22px; } }
  .kpi .rot{ font-size:12.5px; font-weight:700; letter-spacing:.04em; color:var(--t1); }
  /* Cartão em coluna e o histórico empurrado pro fim: cartões de alturas
     diferentes (Servidores não tem a linha do valor exato) ficam com os
     meses anteriores alinhados na mesma linha. */
  .kpi{ display:flex; flex-direction:column; }
  .kpi .s{ margin-bottom:10px; }
  .kpi .hist{ margin-top:auto; padding-top:6px; max-width:250px; border-top:1px solid var(--linha); }
  .kpi .hist div{ display:flex; justify-content:space-between; gap:12px; font-size:11.5px;
                  color:var(--t3); line-height:1.75; }
  .kpi .hist b{ font-weight:500; color:var(--t2); font-variant-numeric:tabular-nums; }
  .kpi .v{ font-size:30px; font-weight:300; letter-spacing:-.02em; margin-top:8px;
           line-height:1.1; }
  .kpi .x{ font-size:13px; color:var(--t2); margin-top:6px; font-weight:600;
           font-variant-numeric:tabular-nums; white-space:nowrap; }
  .kpi .s{ font-size:12.5px; color:var(--t3); margin-top:4px;
           overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* ---------------- seções ---------------- */
  .secao{ padding:34px 0 0; }
  .secao > .rot{ margin-bottom:16px; }
  .duplo{ display:grid; grid-template-columns:1.35fr 1fr; gap:52px; }
  @media (max-width:900px){ .duplo{ grid-template-columns:1fr; gap:34px; } }

  /* ---------------- gráfico de colunas ---------------- */
  .colunas{ width:100%; }
  .colunas svg{ display:block; width:100%; overflow:visible; }
  .cv{ fill:var(--t2); font-size:12px; font-variant-numeric:tabular-nums; }
  .cc{ fill:var(--t2); font-size:12px; font-weight:600; }
  .cc.on{ fill:var(--t1); font-weight:700; }
  .cv{ font-weight:600; }
  .cb{ fill:var(--acento-fraco); cursor:pointer; transition:fill .14s; }
  .cb:hover{ fill:#A9CBF7; }
  .cb.on{ fill:var(--acento); }
  .cb.amb{ fill:var(--parcial); fill-opacity:.30; }
  .cb.amb:hover{ fill-opacity:.45; }
  .cb.amb.on{ fill:var(--parcial); fill-opacity:1; }

  /* ---------------- listas com barra ---------------- */
  .lista{ display:flex; flex-direction:column; }
  .lista.rola{ max-height:470px; overflow-y:auto; padding-right:10px; }
  .lista.rola::-webkit-scrollbar{ width:9px; }
  .lista.rola::-webkit-scrollbar-track{ background:var(--trilho); border-radius:5px; }
  .lista.rola::-webkit-scrollbar-thumb{ background:#C7CCD5; border-radius:5px;
                                        border:2px solid var(--trilho);
                                        background-clip:content-box; }
  .lista.rola::-webkit-scrollbar-thumb:hover{ background:#AAB1BD;
                                              background-clip:content-box; }
  .lin{ display:grid; grid-template-columns:minmax(140px,1fr) minmax(100px,1.3fr) 58px 158px;
        align-items:center; gap:14px; padding:9px 0;
        border-bottom:1px solid var(--linha); }
  .lin:last-child{ border-bottom:0; }
  .lin.clic{ cursor:pointer; }
  .lin.clic:hover .n{ color:var(--acento); }
  .lin.sel .n{ color:var(--acento); font-weight:600; }
  .lin .n{ font-size:12.5px; color:var(--t1); overflow:hidden; text-overflow:ellipsis;
           white-space:nowrap; }
  .lin .b{ height:7px; background:var(--trilho); border-radius:4px; overflow:hidden; }
  .lin .b i{ display:block; height:100%; background:var(--acento); border-radius:4px;
             transition:width .2s; }
  .lin .v{ font-size:13px; text-align:right; color:var(--t1);
           font-variant-numeric:tabular-nums; }
  .lin .p{ font-size:12.5px; text-align:right; color:var(--t3);
           font-variant-numeric:tabular-nums; }
  .lin.esm{ opacity:.38; }
  /* tabela de fontes com as 3 colunas de vinculação legal (%, valor, lei) */
  .lin.vinc, .cabl.vinc{ grid-template-columns:minmax(170px,1.2fr) minmax(50px,.4fr) 52px 150px 62px 150px 150px minmax(150px,1fr); }
  .lin .vp, .lin .vv, .lin .vl, .lin .va{ font-size:12.5px; color:var(--t3); }
  .lin .vp, .lin .vv{ text-align:right; font-variant-numeric:tabular-nums; }
  .lin .vl, .lin .va{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lin .r{ color:var(--baixa); font-weight:600; }
  .lin .ac{ color:var(--parcial); }
  .lin .va.ac, .lin .vl.ac{ font-size:11.5px; font-style:italic; }
  .cabl.vinc span:nth-child(5),.cabl.vinc span:nth-child(6){ text-align:right; }
  @media (max-width:1100px){
    .lin.vinc, .cabl.vinc{ grid-template-columns:minmax(150px,1fr) 52px 140px 62px 140px; }
    .lin.vinc .b, .cabl.vinc span:nth-child(2), .lin.vinc .vl, .lin.vinc .va, .cabl.vinc span:nth-child(7), .cabl.vinc span:nth-child(8){ display:none; }
  }
  @media (max-width:620px){
    .lin{ grid-template-columns:1fr 140px; gap:8px; }
    .lin .b, .lin .p{ display:none; }
    .lin.vinc, .cabl.vinc{ grid-template-columns:1fr 140px; }
    .lin.vinc .vp, .lin.vinc .vv, .cabl.vinc span:nth-child(5), .cabl.vinc span:nth-child(6){ display:none; }
  }
  .cabl{ display:grid; grid-template-columns:minmax(140px,1fr) minmax(100px,1.3fr) 58px 158px;
         gap:14px; padding-bottom:9px; border-bottom:1px solid var(--linha); }
  .cabl span{ font-size:10.5px; letter-spacing:.07em; text-transform:uppercase;
              color:var(--t3); }
  .cabl span:nth-child(3),.cabl span:nth-child(4){ text-align:right; }
  @media (max-width:620px){ .cabl{ grid-template-columns:1fr 140px; }
                            .cabl span:nth-child(2),.cabl span:nth-child(3){ display:none; } }

  /* ---------------- Visão do Prefeito ---------------- */
  .pfrase{ border:1px solid var(--cs); border-left:6px solid var(--cs); border-radius:var(--r);
           background:var(--sup); padding:16px 20px; font-size:16px; line-height:1.55;
           color:var(--t1); margin:4px 0 18px; }
  .pfrase b{ color:var(--cs); }
  .pgrid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(255px,1fr)); gap:14px; margin:4px 0 6px; }
  .pcard{ border:1px solid var(--linha); border-left:5px solid var(--cs); border-radius:var(--r);
          padding:14px 18px 15px; background:var(--bg); cursor:pointer; transition:box-shadow .15s; }
  .pcard:hover{ box-shadow:0 3px 14px rgba(20,22,26,.10); }
  .pcard .pt{ font-size:11px; letter-spacing:.07em; text-transform:uppercase; color:var(--t3);
              display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .pcard .tag{ font-size:10px; font-weight:700; letter-spacing:.04em; padding:2px 8px; border-radius:10px;
               color:#fff; background:var(--cs); white-space:nowrap; }
  .pcard .pb{ font-size:30px; font-weight:700; line-height:1.1; margin:9px 0 3px; color:var(--cs);
              font-variant-numeric:tabular-nums; }
  .pcard .ps{ font-size:13px; color:var(--t1); line-height:1.45; }
  .pcard .pl{ font-size:11.5px; color:var(--t3); margin-top:7px; line-height:1.45; }
  .pcard .pm{ position:relative; height:8px; background:var(--trilho); border-radius:5px; margin:10px 0 2px; }
  .pcard .pm i{ position:absolute; left:0; top:0; height:100%; background:var(--cs); border-radius:5px; }
  .pcard .pm u{ position:absolute; top:-3px; height:14px; width:2px; background:var(--t2); }
  .pgrid.p3{ grid-template-columns:repeat(3,minmax(0,1fr)); }
  .pgrid.p2{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  @media(max-width:560px){ .pgrid.p2{ grid-template-columns:1fr; } }
  @media(max-width:900px){ .pgrid.p3{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:560px){ .pgrid.p3{ grid-template-columns:1fr; } }
  .palerta{ display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--linha);
            font-size:13.5px; line-height:1.5; color:var(--t1); cursor:pointer; }
  .palerta:last-child{ border-bottom:0; }
  .palerta:hover{ color:var(--acento); }
  .palerta i{ flex:none; width:10px; height:10px; border-radius:50%; background:var(--cs); margin-top:6px; }
  /* ---------------- Painel de Comando ---------------- */
  .cgrid{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:6px 0 4px; }
  @media(max-width:900px){ .cgrid{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
  .cg{ border:1px solid var(--linha); border-radius:var(--r); background:var(--bg); padding:12px 10px 14px;
       text-align:center; cursor:pointer; transition:box-shadow .15s,border-color .15s; }
  .cg:hover{ box-shadow:0 3px 14px rgba(20,22,26,.10); border-color:var(--cs); }
  .dgrid{ display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:14px; margin:14px 0 0; }
  .dgrid > .secao{ padding:14px 16px 16px; border:1px solid var(--linha); border-radius:var(--r); background:var(--bg); min-width:0; }
  .dgrid > .secao > .rot{ margin-bottom:12px; color:var(--t2); font-weight:700; }
  .colbox{ min-width:0; }
  .colbox > .secao{ margin-top:14px; padding:14px 16px 16px; border:1px solid var(--linha); border-radius:var(--r); background:var(--bg); }
  .colbox > .secao > .rot{ margin-bottom:12px; color:var(--t2); font-weight:700; }
  .colcards{ display:flex; flex-direction:column; min-width:0; }
  .colcards > .pgrid{ flex:1; margin:0; grid-auto-rows:1fr; }   /* cartões preenchem a altura do quadrante ao lado */
  .c3{ grid-column:span 3; } .c4{ grid-column:span 4; } .c5{ grid-column:span 5; } .c6{ grid-column:span 6; } .c7{ grid-column:span 7; }
  @media(max-width:1100px){ .c3,.c4{ grid-column:span 6; } .c5,.c6,.c7{ grid-column:span 12; } }
  @media(max-width:700px){ .dgrid > .secao{ grid-column:span 12; } }
  .c12{ grid-column:span 12; }
  .rv.sel{ background:var(--sup); }
  .rv.sel .n{ color:var(--acento); font-weight:700; }
  .rv.esm{ opacity:.45; }
  .pjt{ margin:14px 0 8px; padding-top:12px; border-top:1px solid var(--linha); font-size:11px; letter-spacing:.07em;
        text-transform:uppercase; color:var(--t2); font-weight:700; }
  .pjt span{ text-transform:none; letter-spacing:0; font-weight:400; color:var(--t3); }
  .pjg{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 22px; }
  .pj{ display:flex; justify-content:space-between; gap:8px; padding:4px 6px; border-bottom:1px solid var(--linha); font-size:12.5px; }
  .pj span{ color:var(--t2); } .pj b{ font-weight:600; font-variant-numeric:tabular-nums; color:var(--t1); }
  .pj.on{ background:var(--sup); } .pj.on span{ color:var(--acento); font-weight:700; }
  .pjs{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-top:10px; }
  .pjs > div{ background:var(--sup); border-radius:var(--r); padding:8px 12px; }
  .pjs small{ display:block; font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; color:var(--t3); }
  .pjs b{ font-size:15px; font-variant-numeric:tabular-nums; }
  .vbar{ display:flex; height:16px; border-radius:8px; overflow:hidden; background:var(--trilho); margin:4px 0 6px; }
  .vleg{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--t2); margin-bottom:12px; }
  .vleg i{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; }
  .vrow{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) 72px 72px 56px; gap:12px; align-items:center;
         padding:8px 4px; border-bottom:1px solid var(--linha); font-size:13px; cursor:pointer; }
  .vrow:hover .n{ color:var(--acento); }
  .vrow.cab{ cursor:default; font-size:11px; color:var(--t3); letter-spacing:.06em; text-transform:uppercase; padding-top:2px; }
  .vrow .n{ font-weight:600; color:var(--t1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vrow .bb{ display:flex; flex-direction:column; gap:4px; }
  .vrow .bb .t{ height:8px; background:var(--trilho); border-radius:4px; overflow:hidden; }
  .vrow .bb .t i{ display:block; height:100%; border-radius:4px; }
  .vrow .bb .rr i{ background:var(--acento); }
  .vrow .bb .gg i{ background:#8A94A6; }
  .vrow .bb em{ font-size:10.5px; font-style:italic; color:var(--parcial); line-height:1.2; }
  .vsem{ margin-top:10px; padding:9px 12px; border-radius:var(--r); background:#FFF6E0; border:1px solid #F1D48A; font-size:12.5px; color:#6B4A00; line-height:1.5; }
  .vlegd{ display:flex; gap:16px; flex-wrap:wrap; font-size:11.5px; color:var(--t2); margin:0 0 6px; }
  .vlegd i{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; }
  .vrow .q, .vrow .p{ text-align:right; font-variant-numeric:tabular-nums; }
  .vrow .p{ font-weight:700; }
  .vdet{ background:var(--sup); border-radius:var(--r); padding:9px 12px; margin:2px 0 6px; font-size:12.5px; color:var(--t2); line-height:1.55; }
  .rv{ display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr) 42px 44px; gap:10px; align-items:center;
       font-size:12.5px; padding:6px 0; border-bottom:1px solid var(--linha); cursor:pointer; }
  .rv:last-child{ border-bottom:0; }
  .rv:hover .n{ color:var(--acento); }
  .rv .n{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--t1); }
  .rv .b{ height:7px; background:var(--trilho); border-radius:4px; overflow:hidden; }
  .rv .b i{ display:block; height:100%; background:var(--acento); border-radius:4px; }
  .rv .p{ text-align:right; color:var(--t3); font-variant-numeric:tabular-nums; }
  .rv .q{ text-align:right; color:var(--t1); font-variant-numeric:tabular-nums; }
  .rk{ display:grid; grid-template-columns:92px 1fr 40px; gap:8px; align-items:center; font-size:12px; padding:5px 0; cursor:pointer; }
  .rk:hover .n{ color:var(--acento); }
  .rk .n{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--t1); }
  .rk .b{ height:8px; background:var(--trilho); border-radius:4px; overflow:hidden; }
  .rk .b i{ display:block; height:100%; background:var(--acento); border-radius:4px; }
  .rk .p{ text-align:right; color:var(--t3); font-variant-numeric:tabular-nums; }
  .linhaTopo{ display:flex; align-items:center; gap:18px; flex-wrap:wrap; margin:6px 0 10px; }
  .linhaTopo .cbar{ margin:0; flex:none; }
  .cgrid.inl{ display:flex; gap:12px; margin:8px 0 0 auto; flex:none; justify-content:flex-end; align-self:flex-start; }
  .cgrid.inl .cg{ display:flex; flex-direction:column; align-items:center; padding:2px 8px 0; border:0;
                  border-radius:var(--r); background:transparent; text-align:center; }
  .cgrid.inl .cg:hover{ box-shadow:none; background:var(--sup); }
  .cgrid.inl svg{ width:clamp(101px,7.7vw,132px); flex:none; display:block; overflow:visible; }
  .cgrid.inl .cg{ padding:0 8px; }
  .cgrid.inl .cl{ font-size:11px; font-weight:600; color:var(--t2); line-height:1.15; white-space:nowrap; margin-top:0; }
  .cmdtop{ padding-top:10px !important; align-items:flex-start; }
  .coltit{ min-width:0; flex:1; }
  .coltit .cbar{ margin:10px 0 4px; }
  .ano.ultimo{ border-color:#009C3B; color:#007A2E; background:#E9F7EE; font-weight:700; }
  .ano.ultimo.on{ background:var(--acento); color:#fff; border-color:#009C3B; box-shadow:0 0 0 2px #009C3B55; }
  .cbtodos{ display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--t2); cursor:pointer; user-select:none; margin-right:6px; }
  .cbtodos input{ width:15px; height:15px; accent-color:var(--acento); cursor:pointer; }
  .cgrid.mini{ gap:10px; margin:14px 0 4px; }
  .cgrid.mini .cg{ padding:7px 8px 9px; }
  .cgrid.mini .ct{ font-size:10.5px; }
  .cgrid.mini .cv{ font-size:19px; margin:-2px 0 2px; }
  .cgrid.mini svg{ max-width:104px; display:block; margin:2px auto 0; }
  .cgrid.mini .cs{ font-size:11px; }
  .cgrid.mini .cx{ font-size:10px; }
  .cg .ct{ font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--t3); }
  .cg .cv{ font-size:30px; font-weight:700; line-height:1; margin:-4px 0 4px; color:var(--cs); font-variant-numeric:tabular-nums; }
  .cg .cs{ font-size:12px; color:var(--t2); line-height:1.4; }
  .cg .cx{ font-size:11px; color:var(--t3); line-height:1.4; margin-top:3px; }
  .cbar{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:4px 0 14px; }
  .cbar .ano.parcial{ font-style:italic; opacity:.7; }
  .csel{ display:inline-block; padding:5px 14px; border-radius:100px; font-size:13px; font-weight:700;
         color:#fff; background:var(--cs); }
  .csim{ border:1px solid var(--linha); border-radius:var(--r); background:var(--sup); padding:14px 18px 12px; margin-top:16px; }
  .csim h3{ margin:0 0 2px; font-size:15px; }
  .csim p{ margin:0 0 10px; font-size:12.5px; color:var(--t3); }
  .csl{ display:grid; grid-template-columns:230px 1fr 56px; align-items:center; gap:12px; margin:7px 0; font-size:13px; color:var(--t1); }
  .csl input{ width:100%; accent-color:var(--acento); }
  .csl b{ text-align:right; font-variant-numeric:tabular-nums; }
  @media(max-width:620px){ .csl{ grid-template-columns:120px 1fr 48px; } }
  .ckpi{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:16px 0 4px; }
  .ckpi div{ background:var(--sup); border-radius:var(--r); padding:10px 14px; }
  .ckpi small{ display:block; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--t3); }
  .ckpi b{ font-size:20px; font-variant-numeric:tabular-nums; }
  /* ---------------- busca e tabela ---------------- */
  .busca{ border:1px solid var(--linha); border-radius:100px; background:var(--bg);
          padding:9px 16px; font-size:13.5px; font-family:inherit; color:var(--t1);
          width:320px; max-width:100%; outline:0; transition:.12s; }
  .busca:focus{ border-color:var(--acento); box-shadow:0 0 0 3px rgba(31,111,235,.12); }
  .busca::placeholder{ color:var(--t3); }
  table{ width:100%; border-collapse:collapse; color:var(--t1);
         font-family:inherit; font-size:12.5px; }
  th{ font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--t3);
      font-weight:400; text-align:right; padding:0 0 9px; white-space:nowrap;
      border-bottom:1px solid var(--linha); }
  th:first-child,th.e{ text-align:left; }
  td{ padding:8px 0; border-bottom:1px solid var(--linha); text-align:right;
      color:var(--t2); font-variant-numeric:tabular-nums; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; }
  td + td{ padding-left:14px; }
  td:first-child,td.e{ text-align:left; color:var(--t1); }
  .rolatab{ max-height:440px; overflow-y:auto; padding-right:10px; }
  .rolatab thead th{ position:sticky; top:0; background:var(--bg); z-index:1; }
  .rolatab::-webkit-scrollbar{ width:9px; }
  .rolatab::-webkit-scrollbar-track{ background:var(--trilho); border-radius:5px; }
  .rolatab::-webkit-scrollbar-thumb{ background:#C7CCD5; border-radius:5px;
                                     border:2px solid var(--trilho);
                                     background-clip:content-box; }


  /* ---------------- contratos ---------------- */
  .alerta{ display:grid; grid-template-columns:88px minmax(120px,1.1fr) minmax(120px,1.4fr) 158px;
           gap:14px; align-items:center; padding:9px 0;
           border-bottom:1px solid var(--linha); font-size:13px; }
  .alerta:last-child{ border-bottom:0; }
  .alerta .pz{ font-weight:600; font-variant-numeric:tabular-nums; }
  .alerta .pz.r{ color:var(--baixa); }
  .alerta .pz.a{ color:var(--parcial); }
  .alerta .pz.n{ color:var(--t2); }
  .alerta .cr{ color:var(--t1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .alerta .ds{ color:var(--t3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .alerta .vl{ text-align:right; font-variant-numeric:tabular-nums; color:var(--t1); }
  @media (max-width:760px){ .alerta{ grid-template-columns:76px 1fr 140px; }
                            .alerta .ds{ display:none; } }
  .tagsit{ font-size:11px; padding:2px 9px; border-radius:100px; white-space:nowrap; }
  .tagsit.v{ background:#E6F4EC; color:var(--alta); }
  .tagsit.e{ background:#F1F2F5; color:var(--t3); }

  /* ---------------- dica ---------------- */
  #tip{ position:fixed; z-index:60; pointer-events:none; display:none; max-width:320px;
        background:#14161A; color:#D9DCE3; border-radius:8px; padding:9px 12px;
        font-size:12.5px; line-height:1.5; box-shadow:0 10px 30px rgba(20,22,26,.22);
        font-family:inherit; }
  #tip b{ display:block; color:#fff; font-weight:600; margin-bottom:3px;
          white-space:normal; }
  #tip em{ font-style:normal; color:#fff; font-variant-numeric:tabular-nums; }

  .vazio{ color:var(--t3); font-size:13px; padding:26px 0; }
  .pg{ display:none; } .pg.on{ display:block; }
  .nota{ color:var(--t3); font-size:11.5px; padding-top:26px; }
</style>

<header><div class="topo">
  <div class="marca">Nova Lima</div>
  <nav id="abas">
    <b data-p="cmd" class="on">Painel de Comando</b>
    <span class="espaco"></span>
    <b class="grupoLabel">Receita</b>
    <b data-p="rc">Receita Corrente</b>
    <b data-p="cap">Receita de Capital</b>
    <b data-p="ded">Deduções</b>
    <span class="espaco"></span>
    <b class="grupoLabel">Despesas</b>
    <b data-p="pes">Pessoal</b>
    <b data-p="desp">Órgãos</b>
    <b data-p="ctr">Contratos</b>
    <span class="espaco"></span>
    <b data-p="eq">__ANO_EQ__ · Gestão Fiscal</b>
  </nav>
  <div class="acoes"><div id="btnAuditoria" title="Auditoria interna: pontos de atenção" role="button">🛡️ Auditoria interna</div><div id="btnLimpar" title="Limpar todos os filtros do painel" aria-label="Limpar filtros" role="button">🗑️ Limpar</div><div id="btnAtualizar" title="Atualizar" aria-label="Atualizar" role="button">↻</div></div>
</div></header>

<div id="audModal" aria-hidden="true">
  <div class="audCaixa" role="dialog" aria-label="Auditoria interna">
    <div class="audTopo">
      <div><div class="audTit">Auditoria interna · pontos de atenção</div><div class="audSub" id="audSub"></div></div>
      <div class="audBtns"><button id="audPdf" type="button">🖨️ Imprimir / salvar em PDF</button><button id="audFechar" type="button" aria-label="Fechar">✕</button></div>
    </div>
    <div id="audCorpo"></div>
  </div>
</div>

<div class="env">
  <div class="pg on" id="pg-cmd"></div>
  <div class="pg" id="pg-rc"></div>
  <div class="pg" id="pg-cap"></div>
  <div class="pg" id="pg-ded"></div>
  <div class="pg" id="pg-ctr"></div>
  <div class="pg" id="pg-pes"></div>
  <div class="pg" id="pg-desp"></div>
  <div class="pg" id="pg-eq"></div>
</div>

<script>
const DATA = __DATA__;
const ANOS = [...new Set(DATA.rc.map(r=>r[0]))].sort((a,b)=>a-b);
const PARCIAL = Math.max(...ANOS);              /* exercício ainda em andamento */

const PAGS = {
  rc:  {t:'Receitas Correntes', sub:'Arrecadação corrente do município, por ano e por fonte',
        tipos:true,  rot:'Fontes de receita', vinc:true},
  cap: {t:'Receita de Capital', sub:'Operações de crédito, alienação de bens e transferências de capital',
        tipos:false, rot:'Itens', vinc:true},
  ded: {t:'Deduções da Receita', sub:'FUNDEB, restituições e deduções sobre a arrecadação',
        tipos:false, rot:'Itens', vinc:false},
};

let pagina='cmd';
const estado={ rc:{anos:new Set([PARCIAL]),tipo:null,mes:null}, cap:{anos:new Set([PARCIAL]),tipo:null,mes:null},
               ded:{anos:new Set([PARCIAL]),tipo:null,mes:null}, pes:{busca:'',corte:null},
               ctr:{sit:'vigente', tipo:null, busca:''} };

const nf=(a,b)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:a,maximumFractionDigits:b});
const f0=nf(0,0), f1=nf(1,1), f2=nf(2,2);
const mi  = v => Math.abs(v)<1e7 ? f1.format(v/1e6) : f0.format(Math.round(v/1e6));
const mil = v => f0.format(Math.round(v/1e3));
function brl(v){
  const a=Math.abs(v);
  if(a>=1e9) return 'R$ '+f2.format(v/1e9)+' bi';
  if(a>=1e6) return 'R$ '+f1.format(v/1e6)+' mi';
  if(a>=1e3) return 'R$ '+f1.format(v/1e3)+' mil';
  return 'R$ '+f2.format(v);
}
const exato = v => 'R$ '+f2.format(v);

/* por extenso: 1.185.857.942 -> "1 bi e 186 mi"; 315.431.334 -> "315 mi";
   1.729.013 -> "1,7 mi"; 830.000 -> "830 mil"; 3.848 -> "3,8 mil".
   Arredonda para o milhao mais proximo acima de R$ 10 mi. */
function extenso(v){
  const neg = v<0 ? '−' : '', a = Math.abs(v);
  if(a>=1e7){
    const m = Math.round(a/1e6);             /* total em milhoes, ja arredondado */
    if(m>=1000){
      const b = Math.floor(m/1000), r = m%1000;
      return neg + f0.format(b)+' bi' + (r ? ' e '+r+' mi' : '');
    }
    return neg + m+' mi';
  }
  if(a>=1e6)  return neg + f1.format(a/1e6)+' mi';
  if(a>=1e5)  return neg + f0.format(Math.round(a/1e3))+' mil';
  if(a>=1e3)  return neg + f1.format(a/1e3)+' mil';
  return neg + f0.format(a);
}
const brlx = v => 'R$ '+extenso(v);
const el=(t,c)=>{const e=document.createElement(t); if(c)e.className=c; return e;};
const S=(n,a)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',n);
                for(const k in a)e.setAttribute(k,a[k]); return e;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- dica flutuante ---------------- */
const tip=el('div'); tip.id='tip'; document.body.appendChild(tip);
function dica(alvo,titulo,corpo){
  alvo.addEventListener('mousemove',ev=>{
    tip.innerHTML='<b>'+esc(titulo)+'</b>'+corpo;
    tip.style.display='block';
    const r=tip.getBoundingClientRect();
    let x=ev.clientX+16, y=ev.clientY+16;
    if(x+r.width  > innerWidth -10) x=ev.clientX-r.width -16;
    if(y+r.height > innerHeight-10) y=ev.clientY-r.height-16;
    tip.style.left=x+'px'; tip.style.top=y+'px';
  });
  alvo.addEventListener('mouseleave',()=>{ tip.style.display='none'; });
}

/* ---------------- peças ---------------- */
/* indicador: rótulo, valor grande, valor exato (opcional, em R$) e legenda */
function kpiHtml(rot, valor, legenda, exatoNum, corValor, historico){
  return '<div class="rot">'+rot+'</div>'
    + '<div class="v"'+(corValor?' style="color:'+corValor+'"':'')+'>'+valor+'</div>'
    + (exatoNum!==undefined && exatoNum!==null ? '<div class="x">'+exato(exatoNum)+'</div>' : '')
    + '<div class="s">'+(legenda||'')+'</div>'
    + (historico && historico.length
        ? '<div class="hist">'+historico.map(h=>'<div><span>'+h[0]+'</span><b>'+h[1]+'</b></div>').join('')+'</div>'
        : '');
}
function bloco(pai,rotulo){
  const s=el('div','secao'); const r=el('div','rot'); r.textContent=rotulo;
  s.appendChild(r); pai.appendChild(s); return s;
}
function linha(nome,valor,frac,pct,opt){
  opt=opt||{};
  const d=el('div','lin'+(opt.click?' clic':'')+(opt.sel?' sel':'')+(opt.esm?' esm':''));
  d.innerHTML='<span class="n">'+esc(nome)+'</span>'
    +'<span class="b"><i style="width:'+(Math.max(0,Math.min(1,frac))*100).toFixed(1)+'%"></i></span>'
    +'<span class="p">'+(pct||'')+'</span><span class="v">'+valor+'</span>'
    +(opt.vinc ? vincHtml(opt.vinc) : '');
  if(opt.vinc) d.classList.add('vinc');
  if(opt.click) d.onclick=opt.click;
  return d;
}
/* três colunas de vinculação legal: % vinculada · valor vinculado · lei.
   Vermelho = vinculada por lei; cinza = sem vinculação legal; âmbar = nenhuma
   das regras cobre a linha (a classificar — nada é estimado). */
function vincHtml(v){
  if(v.pct===null) return '<span class="vp ac">—</span><span class="vv ac">—</span><span class="va ac">—</span><span class="vl ac">a classificar</span>';
  if(v.pct===0)    return '<span class="vp">0%</span><span class="vv">—</span><span class="va">—</span><span class="vl">—</span>';
  return '<span class="vp r">'+f0.format(v.pct)+'%</span><span class="vv r">'+exato(v.valor)+'</span>'
    +'<span class="va r">'+esc(v.area||'')+'</span><span class="vl r">'+esc(v.lei||'')+'</span>';
}
function cabecaLista(a,b,c,d,vinc){
  const h=el('div','cabl'+(vinc?' vinc':''));
  h.innerHTML='<span>'+a+'</span><span>'+(b||'')+'</span><span>'+(d||'')+'</span><span>'+c+'</span>'
    +(vinc?'<span>% Vinc.</span><span>Valor vinculado (R$)</span><span>Destinação</span><span>Lei</span>':'');
  return h;
}

/* colunas por ano — cronológico, topo arredondado */
function colunas(host,dados,sel,onClick){
  host.innerHTML='';
  const W=host.clientWidth||900, H=210, base=H-30, topo=26;
  const svg=S('svg',{viewBox:'0 0 '+W+' '+H,width:W,height:H}); host.appendChild(svg);
  if(!dados.length) return;
  const max=Math.max(...dados.map(d=>d.v))||1;
  const soma=dados.reduce((a,d)=>a+d.v,0);
  const slot=W/dados.length, bw=Math.min(86,slot*0.52);
  dados.forEach((d,i)=>{
    const cx=i*slot+slot/2, h=Math.max(2,(d.v/max)*(base-topo));
    const on=sel.has(d.k), r=Math.min(7,bw/2,h);
    const y=base-h;
    const p=S('path',{d:'M'+(cx-bw/2)+','+base+' L'+(cx-bw/2)+','+(y+r)
        +' Q'+(cx-bw/2)+','+y+' '+(cx-bw/2+r)+','+y
        +' L'+(cx+bw/2-r)+','+y+' Q'+(cx+bw/2)+','+y+' '+(cx+bw/2)+','+(y+r)
        +' L'+(cx+bw/2)+','+base+' Z',
      class:'cb'+(on?' on':'')+(d.k===PARCIAL?' amb':'')});
    p.addEventListener('click',()=>onClick(d.k));
    dica(p, d.k+(d.k===PARCIAL?' (em andamento)':''),
      '<em>'+exato(d.v)+'</em><br>'+f1.format(d.v/soma*100)+'% do período'
      +'<br><span style="opacity:.6">clique para filtrar</span>');
    svg.appendChild(p);
    const tv=S('text',{x:cx,y:y-9,'text-anchor':'middle',class:'cv'});
    tv.textContent=extenso(d.v); svg.appendChild(tv);
    const tc=S('text',{x:cx,y:base+20,'text-anchor':'middle',class:'cc'+(on?' on':'')});
    tc.textContent=d.k; svg.appendChild(tc);
  });
}

/* colunas simples (mês a mês) — sem clique, sem destaque */
const MESES=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MESNOME={'1':'janeiro','2':'fevereiro','3':'março','4':'abril','5':'maio','6':'junho',
               '7':'julho','8':'agosto','9':'setembro','10':'outubro','11':'novembro','12':'dezembro'};
function colunasMes(host,dados,sel,onClick,multi){
  host.innerHTML='';
  const W=host.clientWidth||900, H=190, base=H-28, topo=24;
  const svg=S('svg',{viewBox:'0 0 '+W+' '+H,width:W,height:H}); host.appendChild(svg);
  const max=Math.max(...dados.map(d=>d.v),0)||1;
  const soma=dados.reduce((a,d)=>a+d.v,0);
  const slot=W/12, bw=Math.min(58,slot*0.5);
  // sel pode ser uma string (seleção única, como no mês-a-mês da Receita) ou
  // um Set (seleção múltipla, como em Despesas) — nenhumSel cobre os dois.
  const ehSet = sel instanceof Set;
  const nenhumSel = ehSet ? sel.size===0 : !sel;
  const estaMarcado = m => ehSet ? sel.has(m) : sel===m;
  dados.forEach((d,i)=>{
    const cx=i*slot+slot/2, h=d.v>0?Math.max(2,(d.v/max)*(base-topo)):0, y=base-h;
    const marcado = estaMarcado(d.mes);
    if(h>0){
      const r=Math.min(6,bw/2,h);
      const p=S('path',{d:'M'+(cx-bw/2)+','+base+' L'+(cx-bw/2)+','+(y+r)
        +' Q'+(cx-bw/2)+','+y+' '+(cx-bw/2+r)+','+y
        +' L'+(cx+bw/2-r)+','+y+' Q'+(cx+bw/2)+','+y+' '+(cx+bw/2)+','+(y+r)
        +' L'+(cx+bw/2)+','+base+' Z', class:'cb'+((nenhumSel||marcado)?' on':'')});
      if(onClick) p.addEventListener('click',function(){ onClick(d.mes); });
      dica(p, d.k, '<em>'+exato(d.v)+'</em><br>'+(soma?f1.format(d.v/soma*100)+'% do período':'')
           +(onClick?'<br><span style="opacity:.6">clique para '+(multi?'adicionar/remover':'ver só este mês')+'</span>':''));
      svg.appendChild(p);
      const tv=S('text',{x:cx,y:y-8,'text-anchor':'middle',class:'cv'});
      tv.textContent=extenso(d.v);
      if(marcado) tv.setAttribute('fill','var(--t1)');
      svg.appendChild(tv);
    }
    const tc=S('text',{x:cx,y:base+18,'text-anchor':'middle',class:'cc'+(marcado?' on':'')});
    tc.textContent=d.k;
    if(onClick) tc.style.cursor='pointer';
    if(onClick) tc.addEventListener('click',function(){ onClick(d.mes); });
    svg.appendChild(tc);
  });
}

/* colunas triplas (mês a mês, 3 séries) — Receita x Empenhado x Pago, sem
   seleção nem clique, só a comparação visual + tooltip com os 3 valores. */
function colunasMesTrio(host,dados,series){
  host.innerHTML='';
  const W=host.clientWidth||900, H=220, base=H-30, topo=26;
  const svg=S('svg',{viewBox:'0 0 '+W+' '+H,width:W,height:H}); host.appendChild(svg);
  const max=Math.max(...dados.flatMap(d=>series.map(s=>d[s.chave])),0)||1;
  const slot=W/dados.length, grupoW=Math.min(78,slot*0.72), bw=grupoW/series.length-4;
  dados.forEach((d,i)=>{
    const cx=i*slot+slot/2, x0=cx-grupoW/2;
    series.forEach((s,j)=>{
      const v=d[s.chave], h=v>0?Math.max(2,(v/max)*(base-topo)):0, y=base-h;
      const bx=x0+j*(bw+4);
      if(h>0){
        const r=Math.min(4,bw/2,h);
        const p=S('path',{d:'M'+bx+','+base+' L'+bx+','+(y+r)
          +' Q'+bx+','+y+' '+(bx+r)+','+y
          +' L'+(bx+bw-r)+','+y+' Q'+(bx+bw)+','+y+' '+(bx+bw)+','+(y+r)
          +' L'+(bx+bw)+','+base+' Z', fill:s.cor});
        dica(p, d.k+' · '+s.nome, '<em>'+exato(v)+'</em>');
        svg.appendChild(p);
      }
    });
    const tc=S('text',{x:cx,y:base+18,'text-anchor':'middle',class:'cc'});
    tc.textContent=d.k;
    svg.appendChild(tc);
  });
}

/* ---------------- páginas de receita ---------------- */
function montaReceita(id){
  const cfg=PAGS[id], st=estado[id], host=document.getElementById('pg-'+id);
  host.innerHTML='';

  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>'+cfg.t+'</h1><p>'+cfg.sub+'</p></div>';
  topopag.appendChild(cab);

  const filtros=el('div','filtros'); topopag.appendChild(filtros);
  const kpis=el('div','kpis'); host.appendChild(kpis);

  const sGraf=el('div','secao'); const parGraf=el('div','duplo');
  parGraf.style.gridTemplateColumns='1fr 1fr';
  sGraf.appendChild(parGraf); host.appendChild(sGraf);
  const cEvo=el('div'), cMes=el('div');
  cEvo.innerHTML='<div class="rot" style="margin-bottom:16px">Arrecadado por ano · R$</div>';
  cMes.innerHTML='<div class="rot" style="margin-bottom:16px">Mês a mês · R$ · clique para ver só um mês</div>';
  parGraf.appendChild(cEvo); parGraf.appendChild(cMes);
  const evo=el('div','colunas'); cEvo.appendChild(evo);
  const mesG=el('div','colunas'); cMes.appendChild(mesG);
  const sMes=cMes;

  let listaTipo=null;
  if(cfg.tipos){
    const sTip=bloco(host,'Por tipo · clique para filtrar');
    listaTipo=el('div','lista'); sTip.appendChild(listaTipo);
  }
  const caixaDet=bloco(host,cfg.rot);
  const listaDet=el('div','lista rola');
  caixaDet.appendChild(cabecaLista('Descrição','', 'Valor (R$)','%', cfg.vinc));
  caixaDet.appendChild(listaDet);
  const resumoVinc=el('div','nota'); resumoVinc.style.paddingTop='14px';
  if(cfg.vinc) caixaDet.appendChild(resumoVinc);

  const nota=el('div','nota');
  nota.textContent=PARCIAL+' é exercício em andamento — os valores vão até o período apurado.'
    + (DATA.coleta ? '  ·  Dados coletados do Portal da Transparência em '
        + DATA.coleta.split('-').reverse().join('/') : '');
  host.appendChild(nota);

  function linhasBase(){
    if(st.mes){                       /* mês escolhido: remonta a partir do mensal */
      const fonte=(DATA.mensal||{})[id]||{};
      const anos=st.anos.size?Array.from(st.anos):ANOS;
      const out=[];
      anos.forEach(function(a){
        const m=(fonte[a]||{})[st.mes]; if(!m) return;
        for(const cod in m){
          const mt=(DATA.meta||{})[cod]||[cod,''];
          out.push([+a, mt[1], mt[0], m[cod], mt[2]===undefined?null:mt[2], mt[3]||'', mt[4]||'']);
        }
      });
      return out;
    }
    let r=DATA[id];
    if(st.anos.size) r=r.filter(x=>st.anos.has(x[0]));
    return r;
  }
  function filtrado(ignorarTipo){
    let r=linhasBase();
    if(st.tipo && !ignorarTipo) r=r.filter(x=>x[1]===st.tipo);
    return r;
  }
  function agrupa(rows,i){
    const m=new Map();
    for(const r of rows){ m.set(r[i],(m.get(r[i])||0)+r[3]); }
    return [...m].map(([k,v])=>({k,v}));
  }
  /* agrupa por nome somando também o que é vinculado por lei (100%), o que
     não é (0%) e o que nenhuma regra cobre (null) — sem rateio: cada linha
     de origem entra inteira numa das três. */
  function agrupaDet(rows){
    const m=new Map();
    for(const r of rows){
      const g=m.get(r[2])||{k:r[2], v:0, vv:0, v0:0, vn:0, c100:0, c0:0, lei:'', area:''};
      g.v+=r[3];
      if(r[4]===100){ g.vv+=r[3]; g.c100++; if(!g.lei) g.lei=r[5]||''; if(!g.area) g.area=r[6]||''; }
      else if(r[4]===0){ g.v0+=r[3]; g.c0++; }
      else g.vn+=r[3];
      m.set(r[2],g);
    }
    return [...m.values()];
  }

  return function(){
    /* --- anos --- */
    filtros.innerHTML='';
    const bt=el('div','ano'+(st.anos.size===0&&!st.mes?' on':'')); bt.textContent='Todos os anos';
    bt.onclick=()=>{ st.anos.clear(); st.mes=null; st.tipo=null; render(); };
    filtros.appendChild(bt);
    ANOS.forEach(a=>{
      const b=el('div','ano'+(st.anos.has(a)?' on':'')+(a===PARCIAL?' parcial':''));
      b.textContent=a;
      b.onclick=()=>{ st.anos.has(a)?st.anos.delete(a):st.anos.add(a); render(); };
      filtros.appendChild(b);
    });
    const btnLimpar=el('div','ano'); btnLimpar.textContent='🗑️ Limpar'; btnLimpar.title='Limpar todos os filtros';
    /* Limpar volta ao padrão de abertura: só o exercício em andamento (2026) */
    btnLimpar.onclick=()=>{ st.anos.clear(); st.anos.add(PARCIAL); st.mes=null; st.tipo=null; render(); };
    filtros.appendChild(btnLimpar);
    const res=el('div','resumo'); filtros.appendChild(res);

    /* --- dados --- */
    const linhas=filtrado(), total=linhas.reduce((s,r)=>s+r[3],0);
    const nAnos=st.anos.size||ANOS.length;
    const det=agrupaDet(linhas).sort((a,b)=>b.v-a.v);
    const maior=det[0];

    const sel=[...st.anos].sort((a,b)=>a-b);
    res.innerHTML=(sel.length
        ? '<b>'+sel.join(', ')+'</b> · '+sel.length+(sel.length>1?' anos':' ano')
        : '<b>Todos os anos</b> · '+ANOS[0]+'–'+ANOS[ANOS.length-1])
      + (st.mes?' · <u>'+MESNOME[st.mes]+'</u>':'')
      + ' · '+det.length+' itens'
      + (st.tipo?' · <u>'+esc(st.tipo)+'</u>':'');

    /* --- indicadores --- */
    kpis.innerHTML='';
    const cards=[
      ['Total arrecadado', brlx(total), sel.length? sel.join(' + ') : 'soma de todos os anos', total],
      st.mes
        ? ['Média por ano', brlx(total/nAnos), MESNOME[st.mes]+' em '+nAnos+(nAnos>1?' anos':' ano'), total/nAnos]
        : ['Média por ano', brlx(total/nAnos), nAnos+(nAnos>1?' anos considerados':' ano considerado'), total/nAnos],
      ['Maior fonte', maior?brlx(maior.v):'—',
        maior? esc(maior.k)+' · '+f1.format(maior.v/total*100)+'% do total':'', maior?maior.v:null],
      ['Itens', f0.format(det.length), st.tipo? 'no tipo '+esc(st.tipo) : cfg.rot.toLowerCase(), null],
    ];
    cards.forEach(([r,v,s,x])=>{
      const d=el('div','kpi');
      d.innerHTML=kpiHtml(r,v,s,x);
      kpis.appendChild(d);
    });

    /* --- colunas por ano (sempre todos os anos, o selecionado em destaque) --- */
    const base=st.tipo? DATA[id].filter(x=>x[1]===st.tipo) : DATA[id];
    const porAno=ANOS.map(a=>({k:a,v:base.reduce((s,r)=>r[0]===a?s+r[3]:s,0)}));
    colunas(evo,porAno,st.anos,a=>{
      st.anos.has(a)?st.anos.delete(a):st.anos.add(a); render();
    });

    /* --- mês a mês --- */
    const fonteMes=(DATA.mensal||{})[id]||{};
    const anosMes=st.anos.size?Array.from(st.anos):ANOS;
    const serie=MESES.map(function(m,i){ return {k:m, v:0, mes:String(i+1)}; });
    anosMes.forEach(function(a){
      const pm=fonteMes[a]; if(!pm) return;
      for(const m in pm){
        let v=0; const regs=pm[m];
        for(const cod in regs){
          const mt=(DATA.meta||{})[cod];
          if(!st.tipo || (mt && mt[1]===st.tipo)) v+=regs[cod];
        }
        serie[+m-1].v += v;
      }
    });
    colunasMes(mesG, serie, st.mes, function(m){
      st.mes = (st.mes===m ? null : m); render();
    });
    sMes.style.display = serie.some(function(x){ return x.v>0; }) ? '' : 'none';

    /* --- por tipo --- */
    if(listaTipo){
      listaTipo.innerHTML='';
      const tp=agrupa(filtrado(true),1).sort((a,b)=>b.v-a.v);
      const mx=tp.length?tp[0].v:1, sm=tp.reduce((s,t)=>s+t.v,0);
      tp.forEach(t=>{
        const l=linha(t.k, exato(t.v), t.v/mx, f1.format(t.v/sm*100)+'%',
          { click:()=>{ st.tipo=(st.tipo===t.k?null:t.k); render(); },
            sel:st.tipo===t.k, esm:st.tipo&&st.tipo!==t.k });
        dica(l, t.k, '<em>'+exato(t.v)+'</em><br>'+f1.format(t.v/sm*100)+'% do total'
          +'<br><span style="opacity:.6">clique para filtrar</span>');
        listaTipo.appendChild(l);
      });
    }

    /* --- detalhamento --- */
    caixaDet.firstChild.textContent = cfg.rot
      + (st.mes ? ' · ' + MESNOME[st.mes] + (sel.length?' de '+sel.join(', '):' (todos os anos)') : '');
    listaDet.innerHTML='';
    resumoVinc.innerHTML='';
    if(!det.length){ const v=el('div','vazio'); v.textContent='Sem dados para o filtro.';
                     listaDet.appendChild(v); return; }
    const mx=det[0].v;
    det.forEach(d=>{
      let vinc=null;
      if(cfg.vinc){
        const cls=d.c100+d.c0;
        let pct=null;
        if(cls) pct=(d.vv+d.v0)>0 ? d.vv/(d.vv+d.v0)*100 : (d.c100>0?100:0);
        vinc={pct, valor:d.vv, lei:d.lei, area:d.area};
      }
      const l=linha(d.k, exato(d.v), d.v/mx, f1.format(d.v/total*100)+'%', {vinc});
      dica(l, d.k, '<em>'+exato(d.v)+'</em><br>'+f2.format(d.v/total*100)+'% do total'
        +(vinc&&vinc.pct!==null&&vinc.pct>0 ? '<br>vinculada por lei: '+exato(vinc.valor)+' · '+esc(vinc.area||'')+' · '+esc(vinc.lei||'') : ''));
      listaDet.appendChild(l);
    });
    if(cfg.vinc){
      const tv=det.reduce((s,d)=>s+d.vv,0), t0=det.reduce((s,d)=>s+d.v0,0), tn=det.reduce((s,d)=>s+d.vn,0);
      const pc=x=>f1.format(total?x/total*100:0)+'%';
      resumoVinc.innerHTML='<b style="color:var(--baixa)">Vinculado por lei: '+exato(tv)+' ('+pc(tv)+' do total)</b>'
        +' · sem vinculação legal: '+exato(t0)+' ('+pc(t0)+')'
        +(tn>0.005 ? ' · <span style="color:var(--parcial)">a classificar: '+exato(tn)+' ('+pc(tn)
            +') — nenhuma das regras de vinculação cobre essas linhas</span>' : '')
        +'<br>Classificação só pelas regras legais definidas, sem rateio nem estimativa. Os 25% em educação e 15% '
        +'em saúde são vinculação da despesa, não da receita.';
    }
  };
}


/* ---------------- página de contratos ---------------- */
function montaContratos(){
  const st=estado.ctr, host=document.getElementById('pg-ctr');
  host.innerHTML='';
  const C=DATA.contratos||[];
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>Contratos</h1><p>Contratos da Prefeitura de Nova Lima &middot; vig&ecirc;ncia calculada pelas datas de in&iacute;cio e fim</p></div>';
  topopag.appendChild(cab);

  const filtros=el('div','filtros'); topopag.appendChild(filtros);
  const kpis=el('div','kpis'); host.appendChild(kpis);

  const sAl=bloco(host,'Vencimentos próximos · contratos vigentes que terminam em até 90 dias');
  const listaAl=el('div','lista rola'); listaAl.style.maxHeight='300px'; sAl.appendChild(listaAl);

  const sDois=el('div','secao'); const dois=el('div','duplo');
  sDois.appendChild(dois); host.appendChild(sDois);
  const cTipo=el('div'), cForn=el('div');
  cTipo.innerHTML='<div class="rot" style="margin-bottom:16px">Por tipo · clique para filtrar</div>';
  cForn.innerHTML='<div class="rot" style="margin-bottom:16px">Maiores fornecedores</div>';
  dois.appendChild(cTipo); dois.appendChild(cForn);
  const listaTipo=el('div','lista'), listaForn=el('div','lista');
  cTipo.appendChild(listaTipo); cForn.appendChild(listaForn);

  const sTab=bloco(host,'Todos os contratos');
  const barra=el('div');
  barra.style.cssText='display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px';
  const inp=el('input','busca'); inp.type='text';
  inp.placeholder='Buscar por número, fornecedor ou objeto…';
  const info=el('span','resumo'); info.style.marginLeft='0';
  barra.appendChild(inp); barra.appendChild(info); sTab.appendChild(barra);
  const rola=el('div','rolatab'); sTab.appendChild(rola);
  inp.addEventListener('input',function(){ st.busca=inp.value.trim().toLowerCase(); render(); });

  const nota=el('div','nota'); host.appendChild(nota);

  function base(ignorarTipo){
    let r=C;
    if(st.sit) r=r.filter(function(c){ return c[7]===st.sit; });
    if(st.tipo && !ignorarTipo) r=r.filter(function(c){ return c[5]===st.tipo; });
    if(st.busca) r=r.filter(function(c){
      return (c[0]+' '+c[3]+' '+c[4]).toLowerCase().indexOf(st.busca)>=0; });
    return r;
  }

  return function(){
    filtros.innerHTML='';
    [['vigente','Vigentes'],['encerrado','Encerrados'],[null,'Todos']].forEach(function(par){
      const b=el('div','ano'+(st.sit===par[0]?' on':'')); b.textContent=par[1];
      b.onclick=function(){ st.sit=par[0]; render(); }; filtros.appendChild(b);
    });
    const btnLimpar=el('div','ano'); btnLimpar.textContent='🗑️ Limpar'; btnLimpar.title='Limpar todos os filtros';
    btnLimpar.onclick=function(){ st.sit=null; st.tipo=null; st.busca=''; inp.value=''; render(); }; filtros.appendChild(btnLimpar);
    const res=el('div','resumo'); filtros.appendChild(res);

    const lista=base();
    const total=lista.reduce(function(s,c){ return s+c[6]; },0);
    const venc=lista.filter(function(c){ return c[7]==='vigente'&&c[8]!==null&&c[8]<=90&&c[8]>=0; })
                    .sort(function(a,b){ return a[8]-b[8]; });
    res.innerHTML='<b>'+f0.format(lista.length)+'</b> contratos'
      + (st.tipo?' · <u>'+esc(st.tipo)+'</u>':'')
      + (st.busca?' · busca "'+esc(st.busca)+'"':'');

    kpis.innerHTML='';
    const rotulo = st.sit==='vigente' ? 'Contratos vigentes'
                 : st.sit==='encerrado' ? 'Contratos encerrados' : 'Contratos';
    const somaVenc=venc.reduce(function(s,c){ return s+c[6]; },0);
    [[rotulo, f0.format(lista.length), 'de '+f0.format(C.length)+' no total', null],
     ['Valor contratado', brlx(total),
      st.sit==='vigente'?'soma dos contratos em vigência':'soma do filtro atual', total],
     ['Vencendo em 90 dias', f0.format(venc.length),
      venc.length? 'valor em jogo' : 'nenhum no filtro atual', venc.length?somaVenc:null],
     ['Ticket médio', brlx(lista.length?total/lista.length:0), 'por contrato',
      lista.length?total/lista.length:null]
    ].forEach(function(k){
      const d=el('div','kpi');
      d.innerHTML=kpiHtml(k[0],k[1],k[2],k[3]);
      kpis.appendChild(d);
    });

    listaAl.innerHTML='';
    if(!venc.length){
      const v=el('div','vazio');
      v.textContent='Nenhum contrato vencendo nos próximos 90 dias neste filtro.';
      listaAl.appendChild(v);
    } else venc.forEach(function(c){
      const d=el('div','alerta');
      const cls=c[8]<=30?'r':(c[8]<=60?'a':'n');
      d.innerHTML='<span class="pz '+cls+'">'+(c[8]===0?'hoje':c[8]+' dias')+'</span>'
        +'<span class="cr">'+esc(c[3])+'</span>'
        +'<span class="ds">'+esc(c[0])+' · '+esc(c[4])+'</span>'
        +'<span class="vl">'+exato(c[6])+'</span>';
      dica(d, c[0]+' · '+c[3], '<em>'+brl(c[6])+'</em><br>'+esc(c[4])
           +'<br>vigência '+c[1]+' a '+c[2]);
      listaAl.appendChild(d);
    });

    const mt=new Map();
    base(true).forEach(function(c){ mt.set(c[5],(mt.get(c[5])||0)+c[6]); });
    const lt=Array.from(mt).sort(function(a,b){ return b[1]-a[1]; });
    const mxt=lt.length?lt[0][1]:1;
    const somat=lt.reduce(function(s,x){ return s+x[1]; },0);
    listaTipo.innerHTML='';
    lt.forEach(function(par){
      const l=linha(par[0], exato(par[1]), par[1]/mxt,
        somat?f1.format(par[1]/somat*100)+'%':'',
        { click:function(){ st.tipo=(st.tipo===par[0]?null:par[0]); render(); },
          sel:st.tipo===par[0], esm:st.tipo&&st.tipo!==par[0] });
      dica(l,par[0],'<em>'+brl(par[1])+'</em>');
      listaTipo.appendChild(l);
    });

    const mf=new Map();
    lista.forEach(function(c){ mf.set(c[3],(mf.get(c[3])||0)+c[6]); });
    const lf=Array.from(mf).sort(function(a,b){ return b[1]-a[1]; }).slice(0,8);
    const mxf=lf.length?lf[0][1]:1;
    listaForn.innerHTML='';
    lf.forEach(function(par){
      const l=linha(par[0], exato(par[1]), par[1]/mxf,
        total?f1.format(par[1]/total*100)+'%':'');
      dica(l,par[0],'<em>'+brl(par[1])+'</em><br>'
        +f1.format(par[1]/total*100)+'% do filtro atual');
      listaForn.appendChild(l);
    });

    info.innerHTML='<b>'+f0.format(lista.length)+'</b> de '+f0.format(C.length);
    rola.innerHTML='';
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:10%">Número</th>'
      +'<th class="e" style="width:9%">Início</th><th class="e" style="width:9%">Fim</th>'
      +'<th class="e" style="width:25%">Fornecedor</th>'
      +'<th class="e" style="width:26%">Objeto</th>'
      +'<th style="width:13%">Valor (R$)</th>'
      +'<th class="e" style="width:8%">Situação</th></tr></thead>';
    const tb=el('tbody');
    lista.slice().sort(function(a,b){ return b[6]-a[6]; }).slice(0,600).forEach(function(c){
      const tr=el('tr');
      tr.innerHTML='<td class="e">'+esc(c[0])+'</td>'
        +'<td class="e" style="color:var(--t3)">'+esc(c[1])+'</td>'
        +'<td class="e" style="color:var(--t3)">'+esc(c[2])+'</td>'
        +'<td class="e">'+esc(c[3])+'</td>'
        +'<td class="e" style="color:var(--t2)">'+esc(c[4])+'</td>'
        +'<td>'+exato(c[6])+'</td>'
        +'<td class="e"><span class="tagsit '+(c[7]==='vigente'?'v':'e')+'">'
          +(c[7]==='vigente'?'vigente':'encerrado')+'</span></td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb); rola.appendChild(t);
    nota.textContent='Os valores são o total contratado, não o pago. '
      + (DATA.ct_coleta ? 'Coletado do Portal da Transparência em '
          + DATA.ct_coleta.split('-').reverse().join('/') : '');
  };
}

/* ---------------- página de pessoal ---------------- */
function montaPessoal(){
  const st=estado.pes, host=document.getElementById('pg-pes');
  host.innerHTML='';
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>Pessoal</h1><p>Folha da Prefeitura de Nova Lima · '+(DATA.rh_ref||'')+'</p></div>';
  topopag.appendChild(cab);
  const filtroPes=el('div','filtros'); topopag.appendChild(filtroPes);
  const kpis=el('div','kpis'); host.appendChild(kpis);

  const s1=el('div','secao'), d1=el('div','duplo');
  d1.style.gridTemplateColumns='1fr 1fr';
  s1.appendChild(d1); host.appendChild(s1);
  const cSec=el('div'), cVin=el('div');
  cSec.innerHTML='<div class="rot" style="margin-bottom:16px">Folha por secretaria · R$</div>';
  cVin.innerHTML='<div class="rot" style="margin-bottom:16px">Vínculo · servidores</div>';
  d1.appendChild(cSec); d1.appendChild(cVin);
  const listaSec=el('div','lista'), listaVin=el('div','lista');
  cSec.appendChild(listaSec); cVin.appendChild(listaVin);

  const s2=bloco(host,'Servidores');
  const bar=el('div'); bar.style.cssText='display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px';
  const inp=el('input','busca'); inp.type='text'; inp.placeholder='Buscar pelo nome…';
  const btnLimparPes=el('button','ano'); btnLimparPes.textContent='🗑️ Limpar'; btnLimparPes.title='Limpar todos os filtros';
  btnLimparPes.style.cssText='padding:6px 14px;border:1px solid var(--linha);border-radius:100px;background:var(--bg);cursor:pointer;font-size:12.5px;color:var(--t2);white-space:nowrap';
  btnLimparPes.onclick=()=>{ st.busca=''; st.corte=null; inp.value=''; render(); };
  const info=el('span','resumo'); info.style.marginLeft='0';
  bar.appendChild(inp); bar.appendChild(btnLimparPes); bar.appendChild(info); s2.appendChild(bar);
  const rola=el('div','rolatab'); s2.appendChild(rola);
  inp.addEventListener('input',()=>{ st.busca=inp.value.trim().toLowerCase(); render(); });

  function base(){
    let r=DATA.rh;
    if(st.busca) r=r.filter(x=>x[0].toLowerCase().includes(st.busca));
    if(st.corte) r=r.filter(x=>x[2]===st.corte);
    return r;
  }
  return function(){
    const b=base();
    const folha=b.reduce((s,r)=>s+r[5],0);
    const bruto=b.reduce((s,r)=>s+r[6],0);
    kpis.innerHTML='';
    // Os 3 meses anteriores (só totais) aparecem pequenos embaixo de cada
    // cartão — mas só sem filtro/busca ativo, senão compararia um recorte
    // do mês atual com o total dos meses passados.
    const semFiltro=!st.busca && !st.corte;
    const nomeMes=h=>{ const n=MESNOME[String(h.mes)]; return n.charAt(0).toUpperCase()+n.slice(1); };
    const hist=(campo,fmt)=> semFiltro ? (DATA.pessoal_hist||[]).map(h=>[nomeMes(h), fmt(h[campo])]) : null;
    [['Servidores', f0.format(b.length),
       st.corte? 'vínculo '+esc(st.corte) : (DATA.rh_ref||'').replace('referência','folha de'), null, hist('servidores', f0.format)],
     ['Vencimentos', brlx(folha), 'base da folha', folha, hist('vencimentos', exato)],
     ['Bruto', brlx(bruto), 'com vantagens e adicionais', bruto, hist('bruto', exato)],
     ['Vencimento médio', brlx(b.length?folha/b.length:0), 'por servidor', b.length?folha/b.length:null, hist('media', exato)]
    ].forEach(([r,v,s,x,hs])=>{
      const d=el('div','kpi');
      d.innerHTML=kpiHtml(r,v,s,x,null,hs);
      kpis.appendChild(d);
    });

    const ms=new Map();
    for(const r of b) ms.set(r[4],(ms.get(r[4])||0)+r[5]);
    const tops=[...ms].sort((a,b2)=>b2[1]-a[1]).slice(0,8);
    const mxs=tops.length?tops[0][1]:1;
    listaSec.innerHTML='';
    tops.forEach(([k,v])=>{
      const nome=k.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /,'')||'(sem lotação)';
      const l=linha(nome, exato(v), v/mxs, folha?f1.format(v/folha*100)+'%':'');
      dica(l,k,'<em>'+exato(v)+'</em><br>'+f1.format(v/folha*100)+'% da folha');
      listaSec.appendChild(l);
    });

    const mv=new Map();
    for(const r of b) mv.set(r[2],(mv.get(r[2])||0)+1);
    const tv=[...mv].sort((a,b2)=>b2[1]-a[1]);
    const mxv=tv.length?tv[0][1]:1;
    listaVin.innerHTML='';
    tv.forEach(([k,v])=>{
      listaVin.appendChild(linha(k, f0.format(v), v/mxv,
        b.length?f1.format(v/b.length*100)+'%':'',
        { click:()=>{ st.corte=(st.corte===k?null:k); render(); },
          sel:st.corte===k, esm:st.corte&&st.corte!==k }));
    });

    info.innerHTML='<b>'+f0.format(b.length)+'</b> de '+f0.format(DATA.rh.length)
      + (st.corte?' · <u>'+esc(st.corte)+'</u>':'');
    rola.innerHTML='';
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:30%">Nome</th>'
      +'<th class="e" style="width:28%">Cargo</th>'
      +'<th class="e" style="width:24%">Secretaria</th>'
      +'<th>Vencimentos (R$)</th><th>Líquido (R$)</th></tr></thead>';
    const tb=el('tbody');
    b.slice().sort((x,y)=>y[5]-x[5]).slice(0,500).forEach(r=>{
      const tr=el('tr');
      tr.innerHTML='<td class="e">'+esc(r[0])+'</td>'
        +'<td class="e" style="color:var(--t2)">'+esc(r[1])+'</td>'
        +'<td class="e" style="color:var(--t3)">'
          +esc(r[4].replace(/^SECRETARIA MUNICIPAL D[AEO]S? /,''))+'</td>'
        +'<td>'+exato(r[5])+'</td><td>'+exato(r[7])+'</td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb); rola.appendChild(t);
  };
}

/* ---------------- página de despesas ---------------- */
function montaDespesas(){
  const host=document.getElementById('pg-desp');
  host.innerHTML='';
  const meses=(DATA.despesas&&DATA.despesas.meses)||[];
  const ano=DATA.despesas&&DATA.despesas.ano;
  const orgaosPorMes=(DATA.despesas&&DATA.despesas.orgaos_por_mes)||{};
  const st={ meses:new Set() };
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>Despesas</h1><p>Empenho, liquidação e pagamento por mês'
    +(ano?' · '+ano:'')+' · todas as secretarias</p></div>';
  topopag.appendChild(cab);

  const filtros=el('div','filtros'); topopag.appendChild(filtros);
  const btnLimpar=el('div','ano'); btnLimpar.textContent='🗑️ Limpar'; btnLimpar.title='Limpar seleção de meses';
  filtros.appendChild(btnLimpar);
  const kpis=el('div','kpis'); host.appendChild(kpis);

  if(!meses.length){
    const d=el('div','vazio'); d.textContent='Sem dados de despesas coletados ainda.';
    host.appendChild(d);
    return function(){};
  }

  const sMes=bloco(host,'Pagamento mês a mês · R$');
  const mesG=el('div'); sMes.appendChild(mesG);

  const sOrg=bloco(host,'Por secretaria');
  const rolaOrg=el('div','rolatab'); sOrg.appendChild(rolaOrg);

  const sNat=bloco(host,'Por natureza da despesa');
  const resNat=el('div','nota'); resNat.style.paddingTop='0'; resNat.style.paddingBottom='10px'; sNat.appendChild(resNat);
  const rolaNat=el('div','rolatab'); sNat.appendChild(rolaNat);
  const naturezaPorMes=(DATA.natureza&&DATA.natureza.por_mes)||{};

  const s2=bloco(host,'Detalhado por mês');
  const rola=el('div','rolatab'); s2.appendChild(rola);
  const nota=el('div','nota'); s2.appendChild(nota);

  const totEmp=meses.reduce((s,m)=>s+m[1],0), totLiq=meses.reduce((s,m)=>s+m[2],0),
        totPag=meses.reduce((s,m)=>s+m[3],0);

  // Agrega o detalhamento por órgão dos meses pedidos, somando quando mais
  // de um mês está selecionado. Sem seleção nenhuma, soma TODOS os meses já
  // coletados (visão do período inteiro) — a tabela nunca fica vazia.
  function orgAgregado(mesesPedidos){
    const usar = mesesPedidos.length ? mesesPedidos : Object.keys(orgaosPorMes);
    const mapa = new Map();
    /* Valor Inicial/Atual são da dotação do ano, não se somam entre meses:
       vale o do último mês (com detalhe) entre os pedidos. */
    const ordem = usar.slice().sort((a,b)=>+a-+b);
    ordem.forEach(m=>{
      (orgaosPorMes[m]||[]).forEach(([nome,ini,atual,emp,liq,pag])=>{
        const cur = mapa.get(nome) || [0,0,0,0,0];
        cur[0]+=emp; cur[1]+=liq; cur[2]+=pag;
        cur[3]=ini; cur[4]=atual;
        mapa.set(nome, cur);
      });
    });
    /* Valor Inicial/Atual: dotação do ANO (visão do ano inteiro do portal) quando coletada */
    const dotOrg=(DATA.despesas&&DATA.despesas.dot_orgaos)||{};
    return [...mapa.entries()].map(([nome,v])=>{ const d=dotOrg[nome]; if(d){ v[3]=d[0]; v[4]=d[1]; } return [nome,...v]; });
  }

  function montaOrg(){
    const rot=sOrg.querySelector('.rot');
    const selecionados=[...st.meses].sort((a,b)=>+a-+b);
    const linhas=orgAgregado(selecionados);
    const semDetalhe=selecionados.filter(m=>!orgaosPorMes[m]);

    if(!selecionados.length){
      rot.textContent='Por secretaria · todos os meses coletados';
    } else {
      rot.innerHTML='Por secretaria · <b style="color:var(--t1)">'
        +selecionados.map(m=>MESNOME[m].charAt(0).toUpperCase()+MESNOME[m].slice(1)).join(', ')
        +'</b> <span style="color:var(--t3);font-weight:400;cursor:pointer" id="limparOrg">✕ limpar</span>';
      rot.querySelector('#limparOrg').onclick=limparMeses;
    }

    rolaOrg.innerHTML='';
    if(!linhas.length){
      const d=el('div','vazio'); d.textContent='Sem detalhamento por secretaria coletado ainda.';
      rolaOrg.appendChild(d);
      return;
    }
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:34%">Secretaria/Órgão</th>'
      +'<th title="Valor aprovado na LOA">Valor Inicial (R$)</th>'
      +'<th title="Dotação atual do ano (Portal, visão do ano inteiro). Azul ▲ = subiu, vermelho ▼ = desceu em relação ao valor inicial da LOA">Valor Atual (R$)</th>'
      +'<th>Empenhado (R$)</th><th>Liquidação (R$)</th><th>Pagamento (R$)</th></tr></thead>';
    const tb=el('tbody');
    linhas.slice().sort((a,b)=>b[3]-a[3]).forEach(([nome,emp,liq,pag,ini,atual])=>{
      const tr=el('tr');
      const dif=atual-ini, alt=Math.abs(dif)>0.005;
      const seta=!alt?'':(dif>0?'<span style="font-size:.75em">▲</span> ':'<span style="font-size:.75em">▼</span> ');
      const corAlt=dif>0?'var(--acento)':'var(--baixa)';
      tr.innerHTML='<td class="e">'+esc(nome.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /,''))+'</td>'
        +'<td>'+exato(ini)+'</td>'
        +'<td'+(alt?' style="color:'+corAlt+';font-weight:600" title="'+(dif>0?'Subiu':'Desceu')+' '+exato(Math.abs(dif))+' em relação ao valor inicial ('+exato(ini)+')"':'')+'>'+seta+exato(atual)+'</td>'
        +'<td>'+exato(emp)+'</td><td>'+exato(liq)+'</td><td>'+exato(pag)+'</td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb); rolaOrg.appendChild(t);
    if(semDetalhe.length){
      const av=el('div','nota');
      av.textContent='Sem detalhamento por secretaria ainda pra: '
        +semDetalhe.map(m=>MESNOME[m]).join(', ')+' (só o total entra na conta acima).';
      rolaOrg.appendChild(av);
    }
  }

  /* Despesa por natureza: obrigatória x discricionária. Mesma regra de meses
     da tabela por secretaria (soma o empenhado/liquidado/pago dos meses
     pedidos; Valor Atual é o do último mês, não se soma). */
  function montaNat(){
    const sel=[...st.meses].sort((a,b)=>+a-+b);
    const usar=sel.length?sel:Object.keys(naturezaPorMes).sort((a,b)=>+a-+b);
    const rot=sNat.querySelector('.rot');
    rot.textContent='Por natureza da despesa · '+(sel.length
      ? sel.map(m=>MESNOME[m]).join(', ') : 'todos os meses coletados');
    const mapa=new Map();
    usar.forEach(m=>{
      (naturezaPorMes[m]||[]).forEach(([nome,ini,atual,emp,liq,pag,tipo,grupo,lei,dtp,l9])=>{
        const c=mapa.get(nome)||{nome,ini:0,atual:0,emp:0,liq:0,pag:0,tipo,grupo,lei,key:l9};
        c.emp+=emp; c.liq+=liq; c.pag+=pag; c.ini=ini; c.atual=atual;
        mapa.set(nome,c);
      });
    });
    const dotNat=(DATA.natureza&&DATA.natureza.dot)||{};
    mapa.forEach(c=>{ const d=dotNat[c.key]; if(d){ c.ini=d[0]; c.atual=d[1]; } });
    const linhas=[...mapa.values()].sort((a,b)=>b.emp-a.emp);
    rolaNat.innerHTML=''; resNat.innerHTML='';
    if(!linhas.length){
      const d=el('div','vazio'); d.textContent='Sem despesa por natureza coletada ainda.'; rolaNat.appendChild(d); return;
    }
    const tot=linhas.reduce((s,l)=>s+l.emp,0);
    const soma=f=>linhas.filter(f).reduce((s,l)=>s+l.emp,0);
    const pc=x=>f1.format(tot?x/tot*100:0)+'%';
    const ob=soma(l=>l.tipo==='Obrigatória'), di=soma(l=>l.tipo==='Discricionária'), nc=soma(l=>!l.tipo);
    const grupos={}; linhas.filter(l=>l.tipo==='Obrigatória').forEach(l=>{ grupos[l.grupo]=(grupos[l.grupo]||0)+l.emp; });
    resNat.innerHTML='<b style="color:var(--baixa)">Obrigatórias: '+exato(ob)+' ('+pc(ob)+' do empenhado)</b>'
      +' · Discricionárias: '+exato(di)+' ('+pc(di)+')'
      +(nc>0.005?' · <span style="color:var(--parcial)">a classificar: '+exato(nc)+' ('+pc(nc)+')</span>':'')
      +'<br>'+Object.entries(grupos).map(([g,v])=>esc(g)+': '+exato(v)+' ('+pc(v)+')').join(' · ')
      +'<br>Classificação só pelas regras definidas, pelo nome da natureza; o que nenhuma regra cobre fica em "a classificar".';
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:30%">Natureza</th><th class="e">Tipo</th>'
      +'<th title="Valor aprovado na LOA">Valor Inicial (R$)</th>'
      +'<th title="Dotação atual do ano (Portal, visão do ano inteiro). Azul ▲ = subiu, vermelho ▼ = desceu em relação ao valor inicial da LOA">Valor Atual (R$)</th>'
      +'<th>Empenhado (R$)</th><th>Liquidação (R$)</th><th>Pagamento (R$)</th><th class="e">Base legal</th></tr></thead>';
    const tb=el('tbody');
    linhas.forEach(l=>{
      const tr=el('tr');
      const dif=l.atual-l.ini, alt=Math.abs(dif)>0.005;
      const seta=!alt?'':(dif>0?'<span style="font-size:.75em">▲</span> ':'<span style="font-size:.75em">▼</span> ');
      const corAlt=dif>0?'var(--acento)':'var(--baixa)';
      const tipoTd=l.tipo==='Obrigatória' ? '<td class="e" style="color:var(--baixa);font-weight:600">Obrigatória · '+esc(l.grupo)+'</td>'
        : l.tipo ? '<td class="e">Discricionária · '+esc(l.grupo)+'</td>'
        : '<td class="e" style="color:var(--parcial);font-style:italic">a classificar</td>';
      tr.innerHTML='<td class="e">'+esc(l.nome.charAt(0)+l.nome.slice(1).toLowerCase())+'</td>'+tipoTd
        +'<td>'+exato(l.ini)+'</td>'
        +'<td'+(alt?' style="color:'+corAlt+';font-weight:600" title="'+(dif>0?'Subiu':'Desceu')+' '+exato(Math.abs(dif))+' em relação ao valor inicial ('+exato(l.ini)+')"':'')+'>'+seta+exato(l.atual)+'</td>'
        +'<td>'+exato(l.emp)+'</td><td>'+exato(l.liq)+'</td><td>'+exato(l.pag)+'</td>'
        +'<td class="e" style="color:var(--t3)">'+esc(l.lei||'')+'</td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb); rolaNat.appendChild(t);
  }

  const serie=meses.map(m=>({k:MESES[m[0]-1], v:m[3], mes:String(m[0])}));
  function onClickMes(m){
    st.meses.has(m) ? st.meses.delete(m) : st.meses.add(m);
    colunasMes(mesG, serie, st.meses, onClickMes, true);
    montaOrg(); montaNat();
  }
  function limparMeses(){
    st.meses.clear();
    colunasMes(mesG, serie, st.meses, onClickMes, true);
    montaOrg(); montaNat();
  }
  btnLimpar.onclick=limparMeses;

  return function(){
    kpis.innerHTML='';
    [['Empenhado', brlx(totEmp), (ano||'')+' · todos os meses', totEmp],
     ['Liquidado', brlx(totLiq), 'valores já verificados', totLiq],
     ['Pago', brlx(totPag), 'valores efetivamente pagos', totPag],
     ['Execução', totEmp?f1.format(totPag/totEmp*100)+'%':'—', 'pago sobre empenhado', null],
    ].forEach(([r,v,s,x])=>{
      const d=el('div','kpi'); d.innerHTML=kpiHtml(r,v,s,x); kpis.appendChild(d);
    });

    colunasMes(mesG, serie, st.meses, onClickMes, true);
    montaOrg(); montaNat();

    rola.innerHTML='';
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:28%">Mês</th>'
      +'<th>Empenhado (R$)</th><th>Liquidação (R$)</th><th>Pagamento (R$)</th></tr></thead>';
    const tb=el('tbody');
    meses.forEach(([m,emp,liq,pag])=>{
      const tr=el('tr');
      tr.innerHTML='<td class="e" style="text-transform:capitalize">'+esc(MESNOME[String(m)])+'</td>'
        +'<td>'+exato(emp)+'</td><td>'+exato(liq)+'</td><td>'+exato(pag)+'</td>';
      tb.appendChild(tr);
    });
    const trTot=el('tr');
    trTot.style.fontWeight='600';
    trTot.innerHTML='<td class="e">Total</td><td>'+exato(totEmp)+'</td><td>'+exato(totLiq)+'</td><td>'+exato(totPag)+'</td>';
    tb.appendChild(trTot);
    t.appendChild(tb); rola.appendChild(t);
    nota.textContent='Valores por mês de competência (empenho/liquidação/pagamento do próprio mês, não acumulado). '
      + (DATA.dp_coleta ? 'Coletado do Portal da Transparência em '
          + DATA.dp_coleta.split('-').reverse().join('/') : '');
  };
}


/* ---------------- limites legais e gastos obrigatórios (aba Gestão Fiscal) ---------------- */
/* Tabela com o mínimo (educação, saúde) ou teto (pessoal, Câmara), quanto foi
   aplicado e uma barra com a marca do limite. Aproximação gerencial pelo
   empenhado — não substitui SIOPE/SIOPS/RREO. */
function limitesLegais(rot, rolaLei, notaLei){
  const leiMeses=(DATA.lei&&DATA.lei.meses)||{};
  const naturezaPorMes=(DATA.natureza&&DATA.natureza.por_mes)||{};
  const art29=DATA.art29a||{};
  const usar=Object.keys(leiMeses).sort((a,b)=>+a-+b);
  rot.textContent='Limites legais · '+(usar.length?MESNOME[usar[0]]+' a '+MESNOME[usar[usar.length-1]]:'sem dados');
  rolaLei.innerHTML=''; notaLei.innerHTML='';
  if(!usar.length){ const d=el('div','vazio'); d.textContent='Sem dados de função/receita coletados ainda.'; rolaLei.appendChild(d); return; }
  const S=k=>usar.reduce((s,m)=>s+(leiMeses[m][k]||0),0);
  const rit=S('rit'), rcl=S('rcl');
  const p12=(DATA.natureza&&DATA.natureza.pessoal12)||{pessoal:0,rcl:0,meses:0,faltam:[]};
  const linhas=[
    {n:'Educação (MDE)', regra:'mínimo 25% · CF art. 212', tipo:'min', lim:25, base:rit, ref:rit*0.25,
     apl:S('edu')-S('edu_fed'), bn:'receita de impostos e transferências'},
    {n:'Saúde (ASPS)', regra:'mínimo 15% · LC 141/2012', tipo:'min', lim:15, base:rit, ref:rit*0.15,
     apl:S('saude')-S('saude_fed'), bn:'receita de impostos e transferências'},
    {n:'Despesa com pessoal (12 meses)', regra:'máximo 60% · LRF art. 19 · janela móvel '+(p12.de||'')+' a '+(p12.ate||''), tipo:'max', lim:60, base:p12.rcl, ref:p12.rcl*0.60,
     apl:p12.pessoal, bn:'receita corrente líquida dos 12 meses (aprox.)', anual:true},
    {n:'Repasse à Câmara (empenhado)', regra:'teto 6% · CF art. 29-A', tipo:'max', lim:6, base:art29.base_2025||0, ref:art29.teto_2026||0,
     apl:art29.emp_camara_2026||0, bn:'receita tributária e transferências de 2025', anual:true},
    {n:'Repasse à Câmara (pago)', regra:'teto 6% · CF art. 29-A', tipo:'max', lim:6, base:art29.base_2025||0, ref:art29.teto_2026||0,
     apl:art29.pag_camara_2026||0, bn:'receita tributária e transferências de 2025', anual:true},
  ];
  const t=el('table');
  t.innerHTML='<thead><tr><th class="e" style="width:20%">Exigência</th><th class="e">Regra</th>'
    +'<th>Base de cálculo (R$)</th><th>Mínimo / teto (R$)</th><th>Aplicado (R$)</th><th>%</th>'
    +'<th class="e" style="width:22%">Gráfico</th></tr></thead>';
  const tb=el('tbody');
  linhas.forEach(l=>{
    const pct=l.base>0?l.apl/l.base*100:0;
    const ok=l.tipo==='min'?pct>=l.lim:pct<=l.lim;
    const cor=ok?'var(--alta)':(l.tipo==='min'?'var(--parcial)':'var(--baixa)');
    const esc_=Math.max(pct,l.lim)*1.25||1;
    const barra='<div style="position:relative;height:10px;background:var(--trilho);border-radius:6px;min-width:120px">'
      +'<div style="position:absolute;left:0;top:0;height:100%;width:'+Math.max(0,Math.min(100,pct/esc_*100)).toFixed(1)+'%;background:'+cor+';border-radius:6px"></div>'
      +'<div title="'+(l.tipo==='min'?'mínimo ':'teto ')+l.lim+'%" style="position:absolute;left:'+(l.lim/esc_*100).toFixed(1)+'%;top:-3px;height:16px;width:2px;background:var(--t2)"></div></div>';
    const tr=el('tr');
    tr.innerHTML='<td class="e" style="font-weight:600">'+esc(l.n)+'</td>'
      +'<td class="e" style="color:var(--t3)">'+esc(l.regra)+'</td>'
      +'<td title="'+esc(l.bn)+(l.anual?'':' no período')+'">'+exato(l.base)+'</td>'
      +'<td>'+exato(l.ref)+'</td><td>'+exato(l.apl)+'</td>'
      +'<td style="color:'+cor+';font-weight:700">'+f1.format(pct)+'%</td>'
      +'<td class="e">'+barra+'</td>';
    tb.appendChild(tr);
  });
  t.appendChild(tb); rolaLei.appendChild(t);
  const loa=art29.loa_camara_2026||0, teto=art29.teto_2026||0;
  notaLei.innerHTML='<div style="font-size:13px;color:var(--t1);padding:6px 0 12px;line-height:1.7">'
    +'<b>Repasse à Câmara Municipal:</b> previsto na LOA <b>'+exato(loa)+'</b> ('+f1.format(teto?loa/teto*100:0)+'% do teto) · '
    +'empenhado <b>'+exato(art29.emp_camara_2026||0)+'</b> · pago <b>'+exato(art29.pag_camara_2026||0)+'</b> · '
    +'teto do art. 29-A <b>'+exato(teto)+'</b></div>'
    +'Barra: preenchimento = % aplicado; traço = limite legal. Verde = dentro da regra; âmbar = abaixo do mínimo no período; vermelho = acima do teto.<br>'
    +'<b>Aproximação gerencial</b> pelo liquidado do ano civil (restos a pagar não entram), sem substituir SIOPE/SIOPS/RREO. '
    +'Educação e Saúde: liquidado da função, menos salário-educação/PNAE/PNATE (educação) e repasses do SUS e do Estado (saúde); '
    +'glosa por subfunção (alimentação, inativos/pensionistas; na saúde também saneamento e limpeza): educação '+exato(S('edu_glosa'))+', saúde '+exato(S('saude_glosa'))+'; '
    +'base = IPTU, ISS, ITBI, IRRF, FPM, ITR, cota-parte de ICMS, IPVA e IPI, sem dívida ativa nem multas e juros. '
    +'Pessoal: janela móvel dos últimos 12 meses fechados ('+(p12.de||'')+' a '+(p12.ate||'')+'), pela despesa liquidada (competência) ÷ RCL dos mesmos 12 meses; '
    +'inclui inativos, pensionistas, contratação temporária e a terceirização que substitui servidores (LRF art. 18, §1º); '
    +'fora: indenização por demissão, sentenças e despesas de exercícios anteriores (art. 19, §1º). '
    +(p12.faltam&&p12.faltam.length?'<b>Janela incompleta: faltam '+p12.faltam.join(', ')+' (calculado com '+p12.meses+' meses).</b> ':'')
    +'A RCL aqui é corrente − deduções, sem excluir a contribuição previdenciária do servidor. '
    +'Câmara: ano todo; o valor efetivamente repassado (duodécimo) não vem separado no portal, então o pago pela Câmara é a referência. '
    +'FUNDEB (70% em remuneração) não é calculável: o portal não separa a despesa por fonte.';
}

/* barra empilhada: o que é obrigatório x discricionário no empenhado (por natureza) */
function barraObrigatorias(host, ateMes){
  const npm=(DATA.natureza&&DATA.natureza.por_mes)||{};
  const acc={};
  Object.entries(npm).forEach(([m,ls])=>{ if(ateMes&&+m>ateMes) return; ls.forEach(l=>{
    const k=l[6]==='Obrigatória'?l[7]:(l[6]?'Discricionárias':'A classificar');
    acc[k]=(acc[k]||0)+l[3];
  }); });
  const ordem=[['Pessoal e encargos','#B3262C'],['Dívida e sentenças','#DD6B70'],['Outras obrigações','#EDB3B5'],
               ['Discricionárias','var(--acento)'],['A classificar','#D9A441']];
  const tot=ordem.reduce((s,[k])=>s+(acc[k]||0),0);
  host.innerHTML='';
  if(!tot){ const d=el('div','vazio'); d.textContent='Sem despesa por natureza coletada ainda.'; host.appendChild(d); return; }
  const barra=el('div'); barra.style.cssText='display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--trilho)';
  const leg=el('div'); leg.style.cssText='display:flex;flex-wrap:wrap;gap:8px 28px;margin-top:14px';
  ordem.forEach(([k,c])=>{
    const v=acc[k]||0; if(!v) return;
    const sg=el('div'); sg.style.cssText='width:'+(v/tot*100).toFixed(2)+'%;background:'+c;
    sg.title=k+': '+exato(v)+' ('+f1.format(v/tot*100)+'%)'; barra.appendChild(sg);
    const it=el('div'); it.style.cssText='font-size:12.5px;color:var(--t2);line-height:1.5';
    it.innerHTML='<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:'+c+';margin-right:6px"></span>'
      +esc(k)+'<br><b style="color:var(--t1)">'+exato(v)+'</b> · '+f1.format(v/tot*100)+'%';
    leg.appendChild(it);
  });
  host.appendChild(barra); host.appendChild(leg);
  const nt=el('div','nota'); nt.style.paddingTop='12px';
  nt.textContent='Pelo empenhado'+(ateMes?' de janeiro até o mês escolhido':' do ano')+', classificado pelo nome da natureza (tabela completa em Despesas → Órgãos). '
    +'Obrigatória = pessoal, dívida, sentenças, exercícios anteriores e consórcios; "a classificar" = nenhuma regra cobre a linha.';
  host.appendChild(nt);
}

/* rosca: obrigatório x discricionário (empenhado por natureza, até o mês escolhido) */
function donutObrigatorias(host, ateMes){
  const npm=(DATA.natureza&&DATA.natureza.por_mes)||{}, acc={};
  Object.entries(npm).forEach(([m,ls])=>{ if(ateMes&&+m>ateMes) return; ls.forEach(l=>{
    const k=l[6]==='Obrigatória'?l[7]:(l[6]?'Discricionárias':'A classificar'); acc[k]=(acc[k]||0)+l[3]; }); });
  const ordem=[['Pessoal e encargos','#B3262C'],['Dívida e sentenças','#DD6B70'],['Outras obrigações','#EDB3B5'],['Discricionárias','#1F6FEB'],['A classificar','#D9A441']];
  const tot=ordem.reduce((s,[k])=>s+(acc[k]||0),0);
  host.innerHTML='';
  if(!tot){ const d=el('div','vazio'); d.textContent='Sem despesa por natureza coletada ainda.'; host.appendChild(d); return; }
  const ob=(acc['Pessoal e encargos']||0)+(acc['Dívida e sentenças']||0)+(acc['Outras obrigações']||0);
  const R=40, C=2*Math.PI*R; let off=0;
  let svg='<svg viewBox="0 0 120 120" width="100%" style="max-width:150px;display:block;margin:0 auto" role="img" aria-label="Obrigatório x discricionário">'
    +'<circle cx="60" cy="60" r="'+R+'" fill="none" stroke="var(--trilho)" stroke-width="18"/>';
  ordem.forEach(([k,c])=>{ const v=acc[k]||0; if(!v) return; const len=v/tot*C;
    svg+='<circle cx="60" cy="60" r="'+R+'" fill="none" stroke="'+c+'" stroke-width="18" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)
      +'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 60 60)"><title>'+k+': '+exato(v)+'</title></circle>'; off+=len; });
  svg+='<text x="60" y="58" text-anchor="middle" style="font-size:17px;font-weight:700;fill:var(--t1)">'+f1.format(ob/tot*100)+'%</text>'
    +'<text x="60" y="72" text-anchor="middle" style="font-size:8px;fill:var(--t3)">obrigatório</text></svg>';
  const leg=ordem.filter(([k])=>acc[k]).map(([k,c])=>'<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--t2);padding:2px 0">'
    +'<span style="width:9px;height:9px;border-radius:2px;background:'+c+';flex:none"></span><span style="flex:1">'+esc(k)+'</span><b style="color:var(--t1)">'+f1.format(acc[k]/tot*100)+'%</b></div>').join('');
  host.innerHTML=svg+'<div style="margin-top:8px">'+leg+'</div>';
}

/* ---------------- página de equilíbrio (Gestão Fiscal) ---------------- */
function montaEquilibrio(){
  const host=document.getElementById('pg-eq');
  host.innerHTML='';
  const eq=DATA.equilibrio||{ano:null,meses:[]};
  const meses=eq.meses||[];
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>'+(eq.ano||'')+' · Gestão Fiscal</h1>'
    +'<p>Receita x despesa, limites legais e gastos obrigatórios · Receita Orçamentária Líquida Total (Corrente + Capital − Deduções)</p></div>';
  topopag.appendChild(cab);
  const kpis=el('div','kpis'); host.appendChild(kpis);

  if(!meses.length){
    const d=el('div','vazio'); d.textContent='Sem dados suficientes ainda pra montar essa comparação.';
    host.appendChild(d);
    return function(){};
  }

  const sMes=bloco(host,'Mês a mês · R$');
  const leg=el('div'); leg.style.cssText='display:flex;gap:20px;margin:-6px 0 14px;flex-wrap:wrap';
  const SERIES=[
    {chave:'receita', nome:'Receita', cor:'var(--acento)'},
    {chave:'emp',     nome:'Empenhado', cor:'#5B6472'},
    {chave:'pag',     nome:'Pago', cor:'#B8860B'},
  ];
  SERIES.forEach(s=>{
    const it=el('div'); it.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2)';
    it.innerHTML='<span style="width:10px;height:10px;border-radius:3px;background:'+s.cor+';display:inline-block"></span>'+s.nome;
    leg.appendChild(it);
  });
  sMes.appendChild(leg);
  const mesG=el('div'); sMes.appendChild(mesG);

  const sLim=bloco(host,'Limites legais');
  const rolaLim=el('div','rolatab'); sLim.appendChild(rolaLim);
  const notaLim=el('div','nota'); sLim.appendChild(notaLim);
  const sObr=bloco(host,'Gastos obrigatórios x discricionários');
  const hostObr=el('div'); sObr.appendChild(hostObr);

  const totReceita=meses.reduce((s,m)=>s+m[1],0), totEmp=meses.reduce((s,m)=>s+m[2],0),
        totPag=meses.reduce((s,m)=>s+m[3],0);
  const saldo=totReceita-totPag;
  const rclTotal=Object.values((DATA.lei&&DATA.lei.meses)||{}).reduce((s,m)=>s+(m.rcl||0),0);

  return function(){
    kpis.innerHTML='';
    [['Receita líquida total', brlx(totReceita), 'Corrente + Capital − Deduções · RCL (sem capital): '+exato(rclTotal), totReceita, null],
     ['Empenhado', brlx(totEmp), 'comprometido no período', totEmp, null],
     ['Pago', brlx(totPag), 'efetivamente desembolsado', totPag, null],
     ['Saldo', brlx(saldo), saldo>=0?'receita cobriu o pago':'pago passou da receita', saldo,
       saldo>=0?'var(--alta)':'var(--baixa)'],
    ].forEach(([r,v,s,x,cor])=>{
      const d=el('div','kpi'); d.innerHTML=kpiHtml(r,v,s,x,cor); kpis.appendChild(d);
    });

    const dados=meses.map(([m,receita,emp,pag])=>({k:MESES[m-1], receita, emp, pag}));
    colunasMesTrio(mesG, dados, SERIES);

    limitesLegais(sLim.querySelector('.rot'), rolaLim, notaLim);
    barraObrigatorias(hostObr);
  };
}


/* ---------------- cores e navegação do Painel de Comando ---------------- */
const COR_ST={ ok:'var(--alta)', at:'var(--parcial)', ruim:'var(--baixa)', info:'var(--acento)' };
const TAG_LEI={ ok:'DENTRO DO LIMITE', at:'ATENÇÃO', ruim:'FORA DO LIMITE' };
const TAG_ST={ ok:'OK', at:'ATENÇÃO', ruim:'ALERTA', info:'INFORMATIVO' };
function irPara(p){ pagina=p; render(); scrollTo({top:0,behavior:'smooth'}); }


/* ---------------- Painel de Comando ---------------- */
function montaComando(){
  const host=document.getElementById('pg-cmd');
  host.innerHTML='';
  const eq=DATA.equilibrio||{ano:null,meses:[]}, lei=(DATA.lei&&DATA.lei.meses)||{},
        ser=DATA.serie||{pes:{},rcl:{}}, a29=DATA.art29a||{};
  const meses=Object.keys(lei).map(Number).sort((a,b)=>a-b);
  const topopag=el('div','topopag cmdtop'); host.appendChild(topopag);
  const colTit=el('div','coltit'); topopag.appendChild(colTit);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>Painel de Comando</h1><p>'+(eq.ano||'')+' · escolha o mês de referência · '
    +'indicadores gerenciais, não substituem o RREO/RGF</p></div>';
  colTit.appendChild(cab);
  if(!meses.length||!eq.ano){
    const d=el('div','vazio'); d.textContent='Sem dados suficientes ainda pra montar o painel.'; host.appendChild(d);
    return function(){};
  }
  const fech=Math.min((DATA.lei&&DATA.lei.fechado)||meses[meses.length-1], meses[meses.length-1]);
  const st={M:fech, rr:0, rf:0, rs:0, re:0, tm:null, sel:new Set(), vinc:null};
  /* período: os meses marcados (vários) ou, sem marcação, o ano de janeiro até o último mês fechado.
     Os indicadores somam só os meses do período; M é o último deles (fim da janela de 12 meses). */
  function periodo(){
    const sel=[...st.sel].sort((a,b)=>a-b);
    const ms=sel.length?sel:meses.filter(m=>m<=fech);
    const M=ms[ms.length-1]||fech;
    let rot;
    if(!sel.length) rot='janeiro a '+MESNOME[fech];
    else rot=ms.map(m=>MESNOME[m]).join(', ');
    return {ms,M,rot,sel};
  }

  const barra=el('div','cbar'); colTit.appendChild(barra);
  const gradeG=el('div','cgrid inl'); topopag.appendChild(gradeG);   /* sobe pra linha do título, no canto direito */
  const selo=el('div'); selo.style.cssText='margin:0 0 4px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  host.appendChild(selo);
  const linhaCards=el('div','dgrid'); host.appendChild(linhaCards);
  /* quadrantes em 2 colunas x 2 linhas, cada par com a mesma altura:
       [cartões] [execução do orçamento] / [receitas vinculadas] [vínculo e pessoal] */
  const colCards=el('div','c7 colcards'); linhaCards.appendChild(colCards);
  const gradeC=el('div','pgrid p2'); colCards.appendChild(gradeC);
  const sTab=bloco(linhaCards,'Execução do orçamento'); sTab.classList.add('c5');
  const hostTab=el('div'); sTab.appendChild(hostTab);
  const sVi=bloco(linhaCards,'Receitas vinculadas'); sVi.classList.add('c7');
  const sVin=bloco(linhaCards,'Vínculo · servidores'); sVin.classList.add('c5');
  const hostVin=el('div'); sVin.appendChild(hostVin);
  const row3=el('div','dgrid'); host.appendChild(row3);
  const sOnde=bloco(row3,'Para onde vai o dinheiro'); sOnde.classList.add('c5');
  const sAl=bloco(row3,'O que merece atenção agora'); sAl.classList.add('c7');

  function calc(Pin){
    const P=Pin||periodo(), M=P.M, ms=P.ms.filter(m=>lei[m]);
    const rr=(DATA.rreo&&DATA.rreo.ultimo)||null;
    const S=k=>ms.reduce((s,m)=>s+(lei[m][k]||0),0);
    const fr=1+st.rr/100;
    const rit=S('rit')*fr;
    const edu=(S('edu')-S('edu_fed'))*(1+st.re/100), sau=(S('saude')-S('saude_fed'))*(1+st.rs/100);
    let pes=0, rcl=0, falt=0, y=eq.ano, mm=M;
    for(let i=0;i<12;i++){
      const k=y+'-'+String(mm).padStart(2,'0'), a=ser.pes[k], b=ser.rcl[k];
      if(a===undefined||b===undefined) falt++; else { pes+=a; rcl+=b; }
      mm--; if(!mm){ mm=12; y--; }
    }
    pes*=1+st.rf/100; rcl*=fr;
    const cam=meses.filter(m=>m<=M).reduce((s,m)=>s+((a29.camara_mes||{})[m]||0),0);   // Câmara: acumulado até o fim do período, contra o teto anual
    const pPes=rcl?pes/rcl*100:0, pEdu=rit?edu/rit*100:0, pSau=rit?sau/rit*100:0, pCam=a29.teto_2026?cam/a29.teto_2026*100:0;
    return {falt,pes,rcl,rit,gauges:[
      {n:'Folha de pessoal', c:'Folha · 12 meses', v:pPes, lim:60, max:80, tipo:'max', alerta:54, sub:'sobre a RCL · últimos 12 meses', x:'Limite 60% · alerta 54%'+(falt?' · janela com '+(12-falt)+' meses':'')},
      {n:'Educação', c:'Educação · mín. 25%', v:pEdu, lim:25, max:50, tipo:'min', sub:'da receita de impostos', x:'Mínimo 25% (CF art. 212)'+(rr?' · Oficial (RREO '+rr.bimestre+'º bim/'+rr.ano+'): '+f1.format(rr.mde.pct)+'%':'')},
      {n:'Saúde', c:'Saúde · mín. 15%', v:pSau, lim:15, max:40, tipo:'min', sub:'da receita de impostos', x:'Mínimo 15% (LC 141/2012)'+(rr?' · Oficial (RREO '+rr.bimestre+'º bim/'+rr.ano+'): '+f1.format(rr.asps.pct)+'%':'')},
      {n:'Repasse à Câmara', c:'Câmara · do teto', v:pCam, lim:100, max:120, tipo:'max', alerta:90, sub:'do teto já empenhado', x:'Teto de 6% (CF art. 29-A)'}]};
  }
  function stat(g,Mref){
    /* o mínimo é anual: abaixo dele antes de dezembro é só observação, não descumprimento */
    if(g.tipo==='min') return g.v>=g.lim?'ok':((g.v>=g.lim-2||(Mref||periodo().M)<12)?'at':'ruim');
    if(g.v>g.lim) return 'ruim';
    return (g.alerta&&g.v>g.alerta)?'at':'ok';
  }
  const ang=p=>Math.PI*(1-p), pt=(cx,cy,r,p)=>[cx+r*Math.cos(ang(p)), cy-r*Math.sin(ang(p))];
  const arc=(cx,cy,r,p0,p1)=>{ const a=pt(cx,cy,r,p0), b=pt(cx,cy,r,p1);
    return 'M'+a[0].toFixed(1)+' '+a[1].toFixed(1)+' A'+r+' '+r+' 0 0 1 '+b[0].toFixed(1)+' '+b[1].toFixed(1); };

  function desenha_(){
    const P=periodo(), M=P.M, R=calc();
    /* meses */
    barra.innerHTML='';
    const cbTodos=el('label','cbtodos'); cbTodos.title='Marcar ou desmarcar todos os meses';
    cbTodos.innerHTML='<input type="checkbox"'+(st.sel.size===meses.length?' checked':'')+'><span>Todos</span>';
    cbTodos.querySelector('input').onchange=e=>{ if(e.target.checked){ meses.forEach(m=>st.sel.add(m)); } else { st.sel.clear(); } desenha_(); };
    barra.appendChild(cbTodos);
    meses.forEach(m=>{
      const b=el('div','ano'+(st.sel.has(m)?' on':'')+(m>fech?' parcial':'')+(m===fech?' ultimo':''));
      b.textContent=MESES[m-1]+(m>fech?' *':'');
      b.title=(m>fech?'mês ainda em andamento · ':(m===fech?'último mês fechado, com todas as informações · ':''))+'clique para marcar ou desmarcar (pode marcar vários)';
      b.onclick=()=>{ st.sel.has(m)?st.sel.delete(m):st.sel.add(m); desenha_(); }; barra.appendChild(b);
    });
    /* selo */
    /* o saldo (receita líquida − pago) também pesa no selo: pago acima da receita é atenção, e alerta se passar de 3% */
    const em=(eq.meses||[]).filter(m=>P.ms.includes(m[0])), rec=em.reduce((s,m)=>s+m[1],0), pag=em.reduce((s,m)=>s+m[3],0);
    const stSaldo=rec-pag>=0?'ok':((rec-pag)/(rec||1)>-0.03?'at':'ruim');
    const ss=R.gauges.map(stat), todos=ss.concat([stSaldo]);
    const pior=todos.includes('ruim')?'ruim':(todos.includes('at')?'at':'ok');
    const soSaldo=pior!=='ok'&&!ss.includes(pior);
    const frase=pior==='ok'?'Tudo dentro dos limites legais e as contas no azul'
      :(soSaldo?'Limites legais em dia, mas o pago passou da receita'
      :(pior==='ruim'?'Há indicador fora do limite':'Indicador perto do limite'));
    selo.innerHTML='<span class="csel" style="--cs:'+COR_ST[pior]+'">'+(pior==='ruim'?'ATENÇÃO':(pior==='at'?'OBSERVAÇÃO':'TUDO EM DIA'))+'</span>'
      +'<b style="font-size:17px">'+frase+' · '+(P.sel.length?'meses: ':'')+P.rot+'</b>'
      ;
    /* medidores */
    gradeG.innerHTML='';
    R.gauges.forEach((g,i)=>{
      const c=COR_ST[ss[i]], f=Math.min(g.v/g.max,1), l=g.lim/g.max, m1=pt(60,62,47,l), m2=pt(60,62,34,l);
      /* arco em cor viva, com brilho; o número fica na cor mais escura, que lê melhor no branco */
      const cb=({ok:'#009C3B',at:'#E3A008',ruim:'#D92D20'})[ss[i]], cn=({ok:'#007A2E',at:'#9A6B00',ruim:'#B42318'})[ss[i]];
      const d=el('div','cg'); d.style.setProperty('--cs',c);
      d.title=g.n+' · '+g.sub+' · '+g.x;
      /* a meta: traço branco por baixo (contorno), traço escuro por cima e uma bolinha na ponta, pra destacar no arco */
      const m3=pt(60,62,54,l);
      d.innerHTML='<svg viewBox="0 -10 120 88" role="img" aria-label="'+g.n+'"><g transform="translate(0,62) scale(1,1.2) translate(0,-62)">'
        +'<path d="'+arc(60,62,41,0,1)+'" fill="none" stroke="var(--trilho)" stroke-width="11"/>'
        +'<path d="'+arc(60,62,41,0,Math.max(f,0.002))+'" fill="none" stroke="'+cb+'" stroke-width="11"/>'
        +'<line x1="'+m2[0].toFixed(1)+'" y1="'+m2[1].toFixed(1)+'" x2="'+m3[0].toFixed(1)+'" y2="'+m3[1].toFixed(1)+'" stroke="#fff" stroke-width="7"/>'
        +'<line x1="'+m2[0].toFixed(1)+'" y1="'+m2[1].toFixed(1)+'" x2="'+m3[0].toFixed(1)+'" y2="'+m3[1].toFixed(1)+'" stroke="#111827" stroke-width="3.6"/>'
        +'<circle cx="'+m3[0].toFixed(1)+'" cy="'+m3[1].toFixed(1)+'" r="3.4" fill="#111827" stroke="#fff" stroke-width="1.5"/></g>'
        +'<text x="60" y="58" text-anchor="middle" style="font-size:21px;font-weight:700;fill:'+cn+'">'+f1.format(g.v)+'%</text></svg>'
        +'<div class="cl">'+g.c+'</div>';
      d.onclick=()=>irPara('eq'); gradeG.appendChild(d);
    });
    /* painel de cartões (reagem ao mês escolhido) */
    const pad=m=>String(m).padStart(2,'0'), ms=P.ms, pf=DATA.prefeito||{}, VI=DATA.vinculadas||{mes:{},bruta_mes:{}};
    const cards=[];
    // contas no azul
    cards.push({tit:'Contas no azul?', st:stSaldo, valor:(rec-pag>=0?'+':'−')+brlx(Math.abs(rec-pag)),
      sub:rec-pag>=0?'A receita cobriu tudo o que foi pago.':'Foi pago mais do que o município arrecadou.',
      leg:'Receita líquida '+brlx(rec)+' · pago '+brlx(pag)+' (o pago inclui restos a pagar de anos anteriores)', ir:'eq'});
    // orçamento executado
    if(pf.dot_atual>0){
      const emp=em.reduce((s,m)=>s+m[2],0), pe=emp/pf.dot_atual*100, dl=pf.dot_atual-pf.dot_ini;
      cards.push({tit:'Orçamento executado', st:pe>100?'ruim':'info', valor:f1.format(pe)+'%',
        sub:'do orçamento atualizado já foi empenhado.',
        leg:'Empenhado '+brlx(emp)+' de '+brlx(pf.dot_atual)+' · LOA '+brlx(pf.dot_ini)+' ('+(dl>=0?'+':'−')+brlx(Math.abs(dl))+' de remanejamento) · pago '+brlx(pag), ir:'desp'});
    }
    // folha em reais
    cards.push({tit:'Folha de pessoal · 12 meses', st:'info', valor:brlx(R.pes),
      sub:'de pessoal e encargos (liquidado), inclusive inativos e terceirização.',
      leg:'RCL dos mesmos 12 meses: '+brlx(R.rcl)+(R.falt?' · janela com '+(12-R.falt)+' meses':''), ir:'eq'});
    // contratos
    {
      const c=(DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0), c30=c.filter(r=>r[8]<=30), c90=c.filter(r=>r[8]<=90);
      cards.push({tit:'Contratos vencendo', st:c30.length===0?'ok':(c30.length<=20?'at':'ruim'), valor:String(c30.length),
        sub:c30.length?'contrato(s) vencem nos próximos 30 dias ('+brlx(c30.reduce((s,r)=>s+r[6],0))+').':'Nenhum contrato vence nos próximos 30 dias.',
        leg:c90.length+' vencem em até 90 dias · '+c.length+' contratos vigentes', ir:'ctr'});
    }
    /* tabela de total do município: valor inicial, valor atual, empenhado, liquidado e pago (acumulados até o mês) */
    {
      const opm=(DATA.despesas&&DATA.despesas.orgaos_por_mes)||{}, mapa=new Map();
      Object.keys(opm).map(Number).sort((a,b)=>a-b).filter(m=>m<=M).forEach(m=>opm[m].forEach(([nome,ini,atual,emp,liq,pg])=>{
        const o=mapa.get(nome)||{nome,ini,dl:0,emp:0,liq:0,pag:0}, dentro=P.ms.includes(m);
        o.dl+=atual-ini; if(dentro){ o.emp+=emp; o.liq+=liq; o.pag+=pg; } mapa.set(nome,o); }));
      const rows=[...mapa.values()].map(o=>({nome:o.nome.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /,''), ini:o.ini, atual:o.ini+o.dl, emp:o.emp, liq:o.liq, pag:o.pag}))
        .sort((a,b)=>b.emp-a.emp);
      const soma=l=>l.reduce((a,r)=>({ini:a.ini+r.ini,atual:a.atual+r.atual,emp:a.emp+r.emp,liq:a.liq+r.liq,pag:a.pag+r.pag}),{ini:0,atual:0,emp:0,liq:0,pag:0});
      const tot=soma(rows);
      const dif=tot.atual-tot.ini;
      const lin=(n,v,pct,extra)=>'<tr><td class="e" style="font-weight:600">'+n+'</td><td style="'+(extra||'')+'">'+exato(v)+'</td><td style="color:var(--t3)">'+(pct===null?'—':f1.format(pct)+'%')+'</td></tr>';
      hostTab.innerHTML='<div class="rolatab"><table style="font-size:13px"><thead><tr><th class="e">Total do município</th><th>Valor (R$)</th><th>% do Valor Atual</th></tr></thead><tbody>'
        +lin('Valor Inicial',tot.ini,tot.atual?tot.ini/tot.atual*100:null)
        +lin('Valor Atual',tot.atual,100,Math.abs(dif)>0.005?'font-weight:700;color:'+(dif>0?'var(--acento)':'var(--baixa)'):'font-weight:700')
        +lin('Empenhado',tot.emp,tot.atual?tot.emp/tot.atual*100:null)
        +lin('Liquidado',tot.liq,tot.atual?tot.liq/tot.atual*100:null)
        +lin('Pago',tot.pag,tot.atual?tot.pag/tot.atual*100:null)
        +'<tr><td colspan="3" style="padding:0;height:10px;border:0"></td></tr>'
        +'<tr style="border-top:2px solid var(--linha)"><td class="e" style="font-weight:700">Arrecadado (receita líquida)</td>'
        +'<td style="font-weight:700;color:var(--alta)">'+exato(rec)+'</td>'
        +'<td style="font-weight:700" title="Arrecadado dividido pelo pago">'+(tot.pag?f1.format(rec/tot.pag*100)+'% do pago':'—')+'</td></tr>'
        +'</tbody></table></div>';
      sTab.querySelector('.rot').textContent='Execução do orçamento · '+P.rot;
    }
    gradeC.innerHTML='';
    cards.forEach(c=>{
      const d=el('div','pcard'); d.style.setProperty('--cs',COR_ST[c.st]);
      d.innerHTML='<div class="pt"><span>'+esc(c.tit)+'</span><span class="tag">'+TAG_ST[c.st]+'</span></div>'
        +'<div class="pb" style="font-size:'+(c.valor.length>12?'22':'28')+'px">'+esc(c.valor)+'</div><div class="ps">'+esc(c.sub)+'</div><div class="pl">'+esc(c.leg)+'</div>';
      d.onclick=()=>irPara(c.ir); gradeC.appendChild(d);
    });
    /* receitas vinculadas: total, percentual da receita e quebra por área (de janeiro até o mês) */
    {
      sVi.querySelectorAll('.vbox').forEach(x=>x.remove());
      sVi.querySelector('.rot').textContent='Receitas vinculadas · '+P.rot;
      const FUNC_DE={'Educação':'EDUCAÇÃO','Saúde':'SAÚDE','Assistência social':'ASSISTÊNCIA SOCIAL'};
      const REGRA_DE={'Mineração (restrita)':'Lei 7.990/1989: não pode pagar folha do quadro permanente nem dívida.',
        'Serviço da taxa':'Só pode custear o serviço que a taxa remunera (CF art. 145).','Iluminação pública':'Só pode custear a iluminação pública (CF art. 149-A).',
        'Trânsito':'Sinalização, engenharia, fiscalização e educação de trânsito (CTB art. 320).',
        'Obra pública':'Só pode custear a obra que gerou a contribuição de melhoria.','Objeto do convênio':'Só pode ser gasto no objeto do convênio.',
        'Assistência social':'Só pode custear a assistência social (Lei 8.742/1993).',
        'Educação':'Educação básica: FUNDEB, salário-educação, PNAE e PNATE só podem ser aplicados na educação.',
        'Saúde':'Repasses do SUS e do Estado só podem ser aplicados em ações e serviços públicos de saúde.'};
      const rec_={}, fg={}; let tb=0, tl=0, tn=0;
      ms.forEach(m=>{ tb+=(VI.bruta_mes||{})[m]||0; tl+=(VI.livre_mes||{})[m]||0; tn+=(VI.nc_mes||{})[m]||0;
        Object.entries((VI.mes||{})[m]||{}).forEach(([a,v])=>{ rec_[a]=(rec_[a]||0)+v; });
        Object.entries((pf.func_mes||{})[m]||{}).forEach(([f,v])=>{ fg[f]=(fg[f]||0)+v; }); });
      const leis={}; Object.entries(VI.areas||{}).forEach(([a,v])=>{ leis[a]=(v.leis||[]).join(' · '); });
      const lv=Object.entries(rec_).map(([a,v])=>({area:a, v, lei:leis[a]||'', gasto:FUNC_DE[a]?(fg[FUNC_DE[a]]||0):null}))
        .sort((x,y)=>y.v-x.v);
      const tv=lv.reduce((s,l)=>s+l.v,0), pc=x=>f1.format(tb?x/tb*100:0)+'%', mi=x=>(x/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
      const box=el('div','vbox'); sVi.appendChild(box);
      if(!tv){ box.innerHTML='<div class="vazio">Sem receita vinculada nos meses coletados.</div>'; }
      else {
        const livre=tb-tv-tn;
        let h='<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin:2px 0 10px">'
          +'<span style="font-size:34px;font-weight:700;color:var(--acento);line-height:1">'+pc(tv)+'</span>'
          +'<span style="font-size:14.5px;color:var(--t1);line-height:1.4">da receita bruta, <b>'+brlx(tv)+'</b>, só pode ser gasta na finalidade que a lei fixou</span></div>'
          +'<div class="vbar"><div style="width:'+(tb?tv/tb*100:0).toFixed(2)+'%;background:var(--acento)"></div>'
          +'<div style="width:'+(tb?livre/tb*100:0).toFixed(2)+'%;background:#C9D1DC"></div>'
          +'<div style="width:'+(tb?tn/tb*100:0).toFixed(2)+'%;background:#E3A008"></div></div>'
          +'<div class="vleg"><span><i style="background:var(--acento)"></i>Vinculada '+brlx(tv)+' · '+pc(tv)+'</span>'
          +'<span><i style="background:#C9D1DC"></i>Livre '+brlx(livre)+' · '+pc(livre)+'</span>'
          +(tn>0.005?'<span><i style="background:#E3A008"></i>Sem regra definida '+brlx(tn)+' · '+pc(tn)+'</span>':'')+'</div>'
          +'<div class="vlegd"><span><i style="background:var(--acento)"></i>Receita vinculada recebida</span>'
          +'<span><i style="background:#8A94A6"></i>Despesa total da função de governo <b>(não é só a parte paga com esta receita: o portal não informa a fonte de recurso)</b></span></div>'
          +'<div class="vrow cab"><span>Área</span><span>Recebido x gasto</span><span style="text-align:right">Recebido</span><span style="text-align:right">Gasto na função</span><span style="text-align:right">% receita</span></div>';
        /* a tabela traz TODAS as receitas vinculadas; onde não há despesa identificada, a própria linha avisa */
        const mxb=Math.max(...lv.map(l=>Math.max(l.v,l.gasto||0)),1);
        lv.forEach(l=>{
          const temG=l.gasto!==null;
          h+='<div class="vrow" data-a="'+esc(l.area)+'"><span class="n">'+esc(l.area)+'</span>'
            +'<span class="bb"><span class="t rr"><i style="width:'+(l.v/mxb*100).toFixed(1)+'%"></i></span>'
            +(temG?'<span class="t gg" title="Gasto na função: '+exato(l.gasto)+'"><i style="width:'+(l.gasto/mxb*100).toFixed(1)+'%"></i></span>'
                  :'<em>aguardando despesa por fonte de recurso</em>')+'</span>'
            +'<span class="q">'+mi(l.v)+'</span><span class="q" style="'+(temG&&l.gasto<l.v?'color:var(--parcial);font-weight:600':'')+'">'+(temG?mi(l.gasto):'—')+'</span>'
            +'<span class="p">'+pc(l.v)+'</span></div>';
          if(st.area===l.area){
            const cob=l.gasto===null?'':(l.v>l.gasto
              ?'<br><b style="color:var(--parcial)">Recebeu mais do que gastou na função — conferir.</b> Gasto na função: '+exato(l.gasto)+'.'
              :'<br><b style="color:var(--parcial)">Aplicação na finalidade não confirmável.</b> A despesa total da função é '+exato(l.gasto)+', mas o portal não informa qual parte foi paga com esta receita vinculada.');
            h+='<div class="vdet"><b>Base legal:</b> '+esc(l.lei||'—')+'<br>'+esc(REGRA_DE[l.area]||'')+'<br>Recebido: '+exato(l.v)+cob+'</div>';
          }
        });
        box.innerHTML=h;
        box.querySelectorAll('.vrow[data-a]').forEach(r=>{ r.onclick=()=>{ st.area=(st.area===r.dataset.a?null:r.dataset.a); desenha_(); }; });
      }
      const nt=el('div','nota'); nt.style.paddingTop='10px';
      nt.textContent='Receita bruta = Corrente + Capital, antes das deduções. "Sem regra definida" são linhas de receita que ainda não têm regra de vinculação e ficam fora do vinculado. '
        +'O portal não separa a despesa por fonte de recurso; a comparação com o gasto na função é aproximada.';
      box.appendChild(nt);
    }
    /* para onde vai o dinheiro (até o mês) */
    {
      sOnde.querySelectorAll('.rk').forEach(x=>x.remove());
      sOnde.querySelector('.rot').textContent='Para onde vai o dinheiro';
      const ac={}; let tt=0;
      ms.forEach(m=>Object.entries((pf.func_mes||{})[m]||{}).forEach(([f,v])=>{ if(v>0){ ac[f]=(ac[f]||0)+v; tt+=v; } }));
      const fun=Object.entries(ac).sort((x,y)=>y[1]-x[1]).slice(0,9);
      fun.forEach(([n,v])=>{
        const r=el('div','rk'); r.title=exato(v);
        r.innerHTML='<span class="n">'+esc(n.charAt(0)+n.slice(1).toLowerCase())+'</span><span class="b"><i style="width:'+(v/fun[0][1]*100).toFixed(1)+'%"></i></span><span class="p">'+f1.format(tt?v/tt*100:0)+'%</span>';
        r.onclick=()=>irPara('desp'); sOnde.appendChild(r);
      });
    }
    /* alertas */
    sAl.querySelectorAll('.palerta,.nota').forEach(x=>x.remove());
    const txt={0:g=>'A folha está em '+f1.format(g.v)+'% da RCL (limite 60%, alerta em 54%).',
      1:g=>'Educação em '+f1.format(g.v)+'%, abaixo do mínimo de 25%.', 2:g=>'Saúde em '+f1.format(g.v)+'%, abaixo do mínimo de 15%.',
      3:g=>'O repasse à Câmara já usou '+f1.format(g.v)+'% do teto de 6%.'};
    let n=0;
    R.gauges.forEach((g,i)=>{ if(ss[i]!=='ok'){ n++; const a=el('div','palerta'); a.style.setProperty('--cs',COR_ST[ss[i]]);
      a.innerHTML='<i></i><span>'+esc(txt[i](g))+'</span>'; a.onclick=()=>irPara('eq'); sAl.appendChild(a); } });
    if(rec-pag<0){ n++; const a=el('div','palerta'); a.style.setProperty('--cs',COR_ST.at);
      a.innerHTML='<i></i><span>No período ('+P.rot+') foram pagos '+brlx(pag-rec)+' a mais do que a receita líquida arrecadada (o pago inclui restos a pagar de anos anteriores).</span>';
      a.onclick=()=>irPara('eq'); sAl.appendChild(a); }
    const ct=(DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0&&r[8]<=30).sort((a,b)=>a[8]-b[8]);
    if(ct.length){ n++; const a=el('div','palerta'); a.style.setProperty('--cs',COR_ST.at);
      a.innerHTML='<i></i><span>'+ct.length+' contrato(s) vencem em até 30 dias ('+brlx(ct.reduce((s,r)=>s+r[6],0))+'). O primeiro: '+esc(ct[0][3])+', em '+ct[0][8]+' dia(s).</span>';
      a.onclick=()=>irPara('ctr'); sAl.appendChild(a); }
    (DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0&&r[8]<=90).sort((a,b)=>a[8]-b[8]).slice(0,5).forEach(r=>{
      const a=el('div','palerta'); a.style.setProperty('--cs',r[8]<=30?COR_ST.at:COR_ST.info);
      a.innerHTML='<i></i><span>Contrato '+esc(r[0])+' · '+esc(r[3])+' · '+brlx(r[6])+' — vence em '+r[8]+' dia(s).</span>';
      a.onclick=()=>irPara('ctr'); sAl.appendChild(a); n++; });
    if(!n){ const a=el('div','nota'); a.style.color='var(--alta)'; a.textContent='Nenhum alerta neste cenário.'; sAl.appendChild(a); }
    desenhaVinculo(P);
  }
  function parar(){ if(st.tm){ clearInterval(st.tm); st.tm=null; } }
  window.__limparCmd=()=>{ st.sel.clear(); st.vinc=null; st.area=null; desenha_(); };   /* limpa todos os filtros do painel */
  /* ---------------- auditoria interna: pontos de atenção (posição: ano até o último mês fechado) ---------------- */
  function auditoria(){
    const Pb={ms:meses.filter(m=>m<=fech), M:fech, sel:[], rot:'janeiro a '+MESNOME[fech]};
    const R=calc(Pb), it=[];
    const add=(g,n,t,d,v,ir)=>it.push({g,n,t,d,v:v||'',ir:ir||''});
    const pf=DATA.prefeito||{}, rr=(DATA.rreo&&DATA.rreo.ultimo)||null, VI=DATA.vinculadas||{mes:{},bruta_mes:{},livre_mes:{},nc_mes:{}};
    const em=(eq.meses||[]).filter(m=>Pb.ms.includes(m[0])), rec=em.reduce((s,m)=>s+m[1],0), pag=em.reduce((s,m)=>s+m[3],0), emp=em.reduce((s,m)=>s+m[2],0);
    const p1=x=>f1.format(x)+'%', p2=x=>f2.format(x)+'%';
    // ---- limites legais
    {
      const g=R.gauges[0], n=g.v>=57?'v':(g.v>=54?'l':'o');
      add('Limites legais',n,'Despesa com pessoal sobre a RCL (janela de 12 meses)','Limite de 60% da LRF; alerta a partir de 54% e prudencial em 57%. Liquidado que entra no limite ÷ RCL dos mesmos 12 meses.',p1(g.v),'eq');
    }
    const lim=(nome,minimo,aprox,ofi,fonte,art)=>{
      if(ofi!==null){
        const n=ofi>=minimo?'o':(rr&&rr.bimestre>=6?'v':'l');
        add('Limites legais',n,nome+': '+p2(ofi)+' aplicado até o '+rr.bimestre+'º bimestre (mínimo '+minimo+'%)',
          'Apuração oficial do RREO, posição em '+rr.posicao+'. '+(ofi>=minimo?'Acima do mínimo.':'Abaixo do mínimo hoje; a verificação é anual (dezembro), mas a margem exige acompanhamento.')+' Aproximação do painel (jan–'+MESNOME[fech]+'): '+p1(aprox)+'. '+art,p2(ofi),'eq');
      } else {
        add('Limites legais',aprox>=minimo?'l':'l',nome+': '+p1(aprox)+' (aproximação, sem RREO)','O RREO oficial ainda não foi coletado; o painel só tem uma aproximação pelo liquidado. '+art,p1(aprox),'eq');
      }
    };
    lim('Educação (MDE)',25,R.gauges[1].v,rr?rr.mde.pct:null,'', 'CF art. 212.');
    lim('Saúde (ASPS)',15,R.gauges[2].v,rr?rr.asps.pct:null,'', 'LC 141/2012, art. 7º.');
    if(rr){
      const f=rr.fundeb70.pct;
      add('Limites legais',f>=70?'o':'l','FUNDEB: '+p2(f)+' na remuneração dos profissionais da educação básica (mínimo 70%)',
        'Apuração oficial do RREO, posição em '+rr.posicao+'. Lei 14.113/2020.',p2(f),'eq');
    }
    {
      const g=R.gauges[3], n=g.v>100?'v':(g.v>=90?'l':'o');
      add('Limites legais',n,'Repasse à Câmara dentro do teto do art. 29-A','Empenhado da Câmara contra o teto de 6% da base de 2025 ('+brlx((DATA.art29a||{}).teto_2026||0)+').',p1(g.v),'eq');
    }
    // ---- equilíbrio
    {
      const sd=rec-pag, rel=rec?sd/rec:0, n=sd>=0?'o':(rel>-0.03?'l':'v');
      add('Equilíbrio das contas',n,sd>=0?'Receita líquida cobre o que foi pago':'Pago acima da receita líquida arrecadada',
        'Receita líquida '+brlx(rec)+' · pago '+brlx(pag)+'. O pago inclui restos a pagar de anos anteriores.',(sd>=0?'+':'−')+brlx(Math.abs(sd)),'eq');
    }
    if(pf.dot_atual>0){
      const pe=emp/pf.dot_atual*100, ritmo=fech/12*100, n=pe>100?'v':(pe-ritmo>10?'l':'o');
      add('Equilíbrio das contas',n,'Empenhado sobre o orçamento atualizado',
        'Empenhado '+brlx(emp)+' de '+brlx(pf.dot_atual)+'. Já passaram '+p1(ritmo)+' do ano'+(pe-ritmo>10&&pe<=100?': o ritmo de empenho está acima do calendário.':'.'),p1(pe),'desp');
      const dl=pf.dot_atual-pf.dot_ini, rl=pf.dot_ini?dl/pf.dot_ini*100:0;
      add('Equilíbrio das contas',Math.abs(rl)>5?'l':'o','Remanejamento do orçamento em relação à LOA',
        'LOA '+brlx(pf.dot_ini)+' · atualizado '+brlx(pf.dot_atual)+'. Créditos adicionais precisam de lei/decreto e de fonte de recurso.',(dl>=0?'+':'−')+p1(Math.abs(rl)),'desp');
    }
    // ---- receitas vinculadas
    {
      const rec_={}; let tb=0, tn=0; const fg={};
      Pb.ms.forEach(m=>{ tb+=(VI.bruta_mes||{})[m]||0; tn+=(VI.nc_mes||{})[m]||0;
        Object.entries((VI.mes||{})[m]||{}).forEach(([a,v])=>{ rec_[a]=(rec_[a]||0)+v; });
        Object.entries((pf.func_mes||{})[m]||{}).forEach(([f,v])=>{ fg[f]=(fg[f]||0)+v; }); });
      const FUNC={'Educação':'EDUCAÇÃO','Saúde':'SAÚDE','Assistência social':'ASSISTÊNCIA SOCIAL'};
      const sem=Object.entries(rec_).filter(([a])=>!FUNC[a]), vs=sem.reduce((s,[,v])=>s+v,0);
      if(vs>0) add('Receitas vinculadas','l','Receita vinculada sem despesa identificada',
        sem.map(([a,v])=>a+' '+brlx(v)).join(' · ')+'. O portal não separa a despesa por fonte de recurso; não dá para confirmar a aplicação na finalidade.',brlx(vs)+' ('+p1(tb?vs/tb*100:0)+')','pre');
      Object.entries(rec_).filter(([a])=>FUNC[a]).forEach(([a,v])=>{
        const g=fg[FUNC[a]]||0;
        add('Receitas vinculadas',v>g?'v':'l',v>g?a+': receita vinculada recebida maior que toda a despesa da função':a+': aplicação da receita vinculada não confirmável',
          'Recebido '+brlx(v)+' · despesa total da função '+brlx(g)+'. O portal não informa a fonte de recurso, então não dá para saber quanto da despesa foi paga com a receita vinculada.',brlx(v),'pre');
      });
      if(rec_['Mineração (restrita)']) add('Receitas vinculadas','l','CFEM: vedado pagar quadro permanente de pessoal e dívida',
        'Lei 7.990/1989. Recebido '+brlx(rec_['Mineração (restrita)'])+'. Não é verificável com os dados do portal.',brlx(rec_['Mineração (restrita)']),'pre');
      add('Receitas vinculadas',tb&&tn/tb>0.02?'l':'o','Receita sem regra de vinculação definida',
        'Linhas de receita que ainda não têm regra e ficam fora do vinculado.',brlx(tn)+' ('+p1(tb?tn/tb*100:0)+')','rc');
    }
    // ---- contratos e pessoal
    {
      const c=(DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0), c30=c.filter(r=>r[8]<=30), v30=c30.reduce((s,r)=>s+r[6],0);
      add('Contratos e pessoal',c30.length===0?'o':(c30.length<=20?'l':'v'),'Contratos vencendo nos próximos 30 dias',
        c30.length?c30.length+' contratos, somando '+brlx(v30)+'. Renovação ou nova licitação precisa começar antes do vencimento. '+c.filter(r=>r[8]<=90).length+' vencem em até 90 dias.':'Nenhum contrato vence em 30 dias.',String(c30.length),'ctr');
      const rh=DATA.rh||[], tot=rh.length, tmp=rh.filter(r=>/TEMPOR/i.test(r[2])).length;
      if(tot){ const pt=tmp/tot*100;
        add('Contratos e pessoal',pt>40?'v':(pt>25?'l':'o'),'Peso dos contratos temporários na folha',
          f0.format(tmp)+' de '+f0.format(tot)+' servidores. Contratação temporária exige excepcional interesse público (CF art. 37, IX).',p1(pt),'pes'); }
    }
    // ---- confiança dos dados
    {
      const p12=(DATA.natureza&&DATA.natureza.pessoal12)||{faltam:[]};
      add('Confiança dos dados',(p12.faltam||[]).length?'l':'o','Janela de 12 meses da despesa com pessoal',
        (p12.faltam||[]).length?'Faltam dados de '+(p12.faltam||[]).join(', ')+'. O limite foi calculado com os meses disponíveis.':'Todos os 12 meses coletados ('+(p12.de||'')+' a '+(p12.ate||'')+').',(p12.faltam||[]).length?'incompleta':'completa','eq');
      const npm=(DATA.natureza&&DATA.natureza.por_mes)||{}; let nc=0, tt=0;
      Pb.ms.forEach(m=>(npm[m]||[]).forEach(l=>{ tt+=l[3]; if(!l[6]) nc+=l[3]; }));
      if(tt) add('Confiança dos dados',nc/tt>0.3?'l':'o','Despesa por natureza sem classificação (obrigatória x livre)',
        'Parte do empenhado ainda não tem regra de classificação.',p1(nc/tt*100),'desp');
      const hoje=new Date(), dias=d=>d?Math.floor((hoje-new Date(d+'T12:00:00'))/86400000):null;
      const dd=dias(DATA.dp_coleta);
      add('Confiança dos dados',dd===null||dd>3?'l':'o','Atualização das despesas do portal',
        'Última coleta em '+(DATA.dp_coleta?DATA.dp_coleta.split('-').reverse().join('/'):'—')+'.',dd===null?'—':(dd===0?'hoje':dd+' dia(s)'),'desp');
      if(rr){
        const prox=rr.bimestre<6?rr.bimestre+1:null, hoje2=new Date();
        if(prox){
          const fimB=new Date(rr.ano,prox*2,0), prazo=new Date(fimB.getTime()+30*86400000), atraso=Math.floor((hoje2-prazo)/86400000);
          const dmy=d=>d.toLocaleDateString('pt-BR');
          add('Confiança dos dados',atraso>0?'l':'o',atraso>0?'RREO do '+prox+'º bimestre ainda não consta no portal':'RREO em dia',
            'Último RREO publicado: '+rr.bimestre+'º bimestre/'+rr.ano+' (posição em '+rr.posicao+'). Prazo legal do '+prox+'º bimestre: '+dmy(prazo)+' (30 dias após o fim do bimestre).',
            atraso>0?atraso+' dia(s) de atraso':'no prazo','eq');
        } else add('Confiança dos dados','o','RREO em dia','Último RREO publicado: 6º bimestre/'+rr.ano+'.','em dia','eq');
      }
      else add('Confiança dos dados','l','RREO oficial não coletado','Sem o RREO, Educação, Saúde e FUNDEB aparecem só por aproximação.','—','eq');
    }
    return {it,P:Pb};
  }
  function abreAuditoria(){
    const {it,P}=auditoria();
    const hoje=new Date(), dt=hoje.toLocaleDateString('pt-BR')+' às '+hoje.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('audSub').innerHTML='Prefeitura Municipal de Nova Lima · exercício '+eq.ano+' · posição: '+P.rot+' · gerado em '+dt;
    const n={v:0,l:0,o:0}; it.forEach(x=>n[x.n]++);
    const nome={v:'Crítico',l:'Atenção',o:'Em ordem'};
    let h='<div class="audResumo">'+['v','l','o'].map(k=>'<span><i class="bol '+k+'" style="margin:0"></i>'+n[k]+' '+nome[k].toLowerCase()+(n[k]===1?'':(k==='v'?'s':''))+'</span>').join('')+'</div>';
    let g='';
    it.forEach(x=>{
      if(x.g!==g){ g=x.g; h+='<div class="audGrupo">'+esc(g)+'</div>'; }
      h+='<div class="audItem"><i class="bol '+x.n+'"></i><div><div class="tt">'+esc(x.t)+'</div><div class="dd">'+esc(x.d)+'</div></div><div class="vv">'+esc(x.v)+'</div></div>';
    });
    h+='<div class="audRodape"><b>Legenda:</b> vermelho = descumprimento ou risco imediato · laranja = ponto de atenção ou dado que o painel não consegue confirmar · verde = em ordem. '
      +'Este relatório reúne <b>pontos de atenção gerenciais</b> calculados a partir dos dados públicos do Portal da Transparência. '
      +'Não substitui a auditoria do controle interno, o parecer do Tribunal de Contas nem o RREO/RGF oficiais.</div>';
    document.getElementById('audCorpo').innerHTML=h;
    const m=document.getElementById('audModal'); m.classList.add('on'); m.setAttribute('aria-hidden','false');
  }
  window.__abrirAuditoria=abreAuditoria;
  /* vínculo dos servidores (mesmo recorte da aba Pessoal, última folha coletada) e, logo abaixo, a despesa com
     pessoal mês a mês pela regra da LRF: despesa liquidada que entra no limite, janela dos 12 meses que
     terminam no último mês escolhido. Clicar num vínculo mostra o recorte da folha daquele vínculo. */
  function desenhaVinculo(P){
    const rh=DATA.rh||[], mv=new Map();
    rh.forEach(r=>{ const o=mv.get(r[2])||{n:0,venc:0,bruto:0}; o.n++; o.venc+=r[5]||0; o.bruto+=r[6]||0; mv.set(r[2],o); });
    const tv=[...mv].sort((x,y)=>y[1].n-x[1].n), mx=tv.length?tv[0][1].n:1, tot=rh.length;
    const totBruto=tv.reduce((s,[,o])=>s+o.bruto,0), totVenc=tv.reduce((s,[,o])=>s+o.venc,0);
    const ref=(DATA.rh_ref||'').replace('referência','').trim();
    sVin.querySelector('.rot').innerHTML='Vínculo · servidores'+(ref?' · <b style="color:var(--t1)">Folha de '+esc(ref)+'</b>':'');
    let h='';
    if(!tot) h+='<div class="vazio">Sem folha coletada ainda.</div>';
    tv.forEach(([k,o],i)=>{
      const sel=st.vinc===k, esm=st.vinc&&!sel;
      h+='<div class="rv'+(sel?' sel':'')+(esm?' esm':'')+'" data-i="'+i+'"><span class="n">'+esc(k)+'</span><span class="b"><i style="width:'+(o.n/mx*100).toFixed(1)+'%"></i></span>'
        +'<span class="p">'+f1.format(o.n/tot*100)+'%</span><span class="q">'+f0.format(o.n)+'</span></div>';
    });
    /* despesa com pessoal: janela de 12 meses terminando no último mês do período */
    const nomes=[];
    {
      let y=eq.ano, m=P.M; const lista=[];
      for(let i=0;i<12;i++){ lista.push({y,m}); m--; if(!m){ m=12; y--; } }
      lista.reverse();
      let soma12=0, rcl12=0, falt=0, somaSel=0, nSel=0;
      let cel='';
      lista.forEach(({y,m})=>{
        const k=y+'-'+String(m).padStart(2,'0'), v=ser.pes[k], r=ser.rcl[k];
        const dentro=(y===eq.ano)&&P.sel.includes(m);
        if(v===undefined||r===undefined){ falt++; }
        else { soma12+=v; rcl12+=r; if(dentro){ somaSel+=v; nSel++; } }
        cel+='<div class="pj'+(dentro?' on':'')+'"><span>'+MESES[m-1]+'/'+String(y).slice(2)+'</span><b>'+(v===undefined?'—':exato(v))+'</b></div>';
      });
      const pc=rcl12?soma12/rcl12*100:0;
      const cor=pc>=57?'var(--baixa)':(pc>=54?'var(--parcial)':'var(--alta)');
      h+='<div class="pjt">Despesa com pessoal · mês a mês <span>(liquidado que entra no limite da LRF)</span></div>'
        +'<div class="pjg">'+cel+'</div>'
        +'<div class="pjs"><div><small>Total dos 12 meses</small><b>'+exato(soma12)+'</b></div>'
        +'<div><small>% da RCL ('+brlx(rcl12)+')</small><b style="color:'+cor+'">'+f1.format(pc)+'%</b></div>'
        +(nSel?'<div><small>Meses marcados ('+nSel+')</small><b>'+exato(somaSel)+'</b></div>':'')+'</div>'
        +'<div class="nota" style="padding-top:6px">Limite 60% da RCL (alerta a partir de 54%). '
        +(falt?'<b>Janela incompleta: faltam '+falt+' mês(es) de dados.</b> ':'')
        +'Inclui inativos, pensionistas, contratação temporária e terceirização que substitui servidores; fora: indenização por demissão, sentenças e exercícios anteriores.</div>';
    }
    /* recorte do vínculo escolhido (a folha mensal por vínculo só existe para o último mês publicado) */
    if(st.vinc&&mv.get(st.vinc)){
      const o=mv.get(st.vinc);
      h+='<div class="vdet" style="margin-top:10px"><b>'+esc(st.vinc)+'</b> na folha de '+esc(ref)+': '+f0.format(o.n)+' servidores ('+f1.format(tot?o.n/tot*100:0)+'%) · '
        +'bruto <b>'+exato(o.bruto)+'</b> ('+f1.format(totBruto?o.bruto/totBruto*100:0)+'% da folha) · vencimentos '+exato(o.venc)
        +' · média '+exato(o.n?o.venc/o.n:0)+'.<br><span style="color:var(--t3)">O portal só publica a folha por vínculo do último mês; a tabela mensal acima considera todos os vínculos.</span></div>';
    }
    hostVin.innerHTML=h;
    hostVin.querySelectorAll('.rv').forEach(x=>{
      const [k,o]=tv[+x.dataset.i];
      x.onclick=()=>{ st.vinc=(st.vinc===k?null:k); desenha_(); };
      dica(x, k, '<em>'+exato(o.bruto)+'</em><br>gasto bruto da folha · '+f1.format(totBruto?o.bruto/totBruto*100:0)+'% do total'
        +'<br>'+f0.format(o.n)+' servidores · vencimentos '+exato(o.venc)+'<br>média por servidor: '+exato(o.n?o.venc/o.n:0));
    });
  }
  desenha_();
  return function(){};
}

/* ---------------- montagem ---------------- */
const desenha={ rc:montaReceita('rc'), cap:montaReceita('cap'),
                ded:montaReceita('ded'), ctr:montaContratos(), pes:montaPessoal(),
                desp:montaDespesas(), eq:montaEquilibrio(), cmd:montaComando() };
function render(){
  document.querySelectorAll('#abas b[data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===pagina));
  document.querySelectorAll('.pg').forEach(p=>p.classList.toggle('on',p.id==='pg-'+pagina));
  document.getElementById('btnLimpar').style.display=(pagina==='cmd')?'flex':'none';   /* só no Painel de Comando */
  desenha[pagina]();
}
document.querySelectorAll('#abas b[data-p]').forEach(b=>b.onclick=()=>{
  pagina=b.dataset.p; render(); scrollTo({top:0,behavior:'smooth'}); });
document.getElementById('btnAtualizar').onclick=()=>location.reload();
document.getElementById('btnLimpar').onclick=()=>{ if(window.__limparCmd) window.__limparCmd(); };
(function(){
  const m=document.getElementById('audModal');
  const fecha=()=>{ m.classList.remove('on'); m.setAttribute('aria-hidden','true'); };
  document.getElementById('btnAuditoria').onclick=()=>{ if(window.__abrirAuditoria) window.__abrirAuditoria(); };
  document.getElementById('audFechar').onclick=fecha;
  document.getElementById('audPdf').onclick=()=>window.print();
  m.addEventListener('click',e=>{ if(e.target===m) fecha(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') fecha(); });
})();
let t=null;
addEventListener('resize',()=>{ clearTimeout(t); t=setTimeout(render,120); });
render();
</script>
'''

out = HTML.replace('__DATA__', json.dumps(DATA, ensure_ascii=False, separators=(',', ':')))
out = out.replace('__ANO_EQ__', str(EQUILIBRIO['ano']))

dest = os.path.abspath(os.path.join(BASE, '..', 'Painel_Receita_Despesas.html'))
with open(dest, 'w', encoding='utf-8') as f:
    f.write(out)
print('painel gerado:', dest, '(%.1f KB)' % (len(out) / 1024))
