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
      empenhado: doMes.reduce((s, o) => s + o.empenhado, 0n),
      liquidado: doMes.reduce((s, o) => s + o.liquidado, 0n),
      pago: doMes.reduce((s, o) => s + o.pago, 0n),
    };
    if (!temEmpenhos) continue;
    const ini = new Date(Date.UTC(ano, mes - 1, 1));
    const fim = new Date(Date.UTC(ano, mes, 1));
    const doAno = { empenho: { ano } };
    const liq = await db.liquidacao.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, ...doAno } });
    // o pagamento do empenho traz só o líquido creditado; o portal conta como pago líquido + descontos retidos
    const pags = await db.pagamento.findMany({ where: { data: { gte: ini, lt: fim }, ...doAno }, select: { idOrigem: true, valor: true } });
    const liquidoPago = pags.reduce((s, x) => s + x.valor, 0n);
    const ret = await db.retencaoLeitura.findMany({ where: { pagamentoIdOrigem: { in: pags.map((x) => x.idOrigem) } }, select: { total: true } });
    const retido = ret.reduce((s, x) => s + x.total, 0n);
    const semLeitura = pags.length - ret.length;
    const rp = await db.pagamento.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, empenho: { ano: { lt: ano } } } });
    // pessoal (natureza 31): o portal lista o líquido e só parte dos descontos (IRRF); previdência e consignados ficam sem registro
    const pesLiq = await db.liquidacao.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim }, empenho: { ano, contaDespesa: { startsWith: '31' } } } });
    const pesPag = await db.pagamento.findMany({ where: { data: { gte: ini, lt: fim }, empenho: { ano, contaDespesa: { startsWith: '31' } } }, select: { idOrigem: true, valor: true } });
    const pesRet = await db.retencaoLeitura.aggregate({ _sum: { total: true }, where: { pagamentoIdOrigem: { in: pesPag.map((x) => x.idOrigem) } } });
    const pesSaldo = (pesLiq._sum.valor ?? 0n) - pesPag.reduce((s, x) => s + x.valor, 0n) - (pesRet._sum.total ?? 0n);
    const emp = await db.empenho.aggregate({ _sum: { valor: true }, where: { data: { gte: ini, lt: fim } } });
    const add = (item: LinhaConciliacao['item'], p: bigint, c: bigint, obs: string, conta: boolean) =>
      linhas.push({ mes, item, portal: p.toString(), calculado: c.toString(), diferenca: (p - c).toString(), confere: p === c, observacao: conta ? obs : `${obs} (informativo)` });
    add('liquidado', portal.liquidado, liq._sum.valor ?? 0n, 'liquidações com data no mês, empenhos do exercício', true);
    const brl = (c: bigint) => (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    add('pago', portal.pago, liquidoPago + retido,
      `pagamentos com data no mês, empenhos do exercício: líquido ${brl(liquidoPago)} + descontos retidos ${brl(retido)}${semLeitura ? ` — descontos ainda não lidos em ${semLeitura} pagamento(s)` : ''}`, true);
    add('pago restos a pagar', 0n, rp._sum.valor ?? 0n, 'pagamentos com data no mês de empenhos de anos anteriores (líquido, só RP processados têm data); a aba Órgão do portal não inclui restos a pagar', false);
    add('pessoal sem pagamento publicado', 0n, pesSaldo, 'despesa com pessoal liquidada no mês menos líquido pago e descontos publicados; o portal não detalha o restante (provavelmente previdência do servidor e consignados) — ajuda a explicar a diferença do pago', false);
    add('empenhado', portal.empenhado, emp._sum.valor ?? 0n, 'portal desconta anulações; o detalhe não traz a data da anulação', false);
  }
  // a folha por servidor ainda não vem para o banco (fase posterior): a conferência é só da despesa
  const divergencias = linhas.filter((l) => !l.confere && !l.observacao.endsWith('(informativo)')).length;
  return { ano, linhas, divergencias };
}
