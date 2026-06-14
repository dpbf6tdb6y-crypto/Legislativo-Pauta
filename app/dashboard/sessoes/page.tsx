"use client";
import { useEffect, useState } from "react";

type ComissaoInfo = { id: string; ordem: number; status: string; comissao: { sigla: string; nome: string } };
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string;
  status: string; etapaAtual: string; destinoFinal?: string;
  numVotacoes?: number; dispensaParecer?: boolean;
  comissoes?: ComissaoInfo[];
};
type PautaItem = { id: string; proposicao: Proposicao; ordem: number; secao: string; resultado?: string };
type Sessao = { id: string; data: string; tipo: string; numero?: number; ano?: number; local?: string; status: string; itens: PautaItem[] };

// ── Mini Stepper ─────────────────────────────────────────────────────────────

function buildSteps(prop: Proposicao): { key: string; label: string }[] {
  const steps: { key: string; label: string }[] = [
    { key: "protocolado", label: "Protoc." },
  ];
  if (!prop.dispensaParecer && prop.comissoes && prop.comissoes.length > 0) {
    prop.comissoes.forEach(c => {
      steps.push({ key: `comissao${c.ordem}`, label: c.comissao.sigla });
    });
    steps.push({ key: "pronto_votar", label: "Ag. Pautar" });
  }
  steps.push({ key: "primeira_votacao", label: "1ª Vot." });
  if ((prop.numVotacoes ?? 1) >= 2) {
    steps.push({ key: "segunda_votacao", label: "2ª Vot." });
  }
  steps.push({
    key: prop.destinoFinal === "promulgacao" ? "promulgada" : "aguardando_sancao",
    label: prop.destinoFinal === "promulgacao" ? "Promulgar" : "Ag. Sanção",
  });
  return steps;
}

function getCurrentIndex(etapaAtual: string, steps: { key: string }[]): number {
  const idx = steps.findIndex(s => s.key === etapaAtual);
  return idx >= 0 ? idx : 0;
}

