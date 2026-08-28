import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { ehPoderExecutivo } from "@/lib/vereador-match";

export type SegovItem = {
  tipo: string;
  numero: string;
  ano: number;
  ementa: string;
  vereador?: { nome: string; poder?: string } | null;
  autorNome?: string | null;
  observacao?: string | null;
  parecerComissao?: string | null;
  parecerConjunto?: boolean;
  proxComissao?: string | null;
  status: string;
  dataEnvio?: string | null;
  updatedAt?: string | null;
  fluxo?: Record<string, { done: boolean; doneAt?: string; data?: any }> | null;
};

export const COLUNAS_RELATORIO = [
  { key: "proposicao",      label: "Proposição" },
  { key: "ementa",          label: "Ementa" },
  { key: "autor",           label: "Autor / Vereador" },
  { key: "comissaoDestino", label: "Comissão Destino" },
  { key: "parecerComissao", label: "Parecer da Comissão" },
  { key: "parecerConjunto", label: "Conjunto" },
  { key: "proxComissao",    label: "Próxima Comissão" },
  { key: "status",          label: "Status" },
  { key: "entrada",         label: "Data de Entrada" },
  { key: "ultimaMov",       label: "Última Movimentação" },
] as const;

export type ColunasKey = typeof COLUNAS_RELATORIO[number]["key"];

const FLUXO_DEF_EXPORT = [
  { key: 'protocolado',         labelCurto: 'Prot.'      },
  { key: 'pautado',             labelCurto: 'Pautado'    },
  { key: 'comissao1',           labelCurto: 'Com. 1'     },
  { key: 'comissao2',           labelCurto: 'Com. 2'     },
  { key: 'comissao3',           labelCurto: 'Com. 3'     },
  { key: 'comissaoEspecial',    labelCurto: 'C. Esp.'    },
  { key: 'comissaoConjunta',    labelCurto: 'C. Conj.'   },
  { key: 'dispensaParecer',     labelCurto: 'D. Par.'    },
  { key: 'dispensaIntersticio', labelCurto: 'D. Int.'    },
  { key: 'pedidoVista',         labelCurto: 'P. Vista'   },
  { key: 'pedidoAdiamento',     labelCurto: 'P. Adj.'    },
  { key: 'emenda',              labelCurto: 'Emenda'     },
  { key: 'emendaNumero',        labelCurto: 'Id. Emenda' },
  { key: 'votacao1',            labelCurto: '1ª Vot.'    },
  { key: 'votacao2',            labelCurto: '2ª Vot.'    },
  { key: 'resultadoFinal',      labelCurto: 'Resultado'  },
]

function formatarData(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}

function autorDe(item: SegovItem) {
  return item.vereador?.nome || item.autorNome || "—";
}

function valorColuna(item: SegovItem, key: ColunasKey): string {
  switch (key) {
    case "proposicao":      return `${item.tipo} ${item.numero}/${item.ano}`;
    case "ementa":          return item.ementa || "";
    case "autor":           return autorDe(item);
    case "comissaoDestino": return item.observacao || "";
    case "parecerComissao": return item.parecerComissao || "";
    case "parecerConjunto": return item.parecerConjunto ? "Sim" : "";
    case "proxComissao":    return item.proxComissao || "";
    case "status":          return item.status;
    case "entrada":         return formatarData(item.dataEnvio);
    case "ultimaMov":       return formatarData(item.updatedAt);
  }
}

