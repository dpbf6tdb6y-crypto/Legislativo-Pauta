// Fase B: projeto × contratos e despesa do portal (ligação, soma sem repetir empenho, alertas, auditoria).
import { beforeAll, describe, expect, it } from 'vitest';
import { dbDa, prismaSistema } from '@/lib/financas/db';
import { atorDe, criarProjeto, mudarFase } from '@/lib/financas/projetos/acoes';
import { carteira, projetosDaSecretaria, sugestoesProjetos } from '@/lib/financas/projetos/dados';
import { alertasFinanceiros, nivelMaximo, somarExecucao, type EmpenhoFin, type FinanceiroProjeto } from '@/lib/financas/projetos/financeiro';
import { candidatosVinculo, carregarFinanceiro, desvincular, vincularAcao, vincularContrato } from '@/lib/financas/projetos/vinculos';

const d = (s: string) => { const [a, m, dia] = s.split('-').map(Number); return new Date(a, m - 1, dia, 12); };
const HOJE = d('2026-11-24');
const R = (reais: number) => BigInt(Math.round(reais * 100));

// ---------------------------------------------------------------- regras puras
const emp = (id: number, valor: number, pago: number, o: Partial<EmpenhoFin> = {}): EmpenhoFin => ({ id, valor: R(valor), anulado: 0n, aLiquidar: 0n, pago: R(pago), ultimoPagamento: null, ...o });
const vazio = (o: Partial<FinanceiroProjeto> = {}): FinanceiroProjeto => ({ contratos: [], acoes: [], contratado: 0n, execucao: somarExecucao([]), ...o });
const contratoFin = (o: Record<string, unknown> = {}) => ({
  vinculoId: 1, id: 7, numero: '0252', ano: 2025, fornecedorNome: 'Construtora X', objeto: 'Obra', situacao: 'Vigente', fim: d('2027-12-31'), valorAtual: R(1000),
  certeza: 'alta' as const, execucao: somarExecucao([]), outrosProjetos: [], ...o,
});
const base = { fase: 'execucao', orcamento: R(1000), inicioPrevisto: d('2026-01-01'), fimPrevisto: d('2027-06-30'), inicioReal: d('2026-01-10'), avanco: 50 };
const cod = (as: { codigo: string }[]) => as.map((a) => a.codigo.split(':')[0]);

// ---------------------------------------------------------------- com banco
const P = 'gasto-teste', O = 'gasto-outra';
const gestor = atorDe({ nome: 'Prefeito', perfil: 'prefeito', orgaoCod: '' });
const sec09 = atorDe({ nome: 'Ana (Educação)', perfil: 'secretaria', orgaoCod: '09' });
const sec12 = atorDe({ nome: 'Beto (Saúde)', perfil: 'secretaria', orgaoCod: '12' });
const sec15 = atorDe({ nome: 'Carla (Obras)', perfil: 'secretaria', orgaoCod: '15' });
const auditor = atorDe({ nome: 'Auditor', perfil: 'auditor', orgaoCod: '' });

const EDU = 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', SAU = 'SECRETARIA MUNICIPAL DE SAÚDE', OBR = 'SECRETARIA MUNICIPAL DE OBRAS';
const PROG = 'DESENVOLVIMENTO DA EDUCAÇÃO', ACAO = 'CONSTRUÇÃO DE ESCOLAS';
let n = 0;

