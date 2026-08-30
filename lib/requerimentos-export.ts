import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { resolverAutores } from "@/lib/vereador-match";

export type RequerimentoItem = {
  tipo: string;
  numero: string;
  ano: number;
  descricao: string;
  vereador?: { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string } | null;
  autorNome?: string | null;
  status: string;
  dataEnvio?: string | null;
  fluxo?: Record<string, { done: boolean; doneAt?: string; data?: any }> | null;
};

export const COLUNAS_RELATORIO_REQ = [
  { key: "item",      label: "Item" },
  { key: "descricao", label: "Descrição" },
  { key: "autor",     label: "Autor / Vereador" },
  { key: "status",    label: "Status" },
  { key: "entrada",   label: "Data de Entrada" },
] as const;

export type ColunasKeyReq = typeof COLUNAS_RELATORIO_REQ[number]["key"];

const FLUXO_DEF_EXPORT = [
  { key: "protocolado",    labelCurto: "Prot." },
  { key: "pautado",        labelCurto: "Pautado" },
  { key: "leituraVotacao", labelCurto: "Leitura/Vot." },
  { key: "resultado",      labelCurto: "Resultado" },
];

function formatarData(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}

function autorDe(item: RequerimentoItem) {
  return item.vereador?.nome || item.autorNome || "—";
}

