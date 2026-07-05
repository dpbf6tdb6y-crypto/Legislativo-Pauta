import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function extrairTextoPdf(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  return (raw.match(/[\x21-\x7E]{2,}/g) || []).join(" ");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const status = formData.get("status") as string | null;

  if (!file || !status) {
    return NextResponse.json({ error: "Arquivo e status são obrigatórios" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const nome = file.name.toLowerCase();
  let texto = "";

  try {
    if (nome.endsWith(".pdf")) {
      texto = extrairTextoPdf(buffer);
    } else if (nome.endsWith(".docx") || nome.endsWith(".doc")) {
      const result = await mammoth.extractRawText({ buffer });
      texto = result.value;
    } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const partes: string[] = [];
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        partes.push(XLSX.utils.sheet_to_txt(ws));
      });
      texto = partes.join("\n");
    } else {
      return NextResponse.json({ error: "Formato não suportado. Use PDF, Word (.docx) ou Excel (.xlsx)." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Erro ao ler o arquivo. Verifique se o arquivo não está corrompido." }, { status: 400 });
  }

  const regex = /\b(PL|PLC|PDL|REQ|IND|MOC)\s*[nNºN°]*\.?\s*(\d+)[\/\-](\d{4})\b/gi;
  const encontrados: { tipo: string; numero: string; ano: number }[] = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    encontrados.push({ tipo: match[1].toUpperCase(), numero: match[2], ano: parseInt(match[3]) });
  }

  if (encontrados.length === 0) {
    return NextResponse.json({ atualizados: 0, naoEncontrados: [], totalEncontrados: 0 });
  }

  let atualizados = 0;
  const naoEncontrados: string[] = [];

  for (const ref of encontrados) {
    const item = await prisma.segov.findFirst({
      where: { numero: ref.numero, ano: ref.ano, tipo: ref.tipo },
    });
    if (item) {
      await prisma.segov.update({ where: { id: item.id }, data: { status } });
      atualizados++;
    } else {
      naoEncontrados.push(`${ref.tipo} ${ref.numero}/${ref.ano}`);
    }
  }

  return NextResponse.json({ atualizados, naoEncontrados, totalEncontrados: encontrados.length });
}
