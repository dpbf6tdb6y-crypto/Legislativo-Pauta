import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Admin user
  await prisma.user.upsert({
    where: { email: "admin@camara.mg.gov.br" },
    update: {},
    create: {
      nome: "Administrador",
      email: "admin@camara.mg.gov.br",
      senha: await bcrypt.hash("admin123", 10),
      perfil: "admin",
    },
  });

  // Vereadores de exemplo
  const vereadores = [
    { nome: "João Silva", partido: "PT", legislatura: "2021-2024" },
    { nome: "Maria Santos", partido: "PSDB", legislatura: "2021-2024" },
    { nome: "Carlos Oliveira", partido: "MDB", legislatura: "2021-2024" },
    { nome: "Ana Lima", partido: "PL", legislatura: "2021-2024" },
    { nome: "Pedro Costa", partido: "PP", legislatura: "2021-2024" },
  ];

  const vereadoresCriados = [];
  for (const v of vereadores) {
    const vereador = await prisma.vereador.create({ data: v });
    vereadoresCriados.push(vereador);
  }

  // Comissão de exemplo
  const comissao = await prisma.comissao.create({
    data: { nome: "Comissão de Finanças e Orçamento", tipo: "permanente" },
  });

  // Membros da comissão
  await prisma.comissaoMembro.createMany({
    data: [
      { comissaoId: comissao.id, vereadorId: vereadoresCriados[0].id, papel: "presidente" },
      { comissaoId: comissao.id, vereadorId: vereadoresCriados[1].id, papel: "vice" },
      { comissaoId: comissao.id, vereadorId: vereadoresCriados[2].id, papel: "relator" },
    ],
  });

  // Analista
  await prisma.analista.create({
    data: {
      nome: "Roberto Ferreira",
      email: "roberto@camara.mg.gov.br",
      comissaoId: comissao.id,
    },
  });

  console.log("Seed concluído!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
