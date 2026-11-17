import { dbDa } from './db';

// Chaves liga/desliga dos módulos da Gestão $$$. LGPD: o nome dos servidores na folha começa DESLIGADO
// (folha_nomes); ligado, só aparece para os perfis com a permissão folha_nomes.
export const CHAVES_PADRAO: Record<string, { padrao: boolean; descricao: string }> = {
  coleta_automatica: { padrao: true, descricao: 'Coleta diária do portal (02:30)' },
  orcamento: { padrao: true, descricao: 'Módulo Orçamento e metas' },
  contratos: { padrao: true, descricao: 'Módulo Contratos' },
  folha: { padrao: true, descricao: 'Módulo Pessoal (folha por servidor, sem nomes)' },
  folha_nomes: { padrao: false, descricao: 'Mostrar o nome do servidor na folha (só prefeito, controlador, RH e auditor)' },
  conferir_antes_de_assinar: { padrao: true, descricao: 'Tela Conferir antes de assinar' },
  exportar_folha: { padrao: false, descricao: 'Permitir exportar a folha' },
};

export async function chaveLigada(prefeituraId: string, nome: string): Promise<boolean> {
  const c = await dbDa(prefeituraId).chave.findFirst({ where: { nome } });
  return c ? c.ligada : CHAVES_PADRAO[nome]?.padrao ?? false;
}

export async function mudarChave(prefeituraId: string, nome: string, ligada: boolean, por: string) {
  if (!CHAVES_PADRAO[nome]) throw new Error(`chave desconhecida: ${nome}`);
  const db = dbDa(prefeituraId);
  const de = await chaveLigada(prefeituraId, nome);
  await db.chave.upsert({
    where: { prefeituraId_nome: { prefeituraId, nome } },
    create: { prefeituraId, nome, ligada, alteradoPor: por, alteradoEm: new Date() },
    update: { ligada, alteradoPor: por, alteradoEm: new Date() },
  });
  await db.chaveHistorico.create({ data: { prefeituraId, nome, de, para: ligada, por } });
}

export async function todasChaves(prefeituraId: string) {
  const r: { nome: string; descricao: string; ligada: boolean }[] = [];
  for (const [nome, c] of Object.entries(CHAVES_PADRAO)) r.push({ nome, descricao: c.descricao, ligada: await chaveLigada(prefeituraId, nome) });
  return r;
}
