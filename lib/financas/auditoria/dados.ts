// Auditoria por secretaria: busca no banco (cliente preso à prefeitura) a ficha de cada secretaria.
import type { DbPrefeitura } from '@/lib/financas/db';
import { brl } from '@/lib/financas/dinheiro';
import { ehLegislativo, razaoBp, tempoDecorridoBp } from '@/lib/financas/painel/fiscal';
import { REGRAS } from '@/lib/financas/regras/motor';
import { resumoPontos, sugerirOrgao, sugestoesSecretaria, type ResumoPontos, type Sugestao } from './regras';

const DIA = 86400000;

async function anoComDados(db: DbPrefeitura, hoje: Date) {
  const r = await db.despesaOrgaoMes.findFirst({ where: { mes: 0 }, orderBy: { ano: 'desc' }, select: { ano: true } });
  return r?.ano ?? hoje.getFullYear();
}

/** Órgãos do Executivo no ano (a Câmara fica de fora: o prefeito não cobra o Legislativo). */
export async function orgaosExecutivo(db: DbPrefeitura, hoje: Date) {
  const ano = await anoComDados(db, hoje);
  const os = await db.despesaOrgaoMes.findMany({ where: { ano, mes: 0 }, orderBy: { orgaoCod: 'asc' } });
  return { ano, orgaos: os.filter((o) => !ehLegislativo(o.orgaoNome)) };
}

/** Nome do órgão como vem no empenho -> código do órgão (memoizado por chamada). */
async function mapaOrgaoEmpenho(db: DbPrefeitura, orgaos: { orgaoCod: string; orgaoNome: string }[]) {
  const nomes = await db.empenho.findMany({ distinct: ['orgao'], select: { orgao: true } });
  return new Map(nomes.map((n) => [n.orgao, sugerirOrgao(n.orgao, orgaos)]));
}

export interface LinhaSecretaria {
  orgaoCod: string; orgaoNome: string; responsavel: string;
  dotAtual: bigint; empenhado: bigint; empenhadoBp: bigint | null; saldo: bigint;
  pontos: ResumoPontos; ultimaReuniao: Date | null;
}

export async function visaoGeral(db: DbPrefeitura, hoje: Date) {
  const { ano, orgaos } = await orgaosExecutivo(db, hoje);
  const [pontos, resp, reun] = await Promise.all([
    db.pontoAuditoria.findMany({ select: { orgaoCod: true, status: true, prazo: true } }),
    db.responsavelSecretaria.findMany(),
    db.reuniaoSecretaria.findMany({ orderBy: { quando: 'desc' } }),
  ]);
  const linhas: LinhaSecretaria[] = orgaos.map((o) => ({
    orgaoCod: o.orgaoCod, orgaoNome: o.orgaoNome,
    responsavel: resp.find((r) => r.orgaoCod === o.orgaoCod)?.nome ?? '',
    dotAtual: o.dotAtual, empenhado: o.empenhado, empenhadoBp: razaoBp(o.empenhado, o.dotAtual), saldo: o.dotAtual - o.empenhado,
    pontos: resumoPontos(pontos.filter((p) => p.orgaoCod === o.orgaoCod), hoje),
    ultimaReuniao: reun.find((r) => r.orgaoCod === o.orgaoCod)?.quando ?? null,
  }));
  return { ano, tempoBp: tempoDecorridoBp(ano, hoje), linhas, total: resumoPontos(pontos, hoje) };
}