function fmtNumero(n: string) {
  return n.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function valorColuna(item: RequerimentoItem, key: ColunasKeyReq): string {
  switch (key) {
    case "item":      return `${item.tipo} ${fmtNumero(item.numero)}/${item.ano}`;
    case "descricao": return item.descricao || "";
    case "autor":     return autorDe(item);
    case "status":    return item.status;
    case "entrada":   return formatarData(item.dataEnvio);
  }
}

export function exportarRequerimentosExcel(
  itens: RequerimentoItem[],
  colunas: ColunasKeyReq[],
  nomeArquivo = "requerimentos.xlsx"
) {
  const headers = colunas.map(k => COLUNAS_RELATORIO_REQ.find(c => c.key === k)!.label);
  const linhas = itens.map(item => {
    const row: Record<string, string> = {};
    colunas.forEach((k, i) => { row[headers[i]] = valorColuna(item, k); });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = headers.map(h => ({ wch: Math.min(60, Math.max(12, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Itens");
  XLSX.writeFile(wb, nomeArquivo);
}

function statusChip(status: string): { bg: [number, number, number]; fg: [number, number, number] } {
  switch (status) {
    case "Em análise": return { bg: [219, 234, 254], fg: [29, 78, 216] };
    case "Aprovado":   return { bg: [187, 247, 208], fg: [22, 101, 52] };
    case "Rejeitado":  return { bg: [254, 202, 202], fg: [185, 28, 28] };
    case "Arquivado":  return { bg: [243, 244, 246], fg: [75, 85, 99] };
    case "Retirado":   return { bg: [255, 237, 213], fg: [154, 52, 18] };
    default:           return { bg: [254, 243, 199], fg: [146, 64, 14] }; // Aguardando
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/.{1,2}/g) || ["8B", "00", "00"];
  return [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)];
}

export function exportarRequerimentosPDF(
  itens: RequerimentoItem[],
  titulo = "Requerimentos",
  corPrimaria = "#8B0000",
  nomeArquivo = "requerimentos.pdf"
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = 841.89;
  const H = 595.28;
  const margin = 36;
  const cw = W - 2 * margin;
  const pad = 12;
  const descLH = 15;
  const [pr, pg, pb] = hexToRgb(corPrimaria);

  let pageNum = 1;

  function drawPageHeader() {
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, 0, W, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${titulo}  |  Câmara Municipal de Nova Lima`, margin, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString("pt-BR")}  |  ${itens.length} item(ns)  |  Pág. ${pageNum}`,
      W - margin, 16, { align: "right" }
    );
  }

  drawPageHeader();
  let y = 32;

  itens.forEach((item, idx) => {
    const fluxo = (item.fluxo || {}) as Record<string, { done: boolean; doneAt?: string; data?: any }>;

    // Mesma resolução usada nas telas — autor do Poder Executivo aparece como
    // "Poder Executivo - Nome", não só o nome solto.
    const nomes = resolverAutores(item.vereador, item.autorNome, []).map(a => a.label);

    const marcados = FLUXO_DEF_EXPORT.filter(d => fluxo[d.key]?.done);
    const hasFluxo = marcados.length > 0;
    const resultado = fluxo["resultado"]?.data?.resultado;
    const graficoCor: "verde" | "vermelho" | "normal" =
      resultado === "aprovado" ? "verde" : resultado === "reprovado" ? "vermelho" : "normal";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const descLinhas = doc.splitTextToSize(item.descricao || "", cw - pad * 2 - 4) as string[];
    const maxLines = 5;
    const descDisplay = descLinhas.slice(0, maxLines) as string[];
    if (descLinhas.length > maxLines) descDisplay[maxLines - 1] = descDisplay[maxLines - 1] + "…";

    const cardH = pad
      + 16
      + 10
      + descDisplay.length * descLH
      + (nomes.length > 0 ? 8 + 14 : 0)
      + (hasFluxo ? 10 + 1 + 10 + 30 : 0)
      + pad;

    if (y + cardH + 8 > H - 10 && idx > 0) {
      doc.addPage();
      pageNum++;
      drawPageHeader();
      y = 32;
    }

    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(1.4);
    doc.rect(margin, y, cw, cardH, "S");

    let cy = y + pad;
    let cx = margin + pad;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const tipoW = doc.getTextWidth(item.tipo) + 8;
    doc.setFillColor(254, 202, 202);
    doc.rect(cx, cy + 1, tipoW, 13, "F");
    doc.setTextColor(185, 28, 28);
    doc.text(item.tipo, cx + 4, cy + 10);
    cx += tipoW + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(25, 25, 25);
    const numStr = `${fmtNumero(item.numero)}/${item.ano}`;
    doc.text(numStr, cx, cy + 12);
    cx += doc.getTextWidth(numStr) + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const sc = statusChip(item.status);
    const statusW = doc.getTextWidth(item.status) + 10;
    doc.setFillColor(sc.bg[0], sc.bg[1], sc.bg[2]);
    doc.rect(cx, cy + 1, statusW, 13, "F");
    doc.setTextColor(sc.fg[0], sc.fg[1], sc.fg[2]);
    doc.text(item.status, cx + 5, cy + 10);

    cy += 16;
    cy += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(55, 55, 55);
    descDisplay.forEach((linha, i) => {
      doc.text(linha, margin + pad, cy + i * descLH);
    });
    cy += descDisplay.length * descLH;

    if (nomes.length > 0) {
      cy += 8;
      let ax = margin + pad;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      nomes.forEach(nome => {
        const nW = doc.getTextWidth(nome) + 10;
        doc.setFillColor(238, 242, 255);
        doc.rect(ax, cy, nW, 12, "F");
        doc.setTextColor(67, 56, 202);
        doc.text(nome, ax + 5, cy + 9);
        ax += nW + 5;
      });
      cy += 14;
    }

    if (hasFluxo) {
      cy += 10;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin + pad, cy, W - margin - pad, cy);
      cy += 10;

      const nodeR = 6.5;
      const stepW = Math.min(90, cw / marcados.length);
      const startX = margin + pad + nodeR;
      const nodeY = cy + nodeR;

      marcados.forEach((step, i) => {
        const x = startX + i * stepW;
        const isLast = i === marcados.length - 1;

        let nr = 22, ng = 163, nb = 74;
        if (graficoCor === "vermelho") { nr = 220; ng = 38; nb = 38; }
        else if (graficoCor === "normal" && isLast) { nr = 37; ng = 99; nb = 235; }

        doc.setFillColor(nr, ng, nb);
        doc.circle(x, nodeY, nodeR, "F");

        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.2);
        doc.line(x - 2.8, nodeY, x - 0.5, nodeY + 2.8);
        doc.line(x - 0.5, nodeY + 2.8, x + 3.5, nodeY - 2.8);

        if (i < marcados.length - 1) {
          doc.setDrawColor(nr, ng, nb);
          doc.setLineWidth(0.8);
          const lx1 = x + nodeR + 1;
          const lx2 = x + stepW - nodeR - 1;
          doc.line(lx1, nodeY, lx2, nodeY);
          doc.line(lx2, nodeY, lx2 - 3, nodeY - 2);
          doc.line(lx2, nodeY, lx2 - 3, nodeY + 2);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(50, 50, 50);
        doc.text(step.labelCurto, x, nodeY + nodeR + 9, { align: "center", maxWidth: stepW - 2 });
      });
    }

    y += cardH + 8;
  });

  doc.save(nomeArquivo);
}
