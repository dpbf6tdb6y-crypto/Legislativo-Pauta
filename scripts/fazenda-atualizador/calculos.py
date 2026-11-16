# -*- coding: utf-8 -*-
"""Regras e leitura de números oficiais do painel Fazenda — funções puras, com testes (tests/).

Nada aqui decide o que é irregular: o painel descreve e cita a lei. As regras a conferir com o contador
ou o jurídico estão marcadas com "CONFERIR".
"""
import unicodedata

# ---------------------------------------------------------------- pessoal (LRF)
# Poder Executivo municipal: máximo 54% da RCL (LRF art. 20, III, "b"); prudencial 95% do máximo (art. 22,
# parágrafo único); alerta 90% do máximo (art. 59, §1º, II). O "60%" é o limite do MUNICÍPIO inteiro (Executivo
# + Câmara, art. 19, III) e não é o que o prefeito responde.
LIMITES_PESSOAL = {
    'executivo': {'alerta': 48.6, 'prudencial': 51.3, 'maximo': 54.0},
    'municipio': {'alerta': 54.0, 'prudencial': 57.0, 'maximo': 60.0},
}


def nivel_pessoal(pct, limites=None):
    """'abaixo' | 'alerta' | 'prudencial' | 'maximo' pelos limites dados (padrão: Executivo)."""
    lim = limites or LIMITES_PESSOAL['executivo']
    if pct >= lim['maximo']:
        return 'maximo'
    if pct >= lim['prudencial']:
        return 'prudencial'
    if pct >= lim['alerta']:
        return 'alerta'
    return 'abaixo'


def margens_pessoal(despesa, rcl, limites=None):
    """Quanto ainda cabe até cada limite, em reais (negativo = já passou). Base: RCL ajustada."""
    lim = limites or LIMITES_PESSOAL['executivo']
    return {k: round(rcl * v / 100 - despesa, 2) for k, v in lim.items()}


# ---------------------------------------------------------------- repasse à Câmara (CF art. 29-A)
# CONFERIR com o jurídico: faixas da EC 58/2009 sobre a população; base = receita tributária e transferências
# dos arts. 153, §5º, 158 e 159 EFETIVAMENTE realizadas no exercício ANTERIOR.
FAIXAS_29A = [(100_000, 7.0), (300_000, 6.0), (500_000, 5.0), (3_000_000, 4.5), (8_000_000, 4.0)]


def percentual_29a(populacao):
    for ate, pct in FAIXAS_29A:
        if populacao <= ate:
            return pct
    return 3.5


def teto_camara(base_ano_anterior, populacao):
    return round(base_ano_anterior * percentual_29a(populacao) / 100, 2)


# ---------------------------------------------------------------- mínimos constitucionais
def nivel_minimo(pct, minimo, bimestre):
    """O mínimo vale para o ano: abaixo dele antes do 6º bimestre é observação; no 6º, atenção."""
    if pct >= minimo:
        return 'ok'
    return 'observacao' if bimestre < 6 else 'atencao'


def nivel_divida(pct, limite=120.0):
    """Dívida consolidada líquida × limite do Senado (Res. 40/2001); alerta a 90% do limite (LRF art. 59, §1º, III)."""
    if pct >= limite:
        return 'atencao'
    return 'observacao' if pct >= limite * 0.9 else 'ok'


# ---------------------------------------------------------------- leitura do SICONFI
def _norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).upper().strip()


def _achador(items):
    def achar(cod_prefixo, coluna):
        for i in items:
            if (i.get('cod_conta') or '').startswith(cod_prefixo) and _norm(i.get('coluna')).startswith(_norm(coluna)):
                return i.get('valor')
        return None
    return achar


