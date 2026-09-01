import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { ehPoderExecutivo, resolverAutores } from "@/lib/vereador-match";

export type SegovItem = {
  tipo: string;
  numero: string;
  ano: number;
  ementa: string;
  vereador?: { id: string; nome: string; apelido?: string | null; ativo?: boolean; poder?: string } | null;
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

const CHAVES_COMISSAO = ["comissao1", "comissao2", "comissao3"];
const NEGATIVOS = new Set(["reprovado", "vetado"]);
// Etapas em que a cor do nó já é o próprio veredito (ver graficoCor) — mesma
// regra das telas, pra não repetir "Aprov./Reprov." embaixo do nó.
const PILL_RESULTADO_OCULTA = new Set([...CHAVES_COMISSAO, "comissaoEspecial", "resultadoFinal"]);

const FLUXO_DEF_EXPORT = [
  { key: 'protocolado',         labelCurto: 'Prot.'      },
  { key: 'pautado',             labelCurto: 'Pautado'    },
  { key: 'retiradoPauta',       labelCurto: 'Retirado'   },
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
  // "Sanção/Veto" quebra no meio da palavra ("Vet" + "o" numa segunda linha)
  // na coluna estreita do PDF (48pt) — encurtado só aqui, no relatório; nas
  // telas (mais largas) o rótulo completo continua igual. A etiqueta colorida
  // embaixo do nó (Sancionado/Vetado) já entrega o resultado específico.
  { key: 'sancaoVeto',          labelCurto: 'Sanção'},
  { key: 'promulgacao',         labelCurto: 'Promul.'    },
]

// Sanção/Veto e Promulgação são escolhidas como caminho primeiro (igual
// comissão) — o resultado só chega depois. Marcadas sem resultado ainda não
// valem como nó normal do fluxo, viram a bolinha fantasma no relatório
// também, igual já acontece nas telas.
const CHAVES_SANCAO = ["sancaoVeto", "promulgacao"];
const OPCOES_LABEL_PDF: Record<string, Record<string, string>> = {
  sancaoVeto: { sancionado: "Sancionado", vetado: "Vetado" },
  promulgacao: { promulgado: "Promulgado", vetado: "Vetado" },
};
function labelResultadoPdf(key: string, valor: string) {
  return OPCOES_LABEL_PDF[key]?.[valor] || (valor === "aprovado" ? "Aprov." : "Reprov.");
}

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
    case "Sancionado":   return { bg: [207,250,254], fg: [21,94,117]  };
    case "Promulgado":   return { bg: [209,250,229], fg: [4,120,87]   };
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
  // Passo curto de propósito: encurta as setas entre os nós e ainda permite
  // rótulos maiores (os textos abaixo da bolinha quebram em 2 linhas quando
  // precisam, e a altura da fileira já reserva espaço pra isso).
  const stepW = 48;
  const chipLH = 14;
  const alturaCabecalho = 40;
  const topoConteudo = alturaCabecalho + 10;

  const grupoDe = (i: SegovItem) => (ehPoderExecutivo(i) ? 0 : 1);
  const aprovadoDe = (i: SegovItem) => (["Aprovado", "Sancionado", "Promulgado"].includes(i.status) ? 1 : 0);
  const ordenados = [...itens].sort(
    (a, b) => grupoDe(a) - grupoDe(b) || aprovadoDe(a) - aprovadoDe(b)
  );

  let pageNum = 1;

  function cabecalhoPagina() {
    // Azul já usado nos botões e destaques do sistema (bg-blue-600), no lugar
    // do vermelho anterior.
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, W, alturaCabecalho, "F");

    // "Líder de Governo" é o título em destaque do relatório.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text("LÍDER DE GOVERNO", margin, 21);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(219, 234, 254);
    doc.text("Câmara Municipal de Nova Lima", margin, 32);

    doc.setFontSize(7.5);
    doc.text(
      `${new Date().toLocaleDateString("pt-BR")}  ·  ${ordenados.length} item(ns)`,
      W - margin, 21, { align: "right" }
    );
    doc.text(`Página ${pageNum}`, W - margin, 32, { align: "right" });
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
    // Sancionado: total fixo do processo inteiro (Protocolado até a Sanção),
    // em vez de continuar contando pra sempre desde o Pautado.
    const sancaoDoneAt = fluxo["sancaoVeto"]?.data?.resultado === "sancionado" ? fluxo["sancaoVeto"]?.doneAt : null;
    const protocoladoDoneAt = fluxo["protocolado"]?.doneAt;
    const diasProcessoConcluido = sancaoDoneAt && protocoladoDoneAt
      ? Math.floor((new Date(sancaoDoneAt).getTime() - new Date(protocoladoDoneAt).getTime()) / 86400000)
      : null;

    // Mesma resolução usada nas telas — autor do Poder Executivo aparece como
    // "Poder Executivo - Nome", não só o nome solto.
    const nomes = resolverAutores(item.vereador, item.autorNome, []).map(a => a.label);

    // Parecer conjunto: as comissões que o emitiram são desenhadas dentro de
    // uma moldura única, sem setas entre elas, e o passo avulso "C. Conj." sai
    // do fluxo (a moldura já comunica isso).
    const conjunta = !!fluxo["comissaoConjunta"]?.done;
    const comissoesDoGrupo = conjunta
      ? FLUXO_DEF_EXPORT.filter(d => CHAVES_COMISSAO.includes(d.key) && fluxo[d.key]?.done)
      : [];
    const agrupar = comissoesDoGrupo.length >= 2;

    const marcadosBase = FLUXO_DEF_EXPORT.filter(d => {
      if (!fluxo[d.key]?.done) return false;
      // Sanção/Veto e Promulgação marcadas mas sem resultado ainda são só um
      // caminho reservado — não entram como nó normal, viram a bolinha
      // fantasma mais abaixo.
      if (CHAVES_SANCAO.includes(d.key) && !fluxo[d.key]?.data?.resultado) return false;
      if (agrupar && d.key === "comissaoConjunta") return false;
      return true;
    });
    // Retirado de Pauta pode acontecer a qualquer momento da tramitação —
    // reposiciona pela DATA real dele em vez da ordem fixa do array.
    const idxRetirado = marcadosBase.findIndex(d => d.key === "retiradoPauta");
    let marcados = marcadosBase;
    if (idxRetirado !== -1) {
      const retirado = marcadosBase[idxRetirado];
      const semRetirado = marcadosBase.filter((_, i) => i !== idxRetirado);
      const dataRetirado = fluxo[retirado.key]?.doneAt || "";
      let posicao = semRetirado.findIndex(d => (fluxo[d.key]?.doneAt || "") > dataRetirado);
      if (posicao === -1) posicao = semRetirado.length;
      semRetirado.splice(posicao, 0, retirado);
      marcados = semRetirado;
    }
    const chavesAgrupadas = agrupar ? comissoesDoGrupo.map(d => d.key) : [];
    const porLinha = Math.max(1, Math.floor(innerW / stepW));

    // Mesma regra das telas: reprovação em qualquer comissão (1/2/3 ou Especial)
    // já pinta tudo de vermelho; aprovação nas três sequenciais OU na Especial
    // já pinta tudo de verde, sem esperar o Resultado Final ser marcado.
    const algumaComissaoReprovada = [...CHAVES_COMISSAO, "comissaoEspecial"].some(k => fluxo[k]?.data?.resultado === "reprovado");
    const todasComissoesAprovadas =
      CHAVES_COMISSAO.every(k => fluxo[k]?.done && fluxo[k]?.data?.resultado === "aprovado")
      || (fluxo["comissaoEspecial"]?.done && fluxo["comissaoEspecial"]?.data?.resultado === "aprovado");
    const graficoCor: "verde" | "vermelho" | "normal" = fluxo["resultadoFinal"]?.done
      ? (fluxo["resultadoFinal"]?.data?.resultado === "aprovado" ? "verde" : "vermelho")
      : algumaComissaoReprovada
        ? "vermelho"
        : todasComissoesAprovadas
          ? "verde"
          : "normal";

    // Depois do Resultado Final aprovado, falta o Executivo/a Mesa se
    // manifestar. Três estados: nada escolhido ainda → fantasma genérico
    // "Sanção"; Sanção/Veto ou Promulgação já escolhida como caminho mas sem
    // resultado → fantasma específico daquela etapa; com resultado → nó
    // normal, sem fantasma.
    // Rótulo curto de propósito — a coluna do fluxo no PDF é estreita (48pt) e
    // "Sanção/Veto" força quebra no meio da palavra sem espaço pra respirar.
    const chaveSancaoIncompleta = CHAVES_SANCAO.find(k => fluxo[k]?.done && !fluxo[k]?.data?.resultado);
    const labelFantasmaSancao = chaveSancaoIncompleta === "promulgacao" ? "Promul." : "Sanção";
    const aguardandoSancao =
      !!fluxo["resultadoFinal"]?.done &&
      fluxo["resultadoFinal"]?.data?.resultado === "aprovado" &&
      (!!chaveSancaoIncompleta || (!fluxo["sancaoVeto"]?.done && !fluxo["promulgacao"]?.done));

    // A fonte precisa estar definida ANTES de medir/quebrar o texto.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const ementaLinhas = doc.splitTextToSize(item.ementa || "", innerW) as string[];
    const linhasAutores = nomes.length ? linhasDeChips(nomes, innerW) : [];

    // Cada fileira do fluxo é medida pelo que ela realmente contém — uma
    // fileira só com rótulo de 1 linha não reserva o espaço de outra que tem
    // rótulo quebrado + data + etiqueta de comissão.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const passosReais = marcados.map(step => {
      const sd = fluxo[step.key];
      return {
        step,
        sd,
        labelLinhas: doc.splitTextToSize(step.labelCurto, stepW - 4) as string[],
        temData: !!sd?.doneAt,
        temEtiqueta: !!(sd?.data?.comissaoNome || sd?.data?.nome1 || (sd?.data?.resultado && !PILL_RESULTADO_OCULTA.has(step.key))),
        agrupado: chavesAgrupadas.includes(step.key),
        fantasma: false,
      };
    });
    // Bolinha tracejada azul indicando a próxima etapa esperada, ainda não
    // marcada — mesmo indicativo visual das telas, sem seta colorida saindo
    // dela (a espera ainda não é um fato).
    const labelFantasmaTexto = `Aguard. ${labelFantasmaSancao}`;
    const passos = aguardandoSancao
      ? [...passosReais, {
          step: { key: "_fantasma", labelCurto: labelFantasmaTexto },
          sd: undefined,
          labelLinhas: doc.splitTextToSize(labelFantasmaTexto, stepW - 4) as string[],
          temData: false,
          temEtiqueta: false,
          agrupado: false,
          fantasma: true,
        }]
      : passosReais;
    type Passo = typeof passos[number];
    const fileiras: Passo[][] = [];
    for (let i = 0; i < passos.length; i += porLinha) fileiras.push(passos.slice(i, i + porLinha));
    const alturaFileira = (f: Passo[]) =>
      12 +                                                        // bolinha
      Math.max(...f.map(p => p.labelLinhas.length)) * 8 +          // rótulo
      (f.some(p => p.temData) ? 9 : 0) +                           // data
      (f.some(p => p.temEtiqueta) ? 13 : 0) +                      // etiqueta
      (f.some(p => p.agrupado) ? 11 : 0) +                         // título da moldura
      4;
    const fluxoAltura = fileiras.reduce((s, f) => s + alturaFileira(f), 0);

    const cardH =
      pad +
      15 +                                                    // cabeçalho do cartão
      8 +
      ementaLinhas.length * ementaLH +
      (linhasAutores.length ? 6 + linhasAutores.length * chipLH : 0) +
      (fileiras.length ? 8 + 1 + 8 + fluxoAltura : 0) +
      pad;

    // Faixa de seção ao trocar de grupo (Executivo -> Vereadores)
    const g = grupoDe(item);
    if (g !== grupoAtual) {
      const primeiraSecao = grupoAtual === -1;
      grupoAtual = g;
      // As proposições de vereador sempre começam no topo de uma página nova.
      // (Se não houver nenhuma do Executivo, a seção de vereadores é a
      // primeira e não força página em branco antes dela.)
      if (!primeiraSecao) y = novaPagina();
      else if (y + 22 + 60 > H - 20) y = novaPagina();

      doc.setFillColor(238, 238, 238);
      doc.rect(margin, y, cw, 18, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(70, 70, 70);
      doc.text(g === 0 ? "Poder Executivo - Proposições" : "Vereador - Proposições", margin + 7, y + 12.5);
      y += 24;
    }

    if (y + cardH > H - 20) y = novaPagina();

    // Mesmo azul usado no cabeçalho e nos contornos das telas (bg-blue-600),
    // no lugar do verde anterior.
    doc.setDrawColor(37, 99, 235);
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

    if (diasProcessoConcluido !== null) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(21, 128, 61);
      doc.text(`Concluído em ${diasProcessoConcluido} dias`, cx, cy + 9.5);
    } else if (diasEmAberto !== null) {
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
    if (fileiras.length) {
      cy += 8;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin + pad, cy, W - margin - pad, cy);
      cy += 8;

      let fy = cy;
      fileiras.forEach((fileira, fi) => {
        const labelLinhasFileira = Math.max(...fileira.map(p => p.labelLinhas.length));
        const temGrupo = fileira.some(p => p.agrupado);
        const desloc = temGrupo ? 11 : 0;   // espaço do título "PARECER CONJUNTO"

        // Colchete lilás por cima das comissões do parecer conjunto — mesmo
        // desenho da tela (sem caixa ao redor, só o traço + rótulo por cima).
        if (temGrupo) {
          const cols = fileira.map((p, i) => (p.agrupado ? i : -1)).filter(i => i >= 0);
          const x0 = margin + pad + Math.min(...cols) * stepW - 2;
          const x1 = margin + pad + Math.max(...cols) * stepW + stepW - 6;
          const lineY = fy + 9;
          doc.setDrawColor(168, 85, 247);
          doc.setLineWidth(0.8);
          doc.line(x0, lineY, x1, lineY);
          doc.line(x0, lineY, x0, lineY + 2.5);
          doc.line(x1, lineY, x1, lineY + 2.5);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(126, 34, 206);
          const nomeConjunta = fluxo["comissaoConjunta"]?.data?.nome1;
          doc.text(nomeConjunta ? `PARECER CONJUNTO — ${nomeConjunta}` : "PARECER CONJUNTO", (x0 + x1) / 2, fy + 6, { align: "center" });
        }

        fileira.forEach((p, col) => {
          const indiceGeral = fi * porLinha + col;
          const x = margin + pad + nodeR + col * stepW;
          const nodeY = fy + desloc + nodeR;
          const ultimoGeral = indiceGeral === passos.length - 1;
          const ultimoDaFileira = col === fileira.length - 1;

          if (p.fantasma) {
            // Bolinha tracejada azul — próxima etapa esperada, ainda não
            // marcada. Só indicativo, sem preenchimento nem "check".
            doc.setDrawColor(96, 165, 250);
            doc.setLineWidth(1);
            doc.setLineDashPattern([1.5, 1.5], 0);
            doc.circle(x, nodeY, nodeR, "S");
            doc.setLineDashPattern([], 0);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(59, 130, 246);
            p.labelLinhas.forEach((l, li) => {
              doc.text(l, x, nodeY + nodeR + 9 + li * 8, { align: "center" });
            });
            return;
          }

          // Sanção/Veto e Promulgação têm veredito próprio (Sancionado/
          // Vetado, Promulgado/Vetado) que não entra no cálculo geral do
          // fluxo (graficoCor) — sem isso, um Veto marcado depois do
          // Resultado Final aprovado apareceria verde do mesmo jeito.
          const negativoLocal = !!p.sd?.data?.resultado && NEGATIVOS.has(p.sd.data.resultado);
          // Retirado de Pauta é sempre laranja, a mesma cor do status
          // "Retirado" — independe do resto do fluxo.
          const isRetirado = p.step.key === "retiradoPauta";

          let nr = 22, ng = 163, nb = 74;
          if (isRetirado) { nr = 249; ng = 115; nb = 22; }
          else if (negativoLocal || graficoCor === "vermelho") { nr = 220; ng = 38; nb = 38; }
          else if (graficoCor === "normal" && ultimoGeral) { nr = 37; ng = 99; nb = 235; }

          doc.setFillColor(nr, ng, nb);
          doc.circle(x, nodeY, nodeR, "F");
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(1.1);
          doc.line(x - 2.6, nodeY, x - 0.5, nodeY + 2.6);
          doc.line(x - 0.5, nodeY + 2.6, x + 3.2, nodeY - 2.6);

          // Sem seta entre comissões do mesmo parecer conjunto — foi um ato só.
          const dentroDoGrupo = p.agrupado && !!fileira[col + 1]?.agrupado;
          const proximoEhFantasma = !!fileira[col + 1]?.fantasma;
          if (!ultimoGeral && !ultimoDaFileira && !dentroDoGrupo && proximoEhFantasma) {
            // Seta tracejada azul até a bolinha fantasma — a espera ainda não
            // é um fato, não pode ter a cor "concluído" do resto do fluxo.
            doc.setDrawColor(96, 165, 250);
            doc.setLineWidth(0.8);
            doc.setLineDashPattern([1.5, 1.5], 0);
            doc.line(x + nodeR + 1, nodeY, x + stepW - nodeR - 1, nodeY);
            doc.setLineDashPattern([], 0);
          } else if (!ultimoGeral && !ultimoDaFileira && !dentroDoGrupo) {
            doc.setDrawColor(nr, ng, nb);
            doc.setLineWidth(0.8);
            const lx1 = x + nodeR + 1;
            const lx2 = x + stepW - nodeR - 1;
            doc.line(lx1, nodeY, lx2, nodeY);
            doc.line(lx2, nodeY, lx2 - 3, nodeY - 2);
            doc.line(lx2, nodeY, lx2 - 3, nodeY + 2);
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(50, 50, 50);
          p.labelLinhas.forEach((l, li) => {
            doc.text(l, x, nodeY + nodeR + 9 + li * 8, { align: "center" });
          });

          // Data e etiqueta alinham pela fileira (não pelo rótulo de cada nó),
          // pra não ficarem em alturas diferentes lado a lado.
          const baseFileira = nodeY + nodeR + 9 + (labelLinhasFileira - 1) * 8;

          if (p.sd?.doneAt) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(140, 140, 140);
            doc.text(fmtDDMM(p.sd.doneAt), x, baseFileira + 9, { align: "center" });
          }

          const yEtiqueta = baseFileira + (fileira.some(q => q.temData) ? 9 : 0) + 3;
          if (p.sd?.data?.comissaoNome) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const bw = Math.min(stepW - 2, doc.getTextWidth(p.sd.data.comissaoNome) + 7);
            doc.setFillColor(219, 234, 254);
            doc.rect(x - bw / 2, yEtiqueta, bw, 10, "F");
            doc.setTextColor(29, 78, 216);
            doc.text(p.sd.data.comissaoNome, x, yEtiqueta + 7, { align: "center", maxWidth: bw - 2 });
          } else if (p.sd?.data?.resultado && !PILL_RESULTADO_OCULTA.has(p.step.key)) {
            const rText = labelResultadoPdf(p.step.key, p.sd.data.resultado);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const bw = doc.getTextWidth(rText) + 7;
            if (!NEGATIVOS.has(p.sd.data.resultado)) {
              doc.setFillColor(187, 247, 208); doc.setTextColor(22, 101, 52);
            } else {
              doc.setFillColor(254, 202, 202); doc.setTextColor(185, 28, 28);
            }
            doc.rect(x - bw / 2, yEtiqueta, bw, 10, "F");
            doc.text(rText, x, yEtiqueta + 7, { align: "center" });
          } else if (p.sd?.data?.nome1) {
            // Nome de quem pediu (Retirado de Pauta, Dispensa de Parecer/
            // Interstício, Pedido de Vista/Adiamento, Comissão Especial) —
            // mesma etiqueta cinza usada nas telas.
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const bw = Math.min(stepW - 2, doc.getTextWidth(p.sd.data.nome1) + 7);
            doc.setFillColor(243, 244, 246);
            doc.rect(x - bw / 2, yEtiqueta, bw, 10, "F");
            doc.setTextColor(75, 85, 99);
            doc.text(p.sd.data.nome1, x, yEtiqueta + 7, { align: "center", maxWidth: bw - 2 });
          }
        });

        fy += alturaFileira(fileira);
      });
    }

    y += cardH + 7;
  });

  doc.save(nomeArquivo);
}
