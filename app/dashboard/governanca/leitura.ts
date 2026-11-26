// Leitura única da aba Governança: os mesmos projetos do Compliance, com o mesmo filtro de quem pode ver o quê.
import type { DbPrefeitura } from '@/lib/financas/db';
import type { Ator } from '@/lib/financas/projetos/acoes';
import { acompanhamento, carteira, indicadores, porSecretaria, type ProjetoCompleto } from '@/lib/financas/projetos/dados';
import { bloqueios, etapasPorSecretaria } from '@/lib/financas/projetos/etapas';
import { gravidade, riscoAtivo } from '@/lib/financas/projetos/riscos';
import { DIAS_SEM_ATUALIZAR, diasEntre } from '@/lib/financas/projetos/regras';

export const SEM_SECRETARIA = 'secretaria não definida';

export function nomesDasSecretarias(projetos: ProjetoCompleto[]) {
  const m = new Map<string, string>();
  for (const p of projetos) for (const s of p.secretarias) m.set(s.orgaoCod, s.orgaoNome);
  return (orgaoCod: string) => (orgaoCod ? m.get(orgaoCod) ?? orgaoCod : SEM_SECRETARIA);
}

export async function lerGovernanca(db: DbPrefeitura, ator: Ator, hoje: Date) {
  const projetos = await carteira(db, ator, hoje);
  const ac = await acompanhamento(db, projetos.map((p) => p.id));
  const abertos = projetos.filter((p) => p.fase !== 'concluido' && p.fase !== 'cancelado');
  const riscosGraves = abertos.flatMap((p) => ac.riscosDe(p.id)
    .filter((r) => riscoAtivo(r) && gravidade(r.probabilidade, r.impacto) === 'alta')
    .map((r) => ({ projeto: p, risco: r })));
  const semAtualizacao = projetos
    .filter((p) => p.fase === 'execucao' && diasEntre(p.atualizadoEm, hoje) > DIAS_SEM_ATUALIZAR)
    .map((p) => ({ projeto: p, dias: diasEntre(p.atualizadoEm, hoje) }))
    .sort((a, b) => b.dias - a.dias);
  const doQuadro = porSecretaria(projetos);
  const dasEtapas = etapasPorSecretaria(projetos, hoje);
  const semDona = dasEtapas.find((e) => !e.orgaoCod);
  return {
    projetos, abertos, riscosGraves, semAtualizacao,
    ind: indicadores(projetos, hoje),
    // atrasados e atenção, já na ordem de apresentação da carteira
    prioridades: projetos.filter((p) => p.saude === 'atrasado' || p.saude === 'atencao'),
    esperas: bloqueios(projetos, hoje),
    secretarias: doQuadro.map((l) => ({ ...l, etapas: dasEtapas.find((e) => e.orgaoCod === l.orgaoCod) ?? { orgaoCod: l.orgaoCod, atrasadas: 0, retendo: 0, aguardando: 0 } })),
    semDona,
    nomeDe: nomesDasSecretarias(projetos),
  };
}

export type DadosGovernanca = Awaited<ReturnType<typeof lerGovernanca>>;
export const coordenadora = (p: ProjetoCompleto) => p.secretarias.find((s) => s.papel === 'lider')?.orgaoNome ?? SEM_SECRETARIA;