function MiniStepper({
  prop,
  sessaoAberta = false,
  onEtapa,
}: {
  prop: Proposicao;
  sessaoAberta?: boolean;
  onEtapa?: (key: string) => void;
}) {
  const steps = buildSteps(prop);
  const current = getCurrentIndex(prop.etapaAtual, steps);

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        // Protocolado (i=0) não é clicável — é ponto de partida
        const clickable = sessaoAberta && i > 0 && !active;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center" style={{ minWidth: 44 }}>
              <div
                onClick={() => clickable && onEtapa?.(step.key)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 transition-transform"
                style={{
                  ...(done
                    ? { background: "#8B0000", borderColor: "#8B0000", color: "#fff" }
                    : active
                    ? { background: "#d4a017", borderColor: "#d4a017", color: "#fff" }
                    : { background: "#f3f4f6", borderColor: "#d1d5db", color: "#9ca3af" }),
                  cursor: clickable ? "pointer" : "default",
                  boxShadow: clickable ? "0 0 0 2px transparent" : undefined,
                }}
                title={clickable ? `Mover para: ${step.label}` : undefined}
                onMouseEnter={e => {
                  if (clickable) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px #d4a017";
                }}
                onMouseLeave={e => {
                  if (clickable) (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 2px transparent";
                }}
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
                  maxWidth: 44,
                  color: done ? "#8B0000" : active ? "#b5860f" : "#9ca3af",
                  fontWeight: active ? 700 : 400,
                  wordBreak: "break-word",
                  cursor: clickable ? "pointer" : "default",
                }}
                onClick={() => clickable && onEtapa?.(step.key)}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="h-0.5 flex-shrink-0"
                style={{
                  width: 14,
                  background: i < current ? "#8B0000" : "#e5e7eb",
                  marginBottom: 14,
                }}
              />
            )}
          </div>
        );
      })}
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
    setLista(await res.json());
  }

  async function carregarDetalhe(id: string) {
    const res = await fetch(`/api/sessoes/${id}`);
    const data = await res.json();
    setDetalhe(data);
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
    const novosItens = detalhe.itens.map(i =>
      i.id === item.id ? { ...i, resultado } : i
    );
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

  async function encaminharSancao(proposicaoId: string) {
    await fetch(`/api/proposicoes/${proposicaoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapaAtual: "aguardando_sancao", status: "aguardando_sancao" }),
    });
    if (detalhe) carregarDetalhe(detalhe.id);
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
    };
  }

  const partes = detalhe ? organizarItens(detalhe.itens) : null;

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
                    onSancao={() => encaminharSancao(item.proposicao.id)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    onMoverEtapa={(etapa) => moverEtapa(item.proposicao.id, etapa)} />
                ))}

                {/* d) Leitura de Parecer */}
                <SecaoHeader label="d) Leitura de Parecer" />
                {partes.parecer.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-xs text-gray-400 italic">Nenhum parecer para leitura.</p>
                  </div>
                ) : partes.parecer.map((item) => (
                  <PautaItemRow key={item.id} item={item} sessaoAberta={detalhe.status === "agendada"}
                    onResultado={(r) => atualizarResultado(item, r)}
                    onSancao={() => encaminharSancao(item.proposicao.id)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    onMoverEtapa={(etapa) => moverEtapa(item.proposicao.id, etapa)} />
                ))}
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
                    onSancao={() => encaminharSancao(item.proposicao.id)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    onMoverEtapa={(etapa) => moverEtapa(item.proposicao.id, etapa)} />
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
                    onSancao={() => encaminharSancao(item.proposicao.id)}
                    onRetirar={() => retirarDePauta(item.proposicao.id)}
                    onMoverEtapa={(etapa) => moverEtapa(item.proposicao.id, etapa)} />
                ))}
              </div>

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
  item, sessaoAberta, onResultado, onSancao, onRetirar, onMoverEtapa,
}: {
  item: PautaItem;
  sessaoAberta: boolean;
  onResultado: (r: string) => void;
  onSancao: () => void;
  onRetirar: () => void;
  onMoverEtapa: (etapa: string) => void;
}) {
  const resultadoOpts = [
    { value: "aprovado", label: "✓ Aprovado" },
    { value: "rejeitado", label: "✗ Rejeitado" },
    { value: "retirado", label: "↩ Retirado" },
    { value: "adiado", label: "⏸ Adiado" },
  ];
  const resultadoColor: Record<string, string> = {
    aprovado: "bg-green-100 text-green-700 border-green-300",
    rejeitado: "bg-red-100 text-red-700 border-red-300",
    retirado: "bg-gray-100 text-gray-600 border-gray-300",
    adiado: "bg-yellow-100 text-yellow-700 border-yellow-300",
  };
  const tipoLabel: Record<string, string> = { pl: "PL", resolucao: "Res.", requerimento: "Req.", mocao: "Moção" };

  return (
    <div className="px-5 py-4 border-b border-gray-50 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        {/* Info da proposição */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {item.ordem}. {tipoLabel[item.proposicao.tipo] || item.proposicao.tipo} {item.proposicao.numero}/{item.proposicao.ano}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.proposicao.ementa}</p>
        </div>

        {/* Coluna direita: stepper + ações */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2" style={{ minWidth: 0 }}>
          {/* Mini stepper — clicável em sessão aberta */}
          <MiniStepper
            prop={item.proposicao}
            sessaoAberta={sessaoAberta}
            onEtapa={onMoverEtapa}
          />

          {/* Resultado + Retirar */}
          {sessaoAberta && (
            <div className="flex items-center gap-2">
              {/* Botões de resultado */}
              {resultadoOpts.map(r => (
                <button
                  key={r.value}
                  onClick={() => onResultado(item.resultado === r.value ? "" : r.value)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                    item.resultado === r.value
                      ? resultadoColor[r.value]
                      : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={onRetirar}
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition whitespace-nowrap"
                title="Retirar desta pauta"
              >
                ↩ Retirar
              </button>
            </div>
          )}

          {/* Ação de sanção/promulgação */}
          {item.resultado === "aprovado" && item.proposicao.etapaAtual !== "aguardando_sancao" && item.proposicao.etapaAtual !== "sancionada" && (
            <button
              onClick={onSancao}
              className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition border border-purple-200"
            >
              → {item.proposicao.destinoFinal === "promulgacao" ? "Promulgar" : "Encaminhar à Sanção"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
