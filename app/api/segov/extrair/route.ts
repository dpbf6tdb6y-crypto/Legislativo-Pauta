import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type Proposicao = {
  tipo: string;
  numero: string;
  ano: number;
  ementa: string;
  observacao?: string;
  dataEnvio?: string;
  autorNome?: string;
  vereadorId?: string;
};

type ParecerItem = {
  tipo: string;
  numero: string;
  ano: number;
  parecerComissao: string;
  parecerConjunto: boolean;
  proxComissao?: string;
  autorNome?: string;
  ementa?: string;
  dataParecere?: string;
  jaExiste?: boolean;
};

// "23 de junho de 2026" → "2026-06-23T12:00:00.000Z"
function extrairData(texto: string): string | undefined {
  const meses: Record<string, number> = {
    janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  };
  const m = texto.match(/(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i);
  if (!m) return undefined;
  const mesNome = m[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const mes = meses[mesNome] || 1;
  const day = parseInt(m[1]).toString().padStart(2, "0");
  const monthStr = mes.toString().padStart(2, "0");
  return `${m[3]}-${monthStr}-${day}T12:00:00.000Z`;
}

// Usa a ÚLTIMA ocorrência para não pegar o sumário
function extrairSecaoApresentacao(texto: string): string {
  const reInicio = /Apresenta[çc][ãa]o\s+de\s+proposi[çc][õo]es/gi;
  const reFim = /Leitura\s+de\s+Parecer|d\)\s*Leitura|II\s+SEGUNDA|SEGUNDA\s+PARTE/i;
  let lastIdx = -1, lastLen = 0;
  let m: RegExpExecArray | null;
  while ((m = reInicio.exec(texto)) !== null) { lastIdx = m.index; lastLen = m[0].length; }
  if (lastIdx === -1) return texto;
  const resto = texto.slice(lastIdx + lastLen);
  const fim = resto.match(reFim);
  return fim && fim.index !== undefined ? resto.slice(0, fim.index) : resto;
}

function extrairSecaoPareceres(texto: string): string {
  const reInicio = /d\)\s*Leitura\s+de\s+Parecer/i;
  const reFim = /II\s+SEGUNDA\s+PARTE|SEGUNDA\s+PARTE|\bII\b/i;
  const ini = texto.match(reInicio);
  if (!ini || ini.index === undefined) return "";
  const resto = texto.slice(ini.index + ini[0].length);
  const fim = resto.match(reFim);
  return fim && fim.index !== undefined ? resto.slice(0, fim.index) : resto;
}

