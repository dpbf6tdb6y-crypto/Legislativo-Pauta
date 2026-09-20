# -*- coding: utf-8 -*-
"""Dashboard de Receita — layout claro, leve e responsivo (substitui a lâmina 1280x720)."""
import json, math, os, re
import pandas as pd

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
                out.append([int(ano), D['tipos'].get(cod, ''), nome(cod), v['ate_per']])
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
META = {cod: [nome(cod), D['tipos'].get(cod, '')] for cod in D['nomes']}

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
_rh = sorted(glob.glob(os.path.join(BASE, '..', '..', 'RH', '*.xls'))) \
      or sorted(glob.glob(os.path.join(BASE, 'RH_*.xls')))
if not _rh:
    raise SystemExit('Nao encontrei a planilha de RH em ../../RH/*.xls')
print('folha de pessoal:', os.path.basename(_rh[-1]))
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

rh = le_folha(_rh[-1])
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
    DP_COLETA = _dp.get('coletado_em', '')
except Exception:
    DESPESAS, DP_COLETA = {'ano': None, 'meses': []}, ''
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
    'despesas': DESPESAS,
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
  .cab p{ color:var(--t3); font-size:12.5px; margin-top:6px; }
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
  .lin{ display:grid; grid-template-columns:minmax(140px,1fr) minmax(100px,1.3fr) 158px 58px;
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
  @media (max-width:620px){
    .lin{ grid-template-columns:1fr 140px; gap:8px; }
    .lin .b, .lin .p{ display:none; }
  }
  .cabl{ display:grid; grid-template-columns:minmax(140px,1fr) minmax(100px,1.3fr) 158px 58px;
         gap:14px; padding-bottom:9px; border-bottom:1px solid var(--linha); }
  .cabl span{ font-size:10.5px; letter-spacing:.07em; text-transform:uppercase;
              color:var(--t3); }
  .cabl span:nth-child(3),.cabl span:nth-child(4){ text-align:right; }
  @media (max-width:620px){ .cabl{ grid-template-columns:1fr 140px; }
                            .cabl span:nth-child(2),.cabl span:nth-child(4){ display:none; } }

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
    <b class="grupoLabel">Receita</b>
    <b data-p="rc" class="on">Receita Corrente</b>
    <b data-p="cap">Receita de Capital</b>
    <b data-p="ded">Deduções</b>
    <span class="espaco"></span>
    <b class="grupoLabel">Despesas</b>
    <b data-p="pes">Pessoal</b>
    <b data-p="desp">Órgãos</b>
    <b data-p="ctr">Contratos</b>
    <span class="espaco"></span>
    <b data-p="eq">__ANO_EQ__ · Receita x Despesas</b>
  </nav>
  <div id="btnAtualizar">↻ Atualizar</div>
</div></header>

<div class="env">
  <div class="pg on" id="pg-rc"></div>
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
        tipos:true,  rot:'Fontes de receita'},
  cap: {t:'Receita de Capital', sub:'Operações de crédito, alienação de bens e transferências de capital',
        tipos:false, rot:'Itens'},
  ded: {t:'Deduções da Receita', sub:'FUNDEB, restituições e deduções sobre a arrecadação',
        tipos:false, rot:'Itens'},
};

