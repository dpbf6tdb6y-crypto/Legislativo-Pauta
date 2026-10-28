import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { temPermissao } from "@/lib/permissoes";
import { analisarItens, lerPauta } from "@/lib/pauta-camara";

// Lê a pauta (PDF, Word, texto colado) e mostra o que seria cadastrado. Não grava nada:
// a gravação só acontece depois da revisão, em /api/segov/criar-lote.

async function textoDoPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!temPermissao(session.user as any, "podeImportar")) return NextResponse.json({ error: "Sem permissão para importar" }, { status: 403 });

  let texto = "";
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    const nome = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      if (nome.endsWith(".pdf")) {
        texto = await textoDoPdf(buffer);
      } else if (nome.endsWith(".docx") || nome.endsWith(".doc")) {
        texto = (await mammoth.extractRawText({ buffer })).value;
      } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
        const wb = XLSX.read(buffer, { type: "buffer" });
        texto = wb.SheetNames.map(n => XLSX.utils.sheet_to_txt(wb.Sheets[n])).join("\n");
      } else {
        return NextResponse.json({ error: "Formato não suportado. Use PDF, Word ou Excel." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Erro ao ler o arquivo. Verifique se ele não está corrompido ou protegido." }, { status: 400 });
    }
    if (!texto.trim()) {
      return NextResponse.json({ error: "Não encontrei texto no arquivo (PDF digitalizado como imagem?). Use o Word ou cole o texto." }, { status: 400 });
    }
  } else {
    const body = await req.json();
    texto = body.texto || "";
    if (!texto.trim()) return NextResponse.json({ error: "Nenhum texto fornecido" }, { status: 400 });
  }

  const leitura = lerPauta(texto);

  const anos = Array.from(new Set(leitura.itens.map(i => i.ano)));
  const [existentes, vereadores] = await Promise.all([
    anos.length
      ? prisma.segov.findMany({
          where: { ano: { in: anos } },
          select: { id: true, tipo: true, numero: true, ano: true, autorNome: true, ementa: true, status: true },
        })
      : Promise.resolve([]),
    prisma.vereador.findMany({ select: { id: true, nome: true, apelido: true, ativo: true, poder: true } }),
  ]);

  const proposicoes = analisarItens(leitura, existentes, vereadores);

  return NextResponse.json({
    proposicoes,
    ignorados: leitura.ignorados,
    avisos: leitura.avisos,
    total: proposicoes.length,
    dataEnvio: leitura.dataSessao,
  });
}
