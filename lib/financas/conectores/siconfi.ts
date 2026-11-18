// SICONFI (Tesouro Nacional): API pública, igual para todos os municípios.
// Fonte oficial dos limites da LRF (RGF) e dos mínimos constitucionais e metas fiscais (RREO),
// independente do sistema de cada prefeitura. Os números vêm prontos da contabilidade do município;
// o sistema só lê, não recalcula.
const BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt';

export interface IndicadorC {
  ano: number;
  periodo: number;
  relatorio: 'RGF' | 'RREO';
  chave: string;
  valor: string;
}

export interface ItemSiconfi {
  anexo: string;
  cod_conta?: string;
  conta: string;
  coluna: string;
  valor: number;
  populacao?: number;
}

/** Baixa com novas tentativas: a API do Tesouro às vezes cai por instantes. */
async function obter<T = ItemSiconfi>(url: string, esperasMs = [3000, 7000]): Promise<{ items: T[]; bruto: Buffer }> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'segov-gestao/1.0' } });
      if (!r.ok) throw new Error(`SICONFI HTTP ${r.status}`);
      const bruto = Buffer.from(await r.arrayBuffer());
      const j = JSON.parse(bruto.toString('utf-8'));
      if (j.hasMore) throw new Error('SICONFI: resposta paginada não esperada'); // não grava metade de um relatório
      return { items: j.items ?? [], bruto };
    } catch (e) {
      if (i >= esperasMs.length) throw e;
      await new Promise((ok) => setTimeout(ok, esperasMs[i]));
    }
  }
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Acha o valor pelo código da conta (estável, sem acento) e pelo começo do nome da coluna. */
function achador(items: ItemSiconfi[]) {
  return (codPrefixo: string, coluna: string, excluir?: string) =>
    items.find((i) => (i.cod_conta ?? '').startsWith(codPrefixo) && (!excluir || !(i.cod_conta ?? '').includes(excluir)) && norm(i.coluna).startsWith(norm(coluna)))?.valor;
}

const paraIndicadores = (mapa: Record<string, number | undefined>, ano: number, periodo: number, relatorio: 'RGF' | 'RREO'): IndicadorC[] =>
  Object.entries(mapa)
    .filter(([, v]) => v !== undefined && v !== null && Number.isFinite(v))
    .map(([chave, v]) => ({ ano, periodo, relatorio, chave, valor: String(v) }));

// ---------------------------------------------------------------- RGF (quadrimestral, Executivo)

/** Pessoal (Anexo 01) e dívida consolidada líquida (Anexo 06, demonstrativo simplificado). */
export function extrairRgf(items: ItemSiconfi[], ano: number, quadrimestre: number): IndicadorC[] {
  const a1 = items.filter((i) => i.anexo === 'RGF-Anexo 01');
  if (a1.length === 0) return [];
  const achar = (inicio: string, coluna: string) =>
    a1.find((i) => norm(i.conta).startsWith(norm(inicio)) && norm(i.coluna).startsWith(norm(coluna)))?.valor;
  const a6 = achador(items.filter((i) => i.anexo === 'RGF-Anexo 06'));
  return paraIndicadores({
    rcl: achar('RECEITA CORRENTE LIQUIDA - RCL', 'Valor'),
    rcl_ajustada: achar('= RECEITA CORRENTE LÍQUIDA AJUSTADA', 'Valor'),
    dtp: achar('DESPESA TOTAL COM PESSOAL - DTP', 'Valor'),
    dtp_pct: achar('DESPESA TOTAL COM PESSOAL - DTP', '% sobre a RCL'),
    limite_max_pct: achar('LIMITE MÁXIMO', '% sobre a RCL'),
    limite_prudencial_pct: achar('LIMITE PRUDENCIAL', '% sobre a RCL'),
    limite_alerta_pct: achar('LIMITE DE ALERTA', '% sobre a RCL'),
    dcl: a6('DividaConsolidadaLiquida', 'VALOR'),
    dcl_pct: a6('DividaConsolidadaLiquida', '% SOBRE'),
    dcl_limite_pct: a6('LimiteDefinidoPorResolucaoDoSenadoFederalDivi', '% SOBRE'),
  }, ano, quadrimestre, 'RGF');
}

export async function rgf(ibge: number, ano: number, quadrimestre: number) {
  const url = `${BASE}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=${quadrimestre}&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=${ibge}`;
  const { items, bruto } = await obter(url);
  return { indicadores: extrairRgf(items, ano, quadrimestre), bruto };
}
/** nome antigo, mantido para quem já chama */
export const rgfPessoal = rgf;

// ---------------------------------------------------------------- RREO (bimestral)

/**
 * RREO, Anexo 14 (demonstrativo simplificado): mínimos de Educação (MDE), FUNDEB e Saúde (ASPS) já apurados
 * pela contabilidade, resultado orçamentário, metas de resultado primário e nominal da LDO e restos a pagar.
 */
