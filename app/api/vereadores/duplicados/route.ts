import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e"]);
const REGEX_DIACRITICOS = /[̀-ͯ]/g;

function normalizar(nome: string): string {
  return nome
    .replace(/\(.*?\)/g, "")
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toLowerCase()
    .trim();
}

function tokens(nome: string): string[] {
  return normalizar(nome).split(/\s+/).filter(t => t && !CONECTORES.has(t));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const vereadores = await prisma.vereador.findMany({
    where: { NOT: { nome: { startsWith: "[Mesclado em " } } },
    select: {
      id: true, nome: true, apelido: true, partido: true, legislatura: true, ativo: true, poder: true,
      _count: { select: { segov: true, requerimentos: true, proposicoes: true } },
    },
    orderBy: { nome: "asc" },
  });

  type Grupo = { chave: string; confianca: "alta" | "media"; itens: typeof vereadores };
  const grupos: Grupo[] = [];
  const usados = new Set<string>();

  // Alta confiança: nome normalizado idêntico (só compara dentro do mesmo poder — legislativo com legislativo, executivo com executivo)
  const porNomeExato = new Map<string, typeof vereadores>();
  vereadores.forEach(v => {
    const chave = `${v.poder}:${normalizar(v.nome)}`;
    if (!porNomeExato.has(chave)) porNomeExato.set(chave, []);
    porNomeExato.get(chave)!.push(v);
  });
  porNomeExato.forEach((itens, chave) => {
    if (itens.length > 1) {
      grupos.push({ chave: chave.split(":")[1], confianca: "alta", itens });
      itens.forEach(v => usados.add(v.id));
    }
  });

  // Média confiança: conjunto de tokens de um nome é subconjunto do outro (mín. 2 tokens em comum)
  const restantes = vereadores.filter(v => !usados.has(v.id));
  for (let i = 0; i < restantes.length; i++) {
    for (let j = i + 1; j < restantes.length; j++) {
      if (usados.has(restantes[i].id) || usados.has(restantes[j].id)) continue;
      if (restantes[i].poder !== restantes[j].poder) continue;
      const tA = new Set(tokens(restantes[i].nome));
      const tB = new Set(tokens(restantes[j].nome));
      const intersecao = [...tA].filter(t => tB.has(t));
      const menor = Math.min(tA.size, tB.size);
      if (menor >= 2 && intersecao.length >= 2 && (intersecao.length === menor)) {
        grupos.push({ chave: `${restantes[i].nome} / ${restantes[j].nome}`, confianca: "media", itens: [restantes[i], restantes[j]] });
        usados.add(restantes[i].id);
        usados.add(restantes[j].id);
      }
    }
  }

  return NextResponse.json(grupos);
}