export async function fichaSecretaria(db: DbPrefeitura, orgaoCod: string, hoje: Date, diasContrato = 90) {
  const { ano, orgaos } = await orgaosExecutivo(db, hoje);
  const o = orgaos.find((x) => x.orgaoCod === orgaoCod);
  if (!o) return null;

  // empenhos do órgão (pelo nome) -> contratos ligados e apontamentos
  const mapa = await mapaOrgaoEmpenho(db, orgaos);
  const nomesDoOrgao = [...mapa].filter(([, cod]) => cod === orgaoCod).map(([nome]) => nome);
  const empIds = (await db.empenho.findMany({ where: { orgao: { in: nomesDoOrgao } }, select: { id: true } })).map((e) => e.id);
  // só ligações de certeza alta: a de certeza média pode pôr na secretaria um contrato de outra área
  const ligs = empIds.length ? await db.ligacaoContratoEmpenho.findMany({ where: { empenhoId: { in: empIds }, certeza: 'alta' } }) : [];
  const contratoIds = [...new Set(ligs.map((l) => l.contratoId))];
  const ate = new Date(hoje.getTime() + diasContrato * DIA);
  const vencendo = contratoIds.length
    ? await db.contrato.findMany({ where: { id: { in: contratoIds }, fim: { gte: hoje, lte: ate }, situacao: { contains: 'Vigente' } }, orderBy: { fim: 'asc' } })
    : [];

  const apont = await db.apontamento.findMany({ where: { status: { in: ['para_analise', 'procedente'] } }, orderBy: { id: 'desc' } });
  const empSet = new Set(empIds.map(String)), ctrSet = new Set(contratoIds.map(String));
  const apontDoOrgao = apont.filter((a) => (a.entidade === 'empenho' && empSet.has(a.entidadeId)) || (a.entidade === 'contrato' && ctrSet.has(a.entidadeId)));

  const rp = await db.restoPagar.findMany({ where: { orgaoCod, exercicio: ano }, select: { inscrito: true, anulado: true, pago: true } });
  const rpPendente = rp.reduce((s, r) => s + (r.inscrito - r.anulado - r.pago), BigInt(0));

  const [pontos, responsavel, reunioes] = await Promise.all([
    db.pontoAuditoria.findMany({ where: { orgaoCod }, include: { eventos: { orderBy: { quando: 'asc' } } }, orderBy: { criadoEm: 'desc' } }),
    db.responsavelSecretaria.findFirst({ where: { orgaoCod } }),
    db.reuniaoSecretaria.findMany({ where: { orgaoCod }, orderBy: { quando: 'desc' }, take: 10 }),
  ]);

  const saldo = o.dotAtual - o.empenhado;
  const usados = new Set(pontos.map((p) => p.origemRef).filter(Boolean));
  const sugestoes: Sugestao[] = sugestoesSecretaria({
    orgaoCod, ano, saldoDotacao: saldo,
    saldoTexto: `Dotação atualizada ${brl(o.dotAtual)}, empenhado ${brl(o.empenhado)} (diferença ${brl(saldo)}).`,
    // vira sugestão de cobrança só o que vence em até 30 dias; até 90 dias aparece no número da ficha
    contratosVencendo: vencendo
      .map((c) => ({ id: c.id, numero: c.numero, ano: c.ano, fornecedor: c.fornecedorNome, fim: c.fim!, dias: Math.ceil((c.fim!.getTime() - hoje.getTime()) / DIA) }))
      .filter((c) => c.dias <= 30),
    apontamentos: apontDoOrgao.map((a) => {
      const r = REGRAS.find((x) => x.codigo === a.regraCodigo);
      return { id: a.id, regraCodigo: a.regraCodigo, titulo: (r?.titulo ?? '') + (a.status === 'para_analise' ? ' (ainda em análise)' : ''), resumo: a.resumo, baseLegal: r?.baseLegal ?? '' };
    }),
  }).filter((s) => !usados.has(s.ref));

  return {
    ano, tempoBp: tempoDecorridoBp(ano, hoje), orgao: o, saldo,
    empenhadoBp: razaoBp(o.empenhado, o.dotAtual),
    liquidadoNaoPago: o.liquidado - o.pago,
    rpPendente, contratosVinculados: contratoIds.length, vencendo,
    pontos, responsavel, reunioes, sugestoes, resumo: resumoPontos(pontos, hoje),
    ultimaReuniao: reunioes[0]?.quando ?? null,
  };
}
export type Ficha = NonNullable<Awaited<ReturnType<typeof fichaSecretaria>>>;