export function extrairRreoSimplificado(items: ItemSiconfi[], ano: number, bimestre: number): IndicadorC[] {
  const a14 = items.filter((i) => i.anexo === 'RREO-Anexo 14');
  if (a14.length === 0) return [];
  const a = achador(a14);
  const deficit = a('DeficitOrcamentario', 'Ate o Bimestre');
  const superavit = a('SuperavitOrcamentario', 'Ate o Bimestre');
  return paraIndicadores({
    rec_prev_inicial: a('PrevisaoInicial', 'Ate o Bimestre'),
    rec_prev_atual: a('PrevisaoAtualizada', 'Ate o Bimestre'),
    rec_realizada: a('ReceitasRealizadas', 'Ate o Bimestre'),
    // superávit positivo, déficit negativo
    resultado_orcamentario: superavit !== undefined ? superavit : deficit !== undefined ? -deficit : undefined,
    saldo_exercicios_anteriores: a('SaldoDeExerciciosAnteriores', 'Ate o Bimestre'),
    desp_dot_atual: a('DotacaoAtualizada', 'Ate o Bimestre'),
    desp_empenhada: a('DespesasEmpenhadas', 'Ate o Bimestre'),
    desp_liquidada: a('DespesasLiquidadas', 'Ate o Bimestre'),
    desp_paga: a('DespesasPagas', 'Ate o Bimestre'),
    primario_meta: a('ResultadoPrimario', 'Meta'),
    primario_apurado: a('ResultadoPrimario', 'Resultado Apurado'),
    nominal_meta: a('ResultadoNominal', 'Meta'),
    nominal_apurado: a('ResultadoNominal', 'Resultado Apurado'),
    rp_proc_inscrito: a('RestosAPagarProcessadosDemonstrativo', 'Inscri'),
    rp_proc_cancelado: a('RestosAPagarProcessadosDemonstrativo', 'Cancelamento'),
    rp_proc_pago: a('RestosAPagarProcessadosDemonstrativo', 'Pagamento'),
    rp_proc_saldo: a('RestosAPagarProcessadosDemonstrativo', 'Saldo'),
    rp_nproc_inscrito: a('RestosAPagarNaoProcessadosDemonstrativo', 'Inscri'),
    rp_nproc_cancelado: a('RestosAPagarNaoProcessadosDemonstrativo', 'Cancelamento'),
    rp_nproc_pago: a('RestosAPagarNaoProcessadosDemonstrativo', 'Pagamento'),
    rp_nproc_saldo: a('RestosAPagarNaoProcessadosDemonstrativo', 'Saldo'),
    mde_valor: a('MinimoAnualDasReceitasDeImpostosNaManut', 'Valor Apurado'),
    mde_minimo_pct: a('MinimoAnualDasReceitasDeImpostosNaManut', '% Minimo'),
    mde_pct: a('MinimoAnualDasReceitasDeImpostosNaManut', '% Aplicado'),
    fundeb_valor: a('MinimoAnualDoFUNDEB', 'Valor Apurado'),
    fundeb_minimo_pct: a('MinimoAnualDoFUNDEB', '% Minimo'),
    fundeb_pct: a('MinimoAnualDoFUNDEB', '% Aplicado'),
    asps_valor: a('AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude', 'Valor Apurado'),
    asps_minimo_pct: a('AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude', '% Minimo'),
    asps_pct: a('AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude', '% Aplicado'),
  }, ano, bimestre, 'RREO');
}

const urlRreo = (ibge: number, ano: number, bimestre: number, anexo: string) =>
  `${BASE}/rreo?an_exercicio=${ano}&nr_periodo=${bimestre}&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%20${anexo}&id_ente=${ibge}`;

export async function rreoSimplificado(ibge: number, ano: number, bimestre: number) {
  const { items, bruto } = await obter(urlRreo(ibge, ano, bimestre, '14'));
  return { indicadores: extrairRreoSimplificado(items, ano, bimestre), bruto, populacao: populacaoDe(items) };
}

export function populacaoDe(items: ItemSiconfi[]): number | null {
  const p = items.find((i) => i.populacao)?.populacao;
  return p ? Number(p) : null;
}

