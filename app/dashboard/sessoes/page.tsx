"use client";
import { useEffect, useState } from "react";

type ComissaoInfo = { id: string; ordem: number; status: string; parecerConjunto?: boolean; comissao: { sigla: string; nome: string } };
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string;
  status: string; etapaAtual: string; destinoFinal?: string;
  numVotacoes?: number; dispensaParecer?: boolean;
  comissoes?: ComissaoInfo[];
};
type PautaItem = { id: string; proposicao: Proposicao; ordem: number; secao: string; resultado?: string };
type Sessao = { id: string; data: string; tipo: string; numero?: number; ano?: number; local?: string; status: string; itens: PautaItem[] };

// ── Mini Stepper ─────────────────────────────────────────────────────────────

const STEP_W = 44;
const CONN_W = 14;

function isCRF(c: ComissaoInfo) {
  return c.comissao.sigla === "CRF" || c.comissao.nome.toLowerCase().includes("redação final") || c.comissao.nome.toLowerCase().includes("redacao final");
}

function proximaComissaoEtapa(prop: Proposicao): string | null {
  const etapa = prop.etapaAtual;
  if (!etapa.startsWith("comissao")) return null;
  const currentOrdem = parseInt(etapa.replace("comissao", ""));
  if (isNaN(currentOrdem)) return null;
  const regulares = (prop.comissoes || []).filter(c => !isCRF(c)).sort((a, b) => a.ordem - b.ordem);
  const proxima = regulares.find(c => c.ordem > currentOrdem);
  return proxima ? `comissao${proxima.ordem}` : "pronto_votar";
}

type Step = { key: string; label: string; parecerConjunto?: boolean };

function buildSteps(prop: Proposicao): Step[] {
  const steps: Step[] = [{ key: "protocolado", label: "Protoc." }];

  if (!prop.dispensaParecer && prop.comissoes && prop.comissoes.length > 0) {
    const regulares = prop.comissoes.filter(c => !isCRF(c));
    const crf = prop.comissoes.find(c => isCRF(c));

    regulares.forEach(c => {
      steps.push({ key: `comissao${c.ordem}`, label: c.comissao.sigla || c.comissao.nome.slice(0, 3), parecerConjunto: c.parecerConjunto });
    });
    if (regulares.length > 0) steps.push({ key: "pronto_votar", label: "Ag. Pautar" });

    steps.push({ key: "primeira_votacao", label: "1ª Vot." });
    if ((prop.numVotacoes ?? 1) >= 2) steps.push({ key: "segunda_votacao", label: "2ª Vot." });

    // CRF vem depois das votações
    if (crf) steps.push({ key: `comissao${crf.ordem}`, label: crf.comissao.sigla || "CRF" });
  } else {
    steps.push({ key: "primeira_votacao", label: "1ª Vot." });
    if ((prop.numVotacoes ?? 1) >= 2) steps.push({ key: "segunda_votacao", label: "2ª Vot." });
  }

  steps.push({
    key: prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
    label: prop.destinoFinal === "promulgacao" ? "Promulgar" : "Ag. Sanção",
  });
  return steps;
}

function getCurrentIndex(etapaAtual: string, steps: Step[]): number {
  const idx = steps.findIndex(s => s.key === etapaAtual);
  return idx >= 0 ? idx : 0;
}

// Agrupa índices consecutivos de parecer conjunto
function gruposConjunto(steps: Step[]): { start: number; end: number }[] {
  const groups: { start: number; end: number }[] = [];
  let start = -1;
  steps.forEach((s, i) => {
    if (s.parecerConjunto) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) { groups.push({ start, end: i - 1 }); start = -1; }
    }
  });
  if (start !== -1) groups.push({ start, end: steps.length - 1 });
  return groups;
}

