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
LEI = {'ano': None, 'meses': {}}
try:
    _df = json.load(open(os.path.join(BASE, 'dados_funcao.json'), encoding='utf-8'))
    _ano_f = max(_df.get('anos', {}), default=None)
    if _ano_f:
        LEI['ano'] = int(_ano_f)
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
    PREFEITO['funcoes'] = [[k, round(v, 2)] for k, v in sorted(_fx.items(), key=lambda kv: -kv[1]) if v > 0][:9]
except Exception as _e:
    print('gasto por função não carregado:', _e)

# Receitas com destino obrigatório (só as classificadas em 100% por lei, pela
# coluna Destinação da aba de receita), somadas nos meses coletados do ano.
VINCULADAS = {'ano': int(ANO_EQUILIBRIO), 'bruta': 0.0, 'areas': {}}
try:
    for _chave in ('rc', 'cap'):
        for _m, _regs in MENSAL.get(_chave, {}).get(ANO_EQUILIBRIO, {}).items():
            for _c, _x in _regs.items():
                VINCULADAS['bruta'] += _x
                _tp, _lei = classifica(_c, D['tipos'].get(_c, ''), D['nomes'].get(_c, ''))
                if _tp != 100:
                    continue
                _ar = area_vinc(_c, D['tipos'].get(_c, ''), D['nomes'].get(_c, '')) or 'Outras'
                _a = VINCULADAS['areas'].setdefault(_ar, {'recebido': 0.0, 'leis': []})
                _a['recebido'] += _x
                if _lei and _lei not in _a['leis']:
                    _a['leis'].append(_lei)
    VINCULADAS['bruta'] = round(VINCULADAS['bruta'], 2)
    for _a in VINCULADAS['areas'].values():
        _a['recebido'] = round(_a['recebido'], 2)
    PREFEITO['func_all'] = {k: round(v, 2) for k, v in _fx.items() if v > 0}
except Exception as _e:
    print('receitas vinculadas não calculadas:', _e)

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
         display:flex; align-items:center; gap:34px; height:60px; flex-wrap:wrap; }
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
  #btnAtualizar{ margin-left:auto; display:flex; align-items:center; gap:6px;
                 font-size:12.5px; font-weight:600; color:var(--t2); cursor:pointer;
                 padding:7px 14px; border:1px solid var(--linha); border-radius:100px;
                 background:var(--bg); white-space:nowrap; }
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
  .palerta{ display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--linha);
            font-size:13.5px; line-height:1.5; color:var(--t1); cursor:pointer; }
  .palerta:last-child{ border-bottom:0; }
  .palerta:hover{ color:var(--acento); }
  .palerta i{ flex:none; width:10px; height:10px; border-radius:50%; background:var(--cs); margin-top:6px; }
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
    <b data-p="pre" class="on">Visão do Prefeito</b>
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
  <div id="btnAtualizar">↻ Atualizar</div>
</div></header>

<div class="env">
  <div class="pg on" id="pg-pre"></div>
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

