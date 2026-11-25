// Leitura da carteira com gasto, riscos e metas: usada pela lista e pela impressão (mesmos filtros, mesmos números).
import type { DbPrefeitura } from '@/lib/financas/db';
import type { Ator } from '@/lib/financas/projetos/acoes';
import { agruparPor, alertasDeAcompanhamento, carteira, carteiraComGasto, indicadores, juntarAlertas, porSecretaria } from '@/lib/financas/projetos/dados';

export interface ParamsCarteira { q?: string; secretaria?: string; fase?: string; saude?: string; alerta?: string; eixo?: string; bairro?: string }

export async function lerCarteira(db: DbPrefeitura, ator: Ator, hoje: Date, sp: ParamsCarteira) {
  const q = (sp.q ?? '').trim();
  const todos = await carteira(db, ator, hoje);
  const [gasto, extras] = await Promise.all([carteiraComGasto(db, ator, todos, hoje), alertasDeAcompanhamento(db, todos, hoje)]);
  const alertasDe = (id: number) => juntarAlertas(gasto.porProjeto.get(id)?.alertas ?? [], extras.get(id) ?? []);
  const comAlerta = (id: number) => alertasDe(id).some((a) => a.nivel !== 'info');
  const soAlerta = sp.alerta === '1';
  const filtrados = (await carteira(db, ator, hoje, { q, secretaria: sp.secretaria, fase: sp.fase, saude: sp.saude, eixo: sp.eixo, bairro: sp.bairro })).filter((p) => !soAlerta || comAlerta(p.id));
  const pagoPorProjeto = new Map([...gasto.porProjeto].map(([id, f]) => [id, f.execucao.pago]));
  return {
    q, todos, filtrados, gasto, alertasDe, comAlerta, soAlerta,
    filtrando: !!(q || sp.secretaria || sp.fase || sp.saude || sp.eixo || sp.bairro || soAlerta),
    ind: indicadores(todos, hoje), quadro: porSecretaria(todos),
    porEixo: agruparPor(todos, 'eixo', pagoPorProjeto), porBairro: agruparPor(todos, 'bairro', pagoPorProjeto),
    nAlertas: todos.filter((p) => comAlerta(p.id)).length,
  };
}
