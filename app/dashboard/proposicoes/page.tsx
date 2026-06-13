"use client";
import { useEffect, useState } from "react";

type Vereador = { id: string; nome: string; partido: string; poder: string; cargo?: string };
type Comissao = { id: string; nome: string; sigla?: string };
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string;
  origemTipo: string; autorVereador?: Vereador; autorExterno?: string;
  dataEntrada: string; status: string;
  dispensaParecer: boolean; dispensaIntersticio: boolean;
  regimeUrgencia: boolean; numVotacoes: number; etapaAtual: string;
  comissoes: { comissao: Comissao; ordem: number }[];
};

const tipoLabel: Record<string, string> = {
  pl: "PL", resolucao: "Resolução", requerimento: "Requerimento", mocao: "Moção",
};
const statusLabel: Record<string, string> = {
  em_tramitacao: "Em tramitação", aprovada: "Aprovada", rejeitada: "Rejeitada", arquivada: "Arquivada",
};
const statusColor: Record<string, string> = {
  em_tramitacao: "bg-yellow-100 text-yellow-800",
  aprovada: "bg-green-100 text-green-800",
  rejeitada: "bg-red-100 text-red-800",
  arquivada: "bg-gray-100 text-gray-800",
};

const emptyForm = {
  numero: "", ano: new Date().getFullYear(), tipo: "pl", ementa: "",
  origemTipo: "vereador", autorVereadorId: "", autorExterno: "",
  dataEntrada: new Date().toISOString().slice(0, 10),
  dispensaParecer: false, dispensaIntersticio: false, regimeUrgencia: false,
  numVotacoes: 1, status: "em_tramitacao",
  comissoes: [] as { comissaoId: string; ordem: number }[],
};

type Etapa = { key: string; label: string };

function buildEtapas(p: Proposicao): Etapa[] {
  const etapas: Etapa[] = [
    { key: "protocolado", label: "Protocolado" },
    { key: "pautado", label: "Pautado" },
  ];
  if (p.comissoes.length >= 1) etapas.push({ key: "comissao1", label: p.comissoes[0]?.comissao?.sigla || "Comissão 1" });
  if (p.comissoes.length >= 2) etapas.push({ key: "comissao2", label: p.comissoes[1]?.comissao?.sigla || "Comissão 2" });
  if (p.comissoes.length >= 3) etapas.push({ key: "comissao3", label: p.comissoes[2]?.comissao?.sigla || "Comissão 3" });
  if (p.comissoes.length >= 4) etapas.push({ key: "comissao4", label: p.comissoes[3]?.comissao?.sigla || "Comissão 4" });
  if (p.comissoes.length >= 5) etapas.push({ key: "comissao5", label: p.comissoes[4]?.comissao?.sigla || "Comissão 5" });
  if (p.dispensaParecer) etapas.push({ key: "disp_parecer", label: "Disp. Parecer" });
  if (p.dispensaIntersticio) etapas.push({ key: "disp_intersticio", label: "Disp. Interstício" });
  etapas.push({ key: "primeira_votacao", label: "1ª Votação" });
  if (p.numVotacoes >= 2) etapas.push({ key: "segunda_votacao", label: "2ª Votação" });
  return etapas;
}

