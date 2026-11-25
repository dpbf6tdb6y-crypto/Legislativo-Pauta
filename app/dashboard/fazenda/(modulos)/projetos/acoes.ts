'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAcaoUsuario, registrar } from '@/lib/financas/auth';
import { chaveLigada } from '@/lib/financas/chaves';
import * as A from '@/lib/financas/projetos/acoes';
import * as V from '@/lib/financas/projetos/vinculos';
import * as R from '@/lib/financas/projetos/riscos';
import * as I from '@/lib/financas/projetos/indicadores';

export type Resultado = { erro?: string } | null;
const txt = (f: FormData, k: string) => String(f.get(k) ?? '');

async function contexto() {
  const ctx = await exigirAcaoUsuario('projetos_gerir').catch(() => exigirAcaoUsuario('projetos_secretaria'));
  if (!(await chaveLigada(ctx.s.prefeituraId, 'projetos'))) throw new Error('O módulo Projetos está desligado');
  return { ...ctx, ator: A.atorDe({ nome: ctx.u.nome, perfil: ctx.s.perfil, orgaoCod: ctx.u.orgaoCod, master: ctx.s.master }) };
}
function atualizar(id?: number) {
  revalidatePath('/dashboard/fazenda/projetos');
  revalidatePath('/dashboard/fazenda/projetos/cronograma');
  if (id) revalidatePath(`/dashboard/fazenda/projetos/${id}`);
}
/** Roda a operação; erro de regra volta para a tela, o resto (sessão, permissão) sobe como erro de verdade. */
async function executar(f: FormData, tela: string, op: (c: Awaited<ReturnType<typeof contexto>>, id: number) => Promise<string>): Promise<Resultado> {
  const c = await contexto();
  const id = Number(f.get('id'));
  try {
    const resumo = await op(c, id);
    await registrar(c.s, 'alterar', tela, resumo);
  } catch (e) { return { erro: (e as Error).message }; }
  atualizar(id);
  return null;
}

const dadosDe = (f: FormData): A.DadosProjeto => ({
  titulo: txt(f, 'titulo'), objetivo: txt(f, 'objetivo'), tipo: txt(f, 'tipo'), prioridade: txt(f, 'prioridade'), eixo: txt(f, 'eixo'), bairro: txt(f, 'bairro'),
  fonteRecurso: txt(f, 'fonteRecurso'), orcamento: txt(f, 'orcamento'), inicioPrevisto: txt(f, 'inicioPrevisto'), fimPrevisto: txt(f, 'fimPrevisto'),
});

export async function acaoCriarProjeto(_: Resultado, f: FormData): Promise<Resultado> {
  const c = await contexto();
  let id: number;
  try {
    const p = await A.criarProjeto(c.db, c.ator, { ...dadosDe(f), secretariaLider: txt(f, 'secretariaLider'), responsavel: txt(f, 'responsavel'), parceiras: f.getAll('parceiras').map(String) });
    id = p.id;
    await registrar(c.s, 'alterar', 'Projetos', `projeto #${id} cadastrado: ${p.titulo}`);
  } catch (e) { return { erro: (e as Error).message }; }
  atualizar(id);
  redirect(`/dashboard/fazenda/projetos/${id}`);
}

export const acaoEditarProjeto = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  await A.editarProjeto(c.db, c.ator, id, dadosDe(f), txt(f, 'motivo'));
  return `projeto #${id}: dados alterados`;
});

export const acaoMudarFase = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const para = txt(f, 'para');
  await A.mudarFase(c.db, c.ator, id, para, txt(f, 'motivo'));
  return `projeto #${id} → ${para}`;
});

export const acaoAdicionarEtapa = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  await A.adicionarEtapa(c.db, c.ator, id, {
    titulo: txt(f, 'titulo'), marco: txt(f, 'marco') === 'on', peso: Number(txt(f, 'peso') || 1), inicioPrevisto: txt(f, 'inicioPrevisto'), fimPrevisto: txt(f, 'fimPrevisto'),
  });
  return `projeto #${id}: etapa incluída`;
});

