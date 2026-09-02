import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ARQUIVO = "C:/Users/jucil/2 - Sistema para Pautas/proposicoes_camara_novalima.xlsx";

const MAPA_STATUS: Record<string, string> = {
  "Matéria aprovada": "Aprovado",
  "Matéria sancionada": "Aprovado",
  "Matéria promulgada": "Aprovado",
  "Matéria rejeitada": "Rejeitado",
  "Veto mantido": "Rejeitado",
  "Matéria arquivada": "Arquivado",
  "Matéria retirada de pauta": "Retirado",
  "Aguardando parecer": "Aguardando",
  "Dispensa de parecer": "Aguardando",
  "Pedido de audiência pública": "Aguardando",
  "Pedido adiamento de votação": "Aguardando",
  "Realizada leitura de parecer": "Em análise",
  "Veto rejeitado": "Em análise",
  "Parecer a veto": "Em análise",
  "Documento encaminhado": "Em análise",
  "Votação": "Em análise",
  "Aguardando votação": "Em análise",
  "Pedido de vistas": "Em análise",
  "Apreciação de emendas": "Em análise",
};

const TERMOS_EXECUTIVO = ["prefeito municipal", "prefeitura municipal", "poder executivo"];

// Autor da planilha (nome completo) -> nome já cadastrado no sistema
const ALIAS_VEREADOR: Record<string, string> = {
  "Danúbio de Souza Machado": "Danubio Machado",
  "Viviane Gomes de Matos": "Viviane Matos",
  "Silvânio Aguiar": "Silvanio Silva",
  "Cláudio José de Deus – Claudinho Valle": "Claudio José",
  "Anísio Clemente Filho – Anisinho": "Anisio Filho",
  "Thiago Felipe de Almeida": "Thiago Almeida",
  "Joselino Santana Dias – Zelino": "Joselino Dias",
  "Ismael Soares da Cruz (Mael)": "Ismael Cruz",
  "Gliverson Junio Dias Marques": "Gliverson Marques",
  "Wesley de Jesus Silva": "Wesley Silva",
  "Pedro Henrique Dornas de Assunção Ribeiro": "Pedro Dornas",
  "Abner Henrique Santana Soares": "Abner Soares",
  "Álvaro Azevedo": "Alvaro Azevedo",
  "Nilton da Cruz Oliveira (Nilton de Água Limpa)": "Nilton Oliveira",
  "Adilson Moraes Braga (Taioba)": "Adilson Braga",
};

// Autores da planilha sem correspondência -- serão criados como novo Vereador (nome exatamente como na planilha)
const NOVOS_VEREADORES = new Set([
  "José Carlos de Oliveira",
  "Juliana Ellen de Sales",
  "José Doroteu Martiniano",
  "Alessandro Bonifácio (Coxinha)",
  "Ederson Pinto (Kim do Gás)",
  "Tiago Tito",
  "Fausto Niquini",
  "Flávio de Almeida",
  "José Guedes",
]);

function ehInstitucional(nome: string): boolean {
  const n = nome.toLowerCase();
  return n.startsWith("mesa diretora") || n === "autor personalizado";
}

function ehExecutivo(nome: string): boolean {
  const n = nome.toLowerCase();
  return TERMOS_EXECUTIVO.some(t => n.includes(t));
}