let pagina='pre';
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
function barraObrigatorias(host){
  const npm=(DATA.natureza&&DATA.natureza.por_mes)||{};
  const acc={};
  Object.values(npm).forEach(ls=>ls.forEach(l=>{
    const k=l[6]==='Obrigatória'?l[7]:(l[6]?'Discricionárias':'A classificar');
    acc[k]=(acc[k]||0)+l[3];
  }));
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
  nt.textContent='Pelo empenhado do ano, classificado pelo nome da natureza (tabela completa em Despesas → Órgãos). '
    +'Obrigatória = pessoal, dívida, sentenças, exercícios anteriores e consórcios; "a classificar" = nenhuma regra cobre a linha.';
  host.appendChild(nt);
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


/* ---------------- Visão do Prefeito ---------------- */
const COR_ST={ ok:'var(--alta)', at:'var(--parcial)', ruim:'var(--baixa)', info:'var(--acento)' };
const TAG_LEI={ ok:'DENTRO DO LIMITE', at:'ATENÇÃO', ruim:'FORA DO LIMITE' };
const TAG_ST={ ok:'OK', at:'ATENÇÃO', ruim:'ALERTA', info:'INFORMATIVO' };
function irPara(p){ pagina=p; render(); scrollTo({top:0,behavior:'smooth'}); }

/* mesmas fórmulas da tabela "Limites legais" (aproximação pelo empenhado) */
function calcLegais(){
  const lm=(DATA.lei&&DATA.lei.meses)||{}, npm=(DATA.natureza&&DATA.natureza.por_mes)||{}, a29=DATA.art29a||{};
  const ms=Object.keys(lm);
  if(!ms.length) return null;
  const S=k=>ms.reduce((s,m)=>s+(lm[m][k]||0),0);
  const rit=S('rit'), rcl=S('rcl');
  const p12=(DATA.natureza&&DATA.natureza.pessoal12)||{pessoal:0,rcl:0};
  const pessoal=p12.pessoal;
  const edu=S('edu')-S('edu_fed'), saude=S('saude')-S('saude_fed');
  return { rit, rcl, pessoal, edu, saude, a29,
    pEdu:rit?edu/rit*100:0, pSaude:rit?saude/rit*100:0, pPes:p12.rcl?pessoal/p12.rcl*100:0,
    pCam:a29.teto_2026?(a29.emp_camara_2026||0)/a29.teto_2026*100:0,
    ate:MESNOME[ms.sort((a,b)=>+a-+b)[ms.length-1]] };
}

function montaPrefeito(){
  const host=document.getElementById('pg-pre');
  host.innerHTML='';
  const eq=DATA.equilibrio||{ano:null,meses:[]};
  const L=calcLegais(), pf=DATA.prefeito||{};
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>Visão do Prefeito</h1><p>Como está a gestão em '+(eq.ano||'')
    +' · indicadores gerenciais calculados pelo empenhado, não substituem o RREO/RGF · clique num cartão para ver o detalhe</p></div>';
  topopag.appendChild(cab);
  if(!L||!(eq.meses||[]).length){
    const d=el('div','vazio'); d.textContent='Sem dados suficientes ainda pra montar o painel.'; host.appendChild(d);
    return function(){};
  }

  const totRec=eq.meses.reduce((s,m)=>s+m[1],0), totEmp=eq.meses.reduce((s,m)=>s+m[2],0),
        totPag=eq.meses.reduce((s,m)=>s+m[3],0);
  const saldo=totRec-totPag;
  const cards=[];   // {id, tit, st, valor, sub, leg, barra:{pct,lim}, ir, alerta}

  // 1) contas no azul
  {
    const rel=totRec?saldo/totRec:0;
    const st=saldo>=0?'ok':(rel>-0.03?'at':'ruim');
    cards.push({tit:'Contas no azul?', st, valor:(saldo>=0?'+':'−')+brlx(Math.abs(saldo)),
      sub:saldo>=0?'A receita cobriu tudo o que foi pago.':'Foi pago mais do que o município arrecadou.',
      leg:'Recebido '+brlx(totRec)+' · pago '+brlx(totPag)+' (o pago inclui restos a pagar de anos anteriores)', ir:'eq',
      alerta:'Foram pagos '+brlx(Math.abs(saldo))+' a mais do que a receita líquida arrecadada no ano.'});
  }
  // 2) folha de pagamento (limite 60%, alerta 54%, prudencial 57%)
  {
    const st=L.pPes>=57?'ruim':(L.pPes>=54?'at':'ok');
    cards.push({tit:'Folha de pagamento', st, valor:f1.format(L.pPes)+'%',
      sub:'da receita corrente líquida vai para pessoal e encargos (últimos 12 meses).',
      leg:'Limite da LRF: 60% · alerta a partir de 54% · prudencial em 57% · janela móvel de 12 meses', barra:{pct:L.pPes,lim:60}, ir:'eq', legal:true,
      alerta:'A folha está em '+f1.format(L.pPes)+'% da receita; o limite legal é 60% e o alerta começa em 54%.'});
  }
  // 3) educação / 4) saúde (mínimos)
  [['Educação',L.pEdu,25,L.edu,'CF art. 212'],['Saúde',L.pSaude,15,L.saude,'LC 141/2012']].forEach(([n,pct,min,apl,lei])=>{
    const st=pct>=min?'ok':(pct>=min-2?'at':'ruim');
    cards.push({tit:n, st, valor:f1.format(pct)+'%',
      sub:pct>=min?'da receita de impostos aplicados — acima do mínimo.':'da receita de impostos aplicados — abaixo do mínimo.',
      leg:'Mínimo obrigatório: '+min+'% ('+lei+')', barra:{pct,lim:min,min:true}, ir:'eq', legal:true,
      alerta:n+' está em '+f1.format(pct)+'%, abaixo do mínimo de '+min+'% (faltam cerca de '+brlx(Math.max(0,L.rit*min/100-apl))+').'});
  });
  // 5) câmara
  {
    const st=L.pCam>100?'ruim':(L.pCam>=90?'at':'ok'), a=L.a29;
    cards.push({tit:'Repasse à Câmara', st, valor:f1.format(L.pCam)+'%',
      sub:'do teto constitucional já foi empenhado.',
      leg:'Empenhado '+brlx(a.emp_camara_2026||0)+' · teto de 6% (CF art. 29-A): '+brlx(a.teto_2026||0), barra:{pct:L.pCam,lim:100}, ir:'eq', legal:true,
      alerta:'O repasse à Câmara já usou '+f1.format(L.pCam)+'% do teto de 6% (art. 29-A).'});
  }
  // 6) arrecadação x ano anterior
  if(pf.comp&&pf.comp.anterior>0){
    const v=(pf.comp.atual/pf.comp.anterior-1)*100, st=v>=0?'ok':(v>-5?'at':'ruim');
    cards.push({tit:'Arrecadação', st, valor:(v>=0?'+':'−')+f1.format(Math.abs(v))+'%',
      sub:v>=0?'a mais que no mesmo período do ano passado.':'a menos que no mesmo período do ano passado.',
      leg:'Janeiro a '+MESNOME[String(pf.comp.ate)]+' (meses fechados): '+brlx(pf.comp.atual)+' em '+pf.comp.ano+' contra '+brlx(pf.comp.anterior)+' em '+(pf.comp.ano-1), ir:'rc',
      alerta:'A arrecadação caiu '+f1.format(Math.abs(v))+'% frente ao mesmo período de '+(pf.comp.ano-1)+'.'});
  }
  // 7) orçamento executado
  if(pf.dot_atual>0){
    const pe=totEmp/pf.dot_atual*100, anoPct=(eq.meses.filter(m=>m[2]||m[3]).length/12)*100;
    const st=pe>100?'ruim':'info';
    cards.push({tit:'Orçamento executado', st, valor:f1.format(pe)+'%',
      sub:'do orçamento atualizado já foi empenhado.',
      leg:'Empenhado '+brlx(totEmp)+' de '+brlx(pf.dot_atual)+' previstos · pago '+brlx(totPag)+' ('+f1.format(totPag/pf.dot_atual*100)+'%) · já passaram ~'+f1.format(anoPct)+'% do ano',
      barra:{pct:pe,lim:100}, ir:'desp',
      alerta:'O empenhado já passou da dotação atualizada.'});
  }
  // 8) contratos a vencer
  {
    const c=(DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0);
    const c30=c.filter(r=>r[8]<=30), c90=c.filter(r=>r[8]<=90);
    const st=c30.length===0?'ok':(c30.length<=20?'at':'ruim');
    const v30=c30.reduce((s,r)=>s+r[6],0);
    cards.push({tit:'Contratos vencendo', st, valor:String(c30.length),
      sub:c30.length?'contrato(s) vencem nos próximos 30 dias ('+brlx(v30)+').':'Nenhum contrato vence nos próximos 30 dias.',
      leg:c90.length+' vencem em até 90 dias · '+c.length+' contratos vigentes', ir:'ctr',
      alerta:c30.length+' contrato(s) vencem em até 30 dias, somando '+brlx(v30)+'.'});
  }

  // 9) receitas com destino obrigatório (recebido x gasto na função correspondente)
  const VI=DATA.vinculadas||{areas:{}}, FA=pf.func_all||{};
  const FUNC_DE={'Educação':'EDUCAÇÃO','Saúde':'SAÚDE','Assistência social':'ASSISTÊNCIA SOCIAL'};
  const REGRA_DE={
    'Mineração (restrita)':'Lei 7.990/1989: não pode pagar folha do quadro permanente nem dívida',
    'Serviço da taxa':'só pode custear o serviço que a taxa remunera',
    'Iluminação pública':'só pode custear a iluminação pública (CF art. 149-A)',
    'Trânsito':'sinalização, engenharia, fiscalização e educação de trânsito (CTB art. 320)',
    'Obra pública':'só pode custear a obra que gerou a contribuição de melhoria',
    'Objeto do convênio':'só pode ser gasto no objeto do convênio',
    'Assistência social':'só pode custear a assistência social (Lei 8.742/1993)'};
  const linhasVi=Object.entries(VI.areas||{}).map(([a,v])=>{
    const f=FUNC_DE[a], gasto=f?(FA[f]||0):null;
    return {area:a, leis:v.leis.join(' · '), recebido:v.recebido, gasto, regra:REGRA_DE[a]||''};
  }).sort((x,y)=>y.recebido-x.recebido);
  const totVi=linhasVi.reduce((s,l)=>s+l.recebido,0);
  const falta=linhasVi.filter(l=>l.gasto!==null&&l.recebido>l.gasto);
  if(totVi>0){
    cards.push({tit:'Receita com destino obrigatório', st:falta.length?'at':'info', valor:f1.format(VI.bruta?totVi/VI.bruta*100:0)+'%',
      sub:'da receita bruta do ano só pode ser gasta na finalidade da lei ('+brlx(totVi)+').',
      leg:linhasVi.slice(0,3).map(l=>l.area+' '+brlx(l.recebido)).join(' · '), ir:'rc',
      alerta:'Em '+falta.map(l=>l.area).join(', ')+' foi recebido mais com destino obrigatório do que gasto na função.'});
  }

  // frase de situação
  const ruins=cards.filter(c=>c.st==='ruim'), ats=cards.filter(c=>c.st==='at');
  const pior=ruins.length?'ruim':(ats.length?'at':'ok');
  const fr=el('div','pfrase'); fr.style.setProperty('--cs',COR_ST[pior]);
  const nomes=l=>l.map(c=>c.tit.toLowerCase()).join(', ');
  fr.innerHTML=(pior==='ruim'?'<b>Atenção:</b> '+ruins.length+' indicador(es) em alerta — '+nomes(ruins)+'.'
      +(ats.length?' Em observação: '+nomes(ats)+'.':'')
    :pior==='at'?'<b>Ponto de atenção:</b> '+nomes(ats)+'. Os demais indicadores estão dentro dos limites.'
    :'<b>Tudo dentro dos limites</b> até '+L.ate+'.')
    +' Receita líquida de '+brlx(totRec)+', pago '+brlx(totPag)+'.';
  host.appendChild(fr);

  // cartões
  const grade=el('div','pgrid'); host.appendChild(grade);
  cards.forEach(c=>{
    const d=el('div','pcard'); d.style.setProperty('--cs',COR_ST[c.st]);
    let barra='';
    if(c.barra){
      const esc_=Math.max(c.barra.pct,c.barra.lim)*1.2||1;
      barra='<div class="pm"><i style="width:'+Math.min(100,c.barra.pct/esc_*100).toFixed(1)+'%"></i>'
        +'<u style="left:'+(c.barra.lim/esc_*100).toFixed(1)+'%" title="limite legal"></u></div>';
    }
    d.innerHTML='<div class="pt"><span>'+esc(c.tit)+'</span><span class="tag">'+((c.legal&&TAG_LEI[c.st])||TAG_ST[c.st])+'</span></div>'
      +'<div class="pb">'+esc(c.valor)+'</div><div class="ps">'+esc(c.sub)+'</div>'+barra
      +'<div class="pl">'+esc(c.leg)+'</div>';
    d.onclick=()=>irPara(c.ir);
    grade.appendChild(d);
  });

  // o que merece atenção
  const sAt=bloco(host,'O que merece atenção');
  const lista=cards.filter(c=>c.st==='ruim'||c.st==='at');
  if(!lista.length){ const d=el('div','nota'); d.style.color='var(--alta)'; d.textContent='Nenhum alerta no momento.'; sAt.appendChild(d); }
  lista.sort((a,b)=>(b.st==='ruim')-(a.st==='ruim')).forEach(c=>{
    const d=el('div','palerta'); d.style.setProperty('--cs',COR_ST[c.st]);
    d.innerHTML='<i></i><span>'+esc(c.alerta)+'</span>'; d.onclick=()=>irPara(c.ir); sAt.appendChild(d);
  });
  const prox=(DATA.contratos||[]).filter(r=>r[7]==='vigente'&&r[8]>=0&&r[8]<=90).sort((a,b)=>a[8]-b[8]).slice(0,5);
  prox.forEach(r=>{
    const d=el('div','palerta'); d.style.setProperty('--cs',r[8]<=30?COR_ST.at:COR_ST.info);
    d.innerHTML='<i></i><span>Contrato '+esc(r[0])+' · '+esc(r[3])+' · '+brlx(r[6])+' — vence em '+r[8]+' dia(s).</span>';
    d.onclick=()=>irPara('ctr'); sAt.appendChild(d);
  });

  // receitas com destino obrigatório
  if(linhasVi.length){
    const sVi=bloco(host,'Receitas com destino obrigatório · o que entrou e onde precisa ser gasto');
    const rl=el('div','rolatab'); sVi.appendChild(rl);
    const t=el('table');
    t.innerHTML='<thead><tr><th class="e" style="width:18%">Área</th><th class="e">Base legal</th>'
      +'<th>Recebido no ano (R$)</th><th>Gasto na função (R$)</th><th class="e" style="width:30%">Situação</th></tr></thead>';
    const tb=el('tbody');
    linhasVi.forEach(l=>{
      const tr=el('tr');
      let sit;
      if(l.gasto===null) sit='<span style="color:var(--t3)">'+esc(l.regra||'o portal não separa o gasto por fonte, não dá para comparar')+'</span>';
      else if(l.recebido>l.gasto) sit='<span style="color:var(--parcial);font-weight:600">Recebeu mais do que gastou na função — conferir</span>';
      else sit='<span style="color:var(--alta);font-weight:600">Gasto na função cobre o que foi recebido</span>';
      tr.innerHTML='<td class="e" style="font-weight:600">'+esc(l.area)+'</td>'
        +'<td class="e" style="color:var(--t3)">'+esc(l.leis)+'</td>'
        +'<td>'+exato(l.recebido)+'</td><td>'+(l.gasto===null?'—':exato(l.gasto))+'</td><td class="e">'+sit+'</td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb); rl.appendChild(t);
    const nt=el('div','nota');
    nt.textContent='Soma das receitas classificadas como vinculadas por lei (aba Receita, coluna Destinação) nos meses coletados. '
      +'O gasto é o empenhado da função de governo correspondente; o portal não separa a despesa por fonte de recurso, '
      +'então a comparação é aproximada. A sobra de receita vinculada de anos anteriores (superávit financeiro por fonte), '
      +'que também só pode ser usada na mesma finalidade, não aparece nos dados do portal.';
    sVi.appendChild(nt);
  }

  // para onde vai o dinheiro
  const sOnde=bloco(host,'Para onde vai o dinheiro · empenhado no ano, por área');
  const fun=pf.funcoes||[];
  if(fun.length){
    const tot=fun.reduce((s,f)=>s+f[1],0), mx=fun[0][1];
    fun.forEach(([n,v])=>{
      const l=linha(n.charAt(0)+n.slice(1).toLowerCase(), exato(v), v/mx, f1.format(v/totEmp*100)+'%', {click:()=>irPara('desp')});
      sOnde.appendChild(l);
    });
  }
  const sObr=bloco(host,'O que a lei obriga x o que o prefeito decide');
  const hostObr=el('div'); sObr.appendChild(hostObr); barraObrigatorias(hostObr);
  return function(){};
}

/* ---------------- montagem ---------------- */
const desenha={ rc:montaReceita('rc'), cap:montaReceita('cap'),
                ded:montaReceita('ded'), ctr:montaContratos(), pes:montaPessoal(),
                desp:montaDespesas(), eq:montaEquilibrio(), pre:montaPrefeito() };
function render(){
  document.querySelectorAll('#abas b[data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===pagina));
  document.querySelectorAll('.pg').forEach(p=>p.classList.toggle('on',p.id==='pg-'+pagina));
  desenha[pagina]();
}
document.querySelectorAll('#abas b[data-p]').forEach(b=>b.onclick=()=>{
  pagina=b.dataset.p; render(); scrollTo({top:0,behavior:'smooth'}); });
document.getElementById('btnAtualizar').onclick=()=>location.reload();
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