function extrairComRegex(texto: string): Proposicao[] {
  const mapa = new Map<string, Proposicao>();
  const dataEnvio = extrairData(texto);
  const secao = extrairSecaoApresentacao(texto);

  function add(tipo: string, numRaw: string, anoStr: string, matchIndex: number, matchLen: number) {
    const numero = numRaw.replace(/\./g, "");
    const key = `${tipo}_${numero}_${anoStr}`;
    if (mapa.has(key)) return;

    const afterMatch = secao.slice(matchIndex + matchLen, matchIndex + matchLen + 700);

    let ementa = "";
    const emenMatch = afterMatch.match(
      /(?:\s+que\s*[«"«»]?|[-–—:]\s*)([\s\S]{5,500}?)(?=\n\s*[•*]|[•*]\s*[Ee]ncaminhar|\n\s*\d+\)|\n\s*[a-dA-D]\)|$)/i
    );
    if (emenMatch) {
      ementa = emenMatch[1]
        .replace(/\s*[•*]\s*[Ee]ncaminhar[\s\S]*$/, "")
        .replace(/^[«»""«»]+/, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    let observacao: string | undefined;
    const encMatch = afterMatch.match(/[•*]\s*Encaminhar\s+[àa]\s+([^\n\r.]+)/i);
    if (encMatch) observacao = encMatch[1].trim();

    let autorNome: string | undefined;
    const autorMatch = afterMatch.match(
      /(?:,\s*)?\bautoria\s+(?:dos?\s+)?(?:Vereador(?:a|es|as)?\s+)?([^\n,]+?)(?:(?:,\s*)?que\b|\n|$)/i
    );
    if (autorMatch) autorNome = autorMatch[1].replace(/^Vereador(?:a|es|as)?\s+/i, "").trim();

    mapa.set(key, { tipo, numero, ano: parseInt(anoStr), ementa, observacao, dataEnvio, autorNome });
  }

  let m: RegExpExecArray | null;

  const reAbrev = /\b(PL|PLC|PDL|REQ|IND|MOC)\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = reAbrev.exec(secao)) !== null) add(m[1].toUpperCase(), m[2], m[3], m.index, m[0].length);

  const rePL = /Projeto\s+de\s+Lei(?:\s+(Complementar))?\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = rePL.exec(secao)) !== null) add(m[1] ? "PLC" : "PL", m[2], m[3], m.index, m[0].length);

  const reREQ = /Requerimento\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = reREQ.exec(secao)) !== null) add("REQ", m[1], m[2], m.index, m[0].length);

  const rePDL = /Projeto\s+de\s+Decreto\s+Legislativo\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = rePDL.exec(secao)) !== null) add("PDL", m[1], m[2], m.index, m[0].length);

  const reMOC = /Mo[çc][ãa]o\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = reMOC.exec(secao)) !== null) add("MOC", m[1], m[2], m.index, m[0].length);

  const reIND = /Indica[çc][ãa]o\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})\b/gi;
  while ((m = reIND.exec(secao)) !== null) add("IND", m[1], m[2], m.index, m[0].length);

  return Array.from(mapa.values());
}

