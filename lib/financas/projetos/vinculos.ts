// Projeto × contratos e despesa do portal: o que se pode ligar, ligar/desligar (com histórico) e ler o gasto.
// Só se oferece o que pertence às secretarias que participam do projeto: assim uma secretaria não puxa contrato de outra.
import type { DbPrefeitura } from '@/lib/financas/db';
import { brlCurto } from '@/lib/financas/dinheiro';
import { contratosSecretaria, nomesEmpenhoDoOrgao } from '@/lib/financas/auditoria/dados';
import { lerData } from '@/lib/financas/auditoria/acoes';
import { ehParteDe, filtroVisivel, projetoVisivel, type Ator } from './acoes';
import {
  alertasFinanceiros, somarExecucao, type AcaoLigada, type Alerta, type ContratoLigado, type EmpenhoFin, type FinanceiroProjeto,
} from './financeiro';
import { FASES_ABERTAS } from './regras';

const curto = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

// ------------------------------------------------------------------ o que se pode ligar

export interface CandidatoContrato {
  id: number; numero: string; ano: number; fornecedorNome: string; objeto: string; situacao: string; valorAtual: bigint; pago: bigint;
  fim: Date | null; certeza: 'alta' | 'media'; orgaoCod: string;
}
export interface CandidatoAcao { orgaoCod: string; orgaoEmpenho: string; programa: string; acao: string; empenhado: bigint; empenhos: number; ultimo: Date | null }

export async function candidatosVinculo(db: DbPrefeitura, orgaoCods: string[], hoje: Date) {
  const contratos = new Map<number, CandidatoContrato>();
  const acoes: CandidatoAcao[] = [];
  for (const cod of orgaoCods) {
    const cs = await contratosSecretaria(db, cod, hoje);
    for (const c of cs?.linhas ?? [])
      if (!contratos.has(c.id)) contratos.set(c.id, { id: c.id, numero: c.numero, ano: c.ano, fornecedorNome: c.fornecedorNome, objeto: c.objeto, situacao: c.situacao, valorAtual: c.valorAtual, pago: c.pago, fim: c.fim, certeza: c.certeza, orgaoCod: cod });
    const nomes = await nomesEmpenhoDoOrgao(db, cod, hoje);
    if (!nomes.length) continue;
    const g = await db.empenho.groupBy({ by: ['orgao', 'programa', 'projeto'], where: { orgao: { in: nomes } }, _sum: { valor: true, anulado: true }, _count: { _all: true }, _max: { data: true } });
    for (const x of g)
      acoes.push({ orgaoCod: cod, orgaoEmpenho: x.orgao, programa: x.programa, acao: x.projeto, empenhado: (x._sum.valor ?? 0n) - (x._sum.anulado ?? 0n), empenhos: x._count._all, ultimo: x._max.data });
  }
  acoes.sort((a, b) => (a.empenhado < b.empenhado ? 1 : a.empenhado > b.empenhado ? -1 : 0));
  return { contratos: [...contratos.values()].sort((a, b) => b.ano - a.ano || b.numero.localeCompare(a.numero)), acoes };
}

// ------------------------------------------------------------------ ligar e desligar

/** De quais secretarias participantes o ator pode ligar contrato e despesa: a gestão, de todas; a secretaria, só da própria. */
export const secretariasQuePodeLigar = (a: Ator, p: { secretarias: { orgaoCod: string }[] }) => p.secretarias.map((s) => s.orgaoCod).filter((c) => ehParteDe(a, c));

function conferirEncerrado(fase: string) {
  if (fase === 'concluido' || fase === 'cancelado') throw new Error('Projeto encerrado não pode ser alterado');
}
async function evento(db: DbPrefeitura, projetoId: number, por: string, texto: string) {
  await db.eventoProjeto.create({ data: { prefeituraId: '', projetoId, tipo: 'vinculo', texto: texto.slice(0, 3000), por } });
}
function podeMexer(a: Ator) {
  if (!a.gerir && !a.secretaria) throw new Error('Sem permissão para alterar projetos');
}

