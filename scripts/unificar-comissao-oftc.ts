// Unifica o cadastro duplicado da sigla OFTC: migra as referências da
// comissão vazia (sem membros) pra comissão oficial (com 3 membros) e apaga
// o registro duplicado. Não apaga nenhuma proposição — só troca o
// comissaoId/comissaoNome salvo no fluxo das 7 proposições afetadas e a
// linha da tabela Comissao duplicada.
//
//   npx tsx scripts/unificar-comissao-oftc.ts --dry
//   npx tsx scripts/unificar-comissao-oftc.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry");

const MANTER_ID = "cmqcmqdxn00021276cwwlcqtr";   // Comissão de Orçamento, Finanças e Tomada de Contas (3 membros)
const REMOVER_ID = "cmqcmaby600068fcmdutmb4so";  // Comissão de Finanças e Orçamento (0 membros, duplicada)

function nomeComissao(com: { sigla?: string | null; nome?: string | null }) {
  return com.sigla && com.nome ? `${com.sigla} — ${com.nome}` : (com.sigla || com.nome);
}

async function main() {
  const manter = await prisma.comissao.findUniqueOrThrow({ where: { id: MANTER_ID } });
  const remover = await prisma.comissao.findUniqueOrThrow({ where: { id: REMOVER_ID } });
  const nomeNovo = nomeComissao(manter);
  console.log(`Mantendo: ${manter.sigla} — ${manter.nome} (${manter.id})`);
  console.log(`Removendo: ${remover.sigla} — ${remover.nome} (${remover.id})\n`);

  // 1) Segov.fluxo — comissao1/2/3
  const itens = await prisma.segov.findMany({
    where: { fluxo: { not: null as any } },
    select: { id: true, numero: true, ano: true, fluxo: true },
  });
  let proposicoesAlteradas = 0;
  for (const item of itens) {
    const fluxo = item.fluxo as Record<string, any> | null;
    if (!fluxo) continue;
    let mudou = false;
    for (const chave of ["comissao1", "comissao2", "comissao3"]) {
      if (fluxo[chave]?.data?.comissaoId === REMOVER_ID) {
        console.log(`${item.numero}/${item.ano} [${chave}]: "${fluxo[chave].data.comissaoNome}" -> "${nomeNovo}"`);
        fluxo[chave].data.comissaoId = MANTER_ID;
        fluxo[chave].data.comissaoNome = nomeNovo;
        mudou = true;
      }
    }
    if (mudou) {
      proposicoesAlteradas++;
      if (!dryRun) await prisma.segov.update({ where: { id: item.id }, data: { fluxo } });
    }
  }

  // 2) ComissaoMembro e ProposicaoComissao (0 hoje, mas migra por segurança)
  const membros = await prisma.comissaoMembro.count({ where: { comissaoId: REMOVER_ID } });
  const propComissoes = await prisma.proposicaoComissao.count({ where: { comissaoId: REMOVER_ID } });
  console.log(`\nComissaoMembro a migrar: ${membros} | ProposicaoComissao a migrar: ${propComissoes}`);
  if (!dryRun) {
    if (membros > 0) await prisma.comissaoMembro.updateMany({ where: { comissaoId: REMOVER_ID }, data: { comissaoId: MANTER_ID } });
    if (propComissoes > 0) await prisma.proposicaoComissao.updateMany({ where: { comissaoId: REMOVER_ID }, data: { comissaoId: MANTER_ID } });
  }

  // 3) Apaga o registro duplicado
  console.log(dryRun ? "\n[DRY RUN] registro duplicado NÃO foi apagado." : "\nApagando registro duplicado...");
  if (!dryRun) await prisma.comissao.delete({ where: { id: REMOVER_ID } });

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}${proposicoesAlteradas} proposição(ões) migrada(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