let pagina='rc';
const estado={ rc:{anos:new Set(),tipo:null,mes:null}, cap:{anos:new Set(),tipo:null,mes:null},
               ded:{anos:new Set(),tipo:null,mes:null}, pes:{busca:'',corte:null},
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
function kpiHtml(rot, valor, legenda, exatoNum, corValor){
  return '<div class="rot">'+rot+'</div>'
    + '<div class="v"'+(corValor?' style="color:'+corValor+'"':'')+'>'+valor+'</div>'
    + (exatoNum!==undefined && exatoNum!==null ? '<div class="x">'+exato(exatoNum)+'</div>' : '')
    + '<div class="s">'+(legenda||'')+'</div>';
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
    +'<span class="v">'+valor+'</span><span class="p">'+(pct||'')+'</span>';
  if(opt.click) d.onclick=opt.click;
  return d;
}
function cabecaLista(a,b,c,d){
  const h=el('div','cabl');
  h.innerHTML='<span>'+a+'</span><span>'+(b||'')+'</span><span>'+c+'</span><span>'+(d||'')+'</span>';
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
  caixaDet.appendChild(cabecaLista('Descrição','', 'Valor (R$)','%'));
  caixaDet.appendChild(listaDet);

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
          out.push([+a, mt[1], mt[0], m[cod]]);
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
    btnLimpar.onclick=()=>{ st.anos.clear(); st.mes=null; st.tipo=null; render(); };
    filtros.appendChild(btnLimpar);
    const res=el('div','resumo'); filtros.appendChild(res);

    /* --- dados --- */
    const linhas=filtrado(), total=linhas.reduce((s,r)=>s+r[3],0);
    const nAnos=st.anos.size||ANOS.length;
    const det=agrupa(linhas,2).sort((a,b)=>b.v-a.v);
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
    if(!det.length){ const v=el('div','vazio'); v.textContent='Sem dados para o filtro.';
                     listaDet.appendChild(v); return; }
    const mx=det[0].v;
    det.forEach(d=>{
      const l=linha(d.k, exato(d.v), d.v/mx, f1.format(d.v/total*100)+'%');
      dica(l, d.k, '<em>'+exato(d.v)+'</em><br>'+f2.format(d.v/total*100)+'% do total');
      listaDet.appendChild(l);
    });
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
    [['Servidores', f0.format(b.length),
       st.corte? 'vínculo '+esc(st.corte) : (DATA.rh_ref||'').replace('referência','folha de'), null],
     ['Vencimentos', brlx(folha), 'base da folha', folha],
     ['Bruto', brlx(bruto), 'com vantagens e adicionais', bruto],
     ['Vencimento médio', brlx(b.length?folha/b.length:0), 'por servidor', b.length?folha/b.length:null]
    ].forEach(([r,v,s,x])=>{
      const d=el('div','kpi');
      d.innerHTML=kpiHtml(r,v,s,x);
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
    usar.forEach(m=>{
      (orgaosPorMes[m]||[]).forEach(([nome,ini,atual,emp,liq,pag])=>{
        const cur = mapa.get(nome) || [0,0,0];
        cur[0]+=emp; cur[1]+=liq; cur[2]+=pag;
        mapa.set(nome, cur);
      });
    });
    return [...mapa.entries()].map(([nome,v])=>[nome,...v]);
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
      +'<th>Empenhado (R$)</th><th>Liquidação (R$)</th><th>Pagamento (R$)</th></tr></thead>';
    const tb=el('tbody');
    linhas.slice().sort((a,b)=>b[3]-a[3]).forEach(([nome,emp,liq,pag])=>{
      const tr=el('tr');
      tr.innerHTML='<td class="e">'+esc(nome.replace(/^SECRETARIA MUNICIPAL D[AEO]S? /,''))+'</td>'
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

  const serie=meses.map(m=>({k:MESES[m[0]-1], v:m[3], mes:String(m[0])}));
  function onClickMes(m){
    st.meses.has(m) ? st.meses.delete(m) : st.meses.add(m);
    colunasMes(mesG, serie, st.meses, onClickMes, true);
    montaOrg();
  }
  function limparMeses(){
    st.meses.clear();
    colunasMes(mesG, serie, st.meses, onClickMes, true);
    montaOrg();
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
    montaOrg();

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

/* ---------------- página de equilíbrio (Receita x Despesas) ---------------- */
function montaEquilibrio(){
  const host=document.getElementById('pg-eq');
  host.innerHTML='';
  const eq=DATA.equilibrio||{ano:null,meses:[]};
  const meses=eq.meses||[];
  const topopag=el('div','topopag'); host.appendChild(topopag);
  const cab=el('div','cab');
  cab.innerHTML='<div><h1>'+(eq.ano||'')+' · Receita x Despesas</h1>'
    +'<p>Receita Orçamentária Líquida Total (Receita Corrente + Receita de Capital − Deduções)</p></div>';
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

  const sInd=el('div','secao'); const dInd=el('div','duplo');
  dInd.style.gridTemplateColumns='1fr 1fr 1fr';
  sInd.appendChild(dInd); host.appendChild(sInd);
  const cPes=el('div'), cOrc=el('div'), cCaixa=el('div');
  cPes.innerHTML='<div class="rot" style="margin-bottom:16px">% Gasto com Pessoal</div>';
  cOrc.innerHTML='<div class="rot" style="margin-bottom:16px">Teto da Câmara · Visão Orçamentária</div>';
  cCaixa.innerHTML='<div class="rot" style="margin-bottom:16px">Teto da Câmara · Visão de Caixa</div>';
  dInd.appendChild(cPes); dInd.appendChild(cOrc); dInd.appendChild(cCaixa);
  const medPes=el('div'), medOrc=el('div'), medCaixa=el('div');
  cPes.appendChild(medPes); cOrc.appendChild(medOrc); cCaixa.appendChild(medCaixa);

  const totReceita=meses.reduce((s,m)=>s+m[1],0), totEmp=meses.reduce((s,m)=>s+m[2],0),
        totPag=meses.reduce((s,m)=>s+m[3],0);
  const saldo=totReceita-totPag;

  // Folha do mês de referência (aba Pessoal), anualizada (×12) pra comparar
  // com a Receita do ano inteiro — aproximação gerencial da Despesa Total
  // com Pessoal da LRF (o ideal seria empenhado com encargos patronais em
  // janela móvel de 12 meses, que não temos coletado).
  const folhaBruta=(DATA.rh||[]).reduce((s,r)=>s+r[6],0);
  const folhaAnual=folhaBruta*12;

  const art29a=DATA.art29a||{};

  function medidorHtml(pct,limite,cor,corLimiteTexto,marcadorExtra){
    const dentro=pct<=limite;
    const corTxt=corLimiteTexto||(dentro?'var(--alta)':'var(--baixa)');
    return '<div style="font-size:34px;font-weight:700;color:'+corTxt+';line-height:1">'
        +f1.format(pct)+'%</div>'
      +'<div style="font-size:12px;color:var(--t3);margin:4px 0 14px">'
        +(dentro?'dentro do limite de '+limite+'%':'acima do limite de '+limite+'%')+'</div>'
      +'<div style="position:relative;height:10px;background:var(--trilho);border-radius:6px;margin-bottom:4px">'
        +'<div style="position:absolute;left:0;top:0;height:100%;width:'+Math.max(0,Math.min(100,pct))+'%;'
          +'background:'+cor+';border-radius:6px"></div>'
        +'<div title="limite legal: '+limite+'%" style="position:absolute;left:'+limite+'%;top:-3px;height:16px;'
          +'width:2px;background:var(--t2)"></div>'
        +(marcadorExtra?('<div title="'+marcadorExtra.label+'" style="position:absolute;left:'
          +Math.max(0,Math.min(100,marcadorExtra.pos))+'%;top:-3px;height:16px;width:2px;border-left:2px dashed '
          +marcadorExtra.cor+';background:transparent"></div>'):'')
      +'</div>'
      +(marcadorExtra?('<div style="font-size:11px;color:'+marcadorExtra.cor+';margin-bottom:8px">▲ '+marcadorExtra.label+'</div>'):'');
  }

  return function(){
    kpis.innerHTML='';
    [['Receita', brlx(totReceita), (eq.ano||'')+' · líquida, todos os meses', totReceita, null],
     ['Empenhado', brlx(totEmp), 'comprometido no período', totEmp, null],
     ['Pago', brlx(totPag), 'efetivamente desembolsado', totPag, null],
     ['Saldo', brlx(saldo), saldo>=0?'receita cobriu o pago':'pago passou da receita', saldo,
       saldo>=0?'var(--alta)':'var(--baixa)'],
    ].forEach(([r,v,s,x,cor])=>{
      const d=el('div','kpi'); d.innerHTML=kpiHtml(r,v,s,x,cor); kpis.appendChild(d);
    });

    const dados=meses.map(([m,receita,emp,pag])=>({k:MESES[m-1], receita, emp, pag}));
    colunasMesTrio(mesG, dados, SERIES);

    const pctPes=totReceita?folhaAnual/totReceita*100:0;
    medPes.innerHTML=medidorHtml(pctPes,60,'var(--acento)')
      +'<div class="s" style="font-size:11.5px;color:var(--t3);line-height:1.5">'
      +'% Gasto com Pessoal = Gasto com Pessoal ÷ RCL × 100 (limite total 60% da LRF)<br>'
      +'Folha ('+(DATA.rh_ref||'referência')+') anualizada: '+exato(folhaAnual)+' ÷ RCL '+exato(totReceita)+'</div>';

    const pctLoa=art29a.teto_2026?art29a.loa_camara_2026/art29a.teto_2026*100:0;
    const marcadorLoa={ pos:pctLoa, cor:'#7C3AED',
      label:'LOA 2026: '+exato(art29a.loa_camara_2026||0)+' ('+f1.format(pctLoa)+'% do teto)' };

    const pctOrc=art29a.teto_2026?art29a.emp_camara_2026/art29a.teto_2026*100:0;
    medOrc.innerHTML=medidorHtml(pctOrc,100,'var(--acento)',null,marcadorLoa)
      +'<div class="s" style="font-size:11.5px;color:var(--t3);line-height:1.5">'
      +'% Consumo (Empenhado) = Despesa Empenhada da Câmara ÷ Teto do Art. 29-A × 100<br>'
      +'Empenhado '+exato(art29a.emp_camara_2026||0)+' ÷ Teto '+exato(art29a.teto_2026||0)
      +' (6% de '+exato(art29a.base_2025||0)+' arrecadado em 2025)</div>';

    const pctCaixa=art29a.teto_2026?art29a.pag_camara_2026/art29a.teto_2026*100:0;
    medCaixa.innerHTML=medidorHtml(pctCaixa,100,'#B8860B',null,marcadorLoa)
      +'<div class="s" style="font-size:11.5px;color:var(--t3);line-height:1.5">'
      +'% Consumo (Pago) = Despesa Paga da Câmara ÷ Teto do Art. 29-A × 100<br>'
      +'Pago '+exato(art29a.pag_camara_2026||0)+' ÷ Teto '+exato(art29a.teto_2026||0)
      +' · acumulado em '+(art29a.meses_coletados||0)+' meses de 2026</div>';
  };
}

/* ---------------- montagem ---------------- */
const desenha={ rc:montaReceita('rc'), cap:montaReceita('cap'),
                ded:montaReceita('ded'), ctr:montaContratos(), pes:montaPessoal(),
                desp:montaDespesas(), eq:montaEquilibrio() };
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
