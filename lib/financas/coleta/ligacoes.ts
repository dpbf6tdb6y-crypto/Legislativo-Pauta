import type { DbPrefeitura } from '@/lib/financas/db';

/**
 * Liga empenhos a contratos. O portal não traz essa ligação (o "processo" do
 * empenho vem 0/0), então ela é deduzida e o grau de certeza fica visível:
 *  - alta:  mesmo CNPJ + número/ano do contrato citado na descrição do empenho
 *  - media: mesmo CNPJ + um único contrato desse credor vigente na data do empenho
 */
export async function ligarContratosEmpenhos(db: DbPrefeitura, prefeituraId: string) {
  const contratos = await db.contrato.findMany({
    select: { id: true, numero: true, ano: true, inicio: true, fim: true, fornecedorDoc: true },
  });
  const porDoc = new Map<string, typeof contratos>();
  for (const c of contratos) {
    if (!c.fornecedorDoc) continue;
    porDoc.set(c.fornecedorDoc, [...(porDoc.get(c.fornecedorDoc) ?? []), c]);
  }
  const empenhos = await db.empenho.findMany({ select: { id: true, credorDoc: true, data: true, contratoCitado: true } });
  const ligacoes: { prefeituraId: string; contratoId: number; empenhoId: number; certeza: string; motivo: string }[] = [];
  let alta = 0, media = 0, citadoSemCadastro = 0;
  for (const e of empenhos) {
    const doCredor = porDoc.get(e.credorDoc) ?? [];
    if (e.contratoCitado) {
      const [n, a] = e.contratoCitado.split('/').map(Number);
      const c = doCredor.find((x) => Number(x.numero) === n && x.ano === a);
      if (c) {
        ligacoes.push({ prefeituraId, contratoId: c.id, empenhoId: e.id, certeza: 'alta', motivo: `descrição cita contrato ${e.contratoCitado} e CNPJ confere` });
        alta++;
        continue;
      }
      citadoSemCadastro++;
    }
    const vigentes = doCredor.filter((c) => c.inicio && c.fim && c.inicio <= e.data && e.data <= c.fim);
    if (vigentes.length === 1) {
      ligacoes.push({ prefeituraId, contratoId: vigentes[0].id, empenhoId: e.id, certeza: 'media', motivo: 'único contrato vigente do credor na data do empenho' });
      media++;
    }
  }
  await db.ligacaoContratoEmpenho.deleteMany({});
  for (let i = 0; i < ligacoes.length; i += 500) await db.ligacaoContratoEmpenho.createMany({ data: ligacoes.slice(i, i + 500) });
  return { empenhos: empenhos.length, alta, media, semLigacao: empenhos.length - alta - media, citadoSemCadastro };
}