/** Anexo 06: caixa líquido, caixa bruto, restos processados e depósitos. Se a conta do demonstrativo não fechar, não grava. */
export function extrairCaixa(items: ItemSiconfi[], ano: number, bimestre: number): IndicadorC[] {
  const a6 = items.filter((i) => i.anexo === 'RREO-Anexo 06');
  if (a6.length === 0) return [];
  const a = achador(a6);
  const campos = {
    caixa_liquida_ant: a('RREO5DisponibilidadeDeCaixa', 'Em 31/12'),
    caixa_liquida_ate: a('RREO5DisponibilidadeDeCaixa', 'Ate o Bimestre'),
    caixa_bruta_ant: a('DisponibilidadeDeCaixaBruta', 'Em 31/12'),
    caixa_bruta_ate: a('DisponibilidadeDeCaixaBruta', 'Ate o Bimestre'),
    caixa_rp_proc_ant: a('RestosAPagarProcessadosExcetoPrecatorios', 'Em 31/12'),
    caixa_rp_proc_ate: a('RestosAPagarProcessadosExcetoPrecatorios', 'Ate o Bimestre'),
    caixa_depositos_ant: a('DepositosRestituiveisEValoresVinculados', 'Em 31/12'),
    caixa_depositos_ate: a('DepositosRestituiveisEValoresVinculados', 'Ate o Bimestre'),
  };
  for (const s of ['ant', 'ate'] as const) {
    const [b, rp, dep, liq] = [campos[`caixa_bruta_${s}`], campos[`caixa_rp_proc_${s}`], campos[`caixa_depositos_${s}`], campos[`caixa_liquida_${s}`]];
    if (b !== undefined && rp !== undefined && dep !== undefined && liq !== undefined && Math.abs(b - rp - dep - liq) > 0.05) return [];
  }
  return paraIndicadores(campos, ano, bimestre, 'RREO');
}

/** Anexo 07: restos a pagar (linha TOTAL). Se o saldo do demonstrativo não fechar, não grava. */
export function extrairRestos(items: ItemSiconfi[], ano: number, bimestre: number): IndicadorC[] {
  const a7 = items.filter((i) => i.anexo === 'RREO-Anexo 07' && norm(i.conta).startsWith('TOTAL'));
  if (a7.length === 0) return [];
  const v = (cod: string, coluna: string) => a7.find((i) => i.cod_conta === cod && norm(i.coluna).startsWith(norm(coluna)))?.valor;
  const P = 'RestosAPagarProcessadosENaoProcessadosLiquidados', N = 'RestosAPagarNaoProcessados';
  const r = {
    rp7_ant_proc: v(`${P}InscritosEmExerciciosAnteriores`, 'Em Exerc'),
    rp7_insc_proc: v(`${P}InscritosEmExercicioAnterior`, 'Em 31 de dezembro'),
    rp7_pagos_proc: v(`${P}Pagos`, 'Pagos'),
    rp7_canc_proc: v(`${P}Cancelados`, 'Cancelados'),
    rp7_saldo_proc: v(`${P}APagar`, 'Saldo'),
    rp7_ant_nproc: v(`${N}InscritosEmExerciciosAnteriores`, 'Em Exerc'),
    rp7_insc_nproc: v(`${N}InscritosEmExercicioAnterior`, 'Em 31 de dezembro'),
    rp7_liq_nproc: v(`${N}Liquidados`, 'Liquidados'),
    rp7_pagos_nproc: v(`${N}Pagos`, 'Pagos'),
    rp7_canc_nproc: v(`${N}Cancelados`, 'Cancelados'),
    rp7_saldo_nproc: v(`${N}APagar`, 'Saldo'),
    rp7_saldo_total: v('SaldoTotal', 'Saldo Total'),
  };
  const { rp7_liq_nproc: _liq, ...obrigatorios } = r;
  if (Object.values(obrigatorios).some((x) => x === undefined)) return [];
  const n = obrigatorios as Record<keyof typeof obrigatorios, number>;
  if (Math.abs(n.rp7_ant_proc + n.rp7_insc_proc - n.rp7_pagos_proc - n.rp7_canc_proc - n.rp7_saldo_proc) > 0.05
    || Math.abs(n.rp7_ant_nproc + n.rp7_insc_nproc - n.rp7_pagos_nproc - n.rp7_canc_nproc - n.rp7_saldo_nproc) > 0.05
    || Math.abs(n.rp7_saldo_proc + n.rp7_saldo_nproc - n.rp7_saldo_total) > 0.05) return [];
  return paraIndicadores(r, ano, bimestre, 'RREO');
}

// as 28 funções de governo (Portaria MOG 42/1999): o Anexo 02 mistura função e subfunção na mesma coluna
export const FUNCOES_GOVERNO = [
  'LEGISLATIVA', 'JUDICIARIA', 'ESSENCIAL A JUSTICA', 'ADMINISTRACAO', 'DEFESA NACIONAL', 'SEGURANCA PUBLICA', 'RELACOES EXTERIORES',
  'ASSISTENCIA SOCIAL', 'PREVIDENCIA SOCIAL', 'SAUDE', 'TRABALHO', 'EDUCACAO', 'CULTURA', 'DIREITOS DA CIDADANIA', 'URBANISMO', 'HABITACAO',
  'SANEAMENTO', 'GESTAO AMBIENTAL', 'CIENCIA E TECNOLOGIA', 'AGRICULTURA', 'ORGANIZACAO AGRARIA', 'INDUSTRIA', 'COMERCIO E SERVICOS',
  'COMUNICACOES', 'ENERGIA', 'TRANSPORTE', 'DESPORTO E LAZER', 'ENCARGOS ESPECIAIS',
];
export const nomeFuncao = norm;

