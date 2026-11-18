// Trava de conferência: o que o portal mostra × o RREO HOMOLOGADO no SICONFI, bimestre a bimestre.
// Nada é ajustado: quando não bate, a diferença fica registrada e aparece para quem usa o número.
import type { DbPrefeitura } from '@/lib/financas/db';
import { centavos, somar } from '@/lib/financas/dinheiro';
import { nomeFuncao } from '@/lib/financas/conectores/siconfi';
import { resumoReceita, type ContaReceita } from '@/lib/financas/painel/fiscal';

export interface LinhaConferencia {
  bimestre: number;
  item: string;
  rotulo: string;
  oficial: bigint;
  portal: bigint;
  diferenca: bigint;
  confere: boolean;
}

const NOME_GRUPO: Record<string, string> = {
  '31': 'Pessoal e encargos', '32': 'Juros da dívida', '33': 'Outras despesas correntes',
  '44': 'Investimentos', '45': 'Inversões financeiras', '46': 'Amortização da dívida',
};

export interface PortalDoBimestre {
  bimestre: number;
  receita: bigint | null;
  orgaos: { empenhado: bigint; liquidado: bigint; pago: bigint } | null;
  /** liquidado acumulado por natureza (código) — null se faltar algum mês */
  naturezas: Map<string, bigint> | null;
  /** liquidado acumulado por função (nome normalizado) — null se faltar algum mês */
  funcoes: Map<string, bigint> | null;
}

/** Compara um bimestre. `ind` = indicadores do RREO daquele bimestre (chave -> valor). Só compara o que existe dos dois lados. */
export function compararBimestre(ind: Map<string, string>, p: PortalDoBimestre): LinhaConferencia[] {
  const out: LinhaConferencia[] = [];
  const add = (item: string, rotulo: string, oficial: bigint, portal: bigint) =>
    out.push({ bimestre: p.bimestre, item, rotulo, oficial, portal, diferenca: portal - oficial, confere: portal === oficial });
  const of = (k: string) => (ind.has(k) ? centavos(ind.get(k)!) : null);

  const rec = of('rec_realizada');
  if (rec !== null && p.receita !== null) add('receita', 'Receita realizada', rec, p.receita);
  if (p.orgaos) {
    for (const [k, chave, rotulo] of [['empenhado', 'desp_empenhada', 'Despesa empenhada'], ['liquidado', 'desp_liquidada', 'Despesa liquidada'], ['pago', 'desp_paga', 'Despesa paga']] as const) {
      const v = of(chave);
      if (v !== null) add(k, rotulo, v, p.orgaos[k]);
    }
  }
  const liq = of('desp_liquidada');
  if (p.naturezas) {
    if (liq !== null) add('natureza', 'Liquidado: total por natureza', liq, somar(p.naturezas.values()));
    for (const [g, nome] of Object.entries(NOME_GRUPO)) {
      const v = of(`grupo_liq:${g}`);
      if (v === null) continue;
      const portal = somar([...p.naturezas].filter(([cod]) => cod.startsWith(g)).map(([, x]) => x));
      add(`grupo:${g}`, `Liquidado: ${nome}`, v, portal);
    }
  }
  if (p.funcoes) {
    if (liq !== null) add('funcao', 'Liquidado: total por função', liq, somar(p.funcoes.values()));
    const oficiais = [...ind.keys()].filter((k) => k.startsWith('funcao_liq:')).map((k) => k.slice('funcao_liq:'.length));
    if (oficiais.length) {
      for (const f of new Set([...oficiais, ...p.funcoes.keys()])) {
        const v = of(`funcao_liq:${f}`) ?? BigInt(0);
        add(`funcao:${f}`, `Liquidado: função ${f.toLowerCase()}`, v, p.funcoes.get(f) ?? BigInt(0));
      }
    }
  }
  return out;
}

/** Soma por mês só vale quando todos os meses de 1 até `ate` foram coletados. */
function temTodosOsMeses(meses: Iterable<number>, ate: number) {
  const s = new Set(meses);
  for (let m = 1; m <= ate; m++) if (!s.has(m)) return false;
  return true;
}

