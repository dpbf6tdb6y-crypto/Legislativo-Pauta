// Leitores puros dos formatos do portal Ábaco (sem rede). Testados com arquivos-gabarito.
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { centavos } from '@/lib/financas/dinheiro';
import type { ContratoC, DespesaFuncaoMesC, DespesaNaturezaMesC, DespesaOrgaoMesC, EmpenhoC, EventoC, ReceitaContaMesC, RestoPagarC, RetencaoC } from '../tipos';

export const MESES = ['TODOS', 'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

function lista<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}
const txt = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** dd/mm/aaaa ou aaaa-mm-dd -> Date (meio-dia UTC, evita virar o dia por fuso) */
export function data(s: string): Date | null {
  s = (s ?? '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && m[1] !== '0000') return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return null;
}

/** Confere se o arquivo foi gerado com o filtro pedido (o nome do arquivo é compartilhado entre visitantes). */
function conferirFiltros(raiz: any, ano: number, mes: number, tipo: string) {
  const f = raiz?.Export?.Filtros;
  const anoArq = txt(f?.Ano);
  const mesArq = txt(f?.Mes) || 'TODOS';
  if (anoArq !== String(ano) || mesArq !== MESES[mes]) {
    throw new Error(`${tipo}: arquivo veio com filtro ${anoArq}/${mesArq}, pedido ${ano}/${MESES[mes]} (descartado)`);
  }
}

type ValoresDespesa = { dotInicial: bigint; dotAtual: bigint; empenhado: bigint; liquidado: bigint; pago: bigint };

/**
 * O portal às vezes traz a mesma chave em duas linhas (2020, função 04 / subfunção 122: uma com a execução e outra só
 * com R$ 1.318.000,00 de dotação). A tabela aceita uma linha por chave, então as linhas se somam: o total do
 * relatório não muda e nada é descartado. A primeira linha dá o nome.
 */
function somarMesmaChave<T extends ValoresDespesa>(linhas: T[], chave: (l: T) => string): T[] {
  const mapa = new Map<string, T>();
  for (const l of linhas) {
    const k = chave(l);
    const antes = mapa.get(k);
    mapa.set(k, antes ? { ...antes, dotInicial: antes.dotInicial + l.dotInicial, dotAtual: antes.dotAtual + l.dotAtual, empenhado: antes.empenhado + l.empenhado, liquidado: antes.liquidado + l.liquidado, pago: antes.pago + l.pago } : l);
  }
  return [...mapa.values()];
}

export function lerDespesaOrgaoXml(conteudo: string, ano: number, mes: number): DespesaOrgaoMesC[] {
  const r = xml.parse(conteudo);
  conferirFiltros(r, ano, mes, 'despesa_orgao');
  const itens = lista(r?.Export?.SDTDespesaOrcamentoCollection?.SDTDespesaOrcamento);
  if (itens.length === 0) throw new Error('despesa_orgao: arquivo sem registros');
  return itens.map((d: any) => ({
    ano,
    mes,
    orgaoCod: txt(d.DespesaOrcOrgaoCodigo),
    orgaoNome: txt(d.DespesaOrcOrgaoNome),
    dotInicial: centavos(txt(d.DespesaOrcValorInicial)),
    dotAtual: centavos(txt(d.DespesaOrcValorValorAtual)),
    empenhado: centavos(txt(d.DespesaOrcValorEmpenhadoTot)),
    liquidado: centavos(txt(d.DespesaOrcValorLiquidadoTot)),
    pago: centavos(txt(d.DespesaOrcValorPagoTot)),
  }));
}

/** Relatório consolidado por natureza (wmdespesas?17,0). */
export function lerDespesaNaturezaXml(conteudo: string, ano: number, mes: number): DespesaNaturezaMesC[] {
  const r = xml.parse(conteudo);
  conferirFiltros(r, ano, mes, 'despesa_natureza');
  const itens = lista(r?.Export?.SDTDespesaNaturezaCollection?.SDTDespesaNatureza);
  if (itens.length === 0) throw new Error('despesa_natureza: arquivo sem registros');
  return somarMesmaChave(
    itens.map((d: any) => ({
      ano,
      mes,
      naturezaCod: txt(d.DespesaNaturezaCod),
      naturezaNome: txt(d.DespesaNaturezaNome),
      dotInicial: centavos(txt(d.DespesaNaturezaOrcValorInicial)),
      dotAtual: centavos(txt(d.DespesaNaturezaOrcValorAtual)),
      empenhado: centavos(txt(d.DespesaNaturezaEmpTot)),
      liquidado: centavos(txt(d.DespesaNaturezaLiqTot)),
      pago: centavos(txt(d.DespesaNaturezaPagTot)),
    })),
    (l) => l.naturezaCod,
  );
}

/** Relatório consolidado por função e subfunção (wmdespesas?15,0). */
export function lerDespesaFuncaoXml(conteudo: string, ano: number, mes: number): DespesaFuncaoMesC[] {
  const r = xml.parse(conteudo);
  conferirFiltros(r, ano, mes, 'despesa_funcao');
  const itens = lista(r?.Export?.SDTDespesaFuncaoCollection?.SDTDespesaFuncao);
  if (itens.length === 0) throw new Error('despesa_funcao: arquivo sem registros');
  return somarMesmaChave(
    itens.map((d: any) => ({
      ano,
      mes,
      funcaoCod: txt(d.DespesaFuncaoCod),
      funcaoNome: txt(d.DespesaFuncaoNome),
      subfuncaoCod: txt(d.DespesaSubFuncaoCod),
      subfuncaoNome: txt(d.DespesaSubFuncaoNome),
      dotInicial: centavos(txt(d.DespesaFuncaoOrcValorInicial)),
      dotAtual: centavos(txt(d.DespesaFuncaoOrcValorAtual)),
      empenhado: centavos(txt(d.DespesaFuncaoEmpTot)),
      liquidado: centavos(txt(d.DespesaFuncaoLiqTot)),
      pago: centavos(txt(d.DespesaFuncaoPagTot)),
    })),
    (l) => `${l.funcaoCod}|${l.subfuncaoCod}`,
  );
}

export function lerReceitaXml(conteudo: string, ano: number, mes: number): ReceitaContaMesC[] {
  const r = xml.parse(conteudo);
  conferirFiltros(r, ano, mes, 'receitas');
  const itens = lista(r?.Export?.SDTReceitaOrcamentoCollection?.SDTReceitaOrcamento);
  if (itens.length === 0) throw new Error('receitas: arquivo sem registros');
  return itens.map((d: any) => ({
    ano,
    mes,
    contaCod: txt(d.ReceitaOrcContaCod),
    contaPai: txt(d.ReceitaOrcContaCodPai),
    nome: txt(d.ReceitaOrcContaNome),
    redutora: txt(d.ReceitaOrcContaRedutora) === 'true',
    previstoInicial: centavos(txt(d.ReceitaOrcValorInicial)),
    previstoAtual: centavos(txt(d.ValorValorAtual)),
    arrecAnterior: centavos(txt(d.ArrecadadoAnt)),
    arrecMes: centavos(txt(d.ArrecadadoMes)),
    arrecAteMes: centavos(txt(d.ArrecadadoAteMes)),
  }));
}

export function lerContratosXml(conteudo: string): ContratoC[] {
  const r = xml.parse(conteudo);
  const itens = lista(r?.Export?.SDTContratoCollection?.SDTContrato);
  if (itens.length === 0) throw new Error('contratos: arquivo sem registros');
  return itens.map((c: any) => {
    const pn = txt(c.ContratoProcessoNumero);
    const pa = txt(c.ContratoProcessoAno);
    return {
      idOrigem: Number(txt(c.ContratoId)),
      numero: txt(c.ContratoNumero),
      ano: Number(txt(c.ContratoAno)),
      assinatura: data(txt(c.ContratoDataAssinatura)),
      inicio: data(txt(c.ContratoDataIni)),
      fim: data(txt(c.ContratoDataFim)),
      publicacaoData: data(txt(c.ContratoPublicacaoData)),
      publicacaoVeiculo: txt(c.ContratoPublicacaoTipo),
      objeto: txt(c.ContratoDsc),
      tipo: txt(c.ContratoTipoNome),
      situacao: txt(c.ContratoStatusDesc),
      valorInicial: centavos(txt(c.ContratoValor)),
      valorAtual: centavos(txt(c.ContratoValorAtual)),
      processo: pn && pn !== '0' ? `${pn}/${pa}` : '',
      modalidade: txt(c.ContratoLicitacaoModalidade),
      fornecedorDoc: txt(c.ContratoFornecedorDoc).replace(/\D/g, ''),
      fornecedorNome: txt(c.ContratoFornecedorRazao) || txt(c.ContratoFornecedorNome),
    };
  });
}

export function lerRestosAPagarXml(conteudo: string, exercicio: number): RestoPagarC[] {
  const r = xml.parse(conteudo);
  const exArq = txt(r?.Export?.Filtros?.Exercicio);
  if (exArq !== String(exercicio)) throw new Error(`restos a pagar: arquivo veio com exercício ${exArq || 'TODOS'}, pedido ${exercicio} (descartado)`);
  const itens = lista(r?.Export?.SDTRestoPagarCollection?.SDTRestoPagar);
  return itens.map((c: any) => ({
    idOrigem: Number(txt(c.RestoPagarId)),
    numero: txt(c.RestoPagarNumero),
    anoOrigem: Number(txt(c.RestoPagarAno)),
    exercicio: Number(txt(c.RestoPagarExerAno)),
    tipo: txt(c.RestoPagarTipo),
    empenhoIdOrigem: Number(txt(c.EmpenhoId)),
    empenhoNumero: `${txt(c.RestoPagarEmpenhoNumero)}/${txt(c.RestoPagarEmpenhoAno)}`,
    orgaoCod: txt(c.RestoPagarOrgnCod),
    orgaoNome: txt(c.RestoPagarOrgnNome),
    credorDoc: txt(c.RestoPagarCredorDoc).replace(/\D/g, ''),
    credorNome: txt(c.RestoPagarCredorRazao) || txt(c.RestoPagarCredorNome),
    inscrito: centavos(txt(c.RestoPagarValorInscrito)),
    anulado: centavos(txt(c.RestoPagarValorAnul)),
    liquidado: centavos(txt(c.RestoPagarLiquidacaoValorLiq)),
    pago: centavos(txt(c.RestoPagarPagamentoValorLiq)),
  }));
}

/** Extrai "CONTRATO Nº 0252/2025" da descrição -> "0252/2025" normalizado como "252/2025" */
export function contratoCitado(descricao: string): string | null {
  const m = descricao.match(/CONTRATO\s*(?:N[º°O.]*\s*)?(\d{1,5})\s*\/\s*(\d{4}|\d{2})\b/i);
  if (!m) return null;
  let ano = m[2];
  if (ano.length === 2) ano = '20' + ano;
  return `${Number(m[1])}/${ano}`;
}

function eventosDoGrid(valorJson: string | undefined): EventoC[] {
  if (!valorJson) return [];
  const linhas: string[][] = JSON.parse(valorJson);
  return linhas.map((l) => {
    const iData = l.findIndex((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(x)));
    if (iData < 1) throw new Error('grid de eventos em formato inesperado');
    return {
      idOrigem: Number(l[0]),
      numero: String(l[iData - 1]).trim(),
      data: data(l[iData])!,
      valor: centavos(l[l.length - 1]),
    };
  });
}

/** Detalhe do empenho (wmdespesas?13,<id>). Devolve null se o id não existe. */
export function lerEmpenhoHtml(html: string, idOrigem: number): EmpenhoC | null {
  const $ = cheerio.load(html);
  const v = (campo: string) => $(`#span_W0053v${campo}`).text().replace(/\s+/g, ' ').trim();
  const numero = v('EMPENHONUMERO');
  const d = data(v('EMPENHODATA'));
  if (!numero || !d) return null;
  const credor = v('EMPENHOCREDOR');
  const iSep = credor.lastIndexOf(' - ');
  const liquidacoes = eventosDoGrid($('input[name="W0053GridliquidacaoContainerDataV"]').attr('value'));
  const pagamentos = eventosDoGrid($('input[name="W0053GridpagementoContainerDataV"]').attr('value'));
  return {
    idOrigem,
    numero,
    data: d,
    tipo: v('EMPENHOTIPODSC'),
    orgao: v('EMPENHOORGNNOME'),
    unidade: v('EMPENHOUNIDNOME'),
    credorNome: iSep > 0 ? credor.slice(0, iSep).trim() : credor,
    credorDoc: iSep > 0 ? credor.slice(iSep + 3).replace(/\D/g, '') : '',
    processo: v('EMPENHOPROCESSO'),
    natureza: v('EMPENHONATUREZAPAG'),
    contaDespesa: v('EMPENHOCONTADESPNOME'),
    fonte: v('EMPENHOFONTERECURSOEXENOME'),
    funcao: v('EMPENHOFUNCAOEXENOME'),
    subfuncao: v('EMPENHOSUBFUNCAOEXENOME'),
    programa: v('EMPENHOPROGRAMAEXENOME'),
    projeto: v('EMPENHOPROJETOATIVIDADENOME'),
    descricao: v('EMPENHODSC'),
    valor: centavos(v('EMPENHOVALOR')),
    anulado: centavos(v('EMPENHOVALORANUL')),
    aLiquidar: centavos(v('EMPENHOALIQUIDAR')),
    aPagar: centavos(v('EMPENHOAPAGAR')),
    liquidacoes,
    pagamentos,
  };
}

/**
 * Confere se o detalhe veio completo: liquidado = empenhado - anulado - a liquidar,
 * pago = liquidado - a pagar. Se não bater, o grid pode estar paginado/incompleto.
 */
export function conferirEmpenho(e: EmpenhoC): string | null {
  const liq = e.liquidacoes.reduce((s, x) => s + x.valor, BigInt(0));
  const pag = e.pagamentos.reduce((s, x) => s + x.valor, BigInt(0));
  if (liq !== e.valor - e.anulado - e.aLiquidar) return `liquidações (${liq}) ≠ empenhado − anulado − a liquidar (${e.valor - e.anulado - e.aLiquidar})`;
  if (pag !== liq - e.aPagar) return `pagamentos (${pag}) ≠ liquidado − a pagar (${liq - e.aPagar})`;
  return null;
}

/** "EM EXERCÍCIO" etc. -> categoria resumida (LGPD: não expor motivo de afastamento) */
export function situacaoResumida(s: string): string {
  const u = s.toUpperCase();
  if (u.includes('EXERC')) return 'em exercício';
  if (u.includes('FÉRIAS') || u.includes('FERIAS')) return 'em exercício';
  if (u.includes('EXONER') || u.includes('CANCEL')) return 'desligado';
  if (u.includes('APOSENT') || u.includes('PENSION')) return 'aposentado/pensionista';
  if (u.includes('LICEN') || u.includes('ATESTADO') || u.includes('DISPOSI')) return 'afastado';
  return 'outro';
}

/** Descontos/consignações de um pagamento (wppagamentodoc?<id>). Confere a soma com o total que a própria página mostra. */
export function lerRetencoesHtml(html: string, pagamentoIdOrigem: number): RetencaoC[] {
  const $ = cheerio.load(html);
  const bruto = $('input[name="Grid1ContainerDataV"]').attr('value');
  if (bruto === undefined) throw new Error(`pagamento ${pagamentoIdOrigem}: página sem o quadro de descontos`);
  const linhas: string[][] = JSON.parse(bruto);
  const itens = linhas.map((l, i) => ({
    pagamentoIdOrigem,
    seq: i + 1,
    descricao: txt(l[0]),
    tipo: txt(l[1]),
    data: data(txt(l[3])),
    valor: centavos(l[l.length - 1]),
  }));
  const total = html.match(/Total de Consigna[^:]*:\s*R\$\s*R\$\s*([\d.,-]+)/)?.[1];
  const soma = itens.reduce((s, x) => s + x.valor, BigInt(0));
  if (total !== undefined && centavos(total) !== soma)
    throw new Error(`pagamento ${pagamentoIdOrigem}: descontos somam ${soma}, a página informa ${centavos(total)} (quadro incompleto?)`);
  return itens;
}
