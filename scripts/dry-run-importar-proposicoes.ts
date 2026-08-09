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
  "Realizada leitura de parecer": "Com Parecer",
  "Veto rejeitado": "Com Parecer",
  "Parecer a veto": "Com Parecer",
  "Documento encaminhado": "Em análise",
  "Votação": "Em análise",
  "Aguardando votação": "Em análise",
  "Pedido de vistas": "Em análise",
  "Apreciação de emendas": "Em análise",
};

const TERMOS_EXECUTIVO = ["prefeito municipal", "prefeitura municipal", "poder executivo"];

function nomeBaseParaMatch(nome: string): string {
  return nome.replace(/\(.*?\)/g, "").trim().toLowerCase();
}

function splitAutores(campo: string | null | undefined): string[] {
  if (!campo) return [];
  return campo.split(",").map(s => s.trim()).filter(Boolean);
}

async function main() {
  const wb = XLSX.readFile(ARQUIVO);
  const ws = wb.Sheets["Proposições"];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  const vereadoresExistentes = await prisma.vereador.findMany({ select: { id: true, nome: true } });
  const mapaVereadores = new Map(vereadoresExistentes.map(v => [nomeBaseParaMatch(v.nome), v]));

  const statusSemMapa = new Set<string>();
  const linhasSemNumero: number[] = [];
  const linhasSemAno: number[] = [];
  const autoresNaoEncontrados = new Map<string, number>();
  const contagemStatus: Record<string, number> = {};
  const contagemTipo: Record<string, number> = {};
  let comExecutivo = 0;
  let totalAutoresIndividuais = 0;

  rows.forEach((r, idx) => {
    const linha = idx + 2;
    const numero = r["Número"];
    const ano = r["Ano"];
    const tipo = r["Tipo"];
    const situacao = (r["Situação"] || "").toString().trim();
    const autoresRaw = r["Autores"];

    if (!numero) linhasSemNumero.push(linha);
    if (!ano || isNaN(Number(ano))) linhasSemAno.push(linha);

    const statusMapeado = MAPA_STATUS[situacao];
    if (situacao && !statusMapeado) statusSemMapa.add(situacao);
    contagemStatus[statusMapeado || situacao || "(vazio)"] = (contagemStatus[statusMapeado || situacao || "(vazio)"] || 0) + 1;
    contagemTipo[tipo || "(vazio)"] = (contagemTipo[tipo || "(vazio)"] || 0) + 1;

    const autores = splitAutores(autoresRaw);
    let temExecutivo = false;
    autores.forEach(nome => {
      totalAutoresIndividuais++;
      const nomeBase = nomeBaseParaMatch(nome);
      if (TERMOS_EXECUTIVO.some(t => nomeBase.includes(t))) {
        temExecutivo = true;
        return;
      }
      if (!mapaVereadores.has(nomeBase)) {
        autoresNaoEncontrados.set(nome, (autoresNaoEncontrados.get(nome) || 0) + 1);
      }
    });
    if (temExecutivo) comExecutivo++;
  });

  console.log("========== RELATÓRIO DRY-RUN (nenhuma escrita no banco) ==========\n");
  console.log(`Total de linhas na planilha: ${rows.length}`);
  console.log(`Linhas sem "Número": ${linhasSemNumero.length}`, linhasSemNumero.slice(0, 10));
  console.log(`Linhas sem "Ano" válido: ${linhasSemAno.length}`, linhasSemAno.slice(0, 10));
  console.log(`Linhas com autor "Executivo/Prefeito": ${comExecutivo}`);
  console.log(`Total de menções de autores individuais: ${totalAutoresIndividuais}`);

  console.log("\n--- Situações sem mapeamento definido (cairiam sem status) ---");
  console.log(statusSemMapa.size ? [...statusSemMapa] : "(nenhuma — todas mapeadas)");

  console.log("\n--- Contagem por status mapeado ---");
  console.log(contagemStatus);

  console.log("\n--- Contagem por tipo ---");
  console.log(contagemTipo);

  console.log(`\n--- Vereadores já cadastrados: ${vereadoresExistentes.length} ---`);

  console.log(`\n--- Autores da planilha SEM correspondência em Vereador (${autoresNaoEncontrados.size} nomes distintos, seriam criados) ---`);
  const listaOrdenada = [...autoresNaoEncontrados.entries()].sort((a, b) => b[1] - a[1]);
  listaOrdenada.forEach(([nome, count]) => console.log(`  ${nome}  (${count}x)`));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