export function exportarSegovExcel(
  itens: SegovItem[],
  colunas: ColunasKey[],
  nomeArquivo = "segov.xlsx"
) {
  const headers = colunas.map(k => COLUNAS_RELATORIO.find(c => c.key === k)!.label);
  const linhas = itens.map(item => {
    const row: Record<string, string> = {};
    colunas.forEach((k, i) => { row[headers[i]] = valorColuna(item, k); });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = headers.map(h => ({ wch: Math.min(60, Math.max(12, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Proposições");
  XLSX.writeFile(wb, nomeArquivo);
}

function fmtNumero(n: string) {
  return n.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtDDMM(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function statusChip(status: string): { bg: [number,number,number]; fg: [number,number,number] } {
  switch (status) {
    case "Com Parecer":  return { bg: [233,213,255], fg: [107,33,168] };
    case "Em análise":   return { bg: [219,234,254], fg: [29,78,216]  };
    case "Aprovado":     return { bg: [187,247,208], fg: [22,101,52]  };
    case "Rejeitado":    return { bg: [254,202,202], fg: [185,28,28]  };
    case "Arquivado":    return { bg: [243,244,246], fg: [75,85,99]   };
    case "Retirado":     return { bg: [255,237,213], fg: [154,52,18]  };
    default:             return { bg: [254,243,199], fg: [146,64,14]  }; // Aguardando
  }
}

/**
 * Relatório em PDF que reproduz o mesmo cartão exibido na tela de Proposições.
 *
 * Formato RETRATO (A4). A ementa nunca é truncada — o cartão cresce conforme o
 * texto e a quebra de página acontece antes de cortar. Chips de autor e nós do
 * fluxo de tramitação quebram em várias linhas quando não cabem na largura.
 *
 * Ordem de impressão: Poder Executivo primeiro, depois os vereadores; dentro de
 * cada grupo, os já aprovados vão para o fim. O restante preserva a ordem
 * exibida na tela (Array.prototype.sort é estável).
 */
export function exportarSegovPDF(
  itens: SegovItem[],
  _colunas?: ColunasKey[],
  nomeArquivo = "segov.pdf"
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = 595.28;
  const H = 841.89;
  const margin = 30;
  const cw = W - 2 * margin;
  const pad = 10;
  const innerW = cw - pad * 2;
  const ementaLH = 13;
  const nodeR = 6;
  const stepW = 74;
  const fluxoRowH = 44;
  const chipLH = 14;
  const topoConteudo = 30;

  const grupoDe = (i: SegovItem) => (ehPoderExecutivo(i) ? 0 : 1);
  const aprovadoDe = (i: SegovItem) => (i.status === "Aprovado" ? 1 : 0);
  const ordenados = [...itens].sort(
    (a, b) => grupoDe(a) - grupoDe(b) || aprovadoDe(a) - aprovadoDe(b)
  );

  let pageNum = 1;

  function cabecalhoPagina() {
    doc.setFillColor(139, 0, 0);
    doc.rect(0, 0, W, 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("Proposições  |  Câmara Municipal de Nova Lima", margin, 14.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `${new Date().toLocaleDateString("pt-BR")}  ·  ${ordenados.length} proposicao(oes)  ·  Pag. ${pageNum}`,
      W - margin, 14.5, { align: "right" }
    );
  }

  function novaPagina() {
    doc.addPage();
    pageNum++;
    cabecalhoPagina();
    return topoConteudo;
  }

  /** Distribui os chips em linhas, quebrando quando estouram a largura. */
  function linhasDeChips(nomes: string[], maxW: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const linhas: { nome: string; w: number }[][] = [];
    let atual: { nome: string; w: number }[] = [];
    let x = 0;
    nomes.forEach(nome => {
      const w = doc.getTextWidth(nome) + 9;
      if (x + w > maxW && atual.length) {
        linhas.push(atual);
        atual = [];
        x = 0;
      }
      atual.push({ nome, w });
      x += w + 4;
    });
    if (atual.length) linhas.push(atual);
    return linhas;
  }

  cabecalhoPagina();
  let y = topoConteudo;
  let grupoAtual = -1;

  ordenados.forEach(item => {
    const fluxo = (item.fluxo || {}) as Record<string, { done: boolean; doneAt?: string; data?: any }>;
    const pautadoDoneAt = fluxo["pautado"]?.doneAt;
    const diasEmAberto = pautadoDoneAt
      ? Math.floor((Date.now() - new Date(pautadoDoneAt).getTime()) / 86400000)
      : null;

    const nomes: string[] = [];
    if (item.vereador?.nome) nomes.push(item.vereador.nome);
    if (item.autorNome) {
      (item.autorNome as string).split(/\s+e\s+|,\s+/).forEach((n: string) => {
        const t = n.trim();
        if (t && !nomes.includes(t)) nomes.push(t);
      });
    }

    const marcados = FLUXO_DEF_EXPORT.filter(d => fluxo[d.key]?.done);
    const porLinha = Math.max(1, Math.floor(innerW / stepW));
    const fluxoLinhas = marcados.length ? Math.ceil(marcados.length / porLinha) : 0;

    const graficoCor: "verde" | "vermelho" | "normal" = fluxo["resultadoFinal"]?.done
      ? (fluxo["resultadoFinal"]?.data?.resultado === "aprovado" ? "verde" : "vermelho")
      : "normal";

    // A fonte precisa estar definida ANTES de medir/quebrar o texto.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const ementaLinhas = doc.splitTextToSize(item.ementa || "", innerW) as string[];
    const linhasAutores = nomes.length ? linhasDeChips(nomes, innerW) : [];

    const cardH =
      pad +
      15 +                                                    // cabeçalho do cartão
      8 +
      ementaLinhas.length * ementaLH +
      (linhasAutores.length ? 6 + linhasAutores.length * chipLH : 0) +
      (fluxoLinhas ? 8 + 1 + 8 + fluxoLinhas * fluxoRowH : 0) +
      pad;

    // Faixa de seção ao trocar de grupo (Executivo -> Vereadores)
    const g = grupoDe(item);
    if (g !== grupoAtual) {
      grupoAtual = g;
      if (y + 22 + 60 > H - 20) y = novaPagina();
      doc.setFillColor(238, 238, 238);
      doc.rect(margin, y, cw, 16, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(g === 0 ? "PODER EXECUTIVO" : "VEREADORES", margin + 6, y + 11);
      y += 22;
    }

    if (y + cardH > H - 20) y = novaPagina();

    doc.setDrawColor(22, 163, 74);
    doc.setLineWidth(1.2);
    doc.rect(margin, y, cw, cardH, "S");

    let cy = y + pad;
    let cx = margin + pad;

    // ── Cabeçalho: tipo, número, status, pautado, dias em aberto ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const tipoW = doc.getTextWidth(item.tipo) + 7;
    doc.setFillColor(254, 202, 202);
    doc.rect(cx, cy + 1, tipoW, 12, "F");
    doc.setTextColor(185, 28, 28);
    doc.text(item.tipo, cx + 3.5, cy + 9.5);
    cx += tipoW + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(25, 25, 25);
    const numStr = `${fmtNumero(item.numero)}/${item.ano}`;
    doc.text(numStr, cx, cy + 11);
    cx += doc.getTextWidth(numStr) + 7;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const sc = statusChip(item.status);
    const statusW = doc.getTextWidth(item.status) + 9;
    doc.setFillColor(sc.bg[0], sc.bg[1], sc.bg[2]);
    doc.rect(cx, cy + 1, statusW, 12, "F");
    doc.setTextColor(sc.fg[0], sc.fg[1], sc.fg[2]);
    doc.text(item.status, cx + 4.5, cy + 9.5);
    cx += statusW + 7;

    if (pautadoDoneAt) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      const pText = `Pautado: ${new Date(pautadoDoneAt).toLocaleDateString("pt-BR")}`;
      doc.text(pText, cx, cy + 9.5);
      cx += doc.getTextWidth(pText) + 7;
    }

    if (diasEmAberto !== null) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      if (diasEmAberto > 30)      doc.setTextColor(220, 38, 38);
      else if (diasEmAberto > 15) doc.setTextColor(161, 98, 7);
      else                        doc.setTextColor(22, 163, 74);
      doc.text(`${diasEmAberto} dias em aberto`, cx, cy + 9.5);
    }
    cy += 15 + 8;

    // ── Ementa (completa, sem truncar) ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(55, 55, 55);
    ementaLinhas.forEach((linha, i) => {
      doc.text(linha, margin + pad, cy + i * ementaLH);
    });
    cy += ementaLinhas.length * ementaLH;

    // ── Chips de autor (quebram em várias linhas) ──
    if (linhasAutores.length) {
      cy += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      linhasAutores.forEach((linha, li) => {
        let ax = margin + pad;
        const ly = cy + li * chipLH;
        linha.forEach(({ nome, w }) => {
          doc.setFillColor(238, 242, 255);
          doc.rect(ax, ly, w, 11, "F");
          doc.setTextColor(67, 56, 202);
          doc.text(nome, ax + 4.5, ly + 8);
          ax += w + 4;
        });
      });
      cy += linhasAutores.length * chipLH;
    }

    // ── Fluxo de tramitação ──
    if (fluxoLinhas) {
      cy += 8;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin + pad, cy, W - margin - pad, cy);
      cy += 8;

      marcados.forEach((step, i) => {
        const linha = Math.floor(i / porLinha);
        const col = i % porLinha;
        const x = margin + pad + nodeR + col * stepW;
        const nodeY = cy + linha * fluxoRowH + nodeR;
        const sd = fluxo[step.key];
        const ultimoGeral = i === marcados.length - 1;
        const ultimoDaLinha = col === porLinha - 1;

        let nr = 22, ng = 163, nb = 74;
        if (graficoCor === "vermelho") { nr = 220; ng = 38; nb = 38; }
        else if (graficoCor === "normal" && ultimoGeral) { nr = 37; ng = 99; nb = 235; }

        doc.setFillColor(nr, ng, nb);
        doc.circle(x, nodeY, nodeR, "F");
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.1);
        doc.line(x - 2.6, nodeY, x - 0.5, nodeY + 2.6);
        doc.line(x - 0.5, nodeY + 2.6, x + 3.2, nodeY - 2.6);

        if (!ultimoGeral && !ultimoDaLinha) {
          doc.setDrawColor(nr, ng, nb);
          doc.setLineWidth(0.8);
          const lx1 = x + nodeR + 1;
          const lx2 = x + stepW - nodeR - 1;
          doc.line(lx1, nodeY, lx2, nodeY);
          doc.line(lx2, nodeY, lx2 - 3, nodeY - 2);
          doc.line(lx2, nodeY, lx2 - 3, nodeY + 2);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(50, 50, 50);
        doc.text(step.labelCurto, x, nodeY + nodeR + 8, { align: "center", maxWidth: stepW - 4 });

        if (sd?.doneAt) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          doc.setTextColor(140, 140, 140);
          doc.text(fmtDDMM(sd.doneAt), x, nodeY + nodeR + 15, { align: "center" });
        }

        if (sd?.data?.comissaoNome) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          const bw = Math.min(stepW - 6, doc.getTextWidth(sd.data.comissaoNome) + 6);
          doc.setFillColor(219, 234, 254);
          doc.rect(x - bw / 2, nodeY + nodeR + 18, bw, 8, "F");
          doc.setTextColor(29, 78, 216);
          doc.text(sd.data.comissaoNome, x, nodeY + nodeR + 24, { align: "center", maxWidth: bw - 2 });
        } else if (sd?.data?.resultado) {
          const rText = sd.data.resultado === "aprovado" ? "Aprov." : "Reprov.";
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          const bw = doc.getTextWidth(rText) + 7;
          if (sd.data.resultado === "aprovado") {
            doc.setFillColor(187, 247, 208); doc.setTextColor(22, 101, 52);
          } else {
            doc.setFillColor(254, 202, 202); doc.setTextColor(185, 28, 28);
          }
          doc.rect(x - bw / 2, nodeY + nodeR + 18, bw, 8, "F");
          doc.text(rText, x, nodeY + nodeR + 24, { align: "center" });
        }
      });
    }

    y += cardH + 7;
  });

  doc.save(nomeArquivo);
}