export const acaoEtapa = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const acao = txt(f, 'acao') as A.AcaoEtapa;
  const etapaId = Number(f.get('etapaId'));
  // a etapa precisa ser do projeto da tela (e o projeto visível para quem pede)
  await A.projetoVisivel(c.db, c.ator, id);
  const et = await c.db.etapaProjeto.findFirst({ where: { id: etapaId, projetoId: id } });
  if (!et) throw new Error('Etapa não encontrada');
  await A.atualizarEtapa(c.db, c.ator, etapaId, acao, { inicioPrevisto: txt(f, 'inicioPrevisto'), fimPrevisto: txt(f, 'fimPrevisto'), motivo: txt(f, 'motivo') });
  return `projeto #${id}: etapa #${etapaId} ${acao}`;
});

export const acaoAtualizacao = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  await A.registrarAtualizacao(c.db, c.ator, id, txt(f, 'texto'));
  return `projeto #${id}: atualização de andamento`;
});

export const acaoVinculo = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const acao = txt(f, 'acao');
  if (acao === 'contrato') await V.vincularContrato(c.db, c.ator, id, Number(txt(f, 'contratoId')));
  else if (acao === 'acao') {
    // a ação vem como "índice" da lista oferecida; o servidor confere de novo que pertence às secretarias do projeto
    const [orgaoEmpenho, programa, nome] = txt(f, 'chave').split('␟');
    await V.vincularAcao(c.db, c.ator, id, { orgaoEmpenho, programa, acao: nome, desde: txt(f, 'desde') });
  } else if (acao === 'desfazer') await V.desvincular(c.db, c.ator, id, Number(txt(f, 'vinculoId')), txt(f, 'motivo'));
  else throw new Error('Ação inválida');
  return `projeto #${id}: ligação com despesa (${acao})`;
});

export const acaoRisco = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const acao = txt(f, 'acao');
  if (acao === 'criar')
    await R.criarRisco(c.db, c.ator, id, { titulo: txt(f, 'titulo'), descricao: txt(f, 'descricao'), probabilidade: txt(f, 'probabilidade'), impacto: txt(f, 'impacto'), mitigacao: txt(f, 'mitigacao'), responsavel: txt(f, 'responsavel'), prazoMitigacao: txt(f, 'prazoMitigacao') });
  else await R.atualizarRisco(c.db, c.ator, id, Number(txt(f, 'riscoId')), acao as R.AcaoRisco, {
    probabilidade: txt(f, 'probabilidade'), impacto: txt(f, 'impacto'), mitigacao: txt(f, 'mitigacao'), responsavel: txt(f, 'responsavel'), prazoMitigacao: txt(f, 'prazoMitigacao'), status: txt(f, 'status'), motivo: txt(f, 'motivo'),
  });
  return `projeto #${id}: risco (${acao})`;
});

export const acaoIndicador = async (_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const acao = txt(f, 'acao');
  if (acao === 'criar') await I.criarIndicador(c.db, c.ator, id, { nome: txt(f, 'nome'), unidade: txt(f, 'unidade'), linhaBase: txt(f, 'linhaBase'), meta: txt(f, 'meta'), prazoMeta: txt(f, 'prazoMeta') });
  else if (acao === 'leitura') await I.registrarLeitura(c.db, c.ator, id, Number(txt(f, 'indicadorId')), { valor: txt(f, 'valor'), data: txt(f, 'data'), nota: txt(f, 'nota') });
  else throw new Error('Ação inválida');
  return `projeto #${id}: indicador de resultado (${acao})`;
});

export const acaoParceira = async(_: Resultado, f: FormData) => executar(f, 'Projetos', async (c, id) => {
  const acao = txt(f, 'acao');
  const orgaoCod = txt(f, 'orgaoCod');
  if (acao === 'adicionar') await A.adicionarParceira(c.db, c.ator, id, orgaoCod, txt(f, 'responsavel'));
  else if (acao === 'responsavel') await A.definirResponsavelProjeto(c.db, c.ator, id, orgaoCod, txt(f, 'responsavel'));
  else if (acao === 'remover') await A.removerParceira(c.db, c.ator, id, orgaoCod, txt(f, 'motivo'));
  else throw new Error('Ação inválida');
  return `projeto #${id}: secretaria ${orgaoCod} (${acao})`;
});