function Stepper({ p, onAvancar }: { p: Proposicao; onAvancar: (key: string) => void }) {
  const etapas = buildEtapas(p);
  const idx = etapas.findIndex(e => e.key === p.etapaAtual);
  return (
    <div className="flex items-end gap-2 flex-wrap mt-4 pt-4 border-t border-gray-100">
      {etapas.map((e, i) => {
        const concluida = i < idx;
        const atual = i === idx;
        return (
          <button key={e.key} onClick={() => onAvancar(e.key)} title={`Marcar: ${e.label}`}
            className="flex flex-col items-center gap-1" style={{ minWidth: 60 }}>
            <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background: concluida ? "#8B0000" : atual ? "#d4a017" : "#e5e7eb",
                color: concluida || atual ? "#fff" : "#9ca3af",
                boxShadow: atual ? "0 0 0 3px #d4a01740" : "none",
              }}>
              {concluida ? "✓" : i + 1}
            </div>
            <span className="text-center leading-tight"
              style={{ fontSize: 10, color: concluida ? "#8B0000" : atual ? "#92400e" : "#9ca3af", fontWeight: atual ? 600 : 400, maxWidth: 60 }}>
              {e.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type Sessao = { id: string; data: string; tipo: string; numero?: number; status: string };

export default function ProposicoesPage() {
  const [lista, setLista] = useState<Proposicao[]>([]);
  const [vereadores, setVereadores] = useState<Vereador[]>([]);
  const [executivo, setExecutivo] = useState<Vereador[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [verProp, setVerProp] = useState<Proposicao | null>(null);

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  async function carregar() {
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroStatus) params.set("status", filtroStatus);
    const [p, v, c, s] = await Promise.all([
      fetch(`/api/proposicoes?${params}`).then(r => r.json()),
      fetch("/api/vereadores").then(r => r.json()),
      fetch("/api/comissoes").then(r => r.json()),
      fetch("/api/sessoes").then(r => r.json()),
    ]);
    setLista(p);
    setVereadores(v.filter((vr: any) => vr.ativo && vr.poder === "legislativo"));
    setExecutivo(v.filter((vr: any) => vr.ativo && vr.poder === "executivo"));
    setComissoes(c.filter((c: any) => c.ativa));
    setSessoes(s.filter((ss: any) => ss.status === "agendada"));
  }

  useEffect(() => { carregar(); }, [filtroTipo, filtroStatus]);

  function abrirNova() {
    setForm(emptyForm);
    setEditId(null);
    setModal(true);
  }

  function abrirEditar(p: Proposicao) {
    setForm({
      numero: p.numero,
      ano: p.ano,
      tipo: p.tipo,
      ementa: p.ementa,
      origemTipo: p.origemTipo,
      autorVereadorId: p.autorVereador?.id || "",
      autorExterno: p.autorExterno || "",
      dataEntrada: p.dataEntrada.slice(0, 10),
      dispensaParecer: p.dispensaParecer,
      dispensaIntersticio: p.dispensaIntersticio,
      regimeUrgencia: p.regimeUrgencia,
      numVotacoes: p.numVotacoes,
      status: p.status,
      comissoes: p.comissoes.map(c => ({ comissaoId: c.comissao.id, ordem: c.ordem })),
    });
    setEditId(p.id);
    setModal(true);
  }

  function setComissaoOrdem(idx: number, comissaoId: string) {
    const novas = [...form.comissoes];
    novas[idx] = { comissaoId, ordem: idx + 1 };
    setForm({ ...form, comissoes: novas });
  }

  function addComissao() {
    if (form.comissoes.length < 5)
      setForm({ ...form, comissoes: [...form.comissoes, { comissaoId: "", ordem: form.comissoes.length + 1 }] });
  }

  function removeComissao(idx: number) {
    const novas = form.comissoes.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordem: i + 1 }));
    setForm({ ...form, comissoes: novas });
  }

  async function salvar() {
    const payload = {
      ...form,
      autorVereadorId: form.origemTipo === "vereador" && form.autorVereadorId ? form.autorVereadorId : null,
      autorExterno: form.origemTipo === "executivo" ? form.autorExterno : null,
      comissoes: form.comissoes.filter(c => c.comissaoId),
    };
    if (editId) {
      await fetch(`/api/proposicoes/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/proposicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setModal(false);
    setForm(emptyForm);
    setEditId(null);
    carregar();
  }

  function toggleSelecionada(id: string) {
    setSelecionadas(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const proximaSessao = sessoes.length > 0
    ? sessoes.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())[0]
    : null;

  function formatarDataSessao(data: string) {
    const d = new Date(data);
    const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }

  async function enviarParaPauta() {
    if (!proximaSessao) return;
    setEnviando(true);
    const res = await fetch("/api/pauta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessaoId: proximaSessao.id, proposicaoIds: Array.from(selecionadas) }),
    });
    const result = await res.json();
    setEnviando(false);
    setSelecionadas(new Set());
    carregar();
    if (result.duplicadas > 0) alert(`${result.adicionadas} adicionada(s). ${result.duplicadas} já estavam na pauta.`);
  }

  async function excluir(id: string) {
    if (!confirm("Arquivar esta proposição?")) return;
    await fetch(`/api/proposicoes/${id}`, { method: "DELETE" });
    carregar();
  }

  async function avancarEtapa(id: string, etapaAtual: string) {
    await fetch(`/api/proposicoes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapaAtual }),
    });
    carregar();
  }

  const autorNome = (p: Proposicao) =>
    p.origemTipo === "vereador" ? (p.autorVereador?.nome || "—") : (p.autorExterno || "Executivo");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Proposições</h1>
          <p className="text-gray-500 text-sm">{lista.length} registros</p>
        </div>

        {/* Botão central Enviar para Pauta */}
        <div className="flex-1 flex justify-center">
          {selecionadas.size > 0 && (
            proximaSessao ? (
              <button
                onClick={enviarParaPauta}
                disabled={enviando}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition disabled:opacity-60"
                style={{ background: "#8B0000" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {enviando ? "Enviando..." : `Enviar para pauta de ${formatarDataSessao(proximaSessao.data)}`}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-amber-700 bg-amber-50 border border-amber-200">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                Nenhuma sessão agendada. Cadastre em Sessões & Pautas.
              </div>
            )
          )}
        </div>

        <button onClick={abrirNova} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Nova Proposição
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos os tipos</option>
          {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="space-y-4">
        {lista.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-400">Nenhuma proposição encontrada.</div>
        )}
        {lista.map((p) => (
          <div key={p.id}
            className="bg-white rounded-xl shadow-sm p-5 transition"
            style={selecionadas.has(p.id) ? { outline: "2px solid #8B0000", outlineOffset: 2 } : {}}>
            <div className="flex items-start justify-between gap-4">
              {/* Checkbox de seleção */}
              <div className="flex-shrink-0 pt-0.5">
                <input
                  type="checkbox"
                  checked={selecionadas.has(p.id)}
                  onChange={() => toggleSelecionada(p.id)}
                  className="w-4 h-4 rounded cursor-pointer accent-red-800"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-gray-800">{tipoLabel[p.tipo]} {p.numero}/{p.ano}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                  {p.regimeUrgencia && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Urgência</span>}
                  <span className="text-xs text-gray-400">{new Date(p.dataEntrada).toLocaleDateString("pt-BR")}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">{p.ementa}</p>
                <p className="text-xs text-gray-400">
                  Autor: <span className="text-gray-600 font-medium">{autorNome(p)}</span>
                  {p.comissoes.length > 0 && (
                    <span className="ml-3">
                      Comissões: <span className="text-gray-600">{p.comissoes.map(c => c.comissao.sigla || c.comissao.nome).join(" → ")}</span>
                    </span>
                  )}
                </p>
              </div>
              {/* Botões */}
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => setVerProp(p)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
                  Ver
                </button>
                <button onClick={() => abrirEditar(p)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition">
                  Editar
                </button>
                <button onClick={() => excluir(p.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition">
                  Excluir
                </button>
              </div>
            </div>

            <Stepper p={p} onAvancar={(key) => avancarEtapa(p.id, key)} />
          </div>
        ))}
      </div>

      {/* Modal visualizar */}
      {verProp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-bold text-lg text-gray-800">{tipoLabel[verProp.tipo]} {verProp.numero}/{verProp.ano}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[verProp.status]}`}>{statusLabel[verProp.status]}</span>
              </div>
              <button onClick={() => setVerProp(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Ementa</p>
                <p className="text-gray-800">{verProp.ementa}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Autor</p>
                  <p className="text-gray-800">{autorNome(verProp)}</p>
                  <p className="text-xs text-gray-400 capitalize">{verProp.origemTipo}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Data de Entrada</p>
                  <p className="text-gray-800">{new Date(verProp.dataEntrada).toLocaleDateString("pt-BR")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Votações</p>
                  <p className="text-gray-800">{verProp.numVotacoes === 1 ? "1 votação" : "2 votações"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Regime</p>
                  <p className="text-gray-800">{verProp.regimeUrgencia ? "Urgência" : "Normal"}</p>
                </div>
              </div>
              {verProp.comissoes.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Comissões</p>
                  {verProp.comissoes.map((c, i) => (
                    <p key={i} className="text-gray-800">{i + 1}. {c.comissao.nome} {c.comissao.sigla ? `(${c.comissao.sigla})` : ""}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {verProp.dispensaParecer && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Dispensa de Parecer</span>}
                {verProp.dispensaIntersticio && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Dispensa de Interstício</span>}
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Fluxo</p>
                <Stepper p={verProp} onAvancar={async (key) => { await avancarEtapa(verProp.id, key); setVerProp({ ...verProp, etapaAtual: key }); }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setVerProp(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Fechar</button>
              <button onClick={() => { setVerProp(null); abrirEditar(verProp); }} className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600">Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cadastrar / editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{editId ? "Editar" : "Nova"} Proposição</h2>
            <div className="grid grid-cols-2 gap-4">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                  <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                  <input type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: +e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ementa</label>
                <textarea value={form.ementa} onChange={(e) => setForm({ ...form, ementa: e.target.value })} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
                <select value={form.origemTipo} onChange={(e) => setForm({ ...form, origemTipo: e.target.value, autorVereadorId: "", autorExterno: "" })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="vereador">Vereador</option>
                  <option value="executivo">Executivo Municipal</option>
                </select>
              </div>

              <div>
                {form.origemTipo === "vereador" ? (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor (Vereador)</label>
                    <select value={form.autorVereadorId} onChange={(e) => setForm({ ...form, autorVereadorId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">Selecione...</option>
                      {vereadores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor (Executivo)</label>
                    {executivo.length > 0 ? (
                      <select value={form.autorExterno} onChange={(e) => setForm({ ...form, autorExterno: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        <option value="">Selecione...</option>
                        {executivo.map(e => <option key={e.id} value={e.nome}>{e.nome} ({e.cargo === "prefeito" ? "Prefeito" : "Vice-Prefeito"})</option>)}
                      </select>
                    ) : (
                      <input value={form.autorExterno} onChange={(e) => setForm({ ...form, autorExterno: e.target.value })} placeholder="Ex: Prefeitura Municipal" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrada</label>
                <input type="date" value={form.dataEntrada} onChange={(e) => setForm({ ...form, dataEntrada: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de Votações</label>
                <div className="flex gap-3 pt-1">
                  {[1, 2].map(n => (
                    <label key={n} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="radio" name="numVotacoes" value={n} checked={form.numVotacoes === n} onChange={() => setForm({ ...form, numVotacoes: n })} />
                      {n === 1 ? "1 votação" : "2 votações"}
                    </label>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Etapas do fluxo</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.regimeUrgencia} onChange={(e) => setForm({ ...form, regimeUrgencia: e.target.checked })} />
                    Regime de urgência
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.dispensaParecer} onChange={(e) => setForm({ ...form, dispensaParecer: e.target.checked, comissoes: e.target.checked ? [] : form.comissoes })} />
                    Dispensa de parecer
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.dispensaIntersticio} onChange={(e) => setForm({ ...form, dispensaIntersticio: e.target.checked })} />
                    Disp. interstício
                  </label>
                </div>
              </div>

              {!form.dispensaParecer && (
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Comissões (até 5)</label>
                    {form.comissoes.length < 5 && (
                      <button onClick={addComissao} className="text-blue-600 text-xs hover:underline">+ Adicionar</button>
                    )}
                  </div>
                  {form.comissoes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-500 w-4">{i + 1}ª</span>
                      <select value={c.comissaoId} onChange={(e) => setComissaoOrdem(i, e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                        <option value="">Selecione...</option>
                        {comissoes.map((cm) => <option key={cm.id} value={cm.id}>{cm.sigla ? `${cm.sigla} — ` : ""}{cm.nome}</option>)}
                      </select>
                      <button onClick={() => removeComissao(i)} className="text-red-400 hover:text-red-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="col-span-2 bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 mb-3">Prévia do fluxo</p>
                <div className="flex flex-wrap gap-2 items-end">
                  {[
                    { show: true, label: "Protocolado" },
                    { show: true, label: "Pautado" },
                    { show: form.comissoes.length >= 1, label: comissoes.find(c => c.id === form.comissoes[0]?.comissaoId)?.sigla || "Comissão 1" },
                    { show: form.comissoes.length >= 2, label: comissoes.find(c => c.id === form.comissoes[1]?.comissaoId)?.sigla || "Comissão 2" },
                    { show: form.comissoes.length >= 3, label: comissoes.find(c => c.id === form.comissoes[2]?.comissaoId)?.sigla || "Comissão 3" },
                    { show: form.comissoes.length >= 4, label: comissoes.find(c => c.id === form.comissoes[3]?.comissaoId)?.sigla || "Comissão 4" },
                    { show: form.comissoes.length >= 5, label: comissoes.find(c => c.id === form.comissoes[4]?.comissaoId)?.sigla || "Comissão 5" },
                    { show: form.dispensaParecer, label: "Disp. Parecer" },
                    { show: form.dispensaIntersticio, label: "Disp. Interstício" },
                    { show: true, label: "1ª Votação" },
                    { show: form.numVotacoes >= 2, label: "2ª Votação" },
                  ].filter(e => e.show).map((e, i, arr) => (
                    <div key={i} className="flex items-center gap-1">
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-7 h-7 rounded text-xs font-bold flex items-center justify-center"
                          style={{ background: i === 0 ? "#d4a017" : "#d1d5db", color: i === 0 ? "#fff" : "#6b7280" }}>
                          {i + 1}
                        </div>
                        <span className="text-center text-gray-500" style={{ fontSize: 9, maxWidth: 56 }}>{e.label}</span>
                      </div>
                      {i < arr.length - 1 && <div className="w-3 h-px bg-gray-300 mb-4" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => { setModal(false); setEditId(null); }} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">
                {editId ? "Salvar Alterações" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
