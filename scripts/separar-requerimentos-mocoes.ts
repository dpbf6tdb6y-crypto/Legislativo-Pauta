import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TIPO_CODIGO: Record<string, string> = {
  "Requerimento": "REQ",
  "Moção": "MOC",
  "Indicação": "IND",
};
const TIPOS_MOVER = Object.keys(TIPO_CODIGO);

async function main() {
  // ---- Segov -> Requerimento (fonte única, vira o novo local) ----
  const segovItens = await prisma.segov.findMany({ where: { tipo: { in: TIPOS_MOVER } } });
  console.log(`Segov -> Requerimento: ${segovItens.length} registros a mover`);

  const CHUNK = 500;
  for (let i = 0; i < segovItens.length; i += CHUNK) {
    const chunk = segovItens.slice(i, i + CHUNK);
    await prisma.requerimento.createMany({
      data: chunk.map(s => ({
        numero: s.numero,
        ano: s.ano,
        tipo: TIPO_CODIGO[s.tipo],
        descricao: s.ementa,
        vereadorId: s.vereadorId,
        autorNome: s.autorNome,
        status: s.status,
        dataEnvio: null,
        fluxo: s.fluxo ?? undefined,
      })),
    });
  }
  const idsSegovMover = segovItens.map(s => s.id);
  if (idsSegovMover.length) {
    await prisma.segov.deleteMany({ where: { id: { in: idsSegovMover } } });
  }
  console.log(`Segov: ${idsSegovMover.length} registros removidos (movidos para Requerimento).`);

  // ---- Proposicao: remove os mesmos tipos (dados já preservados via Segov -> Requerimento) ----
  const propItens = await prisma.proposicao.findMany({ where: { tipo: { in: TIPOS_MOVER } }, select: { id: true } });
  const idsProp = propItens.map(p => p.id);
  console.log(`Proposicao: ${idsProp.length} registros a remover (Requerimento/Moção/Indicação)`);

  if (idsProp.length) {
    await prisma.proposicaoAutor.deleteMany({ where: { proposicaoId: { in: idsProp } } });
    await prisma.proposicaoComissao.deleteMany({ where: { proposicaoId: { in: idsProp } } });
    await prisma.emenda.deleteMany({ where: { proposicaoId: { in: idsProp } } });
    await prisma.pautaItem.deleteMany({ where: { proposicaoId: { in: idsProp } } });
    await prisma.proposicao.deleteMany({ where: { id: { in: idsProp } } });
  }
  console.log(`Proposicao: ${idsProp.length} registros removidos.`);

  const restanteSegov = await prisma.segov.count();
  const restanteProp = await prisma.proposicao.count();
  const totalReq = await prisma.requerimento.count();
  console.log(`\nResultado final -> Segov (Proposições): ${restanteSegov} | Proposicao: ${restanteProp} | Requerimento (REQ+MOC+IND): ${totalReq}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