/** Confere todos os bimestres homologados do ano e grava o resultado. Devolve as linhas e quantas não conferem. */
export async function conferirComOficial(db: DbPrefeitura, prefeituraId: string, ano: number, coletaId: number) {
  const ind = await db.indicadorFiscal.findMany({ where: { ano, relatorio: 'RREO' } });
  const homologados = [...new Set(ind.filter((i) => i.chave === 'homologado' && i.valor === '1').map((i) => i.periodo))].sort((a, b) => a - b);
  const [orgaos, naturezas, funcoes] = await Promise.all([
    db.despesaOrgaoMes.findMany({ where: { ano, mes: { gt: 0 } }, select: { mes: true, empenhado: true, liquidado: true, pago: true } }),
    db.despesaNaturezaMes.findMany({ where: { ano, mes: { gt: 0 } }, select: { mes: true, naturezaCod: true, liquidado: true } }),
    db.despesaFuncaoMes.findMany({ where: { ano, mes: { gt: 0 } }, select: { mes: true, funcaoNome: true, liquidado: true } }),
  ]);

  const linhas: LinhaConferencia[] = [];
  for (const b of homologados) {
    const ate = b * 2;
    const contas: ContaReceita[] = await db.receitaContaMes.findMany({ where: { ano, mes: ate } });
    const naoAte = <T extends { mes: number }>(xs: T[]) => xs.filter((x) => x.mes <= ate);
    const org = naoAte(orgaos), nat = naoAte(naturezas), fun = naoAte(funcoes);
    const acumular = <T extends { liquidado: bigint }>(xs: T[], chave: (x: T) => string) => {
      const m = new Map<string, bigint>();
      for (const x of xs) m.set(chave(x), (m.get(chave(x)) ?? BigInt(0)) + x.liquidado);
      return m;
    };
    linhas.push(...compararBimestre(new Map(ind.filter((i) => i.periodo === b).map((i) => [i.chave, i.valor])), {
      bimestre: b,
      receita: resumoReceita(ano, ate, contas)?.liquida.arrecadado ?? null,
      orgaos: temTodosOsMeses(org.map((o) => o.mes), ate)
        ? { empenhado: somar(org.map((o) => o.empenhado)), liquidado: somar(org.map((o) => o.liquidado)), pago: somar(org.map((o) => o.pago)) }
        : null,
      naturezas: temTodosOsMeses(nat.map((x) => x.mes), ate) ? acumular(nat, (x) => x.naturezaCod) : null,
      funcoes: temTodosOsMeses(fun.map((x) => x.mes), ate) ? acumular(fun, (x) => nomeFuncao(x.funcaoNome)) : null,
    }));
  }

  await db.$transaction(async (tx) => {
    await tx.conferenciaOficial.deleteMany({ where: { ano } });
    if (linhas.length) await tx.conferenciaOficial.createMany({ data: linhas.map((l) => ({ ...l, ano, prefeituraId, coletaId })) });
  }, { timeout: 60_000, maxWait: 30_000 });
  return { bimestres: homologados, itens: linhas.length, divergencias: linhas.filter((l) => !l.confere).length };
}

/** No mês coletado agora, natureza e função têm de somar o mesmo que os órgãos (são três visões do mesmo dado). */
export async function conferirVisoes(db: DbPrefeitura, ano: number, meses: number[]) {
  const dif: string[] = [];
  for (const mes of meses) {
    const [o, n, f] = await Promise.all([
      db.despesaOrgaoMes.aggregate({ where: { ano, mes }, _sum: { empenhado: true, liquidado: true, pago: true }, _count: { _all: true } }),
      db.despesaNaturezaMes.aggregate({ where: { ano, mes }, _sum: { empenhado: true, liquidado: true, pago: true }, _count: { _all: true } }),
      db.despesaFuncaoMes.aggregate({ where: { ano, mes }, _sum: { empenhado: true, liquidado: true, pago: true }, _count: { _all: true } }),
    ]);
    if (!o._count._all) continue;
    for (const [nome, v] of [['natureza', n], ['função', f]] as const) {
      if (!v._count._all) continue;
      for (const k of ['empenhado', 'liquidado', 'pago'] as const)
        if ((v._sum[k] ?? BigInt(0)) !== (o._sum[k] ?? BigInt(0))) dif.push(`${ano}/${mes} ${k}: ${nome} difere dos órgãos em ${(v._sum[k] ?? BigInt(0)) - (o._sum[k] ?? BigInt(0))} centavos`);
    }
  }
  return dif;
}
