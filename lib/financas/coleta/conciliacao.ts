import type { DbPrefeitura } from '@/lib/financas/db';

export interface LinhaConciliacao {
  mes: number;
  item: 'liquidado' | 'pago' | 'empenhado' | 'pago restos a pagar' | 'pessoal sem pagamento publicado';
  portal: string; // centavos
  calculado: string; // centavos
  diferenca: string;
  confere: boolean;
  observacao: string;
}
export interface ResultadoConciliacao {
  ano: number;
  linhas: LinhaConciliacao[];
  divergencias: number;
  folha: { anoMes: string; portal: number; coletadas: number; confere: boolean }[];
}

/**
 * Prova 1, camada (b): os totais do mês publicados pelo portal (aba Órgão)
 * conferem com a soma dos eventos coletados empenho por empenho?
 */
export async function conciliar(db: DbPrefeitura, ano: number): Promise<ResultadoConciliacao> {
  const linhas: LinhaConciliacao[] = [];
  const temEmpenhos = (await db.empenho.count({ where: { ano } })) > 0;
  const orgaos = await db.despesaOrgaoMes.findMany({ where: { ano, mes: { gt: 0 } } });
  const meses = [...new Set(orgaos.map((o) => o.mes))].sort((a, b) => a - b);
  for (const mes of meses) {
    const doMes = orgaos.filter((o) => o.mes === mes);
    const portal = {
      empenhado: doMes.reduce((s, o) => s + o.empenhado, BigInt(0)),
      liquidado: doMes.reduce((s, o) => s + o.liquidado, BigInt(0)),
      pago: doMes.reduce((s, o) => s + o.pago, BigInt(0)),
    };
    if (!temEmpenhos) continue;
    const ini = new Date(Date.UTC(ano, mes - 1, 1));
    const fim = new Date(Date.UTC(ano, mes, 1));
    const doAno = { empenho: { ano } };
    const liq = await db.liquidacao.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, ...doAno } });
    // o pagamento do empenho traz só o líquido creditado; o portal conta como pago líquido + descontos retidos
    const pags = await db.pagamento.findMany({ where: { data: { gte: ini, lt: fim }, ...doAno }, select: { idOrigem: true, valor: true } });
    const liquidoPago = pags.reduce((s, x) => s + x.valor, BigInt(0));
    const ret = await db.retencaoLeitura.findMany({ where: { pagamentoIdOrigem: { in: pags.map((x) => x.idOrigem) } }, select: { total: true } });
    const retido = ret.reduce((s, x) => s + x.total, BigInt(0));
    const semLeitura = pags.length - ret.length;
    const rp = await db.pagamento.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, empenho: { ano: { lt: ano } } } });
    // pessoal (natureza 31): o portal lista o líquido e só parte dos descontos (IRRF); previdência e consignados ficam sem registro
    const pesLiq = await db.liquidacao.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, empenho: { ano, contaDespesa: { startsWith: '31' } } } });
    const pesPag = await db.pagamento.findMany({ where: { data: { gte: ini, lt: fim }, empenho: { ano, contaDespesa: { startsWith: '31' } } }, select: { idOrigem: true, valor: true } });
    const pesRet = await db.retencaoLeitura.aggregate({ _sum: { total: true }, where: { pagamentoIdOrigem: { in: pesPag.map((x) => x.idOrigem) } } });
    const pesSaldo = (pesLiq._sum.valor ?? BigInt(0)) - pesPag.reduce((s, x) => s + x.valor, BigInt(0)) - (pesRet._sum.total ?? BigInt(0));
    const emp = await db.empenho.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim } } });
    const add = (item: LinhaConciliacao['item'], p: bigint, c: bigint, obs: string, conta: boolean) =>
      linhas.push({ mes, item, portal: p.toString(), calculado: c.toString(), diferenca: (p - c).toString(), confere: p === c, observacao: conta ? obs : `${obs} (informativo)` });
    add('liquidado', portal.liquidado, liq._sum.valor ?? BigInt(0), 'liquidações com data no mês, empenhos do exercício', true);
    const brl = (c: bigint) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    add('pago', portal.pago, liquidoPago + retido,
      `pagamentos com data no mês, empenhos do exercício: líquido ${brl(liquidoPago)} + descontos retidos ${brl(retido)}${semLeitura ? ` — descontos ainda não lidos em ${semLeitura} pagamento(s)` : ''}`, true);
    add('pago restos a pagar', BigInt(0), rp._sum.valor ?? BigInt(0), 'pagamentos com data no mês de empenhos de anos anteriores (líquido, só RP processados têm data); a aba Órgão do portal não inclui restos a pagar', false);
    add('pessoal sem pagamento publicado', BigInt(0), pesSaldo, 'despesa com pessoal liquidada no mês menos líquido pago e descontos publicados; o portal não detalha o restante (provavelmente previdência do servidor e consignados) — ajuda a explicar a diferença do pago', false);
    add('empenhado', portal.empenhado, emp._sum.valor ?? BigInt(0), 'portal desconta anulações; o detalhe não traz a data da anulação', false);
  }
  const folhas = await db.folhaMes.findMany({ orderBy: { anoMes: 'asc' } });
  const folha = folhas.map((f) => ({ anoMes: f.anoMes, portal: f.linhasPortal, coletadas: f.linhasColetadas, confere: f.linhasPortal === f.linhasColetadas }));
  const divergencias =
    linhas.filter((l) => !l.confere && !l.observacao.endsWith('(informativo)')).length + folha.filter((f) => !f.confere).length;
  return { ano, linhas, divergencias, folha };
}