// Divide o campo "Autores" por vírgula, mas ignora vírgulas dentro de parênteses
function splitAutores(campo: string | null | undefined): string[] {
  if (!campo) return [];
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  for (const ch of campo) {
    if (ch === "(") profundidade++;
    if (ch === ")") profundidade--;
    if (ch === "," && profundidade === 0) {
      partes.push(atual.trim());
      atual = "";
    } else {
      atual += ch;
    }
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

async function main() {
  const wb = XLSX.readFile(ARQUIVO);
  const ws = wb.Sheets["Proposições"];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`Linhas lidas da planilha: ${rows.length}`);

  // Cache de vereadores por nome (sistema)
  const vereadoresExistentes = await prisma.vereador.findMany({ select: { id: true, nome: true } });
  const cacheVereadorPorNome = new Map(vereadoresExistentes.map(v => [v.nome, v.id]));

  // Cria (ou reaproveita) os vereadores novos identificados no dry-run
  for (const nome of NOVOS_VEREADORES) {
    if (cacheVereadorPorNome.has(nome)) continue;
    const existente = await prisma.vereador.findFirst({ where: { nome } });
    if (existente) {
      cacheVereadorPorNome.set(nome, existente.id);
      continue;
    }
    const criado = await prisma.vereador.create({
      data: { nome, partido: "A definir", legislatura: "A definir", ativo: false },
    });
    cacheVereadorPorNome.set(nome, criado.id);
    console.log(`Vereador criado: ${nome} (${criado.id})`);
  }

  type LinhaProcessada = {
    numero: string; ano: number; tipo: string; ementa: string;
    status: string; setorAtual: string | null; protocolo: string | null;
    autoresTexto: string; vereadorIds: string[]; autorExternoTexto: string | null;
  };

  const processadas: LinhaProcessada[] = [];
  const naoTratados = new Set<string>();

  for (const r of rows) {
    const numero = String(r["Número"] ?? "").trim();
    const ano = Number(r["Ano"]);
    const tipo = String(r["Tipo"] ?? "").trim();
    const ementa = String(r["Ementa"] ?? "").trim();
    const situacao = String(r["Situação"] ?? "").trim();
    const setorAtual = r["Setor Atual"] ? String(r["Setor Atual"]).trim() : null;
    const protocolo = r["Protocolo"] !== null && r["Protocolo"] !== undefined ? String(r["Protocolo"]).trim() : null;
    const autoresRaw = String(r["Autores"] ?? "");

    const status = MAPA_STATUS[situacao] || "Aguardando";
    const autoresSplit = splitAutores(autoresRaw);

    const vereadorIds: string[] = [];
    const textoInstitucionalOuExecutivo: string[] = [];

    for (const nome of autoresSplit) {
      if (ehExecutivo(nome) || ehInstitucional(nome)) {
        textoInstitucionalOuExecutivo.push(nome);
        continue;
      }
      const nomeSistema = ALIAS_VEREADOR[nome] || (NOVOS_VEREADORES.has(nome) ? nome : null);
      if (nomeSistema && cacheVereadorPorNome.has(nomeSistema)) {
        const id = cacheVereadorPorNome.get(nomeSistema)!;
        if (!vereadorIds.includes(id)) vereadorIds.push(id);
      } else {
        naoTratados.add(nome);
      }
    }

    processadas.push({
      numero, ano, tipo, ementa, status, setorAtual, protocolo,
      autoresTexto: autoresRaw.trim(),
      vereadorIds,
      autorExternoTexto: textoInstitucionalOuExecutivo.length ? textoInstitucionalOuExecutivo.join(", ") : null,
    });
  }

  if (naoTratados.size) {
    console.log("\nATENÇÃO -- autores não tratados (não deveria acontecer, abortando):");
    console.log([...naoTratados]);
    throw new Error("Existem autores não mapeados. Abortando antes de tocar no banco.");
  }

  console.log(`\nLinhas processadas com sucesso: ${processadas.length}`);
  console.log("Iniciando wipe + importação...\n");

  await prisma.$transaction([
    prisma.votoParecerVereador.deleteMany(),
    prisma.proposicaoComissao.deleteMany(),
    prisma.emenda.deleteMany(),
    prisma.pautaItem.deleteMany(),
    prisma.proposicaoAutor.deleteMany(),
    prisma.proposicao.deleteMany(),
    prisma.segov.deleteMany(),
  ]);
  console.log("Tabelas limpas: Segov, Proposicao (e relacionadas).");

  // Segov: um vereador principal (o primeiro encontrado) + texto com todos os autores
  const CHUNK = 500;
  for (let i = 0; i < processadas.length; i += CHUNK) {
    const chunk = processadas.slice(i, i + CHUNK);
    await prisma.segov.createMany({
      data: chunk.map(p => ({
        numero: p.numero,
        ano: p.ano,
        tipo: p.tipo,
        ementa: p.ementa,
        vereadorId: p.vereadorIds[0] ?? null,
        autorNome: p.autoresTexto,
        status: p.status,
        setorAtual: p.setorAtual,
        protocolo: p.protocolo,
      })),
    });
  }
  console.log(`Segov: ${processadas.length} registros criados.`);

  // Proposicao: relação de autores completa (todos os vereadores identificados)
  let contProposicao = 0;
  const LOTE = 50;
  for (let i = 0; i < processadas.length; i += LOTE) {
    const lote = processadas.slice(i, i + LOTE);
    await Promise.all(lote.map(async p => {
      await prisma.proposicao.create({
        data: {
          numero: p.numero,
          ano: p.ano,
          tipo: p.tipo,
          ementa: p.ementa,
          origemTipo: p.vereadorIds.length ? "vereador" : "executivo",
          autorExterno: p.vereadorIds.length ? null : (p.autorExternoTexto || p.autoresTexto || null),
          dataEntrada: new Date(),
          status: p.status,
          setorAtual: p.setorAtual,
          protocolo: p.protocolo,
          autores: p.vereadorIds.length
            ? { create: p.vereadorIds.map(vereadorId => ({ vereadorId })) }
            : undefined,
        },
      });
      contProposicao++;
    }));
  }
  console.log(`Proposicao: ${contProposicao} registros criados.`);

  console.log("\nImportação concluída.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
