"use client";
import { useEffect, useState } from "react";

type Proposicao = { id: string; numero: string; ano: number; tipo: string; ementa: string; status: string };
type PautaItem = { id: string; proposicao: Proposicao; ordem: number; resultado?: string };
type Sessao = { id: string; data: string; tipo: string; numero?: number; ano?: number; local?: string; status: string; itens: PautaItem[] };

const tipoLabel: Record<string, string> = { pl: "PL", resolucao: "Res.", requerimento: "Req.", mocao: "Moção" };
const resultadoOpts = ["aprovado", "rejeitado", "retirado", "adiado"];

export default function SessoesPage() {
  const [lista, setLista] = useState<Sessao[]>([]);
  const [proposicoes, setProposicoes] = useState<Proposicao[]>([]);
  const [modal, setModal] = useState(false);
  const [detalhe, setDetalhe] = useState<Sessao | null>(null);
  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0, 10),
    tipo: "ordinaria", numero: "", ano: new Date().getFullYear(), local: "", itens: [] as { proposicaoId: string; ordem: number }[],
  });

  async function carregar() {
    const [s, p] = await Promise.all([fetch("/api/sessoes").then(r => r.json()), fetch("/api/proposicoes").then(r => r.json())]);
    setLista(s);
    setProposicoes(p.filter((pr: any) => pr.status === "em_tramitacao"));
  }
  useEffect(() => { carregar(); }, []);

  async function carregarDetalhe(id: string) {
    const res = await fetch(`/api/sessoes/${id}`);
    setDetalhe(await res.json());
  }

  function addItem(propId: string) {
    if (form.itens.find(i => i.proposicaoId === propId)) return;
    setForm({ ...form, itens: [...form.itens, { proposicaoId: propId, ordem: form.itens.length + 1 }] });
  }

  function removeItem(propId: string) {
    const itens = form.itens.filter(i => i.proposicaoId !== propId).map((i, idx) => ({ ...i, ordem: idx + 1 }));
    setForm({ ...form, itens });
  }

  async function salvar() {
    await fetch("/api/sessoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, numero: form.numero ? +form.numero : undefined }),
    });
    setModal(false);
    carregar();
  }

  async function atualizarResultado(sessaoId: string, item: PautaItem, resultado: string) {
    const sessao = lista.find(s => s.id === sessaoId)!;
    const itens = sessao.itens.map(i => i.id === item.id ? { ...i, resultado } : i);
    await fetch(`/api/sessoes/${sessaoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: itens.map(i => ({ proposicaoId: i.proposicao.id, ordem: i.ordem, resultado: i.resultado })) }),
    });
    carregar();
    if (detalhe?.id === sessaoId) carregarDetalhe(sessaoId);
  }

  async function gerarPDF(sessao: Sessao) {
    window.print();
  }

  const statusColor: Record<string, string> = {
    agendada: "bg-blue-100 text-blue-700",
    realizada: "bg-green-100 text-green-700",
    cancelada: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sessões & Pautas</h1>
          <p className="text-gray-500 text-sm">{lista.length} sessão(ões) cadastrada(s)</p>
        </div>
        <button onClick={() => { setForm({ data: new Date().toISOString().slice(0, 10), tipo: "ordinaria", numero: "", ano: new Date().getFullYear(), local: "", itens: [] }); setModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Nova Sessão
        </button>
      </div>

      <div className="flex gap-6">
        {/* Lista de sessões */}
        <div className="w-72 flex-shrink-0 space-y-3">
          {lista.map((s) => (
            <button key={s.id} onClick={() => carregarDetalhe(s.id)} className={`w-full text-left bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition ${detalhe?.id === s.id ? "ring-2 ring-blue-500" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-gray-800 text-sm capitalize">{s.tipo}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[s.status]}`}>{s.status}</span>
              </div>
              <p className="text-xs text-gray-500">{new Date(s.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              <p className="text-xs text-gray-400 mt-1">{s.itens.length} item(s) na pauta</p>
              {s.local && <p className="text-xs text-gray-400">{s.local}</p>}
            </button>
          ))}
          {lista.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Nenhuma sessão cadastrada.</p>}
        </div>

        {/* Detalhe da sessão */}
        {detalhe && (
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-800 capitalize">Sessão {detalhe.tipo}</h2>
                  <p className="text-gray-500 text-sm">{new Date(detalhe.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                  {detalhe.local && <p className="text-sm text-gray-500">Local: {detalhe.local}</p>}
                </div>
                <button onClick={() => gerarPDF(detalhe)} className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-700">
                  🖨️ Imprimir Pauta
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Ordem do Dia</h3>
              </div>
              {detalhe.itens.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Nenhum item na pauta.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {detalhe.itens.map((item) => (
                    <div key={item.id} className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {item.ordem}. {tipoLabel[item.proposicao.tipo]} {item.proposicao.numero}/{item.proposicao.ano}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.proposicao.ementa}</p>
                      </div>
                      <select
                        value={item.resultado || ""}
                        onChange={(e) => atualizarResultado(detalhe.id, item, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Sem resultado</option>
                        {resultadoOpts.map((r) => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">Nova Sessão</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
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

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Itens da Pauta</p>
              {form.itens.length > 0 && (
                <div className="mb-3 space-y-1">
                  {form.itens.map((item, i) => {
                    const p = proposicoes.find(pr => pr.id === item.proposicaoId);
                    return p ? (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-blue-700 flex-1">{i + 1}. {tipoLabel[p.tipo]} {p.numero}/{p.ano} — {p.ementa.slice(0, 60)}...</span>
                        <button onClick={() => removeItem(item.proposicaoId)} className="text-red-400 hover:text-red-600">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {proposicoes.filter(p => !form.itens.find(i => i.proposicaoId === p.id)).map((p) => (
                  <button key={p.id} onClick={() => addItem(p.id)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <p className="text-sm text-gray-700">{tipoLabel[p.tipo]} {p.numero}/{p.ano}</p>
                    <p className="text-xs text-gray-400 line-clamp-1">{p.ementa}</p>
                  </button>
                ))}
                {proposicoes.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhuma proposição disponível.</p>}
              </div>
            </div>

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
