// Lista comissões que compartilham a mesma sigla (cadastro duplicado) e
// quantas referências cada uma tem, pra decidir qual é a "canônica" antes de
// unificar. Só leitura — não altera nada.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const comissoes = await prisma.comissao.findMany({
    select: { id: true, sigla: true, nome: true, ativa: true, tipo: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const porSigla = new Map<string, typeof comissoes>();
  for (const c of comissoes) {
    if (!c.sigla) continue;
    const lista = porSigla.get(c.sigla) || [];
    lista.push(c);
    porSigla.set(c.sigla, lista);
  }

  const segovs = await prisma.segov.findMany({ select: { id: true, numero: true, ano: true, fluxo: true } });
  const propComissoes = await prisma.proposicaoComissao.groupBy({ by: ["comissaoId"], _count: { comissaoId: true } });
  const membros = await prisma.comissaoMembro.groupBy({ by: ["comissaoId"], _count: { comissaoId: true } });

  const contagemProp = new Map(propComissoes.map(p => [p.comissaoId, p._count.comissaoId]));
  const contagemMembro = new Map(membros.map(m => [m.comissaoId, m._count.comissaoId]));

  for (const [sigla, lista] of porSigla) {
    if (lista.length < 2) continue;
    console.log(`\n=== Sigla duplicada: ${sigla} ===`);
    for (const c of lista) {
      let usosSegov = 0;
      const usosSegovDetalhe: string[] = [];
      for (const s of segovs) {
        const fluxo = s.fluxo as Record<string, any> | null;
        if (!fluxo) continue;
        for (const chave of ["comissao1", "comissao2", "comissao3"]) {
          if (fluxo[chave]?.data?.comissaoId === c.id) {
            usosSegov++;
            usosSegovDetalhe.push(`${s.numero}/${s.ano}[${chave}]`);
          }
        }
      }
      console.log(`- id=${c.id} nome="${c.nome}" ativa=${c.ativa} tipo=${c.tipo} criada=${c.createdAt.toISOString().slice(0, 10)}`);
      console.log(`  membros=${contagemMembro.get(c.id) || 0} proposicaoComissao=${contagemProp.get(c.id) || 0} segov=${usosSegov} ${usosSegovDetalhe.length ? "-> " + usosSegovDetalhe.join(", ") : ""}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