def extrair_rgf(items):
    """RGF do Executivo: pessoal (Anexo 01) e dívida consolidada líquida (Anexo 06). Valores como o SICONFI publica."""
    a1 = [i for i in items if i.get('anexo') == 'RGF-Anexo 01']
    if not a1:
        return {}

    def conta(inicio, coluna):
        for i in a1:
            if _norm(i.get('conta')).startswith(_norm(inicio)) and _norm(i.get('coluna')).startswith(_norm(coluna)):
                return i.get('valor')
        return None
    a6 = _achador([i for i in items if i.get('anexo') == 'RGF-Anexo 06'])
    r = {
        'rcl': conta('RECEITA CORRENTE LIQUIDA - RCL', 'Valor'),
        'rcl_ajustada': conta('= RECEITA CORRENTE LÍQUIDA AJUSTADA', 'Valor'),
        'dtp': conta('DESPESA TOTAL COM PESSOAL - DTP', 'Valor'),
        'dtp_pct': conta('DESPESA TOTAL COM PESSOAL - DTP', '% sobre a RCL'),
        'limite_max_pct': conta('LIMITE MÁXIMO', '% sobre a RCL'),
        'limite_prudencial_pct': conta('LIMITE PRUDENCIAL', '% sobre a RCL'),
        'limite_alerta_pct': conta('LIMITE DE ALERTA', '% sobre a RCL'),
        'dcl': a6('DividaConsolidadaLiquida', 'VALOR'),
        'dcl_pct': a6('DividaConsolidadaLiquida', '% SOBRE'),
        'dcl_limite_pct': a6('LimiteDefinidoPorResolucaoDoSenadoFederalDivi', '% SOBRE'),
    }
    return {k: v for k, v in r.items() if v is not None}


def extrair_rreo(items):
    """RREO, Anexo 14 (demonstrativo simplificado): mínimos, metas da LDO, resultado orçamentário e restos a pagar."""
    a14 = [i for i in items if i.get('anexo') == 'RREO-Anexo 14']
    if not a14:
        return {}
    a = _achador(a14)
    deficit, superavit = a('DeficitOrcamentario', 'Ate o Bimestre'), a('SuperavitOrcamentario', 'Ate o Bimestre')
    campos = {
        'rec_prev_atual': a('PrevisaoAtualizada', 'Ate o Bimestre'),
        'rec_realizada': a('ReceitasRealizadas', 'Ate o Bimestre'),
        'resultado_orcamentario': superavit if superavit is not None else (-deficit if deficit is not None else None),
        'saldo_exercicios_anteriores': a('SaldoDeExerciciosAnteriores', 'Ate o Bimestre'),
        'desp_empenhada': a('DespesasEmpenhadas', 'Ate o Bimestre'),
        'desp_liquidada': a('DespesasLiquidadas', 'Ate o Bimestre'),
        'desp_paga': a('DespesasPagas', 'Ate o Bimestre'),
        'primario_meta': a('ResultadoPrimario', 'Meta'),
        'primario_apurado': a('ResultadoPrimario', 'Resultado Apurado'),
        'nominal_meta': a('ResultadoNominal', 'Meta'),
        'nominal_apurado': a('ResultadoNominal', 'Resultado Apurado'),
        'rp_proc_inscrito': a('RestosAPagarProcessadosDemonstrativo', 'Inscri'),
        'rp_proc_pago': a('RestosAPagarProcessadosDemonstrativo', 'Pagamento'),
        'rp_proc_cancelado': a('RestosAPagarProcessadosDemonstrativo', 'Cancelamento'),
        'rp_proc_saldo': a('RestosAPagarProcessadosDemonstrativo', 'Saldo'),
        'rp_nproc_inscrito': a('RestosAPagarNaoProcessadosDemonstrativo', 'Inscri'),
        'rp_nproc_pago': a('RestosAPagarNaoProcessadosDemonstrativo', 'Pagamento'),
        'rp_nproc_cancelado': a('RestosAPagarNaoProcessadosDemonstrativo', 'Cancelamento'),
        'rp_nproc_saldo': a('RestosAPagarNaoProcessadosDemonstrativo', 'Saldo'),
    }
    for chave, cod in (('mde', 'MinimoAnualDasReceitasDeImpostosNaManut'), ('fundeb', 'MinimoAnualDoFUNDEB'),
                       ('asps', 'AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude')):
        campos[chave + '_valor'] = a(cod, 'Valor Apurado')
        campos[chave + '_minimo_pct'] = a(cod, '% Minimo')
        campos[chave + '_pct'] = a(cod, '% Aplicado')
    return {k: v for k, v in campos.items() if v is not None}