function extrairPareceres(texto: string, dataEnvio?: string): ParecerItem[] {
  const secao = extrairSecaoPareceres(texto);
  if (!secao) return [];

  const result: ParecerItem[] = [];

  // Regex: "Parecer [CONJUNTO] da[s] Comissão[ões] de X [, Y e Z], referente ao [TIPO] nº NUM/ANO"
  const reParecer = /\bParecer(\s+CONJUNTO)?\s+das?\s+Comiss[ãa][õo]e?s?\s+de\s+([\s\S]+?),\s*referente\s+ao\s+(Projeto\s+de\s+Lei(?:\s+Complementar)?|Projeto\s+de\s+Decreto\s+Legislativo|Requerimento|Indica[çc][ãa]o|Mo[çc][ãa]o)\s*[nN°º]*\.?\s*([\d][\d.]*)\s*[\/\-]\s*(\d{4})/gi;

  let m: RegExpExecArray | null;
  while ((m = reParecer.exec(secao)) !== null) {
    const conjunto = !!(m[1]?.trim());
    const comissaoNome = m[2].replace(/\s+/g, " ").trim();
    const tipoTexto = m[3].toLowerCase();
    const numRaw = m[4];
    const anoStr = m[5];

    let tipo = "PL";
    if (tipoTexto.includes("decreto legislativo")) tipo = "PDL";
    else if (tipoTexto.includes("complementar")) tipo = "PLC";
    else if (tipoTexto.includes("requerimento")) tipo = "REQ";
    else if (tipoTexto.includes("indica")) tipo = "IND";
    else if (tipoTexto.includes("mo")) tipo = "MOC";

    const numero = numRaw.replace(/\./g, "");

    const afterMatch = secao.slice(m.index + m[0].length, m.index + m[0].length + 700);

    let ementa: string | undefined;
    const emenMatch = afterMatch.match(
      /(?:,\s*)?que\s+([\s\S]{5,400}?)(?=\n\s*[•*]|[•*]\s*[Ee]ncaminhar|\n\s*\d+\.|$)/i
    );
    if (emenMatch) {
      ementa = emenMatch[1]
        .replace(/\s*[•*]\s*[Ee]ncaminhar[\s\S]*$/, "")
        .replace(/\s*[-–]\s*LDO\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    let proxComissao: string | undefined;
    const encMatch = afterMatch.match(/[•*]\s*Encaminhar\s+[àa]\s+([^\n\r.]+)/i);
    if (encMatch) proxComissao = encMatch[1].trim();

    let autorNome: string | undefined;
    const autorMatch = afterMatch.match(
      /(?:,\s*)?\bautoria\s+(?:dos?\s+)?(?:Vereador(?:a|es|as)?\s+)?([^\n,]+?)(?:(?:,\s*)?que\b|\n|$)/i
    );
    if (autorMatch) autorNome = autorMatch[1].replace(/^Vereador(?:a|es|as)?\s+/i, "").trim();

    result.push({
      tipo,
      numero,
      ano: parseInt(anoStr),
      parecerComissao: comissaoNome,
      parecerConjunto: conjunto,
      proxComissao,
      autorNome,
      ementa,
      dataParecere: dataEnvio,
    });
  }

  return result;
}

async function extrairPdfComClaude(buffer: Buffer): Promise<{
  proposicoes: Proposicao[];
  pareceres: ParecerItem[];
  dataEnvio?: string;
}> {
  const base64 = buffer.toString("base64");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          {
            type: "text",
            text: `Este documento é uma pauta de sessão da Câmara Municipal de Nova Lima, MG.
Extraia as proposições de DUAS seções distintas:

1) Seção "c) Apresentação de proposições" (Primeira Parte)
2) Seção "d) Leitura de Parecer" (Primeira Parte)

Retorne SOMENTE um JSON válido (sem markdown):
{
  "dataEnvio": "2026-06-23",
  "proposicoes": [
    {"tipo":"PL","numero":"2725","ano":2026,"ementa":"Declara Utilidade Pública...","observacao":"Comissão de Legislação e Justiça","autorNome":"Nilton Cruz"}
  ],
  "pareceres": [
    {"tipo":"PL","numero":"2605","ano":2025,"parecerComissao":"Legislação e Justiça","parecerConjunto":false,"proxComissao":"Comissão de Participação Popular","autorNome":"Joselino Santana","ementa":"Institui a Semana do Cavalo..."}
  ]
}

Regras para proposicoes (Apresentação):
- tipo: PL, PLC, PDL, REQ, IND, MOC
- numero: sem pontos (2.725→"2725")
- ementa: texto após "que" até "• Encaminhar". NÃO inclua "Encaminhar".
- observacao: comissão de "• Encaminhar à ..."
- autorNome: nome sem "Vereador/a"; "Poder Executivo" se for do executivo

Regras para pareceres (Leitura de Parecer):
- parecerComissao: nome(s) da(s) comissão(ões) sem "Comissão de" (ex: "Legislação e Justiça")
- parecerConjunto: true se "Parecer CONJUNTO"
- proxComissao: comissão de "• Encaminhar à ..." (null se não houver)
- demais campos: mesmas regras das proposicoes
- dataEnvio: data da sessão YYYY-MM-DD`,
          }
        ]
      }]
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erro Claude API (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { proposicoes: [], pareceres: [] };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const dataEnvio = parsed.dataEnvio ? `${parsed.dataEnvio}T12:00:00.000Z` : undefined;

    const proposicoes: Proposicao[] = (parsed.proposicoes || []).map((p: any) => ({
      tipo: p.tipo,
      numero: String(p.numero).replace(/\./g, ""),
      ano: parseInt(p.ano),
      ementa: p.ementa || "",
      observacao: p.observacao || undefined,
      dataEnvio,
      autorNome: p.autorNome || undefined,
    }));

    const pareceres: ParecerItem[] = (parsed.pareceres || []).map((p: any) => ({
      tipo: p.tipo,
      numero: String(p.numero).replace(/\./g, ""),
      ano: parseInt(p.ano),
      parecerComissao: p.parecerComissao || "",
      parecerConjunto: !!p.parecerConjunto,
      proxComissao: p.proxComissao || undefined,
      autorNome: p.autorNome || undefined,
      ementa: p.ementa || undefined,
      dataParecere: dataEnvio,
    }));

    return { proposicoes, pareceres, dataEnvio };
  } catch {
    return { proposicoes: [], pareceres: [] };
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let proposicoes: Proposicao[] = [];
  let pareceres: ParecerItem[] = [];
  let dataEnvio: string | undefined;
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    const nome = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (nome.endsWith(".pdf")) {
      try {
        const result = await extrairPdfComClaude(buffer);
        proposicoes = result.proposicoes;
        pareceres = result.pareceres;
        dataEnvio = result.dataEnvio;
      } catch (e: any) {
        return NextResponse.json({ error: e.message || "Erro ao processar PDF" }, { status: 500 });
      }
    } else {
      let texto = "";
      try {
        if (nome.endsWith(".docx") || nome.endsWith(".doc")) {
          const result = await mammoth.extractRawText({ buffer });
          texto = result.value;
        } else if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
          const wb = XLSX.read(buffer, { type: "buffer" });
          texto = wb.SheetNames.map(n => XLSX.utils.sheet_to_txt(wb.Sheets[n])).join("\n");
        } else {
          return NextResponse.json({ error: "Formato não suportado. Use PDF, Word ou Excel." }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Erro ao ler o arquivo." }, { status: 400 });
      }
      dataEnvio = extrairData(texto);
      proposicoes = extrairComRegex(texto);
      pareceres = extrairPareceres(texto, dataEnvio);
    }
  } else {
    const body = await req.json();
    const texto = body.texto || "";
    if (!texto.trim()) return NextResponse.json({ error: "Nenhum texto fornecido" }, { status: 400 });
    dataEnvio = extrairData(texto);
    proposicoes = extrairComRegex(texto);
    pareceres = extrairPareceres(texto, dataEnvio);
  }

  const vereadores = await prisma.vereador.findMany({ select: { id: true, nome: true } });

  function matchVereador(autorNome?: string): string | undefined {
    if (!autorNome) return undefined;
    const lower = autorNome.toLowerCase().trim();
    if (lower.includes("executivo") || lower.includes("prefeitura")) return undefined;
    const palavras = lower.split(/\s+/).filter(p => p.length > 2);
    if (palavras.length === 0) return undefined;
    const scores = vereadores
      .map(v => ({ id: v.id, score: palavras.filter(p => v.nome.toLowerCase().includes(p)).length }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scores.length === 0) return undefined;
    const melhor = scores[0];
    if (melhor.score >= 2) return melhor.id;
    if (scores.length === 1) return melhor.id;
    return undefined;
  }

  proposicoes = proposicoes.map(p => ({ ...p, vereadorId: p.vereadorId ?? matchVereador(p.autorNome) }));

  // Verifica existência das proposições (apresentação)
  const existentesProps = await Promise.all(
    proposicoes.map(p => prisma.segov.findFirst({ where: { tipo: p.tipo, numero: p.numero, ano: p.ano } }))
  );
  const proposicoesResult = proposicoes.map((p, i) => ({ ...p, jaExiste: existentesProps[i] !== null }));

  // Verifica existência dos pareceres no SEGOV
  const existentesParec = await Promise.all(
    pareceres.map(p => prisma.segov.findFirst({ where: { tipo: p.tipo, numero: p.numero, ano: p.ano } }))
  );
  const parecedResult = pareceres.map((p, i) => ({ ...p, jaExiste: existentesParec[i] !== null }));

  return NextResponse.json({
    proposicoes: proposicoesResult,
    pareceres: parecedResult,
    total: proposicoesResult.length + parecedResult.length,
    dataEnvio,
  });
}
