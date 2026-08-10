import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const NOMES = [
  "José Carlos de Oliveira",
  "Juliana Ellen de Sales",
  "José Doroteu Martiniano",
  "Alessandro Bonifácio (Coxinha)",
  "Ederson Pinto (Kim do Gás)",
  "Tiago Tito",
  "Fausto Niquini",
  "Flávio de Almeida",
  "José Guedes",
];

async function main() {
  const r = await prisma.vereador.updateMany({
    where: { nome: { in: NOMES } },
    data: { ativo: true, legislatura: "Mandato anterior" },
  });
  console.log(`Atualizados: ${r.count}`);
}
main().finally(() => prisma.$disconnect());