function MiniStepper({ prop, resultado }: { prop: Proposicao; resultado?: string }) {
  const baseSteps = buildSteps(prop);
  let current = getCurrentIndex(prop.etapaAtual, baseSteps);

  // Dispensa de Interstício: mostra 1ª Votação como etapa ativa
  if (resultado === "dispensa_intersticio") {
    const pivIdx = baseSteps.findIndex(s => s.key === "primeira_votacao");
    if (pivIdx >= 0 && pivIdx > current) current = pivIdx;
  }

  let bracketType: "parecer_conjunto" | "dispensa_parecer" | null = null;
  const bracketKeys: Set<string> = new Set();

  if (resultado === "parecer_conjunto") {
    bracketType = "parecer_conjunto";
    const regulares = (prop.comissoes || []).filter(c => !isCRF(c));
    const comissaoAtual = regulares.find(c => `comissao${c.ordem}` === prop.etapaAtual);
    const pendentes = comissaoAtual
      ? regulares.filter(c => c.ordem >= comissaoAtual.ordem)
      : regulares;
    pendentes.forEach(c => bracketKeys.add(`comissao${c.ordem}`));
  } else if (resultado === "dispensa_parecer") {
    bracketType = "dispensa_parecer";
    (prop.comissoes || []).filter(c => !isCRF(c)).forEach(c => bracketKeys.add(`comissao${c.ordem}`));
  } else {
    const conjuntoComissoes = (prop.comissoes || []).filter(c => c.parecerConjunto && !isCRF(c));
    if (conjuntoComissoes.length > 0) {
      bracketType = "parecer_conjunto";
      conjuntoComissoes.forEach(c => bracketKeys.add(`comissao${c.ordem}`));
    }
  }

  const steps = baseSteps.map(s => ({
    ...s,
    parecerConjunto: bracketType === "parecer_conjunto" && bracketKeys.has(s.key),
  }));

  // Computa grupos de bracket a partir de bracketKeys
  const grupos: { start: number; end: number }[] = [];
  {
    let gStart = -1;
    baseSteps.forEach((s, i) => {
      if (bracketKeys.has(s.key)) { if (gStart === -1) gStart = i; }
      else { if (gStart !== -1) { grupos.push({ start: gStart, end: i - 1 }); gStart = -1; } }
    });
    if (gStart !== -1) grupos.push({ start: gStart, end: baseSteps.length - 1 });
  }
  const temConjunto = grupos.length > 0;
  const bracketColor = bracketType === "dispensa_parecer" ? "#7c3aed" : "#4338ca";
  const bracketLabel = bracketType === "dispensa_parecer" ? "Disp. Parecer" : "Parecer Conjunto";

  return (
    <div className="overflow-x-auto py-1">
      <div className="relative inline-flex flex-col" style={{ paddingTop: temConjunto ? 26 : 0 }}>

        {/* Brackets (Parecer Conjunto ou Dispensa de Parecer) */}
        {grupos.map((g, gi) => {
          const left = g.start * (STEP_W + CONN_W);
          const width = (g.end - g.start) * (STEP_W + CONN_W) + STEP_W;
          return (
            <div key={gi} style={{ position: "absolute", top: 0, left, width, height: 24 }}>
              <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", fontSize: 8, fontWeight: 700, color: bracketColor, whiteSpace: "nowrap" }}>
                {bracketLabel}
              </span>
              <div style={{ position: "absolute", bottom: 4, left: 4, right: 4, height: 2, background: bracketColor, borderRadius: 1 }} />
              <div style={{ position: "absolute", bottom: 4, left: 4, width: 2, height: 7, background: bracketColor, borderRadius: 1 }} />
              <div style={{ position: "absolute", bottom: 4, right: 4, width: 2, height: 7, background: bracketColor, borderRadius: 1 }} />
            </div>
          );
        })}

        {/* Linha de bolhas */}
        <div className="flex items-center">
          {steps.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div key={step.key} className="flex items-center">
                <div className="flex flex-col items-center" style={{ minWidth: STEP_W }}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0"
                    style={
                      done
                        ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" }
                        : step.parecerConjunto
                        ? { background: "#ea580c", borderColor: "#ea580c", color: "#fff" }
                        : active
                        ? { background: "#d4a017", borderColor: "#d4a017", color: "#fff" }
                        : { background: "#f3f4f6", borderColor: "#d1d5db", color: "#9ca3af" }
                    }
                  >
                    {done ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span
                    className="text-center mt-0.5 leading-tight"
                    style={{
                      fontSize: 9,
                      maxWidth: STEP_W,
                      color: done ? "#16a34a" : step.parecerConjunto ? "#ea580c" : active ? "#b5860f" : "#9ca3af",
                      fontWeight: active || step.parecerConjunto ? 700 : 400,
                      wordBreak: "break-word",
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="h-0.5 flex-shrink-0"
                    style={{ width: CONN_W, background: i < current ? "#16a34a" : "#e5e7eb", marginBottom: 14 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const tipoLabel: Record<string, string> = { pl: "PL", resolucao: "Res.", requerimento: "Req.", mocao: "Moção" };
const tipoSessaoLabel: Record<string, string> = { ordinaria: "Ordinária", extraordinaria: "Extraordinária", especial: "Especial", solene: "Solene" };

const secaoLabel: Record<string, string> = {
  apresentacao: "c) Apresentação de proposições",
  parecer: "d) Leitura de Parecer",
  votacao: "a) Discussão e votação",
  requerimento: "a) Indicações, moções e requerimentos",
  redacao_final: "Comissão de Redação Final",
};

function formatData(data: string) {
  return new Date(data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function SecaoHeader({ label }: { label: string }) {
  return (
    <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function ItemFixo({ label }: { label: string }) {
  return (
    <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-50">
      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
      <p className="text-sm text-gray-400 italic">{label}</p>
    </div>
  );
}

export default function SessoesPage() {
  const [lista, setLista] = useState<Sessao[]>([]);
  const [modal, setModal] = useState(false);
  const [detalhe, setDetalhe] = useState<Sessao | null>(null);
  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0, 10),
    tipo: "ordinaria", numero: "", ano: new Date().getFullYear(), local: "",
  });

  async function carregar() {
    const res = await fetch("/api/sessoes");
    const data = await res.json();
    setLista(data);
    // Restaura a sessão selecionada após reload (via sessionStorage)
    const savedId = sessionStorage.getItem("sessaoAbertaId");
    if (savedId && data.find((s: Sessao) => s.id === savedId)) {
      carregarDetalhe(savedId);
    }
  }

  async function carregarDetalhe(id: string) {
    sessionStorage.setItem("sessaoAbertaId", id);
    const res = await fetch(`/api/sessoes/${id}`);
    const data = await res.json();
    setDetalhe(data);
  }

  function fecharDetalhe() {
    sessionStorage.removeItem("sessaoAbertaId");
    setDetalhe(null);
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    await fetch("/api/sessoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, numero: form.numero ? +form.numero : undefined }),
    });
    setModal(false);
    setForm({ data: new Date().toISOString().slice(0, 10), tipo: "ordinaria", numero: "", ano: new Date().getFullYear(), local: "" });
    carregar();
  }

  async function fecharSessao(id: string) {
    if (!confirm("Fechar esta sessão? As proposições serão automaticamente encaminhadas conforme seu destino.")) return;
    await fetch(`/api/sessoes/${id}/fechar`, { method: "POST" });
    carregar();
    if (detalhe?.id === id) carregarDetalhe(id);
  }

  async function reabrirSessao(id: string) {
    await fetch(`/api/sessoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "agendada" }),
    });
    carregar();
    if (detalhe?.id === id) carregarDetalhe(id);
  }

  async function atualizarResultado(item: PautaItem, resultado: string) {
    if (!detalhe) return;
    let novosItens = detalhe.itens.map(i =>
      i.id === item.id ? { ...i, resultado } : i
    );

    if (resultado === "dispensa_intersticio") {
      // Move o item para votação (remove da seção de apresentação/parecer)
      const itensVotacao = novosItens.filter(i => i.secao === "votacao");
      const maxOrdem = itensVotacao.length > 0 ? Math.max(...itensVotacao.map(i => i.ordem)) : 0;
      novosItens = novosItens.map(i =>
        i.id === item.id ? { ...i, secao: "votacao", ordem: maxOrdem + 1 } : i
      );
    } else if (resultado === "aprovado") {
      // Aprovado: adiciona automaticamente na Comissão de Redação Final (se tiver CRF)
      const hasCRF = (item.proposicao.comissoes || []).some(c => isCRF(c));
      if (hasCRF) {
        const jaEmRedacao = novosItens.some(
          i => i.proposicao.id === item.proposicao.id && i.secao === "redacao_final"
        );
        if (!jaEmRedacao) {
          const itensRedacao = novosItens.filter(i => i.secao === "redacao_final");
          const maxOrdem = itensRedacao.length > 0 ? Math.max(...itensRedacao.map(i => i.ordem)) : 0;
          novosItens = [
            ...novosItens,
            { id: `_redacao_${Date.now()}`, proposicao: item.proposicao, ordem: maxOrdem + 1, secao: "redacao_final" },
          ];
        }
      }
    } else if (resultado === "") {
      // Ao desmarcar, remove itens auto-inseridos sem resultado
      novosItens = novosItens.filter(
        i => !(i.proposicao.id === item.proposicao.id && i.secao === "votacao" && !i.resultado)
      );
      novosItens = novosItens.filter(
        i => !(i.proposicao.id === item.proposicao.id && i.secao === "redacao_final" && !i.resultado)
      );
    }

    await fetch(`/api/sessoes/${detalhe.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itens: novosItens.map(i => ({
          proposicaoId: i.proposicao.id,
          ordem: i.ordem,
          secao: i.secao,
          resultado: i.resultado,
        })),
      }),
    });
    carregarDetalhe(detalhe.id);
    carregar();
  }

  async function retirarDePauta(proposicaoId: string) {
    if (!confirm("Retirar esta proposição da pauta? Ela voltará para o status 'Protocolado'.")) return;
    await fetch("/api/pauta/remover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposicaoId }),
    });
    if (detalhe) carregarDetalhe(detalhe.id);
    carregar();
  }

async function moverEtapa(proposicaoId: string, etapa: string) {
    // Determina status correspondente à etapa
    const statusMap: Record<string, string> = {
      aguardando_sancao: "aguardando_sancao",
      promulgada: "promulgada",
      sancionada: "sancionada",
    };
    const status = statusMap[etapa] ?? "em_tramitacao";
    await fetch(`/api/proposicoes/${proposicaoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapaAtual: etapa, status }),
    });
    if (detalhe) carregarDetalhe(detalhe.id);
    carregar();
  }

  const agendadas = lista.filter(s => s.status === "agendada");
  const encerradas = lista.filter(s => s.status === "encerrada" || s.status === "realizada" || s.status === "cancelada");

  // Organizar itens por seção
  function organizarItens(itens: PautaItem[]) {
    return {
      apresentacao: itens.filter(i => i.secao === "apresentacao"),
      parecer: itens.filter(i => i.secao === "parecer"),
      votacao: itens.filter(i => i.secao === "votacao" || !i.secao),
      requerimento: itens.filter(i => i.secao === "requerimento"),
      redacao_final: itens.filter(i => i.secao === "redacao_final"),
    };
  }

  const partes = detalhe ? organizarItens(detalhe.itens) : null;
  const propIdsEmVotacao = partes ? new Set(partes.votacao.map(i => i.proposicao.id)) : new Set<string>();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sessões & Pautas</h1>
          <p className="text-gray-500 text-sm">{agendadas.length} em aberto · {encerradas.length} encerrada(s)</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          + Nova Sessão
        </button>
      </div>

      <div className="flex gap-6">
        {/* Lista de sessões */}
        <div className="w-72 flex-shrink-0 space-y-3">

          {agendadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Em aberto</p>
              {agendadas.map(s => (
                <button key={s.id} onClick={() => carregarDetalhe(s.id)}
                  className="w-full text-left rounded-xl p-4 mb-2 border-2 transition hover:shadow-md"
                  style={{
                    background: detalhe?.id === s.id ? "#bbf7d0" : "#dcfce7",
                    borderColor: detalhe?.id === s.id ? "#16a34a" : "#86efac",
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-green-900 text-sm">{tipoSessaoLabel[s.tipo] || s.tipo}</p>
                    {s.numero && <span className="text-xs text-green-700 font-medium">Nº {s.numero}</span>}
                  </div>
                  <p className="text-xs text-green-800 capitalize">{formatData(s.data)}</p>
                  <p className="text-xs text-green-700 mt-1">{s.itens.length} item(s) na pauta</p>
                  {s.local && <p className="text-xs text-green-600">{s.local}</p>}
                </button>
              ))}
            </div>
          )}

          {encerradas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">Encerradas</p>
              {encerradas.map(s => (
                <button key={s.id} onClick={() => carregarDetalhe(s.id)}
                  className="w-full text-left rounded-xl p-4 mb-2 border-2 transition hover:shadow-md"
                  style={{
                    background: detalhe?.id === s.id ? "#fecaca" : "#fee2e2",
                    borderColor: detalhe?.id === s.id ? "#dc2626" : "#fca5a5",
                  }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-red-900 text-sm">{tipoSessaoLabel[s.tipo] || s.tipo}</p>
                    {s.numero && <span className="text-xs text-red-700 font-medium">Nº {s.numero}</span>}
                  </div>
                  <p className="text-xs text-red-800 capitalize">{formatData(s.data)}</p>
                  <p className="text-xs text-red-700 mt-1">{s.itens.length} item(s) na pauta</p>
                </button>
              ))}
            </div>
          )}

          {lista.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">Nenhuma sessão cadastrada.</p>
          )}
        </div>

        {/* Detalhe da sessão */}
        {detalhe && partes && (
          <div className="flex-1">
            {/* Cabeçalho */}
            <div className="rounded-xl p-5 mb-4 border-2"
              style={detalhe.status === "agendada"
                ? { background: "#f0fdf4", borderColor: "#86efac" }
                : { background: "#fff1f2", borderColor: "#fca5a5" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-bold text-gray-800">
                      Sessão {tipoSessaoLabel[detalhe.tipo] || detalhe.tipo}
                      {detalhe.numero ? ` — Nº ${detalhe.numero}` : ""}
                    </h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${detalhe.status === "agendada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {detalhe.status === "agendada" ? "Em aberto" : "Encerrada"}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm capitalize">{formatData(detalhe.data)}</p>
                  {detalhe.local && <p className="text-sm text-gray-500 mt-0.5">Local: {detalhe.local}</p>}
                  <p className="text-sm text-gray-500 mt-0.5">{detalhe.itens.length} item(s) na pauta</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={fecharDetalhe} className="border border-gray-300 text-gray-500 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                    ✕ Sair
                  </button>
                  <button onClick={() => window.print()} className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                    🖨️ Imprimir
                  </button>
                  {detalhe.status === "agendada" ? (
                    <button
                      onClick={() => fecharSessao(detalhe.id)}
                      className="text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                      style={{ background: "#dc2626" }}
                    >
                      Fechar Sessão
                    </button>
                  ) : (
                    <button
                      onClick={() => reabrirSessao(detalhe.id)}
                      className="text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
                      style={{ background: "#16a34a" }}
                    >
                      Reabrir Sessão
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ORDEM DO DIA — 4 partes */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200" style={{ background: "#8B0000" }}>
                <h3 className="font-bold text-white text-sm tracking-wide">ORDEM DO DIA</h3>
              </div>

              {/* I – PRIMEIRA PARTE */}
              <div className="border-b border-gray-200">
                <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">I — Primeira Parte</p>
                </div>
                <ItemFixo label="a) Leitura, discussão e votação da ata da reunião anterior" />
                <ItemFixo label="b) Leitura de correspondências" />

                {/* c) Apresentação de proposições */}
                <SecaoHeader label="c) Apresentação de proposições" />
                {partes.apresentacao.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-400 italic">Nenhuma proposição para apresentação.</p>
                  </div>
                ) : partes.apresentacao.map((item) => (
                  <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                    onResultado={(r) => atualizarResultado(item, r)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    propEmVotacao={propIdsEmVotacao.has(item.proposicao.id)}
                    />
                ))}

                {/* d) Leitura de Parecer */}
                <SecaoHeader label="d) Leitura de Parecer" />
                {partes.parecer.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-400 italic">Nenhum parecer para leitura.</p>
                  </div>
                ) : partes.parecer.map((item) => {
                  const nextEtapa = proximaComissaoEtapa(item.proposicao);
                  return (
                    <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                      onResultado={(r) => atualizarResultado(item, r)}
                      onRetirar={() => retirarDePauta(item.proposicao.id)}
                      propEmVotacao={propIdsEmVotacao.has(item.proposicao.id)}
                      onProximaComissao={nextEtapa ? () => moverEtapa(item.proposicao.id, nextEtapa) : undefined}
                    />
                  );
                })}
              </div>

              {/* II – SEGUNDA PARTE */}
              <div className="border-b border-gray-200">
                <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">II — Segunda Parte</p>
                </div>
                <SecaoHeader label="a) Discussão e votação de projetos" />
                {partes.votacao.length === 0 ? (
                  <div className="px-5 py-3">
                    {detalhe.status === "agendada" && (
                      <p className="text-xs text-gray-400">Adicione proposições pela tela de Proposições → Enviar para Pauta.</p>
                    )}
                    {detalhe.status !== "agendada" && (
                      <p className="text-xs text-gray-400 italic">Nenhum item.</p>
                    )}
                  </div>
                ) : partes.votacao.map((item) => (
                  <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                    onResultado={(r) => atualizarResultado(item, r)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    />
                ))}
              </div>

              {/* III – TERCEIRA PARTE */}
              <div className="border-b border-gray-200">
                <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">III — Terceira Parte</p>
                </div>
                <SecaoHeader label="a) Discussão e votação de indicações, moções e requerimentos" />
                {partes.requerimento.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-400 italic">Nenhum item.</p>
                  </div>
                ) : partes.requerimento.map((item) => (
                  <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                    onResultado={(r) => atualizarResultado(item, r)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    />
                ))}
              </div>

              {/* Redação Final — aparece automaticamente quando há aprovação */}
              {partes.redacao_final.length > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-5 py-2.5" style={{ background: "#f0fdf4" }}>
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#166534" }}>
                      Comissão de Redação Final
                    </p>
                  </div>
                  {partes.redacao_final.map((item) => (
                    <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                      onResultado={(r) => atualizarResultado(item, r)}
                      onRetirar={() => retirarDePauta(item.proposicao.id)}
                    />
                  ))}
                </div>
              )}

              {/* IV – QUARTA PARTE */}
              <div>
                <div className="px-5 py-2.5" style={{ background: "#fef9f0" }}>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">IV — Quarta Parte</p>
                </div>
                <ItemFixo label="a) Apresentação de oradores inscritos" />
              </div>
            </div>
          </div>
        )}

        {!detalhe && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Selecione uma sessão para ver a Ordem do Dia.</p>
          </div>
        )}
      </div>

      {/* Modal Nova Sessão */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="font-bold text-lg text-gray-800 mb-4">Nova Sessão</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Sessão</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="ordinaria">Ordinária</option>
                  <option value="extraordinaria">Extraordinária</option>
                  <option value="especial">Especial</option>
                  <option value="solene">Solene</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número da Sessão</label>
                <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Ex: 15" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
                <input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} placeholder="Ex: Plenário da Câmara" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              As proposições são adicionadas à pauta pela tela de Proposições.
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Criar Sessão</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PautaItemRow({
  item, sessaoAberta, onResultado, onRetirar, propEmVotacao, onProximaComissao,
}: {
  item: PautaItem;
  sessaoAberta: boolean;
  onResultado: (r: string) => void;
  onRetirar: () => void;
  propEmVotacao?: boolean;
  onProximaComissao?: () => void;
}) {
  const numVotacoes = item.proposicao.numVotacoes ?? 1;
  const secao = item.secao;
  const resultado = item.resultado ?? "";
  const destinoFinal = item.proposicao.destinoFinal ?? "sancao";
  const tipoLabel: Record<string, string> = { pl: "PL", resolucao: "Res.", requerimento: "Req.", mocao: "Moção" };
  const locked = (secao === "apresentacao" || secao === "parecer") && !!propEmVotacao;

  const propInfo = (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-800">
        {item.ordem}. {tipoLabel[item.proposicao.tipo] || item.proposicao.tipo} {item.proposicao.numero}/{item.proposicao.ano}
      </p>
      <p className="text-xs text-gray-500 mt-0.5 truncate">{item.proposicao.ementa}</p>
    </div>
  );

  const B = "px-1.5 py-0.5 rounded-full text-xs border transition whitespace-nowrap";
  const retirarBtn = (
    <button onClick={onRetirar} className={`${B} font-medium bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100`}>
      ↩ Retirar
    </button>
  );

  // ── Primeira Parte: Apresentação / Parecer ─────────────────────────────────
  if (secao === "apresentacao" || secao === "parecer") {
    // "Disp. Parecer" bloqueado se já passou da primeira comissão regular
    const regulares = (item.proposicao.comissoes || []).filter(c => !isCRF(c)).sort((a, b) => a.ordem - b.ordem);
    const primeiraOrdem = regulares.length > 0 ? regulares[0].ordem : 0;
    const etapaOrdem = item.proposicao.etapaAtual.startsWith("comissao")
      ? parseInt(item.proposicao.etapaAtual.replace("comissao", ""))
      : 0;
    const dispensaParecerBloqueada = etapaOrdem > primeiraOrdem;

    const opts: Array<{ value: string; label: string; readOnly?: boolean; extraDisabled?: boolean }> = [
      { value: "comissao", label: "Comissão", readOnly: true },
      { value: "parecer_conjunto", label: "Par. Conjunto" },
      { value: "dispensa_parecer", label: "Disp. Parecer", extraDisabled: dispensaParecerBloqueada },
      { value: "dispensa_intersticio", label: "Disp. Interstício" },
    ];
    const selIdx = resultado ? opts.findIndex(o => o.value === resultado) : -1;
    // "permanent" = não pode desfazer nem regredir, mas pode avançar para opções posteriores
    const isPermanent = resultado === "parecer_conjunto" || resultado === "dispensa_parecer";
    const canClick = (i: number, opt: { readOnly?: boolean; extraDisabled?: boolean }) => {
      if (opt.readOnly || opt.extraDisabled || locked) return false;
      if (isPermanent && i <= selIdx) return false; // não pode regredir nem desfazer
      return true;
    };

    const btnCls = (i: number, opt: { readOnly?: boolean; extraDisabled?: boolean }) => {
      if (!canClick(i, opt)) return `${B} bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-50`;
      if (selIdx < 0) {
        if (i === 0) return `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold cursor-default`;
        return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
      }
      if (i < selIdx) return `${B} bg-green-100 text-green-700 border-green-400`;
      if (i === selIdx) return `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold${opt.readOnly ? " cursor-default" : ""}`;
      return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
    };

    return (
      <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
        <div className="flex items-start justify-between gap-4">
          {propInfo}
          <div className="flex-shrink-0 flex flex-col items-end gap-2" style={{ minWidth: 0 }}>
            <MiniStepper prop={item.proposicao} resultado={resultado} />
            {sessaoAberta && (
              <div className="flex flex-wrap items-center gap-1 justify-end" style={{ maxWidth: 520 }}>
                {opts.map((opt, i) => (
                  <button
                    key={opt.value}
                    disabled={!canClick(i, opt)}
                    onClick={() => {
                      if (!canClick(i, opt)) return;
                      onResultado(resultado === opt.value ? "" : opt.value);
                    }}
                    className={btnCls(i, opt)}
                  >
                    {opt.label}
                  </button>
                ))}
                {!locked && sessaoAberta && onProximaComissao && secao === "parecer" && (
                  <button
                    onClick={onProximaComissao}
                    className={`${B} font-semibold bg-blue-600 text-white border-blue-600 hover:bg-blue-700`}
                  >
                    Próxima Comissão →
                  </button>
                )}
                {!locked && retirarBtn}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Segunda Parte: Votação ─────────────────────────────────────────────────
  if (secao === "votacao") {
    const mainOpts: Array<{ value: string; label: string }> = [
      { value: "primeira_votacao", label: "1ª Votação" },
    ];
    if (numVotacoes >= 2) mainOpts.push({ value: "segunda_votacao", label: "2ª Votação" });
    mainOpts.push({ value: "aprovado", label: "Aprovado" });
    if (resultado === "aprovado") {
      mainOpts.push(destinoFinal === "promulgacao"
        ? { value: "promulgacao", label: "Promulgação" }
        : { value: "sancao", label: "Sanção" });
    }
    mainOpts.push({ value: "reprovado", label: "Reprovado" });
    if (resultado === "reprovado") mainOpts.push({ value: "arquivo", label: "Arquivo" });

    const mainSelIdx = mainOpts.findIndex(o => o.value === resultado);
    const beforePrimeira = !["primeira_votacao","segunda_votacao","aprovado","sancao","promulgacao","reprovado","arquivo"].includes(resultado);

    const mainBtnCls = (i: number) => {
      if (mainSelIdx < 0) return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
      if (i < mainSelIdx) return `${B} bg-green-100 text-green-700 border-green-400`;
      if (i === mainSelIdx) return `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold`;
      return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
    };
    const sideCls = (active: boolean) =>
      active ? `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold` : `${B} bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100`;

    return (
      <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
        <div className="flex items-start justify-between gap-4">
          {propInfo}
          <div className="flex-shrink-0 flex flex-col items-end gap-2" style={{ minWidth: 0 }}>
            <MiniStepper prop={item.proposicao} resultado={resultado} />
            {sessaoAberta && (
              <div className="flex flex-wrap items-center gap-1 justify-end" style={{ maxWidth: 520 }}>
                <button onClick={() => onResultado(resultado === "vista" ? "" : "vista")} className={sideCls(resultado === "vista")}>Vista</button>
                <button onClick={() => onResultado(resultado === "adiamento" ? "" : "adiamento")} className={sideCls(resultado === "adiamento")}>Adiamento</button>
                <button onClick={() => onResultado(resultado === "dispensa_intersticio" ? "" : "dispensa_intersticio")} className={sideCls(resultado === "dispensa_intersticio")}>Disp. Interstício</button>
                {beforePrimeira && (
                  <button onClick={() => onResultado(resultado === "emenda" ? "" : "emenda")} className={sideCls(resultado === "emenda")}>Emendas</button>
                )}
                <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />
                {mainOpts.map((opt, i) => (
                  <button key={opt.value} onClick={() => onResultado(resultado === opt.value ? "" : opt.value)} className={mainBtnCls(i)}>
                    {opt.label}
                  </button>
                ))}
                {retirarBtn}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Redação Final / Requerimento ───────────────────────────────────────────
  const defOpts = secao === "redacao_final"
    ? [{ value: "em_revisao", label: "Em Revisão" }, { value: "revisado", label: "Revisado" }]
    : [{ value: "aprovado", label: "Aprovado" }, { value: "reprovado", label: "Reprovado" }];
  const defSelIdx = defOpts.findIndex(o => o.value === resultado);
  const defBtnCls = (i: number) => {
    if (defSelIdx < 0) return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
    if (i < defSelIdx) return `${B} bg-green-100 text-green-700 border-green-400`;
    if (i === defSelIdx) return `${B} bg-amber-100 text-amber-700 border-amber-400 font-semibold`;
    return `${B} bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100`;
  };

  return (
    <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        {propInfo}
        <div className="flex-shrink-0 flex flex-col items-end gap-2" style={{ minWidth: 0 }}>
          <MiniStepper prop={item.proposicao} resultado={resultado} />
          {sessaoAberta && (
            <div className="flex flex-wrap items-center gap-1 justify-end" style={{ maxWidth: 520 }}>
              {defOpts.map((opt, i) => (
                <button key={opt.value} onClick={() => onResultado(resultado === opt.value ? "" : opt.value)} className={defBtnCls(i)}>
                  {opt.label}
                </button>
              ))}
              {retirarBtn}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
