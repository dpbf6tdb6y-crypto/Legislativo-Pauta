import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const distintos = await prisma.segov.groupBy({ by: ["tipo"], _count: true });
  console.log("Tipos de Proposição encontrados:", distintos.map(d => `${d.tipo} (${d._count})`));

  const tiposReq = [
    { nome: "Requerimento", codigo: "REQ" },
    { nome: "Moção", codigo: "MOC" },
    { nome: "Indicação", codigo: "IND" },
  ];
  for (let i = 0; i < tiposReq.length; i++) {
    const t = tiposReq[i];
    await prisma.configOpcao.upsert({
      where: { tipo_nome: { tipo: "tipo_requerimento", nome: t.nome } },
      update: { codigo: t.codigo },
      create: { tipo: "tipo_requerimento", nome: t.nome, codigo: t.codigo, ordem: i },
    });
  }

  const tiposProp = distintos.map(d => d.tipo).sort();
  for (let i = 0; i < tiposProp.length; i++) {
    await prisma.configOpcao.upsert({
      where: { tipo_nome: { tipo: "tipo_proposicao", nome: tiposProp[i] } },
      update: {},
      create: { tipo: "tipo_proposicao", nome: tiposProp[i], ordem: i },
    });
  }

  console.log(`Criados/atualizados: ${tiposReq.length} tipo_requerimento + ${tiposProp.length} tipo_proposicao`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