export async function vincularContrato(db: DbPrefeitura, a: Ator, projetoId: number, contratoId: number, hoje = new Date()) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirEncerrado(p.fase);
  if (await db.vinculoProjeto.findFirst({ where: { projetoId, tipo: 'contrato', contratoId } })) throw new Error('Este contrato já está ligado ao projeto');
  const cands = await candidatosVinculo(db, secretariasQuePodeLigar(a, p), hoje);
  const c = cands.contratos.find((x) => x.id === contratoId);
  if (!c) throw new Error(a.gerir ? 'Este contrato não tem despesa das secretarias do projeto. Inclua a secretaria parceira antes de ligá-lo' : 'Este contrato não tem despesa da sua secretaria: cada secretaria liga os próprios contratos');
  await db.vinculoProjeto.create({ data: { prefeituraId: '', projetoId, tipo: 'contrato', contratoId, orgaoCod: c.orgaoCod, criadoPor: a.nome } });
  await evento(db, projetoId, a.nome, `Contrato ${c.numero}/${c.ano} (${c.fornecedorNome}, ${brlCurto(c.valorAtual)}) ligado ao projeto${c.certeza === 'media' ? ' · ligação aos empenhos de certeza média' : ''}`);
}

export async function vincularAcao(db: DbPrefeitura, a: Ator, projetoId: number, d: { orgaoEmpenho: string; programa: string; acao: string; desde: string }, hoje = new Date()) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirEncerrado(p.fase);
  const desde = lerData(curto(d.desde, 20));
  if (!desde) throw new Error('Informe a partir de que data os empenhos desta ação contam para o projeto');
  const orgaoEmpenho = curto(d.orgaoEmpenho, 300), programa = curto(d.programa, 300), acao = curto(d.acao, 300);
  if (await db.vinculoProjeto.findFirst({ where: { projetoId, tipo: 'acao', orgaoEmpenho, programa, acao } })) throw new Error('Esta ação já está ligada ao projeto');
  const cands = await candidatosVinculo(db, secretariasQuePodeLigar(a, p), hoje);
  const c = cands.acoes.find((x) => x.orgaoEmpenho === orgaoEmpenho && x.programa === programa && x.acao === acao);
  if (!c) throw new Error(a.gerir ? 'Esta ação não pertence às secretarias do projeto' : 'Esta ação não é da sua secretaria: cada secretaria liga a própria despesa');
  await db.vinculoProjeto.create({ data: { prefeituraId: '', projetoId, tipo: 'acao', orgaoEmpenho, programa, acao, orgaoCod: c.orgaoCod, desde, criadoPor: a.nome } });
  await evento(db, projetoId, a.nome, `Ação orçamentária “${acao}” (programa ${programa}) ligada ao projeto, empenhos a partir de ${desde.toLocaleDateString('pt-BR')}`);
}

export async function desvincular(db: DbPrefeitura, a: Ator, projetoId: number, vinculoId: number, motivo: string) {
  podeMexer(a);
  const p = await projetoVisivel(db, a, projetoId);
  conferirEncerrado(p.fase);
  const v = await db.vinculoProjeto.findFirst({ where: { id: vinculoId, projetoId } });
  if (!v) throw new Error('Ligação não encontrada');
  if (!ehParteDe(a, v.orgaoCod)) throw new Error('Só a secretaria que fez parte desta ligação, o prefeito ou o controlador pode desfazê-la');
  const m = curto(motivo, 1000);
  if (!m) throw new Error('Diga por que a ligação foi desfeita');
  let rot = `ação “${v.acao}”`;
  if (v.tipo === 'contrato' && v.contratoId) {
    const c = await db.contrato.findFirst({ where: { id: v.contratoId } });
    rot = c ? `contrato ${c.numero}/${c.ano} (${c.fornecedorNome})` : `contrato #${v.contratoId}`;
  }
  await db.vinculoProjeto.deleteMany({ where: { id: v.id } });
  await evento(db, projetoId, a.nome, `Ligação com ${rot} desfeita: ${m}`);
}