def extrair_caixa(items06):
    """RREO Anexo 06: disponibilidade de caixa (líquida e bruta), restos a pagar processados e depósitos, em 31/12 do ano
    anterior e até o bimestre. Mesmos campos que o painel lia do PDF."""
    a6 = [i for i in items06 if i.get('anexo') == 'RREO-Anexo 06']
    if not a6:
        return {}
    a = _achador(a6)
    campos = {
        'caixa_liquida_ant': a('RREO5DisponibilidadeDeCaixa', 'Em 31/12'),
        'caixa_liquida_ate': a('RREO5DisponibilidadeDeCaixa', 'Ate o Bimestre'),
        'caixa_bruta_ant': a('DisponibilidadeDeCaixaBruta', 'Em 31/12'),
        'caixa_bruta_ate': a('DisponibilidadeDeCaixaBruta', 'Ate o Bimestre'),
        'rp_proc_ant': a('RestosAPagarProcessadosExcetoPrecatorios', 'Em 31/12'),
        'rp_proc_ate': a('RestosAPagarProcessadosExcetoPrecatorios', 'Ate o Bimestre'),
        'depositos_ant': a('DepositosRestituiveisEValoresVinculados', 'Em 31/12'),
        'depositos_ate': a('DepositosRestituiveisEValoresVinculados', 'Ate o Bimestre'),
    }
    # o caixa líquido tem de ser bruto − restos processados − depósitos (a conta do próprio demonstrativo)
    for suf in ('ant', 'ate'):
        b, rp, dep, liq = (campos.get('caixa_bruta_' + suf), campos.get('rp_proc_' + suf),
                           campos.get('depositos_' + suf), campos.get('caixa_liquida_' + suf))
        if None not in (b, rp, dep, liq) and abs((b - rp - dep) - liq) > 0.05:
            return {}  # não fecha: melhor mostrar "indisponível" do que um caixa inventado
    return {k: v for k, v in campos.items() if v is not None}


def extrair_restos(items07):
    """RREO Anexo 07: restos a pagar do Poder Executivo + Câmara (linha TOTAL), processados e não processados."""
    a7 = [i for i in items07 if i.get('anexo') == 'RREO-Anexo 07' and _norm(i.get('conta')).startswith('TOTAL')]
    if not a7:
        return {}

    def v(cod, coluna):
        for i in a7:
            if i.get('cod_conta') == cod and _norm(i.get('coluna')).startswith(_norm(coluna)):
                return i.get('valor')
        return None
    P = 'RestosAPagarProcessadosENaoProcessadosLiquidados'
    N = 'RestosAPagarNaoProcessados'
    r = {
        'ant_proc': v(P + 'InscritosEmExerciciosAnteriores', 'Em Exerc'),
        'insc_proc': v(P + 'InscritosEmExercicioAnterior', 'Em 31 de dezembro'),
        'pagos_proc': v(P + 'Pagos', 'Pagos'),
        'canc_proc': v(P + 'Cancelados', 'Cancelados'),
        'saldo_proc': v(P + 'APagar', 'Saldo'),
        'ant_nproc': v(N + 'InscritosEmExerciciosAnteriores', 'Em Exerc'),
        'insc_nproc': v(N + 'InscritosEmExercicioAnterior', 'Em 31 de dezembro'),
        'liq_nproc': v(N + 'Liquidados', 'Liquidados'),
        'pagos_nproc': v(N + 'Pagos', 'Pagos'),
        'canc_nproc': v(N + 'Cancelados', 'Cancelados'),
        'saldo_nproc': v(N + 'APagar', 'Saldo'),
        'saldo_total': v('SaldoTotal', 'Saldo Total'),
    }
    chaves = ('ant_proc', 'insc_proc', 'pagos_proc', 'canc_proc', 'saldo_proc',
              'ant_nproc', 'insc_nproc', 'pagos_nproc', 'canc_nproc', 'saldo_nproc', 'saldo_total')
    if any(r.get(k) is None for k in chaves):
        return {}
    # confere as contas do demonstrativo: saldo = inscrito − pago − cancelado, e o total = processados + não processados
    if (abs(r['ant_proc'] + r['insc_proc'] - r['pagos_proc'] - r['canc_proc'] - r['saldo_proc']) > 0.05
            or abs(r['ant_nproc'] + r['insc_nproc'] - r['pagos_nproc'] - r['canc_nproc'] - r['saldo_nproc']) > 0.05
            or abs(r['saldo_proc'] + r['saldo_nproc'] - r['saldo_total']) > 0.05):
        return {}
    r['pagos'] = round(r['pagos_proc'] + r['pagos_nproc'], 2)
    r['cancelados'] = round(r['canc_proc'] + r['canc_nproc'], 2)
    r['inscritos_ano_anterior'] = round(r['insc_proc'] + r['insc_nproc'], 2)
    r['inscritos_anteriores'] = round(r['ant_proc'] + r['ant_nproc'], 2)
    return r


def populacao(items):
    for i in items:
        if i.get('populacao'):
            return int(i['populacao'])
    return None
