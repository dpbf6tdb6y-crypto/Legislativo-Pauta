// Corrige o "comissaoNome" congelado no fluxo de proposições SEGOV antigas,
// gravado só com a sigla (ex.: "CLJ") por versões do sistema anteriores à
// concatenação "sigla — nome completo" (ver nomeComissao() em
// app/dashboard/segov/[id]/editar/page.tsx). Não toca em nada além desse
// campo — não recalcula datas, resultados nem qualquer outra etapa do fluxo.
//
// Uso (dentro do container, onde o DATABASE_URL da produção já está no
// ambiente):
//   npx tsx scripts/backfill-comissao-nome.ts        # roda de verdade
//   npx tsx scripts/backfill-comissao-nome.ts --dry  # só mostra o que mudaria
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHAVES_COMISSAO = ["comissao1", "comissao2", "comissao3"] as const;
const dryRun = process.argv.includes("--dry");

function nomeComissao(com: { sigla?: string | null; nome?: string | null } | undefined) {
  if (!com) return undefined;
  return com.sigla && com.nome ? `${com.sigla} — ${com.nome}` : (com.sigla || com.nome || undefined);
}

async function main() {
  const comissoes = await prisma.comissao.findMany({ select: { id: true, sigla: true, nome: true } });
  const porId = new Map(comissoes.map(c => [c.id, c]));

  const itens = await prisma.segov.findMany({
    where: { fluxo: { not: null as any } },
    select: { id: true, numero: true, ano: true, fluxo: true },
  });

  let proposicoesAlteradas = 0;
  let camposCorrigidos = 0;

  for (const item of itens) {
    const fluxo = item.fluxo as Record<string, any> | null;
    if (!fluxo) continue;
    let mudou = false;

    for (const chave of CHAVES_COMISSAO) {
      const passo = fluxo[chave];
      const comissaoId = passo?.data?.comissaoId;
      const nomeAtual: string | undefined = passo?.data?.comissaoNome;
      if (!comissaoId || !nomeAtual) continue;
      if (nomeAtual.includes(" — ")) continue; // já está no formato novo

      const com = porId.get(comissaoId);
      const nomeCorrigido = nomeComissao(com);
      if (!nomeCorrigido || nomeCorrigido === nomeAtual) continue;

      console.log(`${item.numero}/${item.ano} [${chave}]: "${nomeAtual}" -> "${nomeCorrigido}"`);
      passo.data.comissaoNome = nomeCorrigido;
      mudou = true;
      camposCorrigidos++;
    }

    if (mudou) {
      proposicoesAlteradas++;
      if (!dryRun) {
        await prisma.segov.update({ where: { id: item.id }, data: { fluxo } });
      }
    }
  }

  console.log(`\n${dryRun ? "[DRY RUN] " : ""}${proposicoesAlteradas} proposição(ões) alteradas, ${camposCorrigidos} campo(s) de comissão corrigido(s).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
