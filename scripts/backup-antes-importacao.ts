import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const [segov, proposicao, proposicaoAutor, proposicaoComissao, votoParecerVereador, emenda, pautaItem, vereador] = await Promise.all([
    prisma.segov.findMany(),
    prisma.proposicao.findMany(),
    prisma.proposicaoAutor.findMany(),
    prisma.proposicaoComissao.findMany(),
    prisma.votoParecerVereador.findMany(),
    prisma.emenda.findMany(),
    prisma.pautaItem.findMany(),
    prisma.vereador.findMany(),
  ]);

  const arquivo = path.join(dir, `backup-${stamp}.json`);
  fs.writeFileSync(arquivo, JSON.stringify({
    segov, proposicao, proposicaoAutor, proposicaoComissao, votoParecerVereador, emenda, pautaItem, vereador,
  }, null, 2));

  console.log(`Backup salvo em: ${arquivo}`);
  console.log(`Segov: ${segov.length} | Proposicao: ${proposicao.length} | ProposicaoAutor: ${proposicaoAutor.length} | ProposicaoComissao: ${proposicaoComissao.length} | VotoParecerVereador: ${votoParecerVereador.length} | Emenda: ${emenda.length} | PautaItem: ${pautaItem.length} | Vereador: ${vereador.length}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