/** Anexo 02: liquidado até o bimestre em cada função de governo. */
export function extrairFuncoes(items: ItemSiconfi[], ano: number, bimestre: number): IndicadorC[] {
  const liq = items.filter((i) => i.anexo === 'RREO-Anexo 02' && norm(i.coluna).startsWith('DESPESAS LIQUIDADAS ATE O BIMESTRE'));
  const mapa: Record<string, number> = {};
  for (const i of liq) {
    const n = norm(i.conta);
    if (FUNCOES_GOVERNO.includes(n)) mapa[`funcao_liq:${n}`] = Math.max(mapa[`funcao_liq:${n}`] ?? 0, i.valor);
  }
  return paraIndicadores(mapa, ano, bimestre, 'RREO');
}

const GRUPOS: Record<string, string> = {
  PessoalEEncargosSociais: '31', JurosEEncargosDaDivida: '32', OutrasDespesasCorrentes: '33',
  Investimentos: '44', InversoesFinanceiras: '45', AmortizacaoDaDivida: '46',
};

/** Anexo 01: liquidado até o bimestre em cada grupo de natureza da despesa. */
export function extrairGrupos(items: ItemSiconfi[], ano: number, bimestre: number): IndicadorC[] {
  const liq = items.filter((i) => i.anexo === 'RREO-Anexo 01' && norm(i.coluna).startsWith('DESPESAS LIQUIDADAS ATE O BIMESTRE'));
  const mapa: Record<string, number> = {};
  for (const [cod, grupo] of Object.entries(GRUPOS)) {
    const i = liq.find((x) => x.cod_conta === cod);
    if (i) mapa[`grupo_liq:${grupo}`] = i.valor;
  }
  return paraIndicadores(mapa, ano, bimestre, 'RREO');
}

/**
 * RREO completo do bimestre: Anexo 14 e, se ele existir, os Anexos 01, 02, 06 e 07 e a população.
 * Falha em um anexo complementar não apaga o resto: vira aviso, e os itens dele ficam fora da conferência.
 */
export async function rreoCompleto(ibge: number, ano: number, bimestre: number) {
  const base = await rreoSimplificado(ibge, ano, bimestre);
  const indicadores = [...base.indicadores];
  const brutos: { anexo: string; bruto: Buffer }[] = [{ anexo: '14', bruto: base.bruto }];
  const avisos: string[] = [];
  if (!indicadores.length) return { indicadores, brutos, avisos };
  if (base.populacao) indicadores.push({ ano, periodo: bimestre, relatorio: 'RREO', chave: 'populacao', valor: String(base.populacao) });
  const anexos: [string, (i: ItemSiconfi[], a: number, b: number) => IndicadorC[]][] = [['01', extrairGrupos], ['02', extrairFuncoes], ['06', extrairCaixa], ['07', extrairRestos]];
  for (const [anexo, extrair] of anexos) {
    try {
      const r = await obter(urlRreo(ibge, ano, bimestre, anexo));
      const ind = extrair(r.items, ano, bimestre);
      if (!ind.length) avisos.push(`RREO ${ano}/${bimestre} Anexo ${anexo}: veio vazio ou a conta do demonstrativo não fechou`);
      indicadores.push(...ind);
      brutos.push({ anexo, bruto: r.bruto });
    } catch (e: any) {
      avisos.push(`RREO ${ano}/${bimestre} Anexo ${anexo}: ${e?.message ?? e}`);
    }
  }
  return { indicadores, brutos, avisos };
}

interface EntregaSiconfi { instituicao?: string; periodo?: number; periodicidade?: string; status_relatorio?: string | null }

/** Períodos cujo relatório da Prefeitura está HOMOLOGADO no SICONFI (a Câmara entrega o RGF dela à parte). */
export function periodosHomologados(items: EntregaSiconfi[]) {
  const da = (per: string) => new Set(items
    .filter((i) => /prefeitura/i.test(i.instituicao ?? '') && i.periodicidade === per && i.status_relatorio === 'HO')
    .map((i) => Number(i.periodo)));
  return { rreo: da('B'), rgf: da('Q') };
}

export async function entregasHomologadas(ibge: number, ano: number) {
  const { items } = await obter<EntregaSiconfi>(`${BASE}/extrato_entregas?id_ente=${ibge}&an_referencia=${ano}`);
  return periodosHomologados(items);
}
