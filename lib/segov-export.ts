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
// As 4 chaves que podem virar um marco extra (roxo) no resumo de 4 marcos —
// mesma lista de app/dashboard/segov/page.tsx (SITUACOES_ESPECIAIS_DEF).
const SITUACOES_ESPECIAIS_DEF = [
  { key: "dispensaParecer",     label: "Dispensa de Parecer" },
  { key: "dispensaIntersticio", label: "Dispensa de Interstício" },
  { key: "pedidoVista",         label: "Pedido de Vista" },
  { key: "pedidoAdiamento",     label: "Pedido de Adiamento" },
];
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
  { key: 'resultadoFinal',      labelCurto: 'Result.'    },
  // "Sanção/Veto" quebra no meio da palavra ("Vet" + "o" numa segunda linha)
  // na coluna estreita do PDF — encurtado só aqui, no relatório; nas telas
  // (mais largas) o rótulo completo continua igual. A etiqueta colorida
  // embaixo do nó (Sancionado/Vetado) já entrega o resultado específico.
  { key: 'sancaoVeto',          labelCurto: 'Sanção'},
  { key: 'promulgacao',         labelCurto: 'Promul.'    },
]

// Sanção/Veto e Promulgação são escolhidas como caminho primeiro (igual
// comissão) — o resultado só chega depois. Marcadas sem resultado ainda não
// valem como nó normal do fluxo, viram a bolinha fantasma no relatório
// também, igual já acontece nas telas.
const CHAVES_SANCAO = ["sancaoVeto", "promulgacao"];
// Etapas que podem acontecer a qualquer momento da tramitação — reposiciona
// pela DATA real delas em vez da ordem fixa do array (ver editar/page.tsx).
const CHAVES_REPOSICIONAR_POR_DATA = ["retiradoPauta", "dispensaIntersticio", "dispensaParecer", "pedidoVista", "pedidoAdiamento"];
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
  nomeArquivo = "segov.pdf",
  // Resumido (padrão) mostra só a sigla da comissão, igual já saía; detalhado
  // mostra o nome completo — pedido do usuário pra quem não conhece o
  // sistema não ficar perdido nas siglas. Não existe "clicar pra expandir"
  // num PDF, por isso a escolha é feita na hora de gerar o relatório.
  detalhado = false
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
  // Passo das colunas do fluxo detalhado (nó a nó, com nome completo da
  // comissão) — só usado quando detalhado=true; o resumido não desenha essa
  // grade, ver marcos4 mais abaixo.
  const stepW = 64;
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

  /** Texto da etiqueta que aparece embaixo de um nó do fluxo (sigla ou nome
   * completo da comissão, resultado, nome de quem pediu, ou autores da
   * emenda) — usada tanto pra medir quantas linhas ela vai ocupar (e reservar
   * altura certa na fileira) quanto pra desenhar de verdade, garantindo que
   * as duas contas nunca fiquem fora de sincronia. */
  function textoEtiqueta(sd: { data?: any } | undefined, stepKey: string): string {
    // Só chamada no modo detalhado (ver marcos4 pro resumido) — sempre nome
    // completo da comissão, sem a sigla na frente (a sigla sozinha não diz
    // nada pra quem não conhece o sistema) — mesmo corte de app/dashboard/
    // segov/page.tsx e segov/[id]/editar/page.tsx.
    if (sd?.data?.comissaoNome) {
      return sd.data.comissaoNome.includes(" — ")
        ? sd.data.comissaoNome.split(" — ").slice(1).join(" — ")
        : sd.data.comissaoNome;
    }
    if (sd?.data?.resultado && !PILL_RESULTADO_OCULTA.has(stepKey)) {
      const autoresTxt = sd?.data?.autores?.length ? ` — ${sd.data.autores.join(" e ")}` : "";
      return labelResultadoPdf(stepKey, sd.data.resultado) + autoresTxt;
    }
    // Comissão Especial não mostra nome de membro aqui — mostrar só nome1
    // seria parcial (a comissão pode ter até 3 membros) e não identifica a
    // comissão toda, mesmo corte das telas.
    if (sd?.data?.nome1 && stepKey !== "comissaoEspecial") return sd.data.nome1;
    if (sd?.data?.autores?.length) return sd.data.autores.join(" e ");
    return "";
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
    // Reposiciona as etapas "livres" (ver CHAVES_REPOSICIONAR_POR_DATA) pela
    // data real, mesclando-as entre as fixas (que mantêm a ordem original
    // entre si). Ordena as livres pela própria data ANTES de mesclar —
    // mesclar direto na ordem do array, comparando com a data antiga de
    // livres ainda não tratadas, jogava a etapa lá pro final ou de volta pro
    // lugar de origem. Empate → livre entra antes da vizinha (ver
    // editar/page.tsx).
    const fixasOrdenadas = marcadosBase.filter(d => !CHAVES_REPOSICIONAR_POR_DATA.includes(d.key));
    const livresOrdenadas = marcadosBase
      .filter(d => CHAVES_REPOSICIONAR_POR_DATA.includes(d.key))
      .sort((a, b) => (fluxo[a.key]?.doneAt || "").localeCompare(fluxo[b.key]?.doneAt || ""));
    const marcados = [...fixasOrdenadas];
    livresOrdenadas.forEach(item => {
      const dataItem = fluxo[item.key]?.doneAt || "";
      let posicao = marcados.findIndex(d => (fluxo[d.key]?.doneAt || "") >= dataItem);
      if (posicao === -1) posicao = marcados.length;
      marcados.splice(posicao, 0, item);
    });
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
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      // "Com. 1/2/3" some quando o nó já mostra o nome completo da comissão
      // embaixo (etiqueta) — mesmo corte das telas, o número da coluna não
      // identifica a comissão pra quem lê.
      const labelLinhas = sd?.data?.comissaoNome ? [] : (doc.splitTextToSize(step.labelCurto, stepW - 4) as string[]);
      const textoEt = textoEtiqueta(sd, step.key);
      // Etiqueta é desenhada em 7pt normal — mede no mesmo tamanho, senão a
      // altura reservada não bate com o que realmente é desenhado.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      // Restrita à largura da própria coluna (stepW), não mais — etiquetas
      // largas em nós vizinhos (ex.: 3 comissões seguidas, cada uma com o
      // nome completo no modo detalhado) colidiam umas com as outras quando
      // podiam passar da largura da coluna.
      const etiquetaLinhas = textoEt ? (doc.splitTextToSize(textoEt, stepW - 4) as string[]) : [];
      return {
        step,
        sd,
        labelLinhas,
        temData: !!sd?.doneAt,
        temEtiqueta: !!textoEt,
        // Só relevante no modo detalhado — no resumido a sigla nunca precisa
        // de mais de 1 linha, mas o nome completo da comissão pode precisar.
        etiquetaLinhas,
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
          etiquetaLinhas: [] as string[],
          agrupado: false,
          fantasma: true,
        }]
      : passosReais;
    type Passo = typeof passos[number];
    const fileiras: Passo[][] = [];
    for (let i = 0; i < passos.length; i += porLinha) fileiras.push(passos.slice(i, i + porLinha));
    const alturaFileira = (f: Passo[]) => {
      // Etiqueta de 1 linha cabe em 13pt; cada linha a mais soma +8pt — só o
      // modo detalhado (nome completo da comissão) chega a precisar de mais
      // de 1 linha na prática.
      const maxEtiquetaLinhas = Math.max(0, ...f.map(p => p.etiquetaLinhas.length));
      return (
        12 +                                                        // bolinha
        Math.max(...f.map(p => p.labelLinhas.length)) * 8 +          // rótulo
        (f.some(p => p.temData) ? 9 : 0) +                           // data
        (maxEtiquetaLinhas > 0 ? 13 + (maxEtiquetaLinhas - 1) * 8 : 0) + // etiqueta
        (f.some(p => p.agrupado) ? 11 : 0) +                         // título da moldura
        4
      );
    };
    const fluxoAltura = fileiras.reduce((s, f) => s + alturaFileira(f), 0);

    // Modo resumido do PDF: os mesmos marcos grandes da listagem (Protocolo
    // / Aprovado-ou-Reprovado pelas comissões / [situações especiais, se
    // houver] / Votado em plenário / Sancionado), em vez do fluxo detalhado
    // passo a passo — ver marcos.map em app/dashboard/segov/page.tsx, mesma
    // lógica replicada aqui.
    const marcoProtocolo = !!fluxo["protocolado"]?.done;
    const marcoComissoes = todasComissoesAprovadas || algumaComissaoReprovada
      || CHAVES_COMISSAO.some(k => fluxo[k]?.done) || !!fluxo["comissaoEspecial"]?.done;
    const marcoVotacao = !!fluxo["resultadoFinal"]?.done;
    const marcoSancao = (fluxo["sancaoVeto"]?.done && !!fluxo["sancaoVeto"]?.data?.resultado)
      || (fluxo["promulgacao"]?.done && !!fluxo["promulgacao"]?.data?.resultado);
    type MarcoItem = { label: string; feito: boolean; data?: string; especial?: boolean; nome?: string };
    const marcosBase: MarcoItem[] = [
      { label: "Protocolo", feito: marcoProtocolo, data: fluxo["protocolado"]?.doneAt },
      { label: algumaComissaoReprovada ? "Reprovado pelas comissões" : "Aprovado pelas comissões", feito: marcoComissoes, data: undefined },
      { label: "Votado em plenário", feito: marcoVotacao, data: fluxo["resultadoFinal"]?.doneAt },
      { label: fluxo["promulgacao"]?.data?.resultado === "promulgado" ? "Promulgado"
          : fluxo["sancaoVeto"]?.data?.resultado === "vetado" ? "Vetado" : "Sancionado",
        feito: marcoSancao, data: fluxo["sancaoVeto"]?.doneAt || fluxo["promulgacao"]?.doneAt },
    ];
    // Dispensa de Parecer/Interstício, Pedido de Vista/Adiamento — marcos
    // extras (roxo), só quando acontecem, encaixados entre "comissões" e
    // "votação", ordenados pela própria data quando há mais de um.
    const situacoesEspeciais: MarcoItem[] = SITUACOES_ESPECIAIS_DEF
      .filter(s => fluxo[s.key]?.done)
      .map(s => ({ label: s.label, feito: true, data: fluxo[s.key]?.doneAt, especial: true, nome: fluxo[s.key]?.data?.nome1 }))
      .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const marcos: MarcoItem[] = [marcosBase[0], marcosBase[1], ...situacoesEspeciais, marcosBase[2], marcosBase[3]];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const colW4 = innerW / marcos.length;
    const marco4Linhas = marcos.map(m => doc.splitTextToSize(m.label, colW4 - 6) as string[]);
    const maxLinhas4 = Math.max(...marco4Linhas.map(l => l.length));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const marcoNomeLinhas = marcos.map(m => m.nome ? (doc.splitTextToSize(m.nome, colW4 - 6) as string[]) : []);
    const maxLinhasNome = Math.max(0, ...marcoNomeLinhas.map(l => l.length));
    const alturaMarcos4 = 16 + 5 + maxLinhas4 * 9 + (maxLinhasNome > 0 ? maxLinhasNome * 8 : 0) + (marcos.some(m => m.data) ? 11 : 0) + 4;

    const cardH =
      pad +
      15 +                                                    // cabeçalho do cartão
      8 +
      ementaLinhas.length * ementaLH +
      (linhasAutores.length ? 6 + linhasAutores.length * chipLH : 0) +
      (fileiras.length ? 8 + 1 + 8 + (detalhado ? fluxoAltura : alturaMarcos4) : 0) +
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
    if (fileiras.length && !detalhado) {
      // Resumido: os 4 marcos grandes, igual à listagem — 4 colunas iguais,
      // bolinha maior que a do fluxo detalhado, com linha conectora colorida
      // entre marcos concluídos consecutivos.
      cy += 8;
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin + pad, cy, W - margin - pad, cy);
      cy += 8;

      const nodeR4 = 8;
      const nodeY4 = cy + nodeR4;
      marcos.forEach((marco, mi) => {
        const x = margin + pad + colW4 * mi + colW4 / 2;

        if (mi > 0) {
          const xPrev = margin + pad + colW4 * (mi - 1) + colW4 / 2;
          const anterior = marcos[mi - 1];
          if (marco.feito && anterior.feito) {
            const roxo = marco.especial || anterior.especial;
            const [lr, lg, lb] = roxo ? [216, 180, 254] : graficoCor === "vermelho" ? [248, 113, 113] : [74, 222, 128];
            doc.setDrawColor(lr, lg, lb);
          } else {
            doc.setDrawColor(229, 231, 235);
          }
          doc.setLineWidth(1.3);
          doc.line(xPrev + nodeR4, nodeY4, x - nodeR4, nodeY4);
        }

        if (marco.feito) {
          const [nr, ng, nb] = marco.especial ? [168, 85, 247] : graficoCor === "vermelho" ? [239, 68, 68] : [34, 197, 94];
          doc.setFillColor(nr, ng, nb);
          doc.circle(x, nodeY4, nodeR4, "F");
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(1.3);
          if (marco.especial) {
            // Relógio, no lugar do "check" — mesmo ícone da tela pra marco
            // de situação especial (dispensa/vista/adiamento).
            doc.circle(x, nodeY4, nodeR4 - 3.5, "S");
            doc.line(x, nodeY4 - 2, x, nodeY4);
            doc.line(x, nodeY4, x + 2, nodeY4 + 1.2);
          } else {
            doc.line(x - 3.2, nodeY4, x - 0.8, nodeY4 + 3.2);
            doc.line(x - 0.8, nodeY4 + 3.2, x + 3.8, nodeY4 - 3.2);
          }
        } else {
          doc.setFillColor(229, 231, 235);
          doc.circle(x, nodeY4, nodeR4, "F");
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        if (marco.especial) doc.setTextColor(126, 34, 206);
        else doc.setTextColor(marco.feito ? 55 : 156, marco.feito ? 65 : 163, marco.feito ? 81 : 175);
        marco4Linhas[mi].forEach((l, li) => {
          doc.text(l, x, nodeY4 + nodeR4 + 10 + li * 9, { align: "center" });
        });
        let baseY = nodeY4 + nodeR4 + 10 + marco4Linhas[mi].length * 9;
        if (marco.nome) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(168, 85, 247);
          marcoNomeLinhas[mi].forEach((l, li) => {
            doc.text(l, x, baseY + li * 8, { align: "center" });
          });
          baseY += marcoNomeLinhas[mi].length * 8;
        }
        if (marco.data) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          doc.text(fmtDDMM(marco.data), x, baseY + 2, { align: "center" });
        }
      });
    } else if (fileiras.length) {
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
          // Usa as mesmas linhas já medidas em passosReais (etiquetaLinhas) —
          // garante que a altura reservada pra fileira e o que é desenhado
          // aqui nunca fiquem fora de sincronia (foi exatamente isso que
          // quebrava o fluxo antes, com "Sanção/Veto" e nomes de comissão
          // compridos).
          const linhasEt = p.etiquetaLinhas;
          if (linhasEt.length) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            let corFundo: [number, number, number];
            let corTexto: [number, number, number];
            if (p.sd?.data?.comissaoNome) {
              corFundo = [219, 234, 254]; corTexto = [29, 78, 216];
            } else if (p.sd?.data?.resultado && !PILL_RESULTADO_OCULTA.has(p.step.key)) {
              const neg = NEGATIVOS.has(p.sd.data.resultado);
              corFundo = neg ? [254, 202, 202] : [187, 247, 208];
              corTexto = neg ? [185, 28, 28] : [22, 101, 52];
            } else {
              corFundo = [243, 244, 246]; corTexto = [75, 85, 99];
            }
            const bw = Math.min(stepW - 2, Math.max(...linhasEt.map(l => doc.getTextWidth(l))) + 7);
            const altura = 10 + (linhasEt.length - 1) * 8;
            doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
            doc.rect(x - bw / 2, yEtiqueta, bw, altura, "F");
            doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
            linhasEt.forEach((linha, li) => {
              doc.text(linha, x, yEtiqueta + 7 + li * 8, { align: "center" });
            });
          }
        });

        fy += alturaFileira(fileira);
      });
    }

    y += cardH + 7;
  });

  doc.save(nomeArquivo);
}
