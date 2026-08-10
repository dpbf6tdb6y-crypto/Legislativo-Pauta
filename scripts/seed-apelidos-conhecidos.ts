import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const APELIDOS: Record<string, string> = {
  "Claudio José": "Claudinho Valle",
  "Anisio Filho": "Anisinho",
  "Joselino Dias": "Zelino",
  "Ismael Cruz": "Mael",
  "Nilton Oliveira": "Nilton de Água Limpa",
  "Adilson Braga": "Taioba",
  "Alessandro Bonifácio (Coxinha)": "Coxinha",
  "Ederson Pinto (Kim do Gás)": "Kim do Gás",
};

async function main() {
  for (const [nome, apelido] of Object.entries(APELIDOS)) {
    const r = await prisma.vereador.updateMany({ where: { nome }, data: { apelido } });
    console.log(nome, "->", apelido, r.count ? "OK" : "NÃO ENCONTRADO");
  }
}
main().finally(() => prisma.$disconnect());