// ------------------------------------------------------------------ ler o gasto

export interface ProjetoParaFin {
  id: number; fase: string; orcamento: bigint | null; inicioPrevisto: Date | null; fimPrevisto: Date | null; inicioReal: Date | null; avanco: number | null;
}
export type FinanceiroCompleto = FinanceiroProjeto & { alertas: Alerta[] };

const ESTE_VAZIO: FinanceiroProjeto = { contratos: [], acoes: [], contratado: 0n, execucao: somarExecucao([]) };

/**
 * Gasto de vários projetos de uma vez (poucas consultas, não uma por projeto).
 * `total` soma os empenhos de todos os projetos passados sem contar duas vezes o que dois projetos dividem.
 */
export async function carregarFinanceiro(db: DbPrefeitura, a: Ator, projetos: ProjetoParaFin[], hoje: Date) {
  const porProjeto = new Map<number, FinanceiroCompleto>();
  const vazio = (): FinanceiroCompleto => ({ ...ESTE_VAZIO, contratos: [], acoes: [], alertas: [] });
  if (!projetos.length) return { porProjeto, total: somarExecucao([]), comLigacao: 0 };
  const ids = projetos.map((p) => p.id);
  const vs = await db.vinculoProjeto.findMany({ where: { projetoId: { in: ids } }, orderBy: { id: 'asc' } });

  const contratoIds = [...new Set(vs.filter((v) => v.tipo === 'contrato' && v.contratoId).map((v) => v.contratoId!))];
  const acoesVs = vs.filter((v) => v.tipo === 'acao');
  const [contratos, ligs, empAcao] = await Promise.all([
    contratoIds.length ? db.contrato.findMany({ where: { id: { in: contratoIds } } }) : [],
    contratoIds.length ? db.ligacaoContratoEmpenho.findMany({ where: { contratoId: { in: contratoIds } } }) : [],
    acoesVs.length
      ? db.empenho.findMany({
        where: { OR: acoesVs.map((v) => ({ orgao: v.orgaoEmpenho, programa: v.programa, projeto: v.acao, ...(v.desde ? { data: { gte: v.desde } } : {}) })) },
        select: { id: true, orgao: true, programa: true, projeto: true, data: true },
      })
      : [],
  ]);
  const idsEmpenho = [...new Set([...ligs.map((l) => l.empenhoId), ...empAcao.map((e) => e.id)])];
  const emps = idsEmpenho.length
    ? await db.empenho.findMany({ where: { id: { in: idsEmpenho } }, select: { id: true, valor: true, anulado: true, aLiquidar: true, pagamentos: { select: { valor: true, data: true } } } })
    : [];
  const fin = new Map<number, EmpenhoFin>(emps.map((e) => [e.id, {
    id: e.id, valor: e.valor, anulado: e.anulado, aLiquidar: e.aLiquidar,
    pago: e.pagamentos.reduce((s, x) => s + x.valor, 0n),
    ultimoPagamento: e.pagamentos.reduce<Date | null>((m, x) => (!m || x.data > m ? x.data : m), null),
  }]));
  const dosEmpenhos = (ids2: number[]) => ids2.map((i) => fin.get(i)).filter((x): x is EmpenhoFin => !!x);

  // quem mais usa o mesmo contrato ou a mesma ação (só os projetos que o ator pode ver)
  const mesmos = await db.vinculoProjeto.findMany({
    where: {
      projetoId: { notIn: ids },
      projeto: { ...filtroVisivel(a), fase: { in: FASES_ABERTAS } },
      OR: [
        ...(contratoIds.length ? [{ tipo: 'contrato', contratoId: { in: contratoIds } }] : []),
        ...acoesVs.map((v) => ({ tipo: 'acao', orgaoEmpenho: v.orgaoEmpenho, programa: v.programa, acao: v.acao })),
      ],
    },
    include: { projeto: { select: { id: true, titulo: true } } },
  });
  // dentro da própria carteira passada: outro projeto com o mesmo vínculo
  const outros = (v: { projetoId: number; tipo: string; contratoId: number | null; orgaoEmpenho: string; programa: string; acao: string }) => {
    const igual = (x: typeof v) => (v.tipo === 'contrato' ? x.tipo === 'contrato' && x.contratoId === v.contratoId : x.tipo === 'acao' && x.orgaoEmpenho === v.orgaoEmpenho && x.programa === v.programa && x.acao === v.acao);
    const titulos = new Map(projetos.map((p) => [p.id, p.id]));
    const res = new Map<number, string>();
    for (const x of vs) if (x.projetoId !== v.projetoId && titulos.has(x.projetoId) && igual(x)) res.set(x.projetoId, '');
    for (const x of mesmos) if (igual(x)) res.set(x.projeto.id, x.projeto.titulo);
    return res;
  };
  const tituloDe = new Map<number, string>();
  if (vs.length) {
    const ps = await db.projeto.findMany({ where: { id: { in: ids }, ...filtroVisivel(a) }, select: { id: true, titulo: true } });
    for (const p of ps) tituloDe.set(p.id, p.titulo);
  }

  for (const p of projetos) {
    const f = vazio();
    const meus = vs.filter((v) => v.projetoId === p.id);
    const todos: EmpenhoFin[] = [];
    for (const v of meus) {
      const o = [...outros(v)].map(([id, t]) => ({ id, titulo: t || tituloDe.get(id) || `projeto #${id}` }));
      if (v.tipo === 'contrato') {
        const c = contratos.find((x) => x.id === v.contratoId);
        if (!c) continue;
        const ls = ligs.filter((l) => l.contratoId === c.id);
        const es = dosEmpenhos(ls.map((l) => l.empenhoId));
        todos.push(...es);
        f.contratos.push({
          vinculoId: v.id, id: c.id, numero: c.numero, ano: c.ano, fornecedorNome: c.fornecedorNome, objeto: c.objeto, situacao: c.situacao, fim: c.fim, valorAtual: c.valorAtual,
          certeza: ls.some((l) => l.certeza === 'alta') ? 'alta' : 'media', execucao: somarExecucao(es), outrosProjetos: o,
        } satisfies ContratoLigado);
      } else {
        const es = dosEmpenhos(empAcao.filter((e) => e.orgao === v.orgaoEmpenho && e.programa === v.programa && e.projeto === v.acao && (!v.desde || e.data >= v.desde)).map((e) => e.id));
        todos.push(...es);
        f.acoes.push({ vinculoId: v.id, programa: v.programa, acao: v.acao, orgaoEmpenho: v.orgaoEmpenho, desde: v.desde, execucao: somarExecucao(es), outrosProjetos: o } satisfies AcaoLigada);
      }
    }
    f.contratado = f.contratos.reduce((t, c) => t + c.valorAtual, 0n);
    f.execucao = somarExecucao(todos);
    f.alertas = alertasFinanceiros(p, f, hoje);
    porProjeto.set(p.id, f);
  }

  // total da carteira: cada empenho uma vez, mesmo que dois projetos o dividam
  const todosIds = new Set<number>();
  for (const p of projetos) {
    const meus = vs.filter((v) => v.projetoId === p.id);
    for (const v of meus) {
      if (v.tipo === 'contrato') ligs.filter((l) => l.contratoId === v.contratoId).forEach((l) => todosIds.add(l.empenhoId));
      else empAcao.filter((e) => e.orgao === v.orgaoEmpenho && e.programa === v.programa && e.projeto === v.acao && (!v.desde || e.data >= v.desde)).forEach((e) => todosIds.add(e.id));
    }
  }
  const comLigacao = projetos.filter((p) => vs.some((v) => v.projetoId === p.id)).length;
  return { porProjeto, total: somarExecucao(dosEmpenhos([...todosIds])), comLigacao };
}