async function criarEmpenho(pref: string, o: { orgao: string; programa: string; projeto: string; data: string; valor: number; aLiquidar?: number; pagos?: [string, number][] }) {
  const db = dbDa(pref);
  n++;
  const e = await db.empenho.create({
    data: {
      prefeituraId: '', idOrigem: n, numero: String(n).padStart(4, '0'), data: d(o.data), ano: Number(o.data.slice(0, 4)), tipo: 'O', orgao: o.orgao, unidade: '', credorDoc: '11', credorNome: 'Credor',
      processo: '', natureza: '', contaDespesa: '', fonte: '', funcao: '', subfuncao: '', programa: o.programa, projeto: o.projeto, descricao: '', valor: R(o.valor), anulado: 0n,
      aLiquidar: R(o.aLiquidar ?? 0), aPagar: 0n,
    },
  });
  for (const [i, [data, v]] of (o.pagos ?? []).entries())
    await db.pagamento.create({ data: { prefeituraId: '', idOrigem: n * 100 + i, empenhoId: e.id, numero: `P${n}-${i}`, data: d(data), valor: R(v) } });
  return e;
}
async function criarContrato(pref: string, numero: string, fornecedor: string, valorAtual: number, fim: string, empenhos: { id: number; certeza: string }[]) {
  const db = dbDa(pref);
  n++;
  const c = await db.contrato.create({
    data: {
      prefeituraId: '', idOrigem: n, numero, ano: 2025, fim: d(fim), publicacaoVeiculo: '', objeto: `Objeto do contrato ${numero}`, tipo: 'Obra', situacao: 'Vigente', valorInicial: R(valorAtual), valorAtual: R(valorAtual),
      processo: '', modalidade: '', fornecedorDoc: `doc${numero}`, fornecedorNome: fornecedor,
    },
  });
  for (const l of empenhos) await db.ligacaoContratoEmpenho.create({ data: { prefeituraId: '', contratoId: c.id, empenhoId: l.id, certeza: l.certeza, motivo: 'teste' } });
  return c;
}

let contrato1 = 0, contrato2 = 0, projetoId = 0;
const dadosProjeto = { titulo: 'Escola integrada', tipo: 'obra', orcamento: '1500000,00', inicioPrevisto: '2026-01-01', fimPrevisto: '2027-06-30' };

beforeAll(async () => {
  for (const id of [P, O]) await prismaSistema.prefeitura.upsert({ where: { id }, create: { id, nome: id, uf: 'MG', ibge: 8, conector: 'arquivo' }, update: {} });
  const linha = (pref: string, orgaoCod: string, orgaoNome: string) =>
    ({ prefeituraId: pref, ano: 2026, mes: 0, orgaoCod, orgaoNome, dotInicial: 100n, dotAtual: 100n, empenhado: 10n, liquidado: 10n, pago: 0n, coletaId: 0 });
  await dbDa(P).despesaOrgaoMes.createMany({ data: [linha(P, '09', EDU), linha(P, '12', SAU), linha(P, '15', OBR)] });
  await dbDa(O).despesaOrgaoMes.createMany({ data: [linha(O, '09', EDU)] });

  const e1 = await criarEmpenho(P, { orgao: EDU, programa: PROG, projeto: ACAO, data: '2026-02-10', valor: 1_000_000, aLiquidar: 400_000, pagos: [['2026-04-01', 300_000]] });
  await criarEmpenho(P, { orgao: EDU, programa: PROG, projeto: ACAO, data: '2026-03-10', valor: 500_000, pagos: [['2026-05-01', 500_000]] });
  await criarEmpenho(P, { orgao: EDU, programa: PROG, projeto: ACAO, data: '2024-05-01', valor: 200_000 }); // antes da data de corte
  await criarEmpenho(P, { orgao: SAU, programa: PROG, projeto: ACAO, data: '2026-03-10', valor: 70_000 }); // ação de mesmo nome em OUTRO órgão
  const e5 = await criarEmpenho(P, { orgao: EDU, programa: PROG, projeto: 'MERENDA ESCOLAR', data: '2026-06-01', valor: 100_000, aLiquidar: 50_000, pagos: [['2026-07-01', 40_000]] });
  const eObras = await criarEmpenho(P, { orgao: OBR, programa: 'INFRAESTRUTURA', projeto: 'PAVIMENTAÇÃO', data: '2026-06-01', valor: 90_000 });
  contrato1 = (await criarContrato(P, '0252', 'Construtora X', 1_200_000, '2026-12-15', [{ id: e1.id, certeza: 'alta' }, { id: e5.id, certeza: 'media' }])).id;
  contrato2 = (await criarContrato(P, '0300', 'Pavimentadora Y', 90_000, '2027-12-31', [{ id: eObras.id, certeza: 'alta' }])).id;
});

