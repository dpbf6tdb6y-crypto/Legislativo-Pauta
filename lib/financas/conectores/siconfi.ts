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
}

async function obter(url: string): Promise<{ items: ItemSiconfi[]; bruto: Buffer }> {
  const r = await fetch(url, { headers: { 'User-Agent': 'segov-gestao/1.0' } });
  if (!r.ok) throw new Error(`SICONFI HTTP ${r.status}`);
  const bruto = Buffer.from(await r.arrayBuffer());
  const j = JSON.parse(bruto.toString('utf-8'));
  if (j.hasMore) throw new Error('SICONFI: resposta paginada não esperada'); // não grava metade de um relatório
  return { items: j.items ?? [], bruto };
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

export async function rreoSimplificado(ibge: number, ano: number, bimestre: number) {
  const url = `${BASE}/rreo?an_exercicio=${ano}&nr_periodo=${bimestre}&co_tipo_demonstrativo=RREO&no_anexo=RREO-Anexo%2014&id_ente=${ibge}`;
  const { items, bruto } = await obter(url);
  return { indicadores: extrairRreoSimplificado(items, ano, bimestre), bruto };
}