describe('o que se pode ligar', () => {
  it('só contratos e ações das secretarias do projeto', async () => {
    const db = dbDa(P);
    const edu = await candidatosVinculo(db, ['09'], HOJE);
    expect(edu.contratos.map((c) => c.id)).toEqual([contrato1]);
    expect(edu.contratos[0].certeza).toBe('alta');
    // a ação aparece uma vez por órgão: a da Saúde, de mesmo nome, não se mistura com a da Educação
    expect(edu.acoes.filter((a) => a.acao === ACAO)).toHaveLength(1);
    expect(edu.acoes.find((a) => a.acao === ACAO)).toMatchObject({ orgaoEmpenho: EDU, empenhos: 3, empenhado: R(1_700_000) });
    const obras = await candidatosVinculo(db, ['15'], HOJE);
    expect(obras.contratos.map((c) => c.id)).toEqual([contrato2]);
    expect((await candidatosVinculo(db, ['09', '15'], HOJE)).contratos.map((c) => c.id).sort()).toEqual([contrato1, contrato2].sort());
  });
});

describe('ligar e desligar', () => {
  it('liga contrato e ação, não aceita repetição nem o que é de outra secretaria, e registra no histórico', async () => {
    const db = dbDa(P);
    const p = await criarProjeto(db, gestor, { ...dadosProjeto, secretariaLider: '09', parceiras: ['12'] });
    projetoId = p.id;
    await mudarFase(db, gestor, projetoId, 'aprovado');
    await mudarFase(db, gestor, projetoId, 'execucao');

    await expect(vincularContrato(db, auditor, projetoId, contrato1, HOJE)).rejects.toThrow(/Sem permissão/);
    await expect(vincularContrato(db, sec15, projetoId, contrato1, HOJE)).rejects.toThrow(/Projeto não encontrado/); // não participa do projeto
    await expect(vincularContrato(db, gestor, projetoId, contrato2, HOJE)).rejects.toThrow(/não tem despesa das secretarias do projeto/);
    const atualizadoAntes = (await db.projeto.findFirst({ where: { id: projetoId } }))!.atualizadoEm.getTime();
    await vincularContrato(db, sec09, projetoId, contrato1, HOJE);
    await expect(vincularContrato(db, gestor, projetoId, contrato1, HOJE)).rejects.toThrow(/já está ligado/);

    const acao = { orgaoEmpenho: EDU, programa: PROG, acao: ACAO };
    await expect(vincularAcao(db, gestor, projetoId, { ...acao, desde: '' }, HOJE)).rejects.toThrow(/a partir de que data/);
    await expect(vincularAcao(db, gestor, projetoId, { ...acao, acao: 'INVENTADA', desde: '2026-01-01' }, HOJE)).rejects.toThrow(/não pertence/);
    await expect(vincularAcao(db, gestor, projetoId, { ...acao, orgaoEmpenho: OBR, desde: '2026-01-01' }, HOJE)).rejects.toThrow(/não pertence/);
    // a Saúde participa, mas a despesa é da Educação: cada secretaria liga só a própria
    await expect(vincularAcao(db, sec12, projetoId, { ...acao, desde: '2026-01-01' }, HOJE)).rejects.toThrow(/não é da sua secretaria/);
    await vincularAcao(db, sec09, projetoId, { ...acao, desde: '2026-01-01' }, HOJE);
    await expect(vincularAcao(db, gestor, projetoId, { ...acao, desde: '2026-01-01' }, HOJE)).rejects.toThrow(/já está ligada/);

    // ligar despesa não é notícia de andamento: não pode esconder o aviso de "sem atualização"
    expect((await db.projeto.findFirst({ where: { id: projetoId } }))!.atualizadoEm.getTime()).toBe(atualizadoAntes);
    const ev = await db.eventoProjeto.findMany({ where: { projetoId, tipo: 'vinculo' }, orderBy: { id: 'asc' } });
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ por: 'Ana (Educação)' });
    expect(ev[0].texto).toMatch(/Contrato 0252\/2025 \(Construtora X/);
    expect(ev[1].texto).toMatch(/CONSTRUÇÃO DE ESCOLAS/);
  });

  it('o total do projeto não repete o empenho que o contrato e a ação dividem', async () => {
    const db = dbDa(P);
    const f = (await fichaProjetoFin(db, gestor, projetoId))!;
    // contrato: e1 + e5 | ação desde 2026: e1 + e2 (a de 2024 e a da Saúde ficam de fora) | união: e1, e2, e5
    expect(f.contratos[0].execucao).toMatchObject({ empenhos: 2, empenhado: R(1_100_000), pago: R(340_000) });
    expect(f.acoes[0].execucao).toMatchObject({ empenhos: 2, empenhado: R(1_500_000), pago: R(800_000) });
    expect(f.execucao).toMatchObject({ empenhos: 3, empenhado: R(1_600_000), liquidado: R(1_150_000), pago: R(840_000) });
    expect(f.contratado).toBe(R(1_200_000));
    expect(f.contratos[0].certeza).toBe('alta');
  });

  it('o orçamento de 1,5 mi estourado pelo empenhado gera alerta grave; o contrato que vence antes do projeto, atenção', async () => {
    const f = (await fichaProjetoFin(dbDa(P), gestor, projetoId))!;
    expect(f.alertas.find((a) => a.codigo === 'estouro')).toMatchObject({ nivel: 'alto' });
    expect(f.alertas.find((a) => a.codigo.startsWith('contrato_curto'))).toMatchObject({ nivel: 'medio' }); // vence em 15/12/2026, projeto vai até 30/06/2027
  });

  it('quem não participa não vê o projeto nem o gasto; outra prefeitura não enxerga nada', async () => {
    const db = dbDa(P);
    const ps = await carteira(db, sec15, HOJE);
    expect(ps).toHaveLength(0);
    const fora = await carregarFinanceiro(dbDa(O), gestor, [{ id: projetoId, fase: 'execucao', orcamento: null, inicioPrevisto: null, fimPrevisto: null, inicioReal: null, avanco: null }], HOJE);
    expect(fora.porProjeto.get(projetoId)!.contratos).toEqual([]);
    expect(fora.total.empenhado).toBe(0n);
  });

  it('um contrato dividido com outro projeto aparece como aviso, sem vazar o título para quem não vê o outro', async () => {
    const db = dbDa(P);
    const p2 = await criarProjeto(db, gestor, { ...dadosProjeto, titulo: 'Reforma da cozinha escolar', secretariaLider: '09' });
    await vincularContrato(db, gestor, p2.id, contrato1, HOJE);
    const vistoPeloPrefeito = (await fichaProjetoFin(db, gestor, projetoId))!;
    expect(vistoPeloPrefeito.contratos[0].outrosProjetos).toEqual([{ id: p2.id, titulo: 'Reforma da cozinha escolar' }]);
    expect(vistoPeloPrefeito.alertas.some((a) => a.codigo.startsWith('compartilhado'))).toBe(true);
    // a Saúde participa do primeiro projeto, mas não do segundo: não pode saber o título dele
    const vistoPelaSaude = await carregarFinanceiro(db, sec12, [{ id: projetoId, fase: 'execucao', orcamento: R(1_500_000), inicioPrevisto: null, fimPrevisto: null, inicioReal: null, avanco: null }], HOJE);
    expect(vistoPelaSaude.porProjeto.get(projetoId)!.contratos[0].outrosProjetos).toEqual([]);
    // o total da carteira conta o contrato uma vez só
    const dois = await carregarFinanceiro(db, gestor, [
      { id: projetoId, fase: 'execucao', orcamento: R(1_500_000), inicioPrevisto: null, fimPrevisto: null, inicioReal: null, avanco: null },
      { id: p2.id, fase: 'ideia', orcamento: null, inicioPrevisto: null, fimPrevisto: null, inicioReal: null, avanco: null },
    ], HOJE);
    expect(dois.total.empenhado).toBe(R(1_600_000));
    expect(dois.comLigacao).toBe(2);
  });

  it('desligar exige o motivo, vale só para o projeto certo e fica no histórico', async () => {
    const db = dbDa(P);
    const v = (await db.vinculoProjeto.findFirst({ where: { projetoId, tipo: 'acao' } }))!;
    await expect(desvincular(db, gestor, projetoId, v.id, '  ')).rejects.toThrow(/por que/);
    await expect(desvincular(db, gestor, projetoId + 999, v.id, 'x')).rejects.toThrow(/Projeto não encontrado/);
    await desvincular(db, gestor, projetoId, v.id, 'Ação escolhida errada');
    expect(await db.vinculoProjeto.count({ where: { projetoId, tipo: 'acao' } })).toBe(0);
    const ev = await db.eventoProjeto.findFirst({ where: { projetoId, tipo: 'vinculo' }, orderBy: { id: 'desc' } });
    expect(ev!.texto).toMatch(/Ligação com ação “CONSTRUÇÃO DE ESCOLAS” desfeita: Ação escolhida errada/);
    const f = (await fichaProjetoFin(db, gestor, projetoId))!;
    expect(f.execucao).toMatchObject({ empenhos: 2, empenhado: R(1_100_000) }); // só o contrato
  });

  it('projeto encerrado não aceita mudança de ligação', async () => {
    const db = dbDa(P);
    const p = await criarProjeto(db, gestor, { ...dadosProjeto, titulo: 'Projeto engavetado', secretariaLider: '09' });
    await mudarFase(db, gestor, p.id, 'cancelado', 'sem verba');
    await expect(vincularContrato(db, gestor, p.id, contrato1, HOJE)).rejects.toThrow(/encerrado/);
  });
});

describe('auditoria por secretaria', () => {
  it('projeto atrasado vira assunto para cobrar da líder, não da parceira', async () => {
    const db = dbDa(P);
    const atrasado = await criarProjeto(db, gestor, { titulo: 'Quadra coberta', tipo: 'obra', orcamento: '500000,00', inicioPrevisto: '2026-01-01', fimPrevisto: '2026-10-01', secretariaLider: '09', parceiras: ['12'] });
    await mudarFase(db, gestor, atrasado.id, 'aprovado');
    const edu = await projetosDaSecretaria(db, '09', HOJE);
    const sau = await projetosDaSecretaria(db, '12', HOJE);
    expect(edu.find((x) => x.titulo === 'Quadra coberta')).toMatchObject({ papel: 'lider', saude: 'atrasado' });
    expect(sau.find((x) => x.titulo === 'Quadra coberta')).toMatchObject({ papel: 'parceira' });
    const sEdu = sugestoesProjetos(edu), sSau = sugestoesProjetos(sau);
    expect(sEdu.some((s) => s.titulo.includes('Quadra coberta') && /atrasado/.test(s.titulo))).toBe(true);
    expect(sSau.some((s) => s.titulo.includes('Quadra coberta'))).toBe(false);
    // alerta de atenção (contrato que vence antes do projeto) não vira cobrança; só o grave
    expect(sEdu.some((s) => s.titulo.includes('Escola integrada'))).toBe(false);
    const grave = { id: 99, titulo: 'Ponte', fase: 'execucao', papel: 'lider', saude: 'no_prazo' as const, motivos: [], diasAtraso: 0, avanco: 10, fimPrevisto: null, parceiras: [], alertas: [{ codigo: 'estouro', nivel: 'alto' as const, texto: 'Empenhado passa do orçamento' }] };
    expect(sugestoesProjetos([grave])).toMatchObject([{ ref: 'sugestao:projeto:99:fin:estouro', titulo: 'Projeto “Ponte”: alerta de gasto' }]);
    // a referência é estável: cobrar duas vezes o mesmo atraso não duplica
    expect(sugestoesProjetos(await projetosDaSecretaria(db, '09', HOJE)).map((s) => s.ref)).toEqual(sEdu.map((s) => s.ref));
    expect(new Set(sEdu.map((s) => s.ref)).size).toBe(sEdu.length);
  });
});

// carteira + gasto de um projeto só, como a ficha faz
async function fichaProjetoFin(db: ReturnType<typeof dbDa>, ator: ReturnType<typeof atorDe>, id: number) {
  const ps = await carteira(db, ator, HOJE);
  const p = ps.find((x) => x.id === id);
  if (!p) return null;
  const r = await carregarFinanceiro(db, ator, [{ id: p.id, fase: p.fase, orcamento: p.orcamento, inicioPrevisto: p.inicioPrevisto, fimPrevisto: p.fimPrevisto, inicioReal: p.inicioReal, avanco: p.avanco }], HOJE);
  return r.porProjeto.get(id)!;
}

