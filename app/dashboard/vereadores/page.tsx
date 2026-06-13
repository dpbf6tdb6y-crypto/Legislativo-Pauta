"use client";
import { useEffect, useState } from "react";

type Vereador = {
  id: string; nome: string; partido: string; legislatura: string;
  telefone?: string; email?: string; cargo?: string; poder: string; ativo: boolean;
};

const cargosMesa = [
  { value: "", label: "Vereador (sem cargo)" },
  { value: "presidente", label: "Presidente da Mesa" },
  { value: "vice-presidente", label: "Vice-Presidente" },
  { value: "1-secretario", label: "1º Secretário" },
  { value: "2-secretario", label: "2º Secretário" },
];

const cargosExecutivo = [
  { value: "prefeito", label: "Prefeito" },
  { value: "vice-prefeito", label: "Vice-Prefeito" },
];

const cargoBadge: Record<string, { label: string; bg: string; color: string }> = {
  presidente:        { label: "Presidente da Mesa", bg: "#6B0000", color: "#fff" },
  "vice-presidente": { label: "Vice-Presidente",    bg: "#d4a017", color: "#fff" },
  "1-secretario":    { label: "1º Secretário",      bg: "#1e40af", color: "#fff" },
  "2-secretario":    { label: "2º Secretário",      bg: "#374151", color: "#fff" },
  prefeito:          { label: "Prefeito",            bg: "#065f46", color: "#fff" },
  "vice-prefeito":   { label: "Vice-Prefeito",      bg: "#047857", color: "#fff" },
};

const empty = { nome: "", partido: "", legislatura: "2025-2028", telefone: "", email: "", cargo: "", poder: "legislativo" };

export default function VereadoresPage() {
  const [lista, setLista] = useState<Vereador[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  async function carregar() {
    const res = await fetch("/api/vereadores");
    setLista(await res.json());
  }
  useEffect(() => { carregar(); }, []);

  async function salvar() {
    const payload = { ...form, cargo: form.cargo || null };
    if (editId) {
      await fetch(`/api/vereadores/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/vereadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setModal(false);
    setForm(empty);
    setEditId(null);
    carregar();
  }

  function editar(v: Vereador) {
    setForm({ nome: v.nome, partido: v.partido, legislatura: v.legislatura, telefone: v.telefone || "", email: v.email || "", cargo: v.cargo || "", poder: v.poder });
    setEditId(v.id);
    setModal(true);
  }

  function abrirNovo(poder: string) {
    setForm({ ...empty, poder, cargo: poder === "executivo" ? "prefeito" : "" });
    setEditId(null);
    setModal(true);
  }

  async function desativar(id: string) {
    if (!confirm("Desativar este cadastro?")) return;
    await fetch(`/api/vereadores/${id}`, { method: "DELETE" });
    carregar();
  }

  const mesa = lista.filter(v => v.ativo && v.poder === "legislativo" && v.cargo);
  const vereadores = lista.filter(v => v.ativo && v.poder === "legislativo" && !v.cargo);
  const executivo = lista.filter(v => v.ativo && v.poder === "executivo");

  function Card({ v }: { v: Vereador }) {
    const badge = v.cargo ? cargoBadge[v.cargo] : null;
    return (
      <div className="bg-white rounded-xl shadow-sm p-5" style={badge ? { borderTop: `4px solid ${badge.bg}` } : {}}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            {badge && (
              <span className="text-xs font-bold px-2 py-0.5 rounded mb-1 inline-block" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
            )}
            <p className="font-semibold text-gray-800">{v.nome}</p>
            <p className="text-sm font-medium text-blue-600">{v.partido}</p>
            {v.poder === "legislativo" && <p className="text-xs text-gray-500 mt-0.5">Legislatura: {v.legislatura}</p>}
            {v.telefone && <p className="text-xs text-gray-500">Tel: {v.telefone}</p>}
            {v.email && <p className="text-xs text-gray-500">{v.email}</p>}
          </div>
          <div className="flex gap-1 ml-2">
            <button onClick={() => editar(v)} className="text-gray-400 hover:text-blue-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={() => desativar(v.id)} className="text-gray-400 hover:text-red-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vereadores / Executivo</h1>
          <p className="text-gray-500 text-sm">{lista.filter(v => v.ativo).length} cadastros ativos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => abrirNovo("legislativo")} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            + Vereador
          </button>
          <button onClick={() => abrirNovo("executivo")} className="text-white px-4 py-2 rounded-lg text-sm font-medium transition" style={{ background: "#065f46" }}>
            + Executivo
          </button>
        </div>
      </div>

      {/* Poder Executivo */}
      {executivo.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Poder Executivo</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {executivo.map(v => <Card key={v.id} v={v} />)}
          </div>
        </div>
      )}

      {/* Mesa Diretora */}
      {mesa.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Mesa Diretora</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mesa.sort((a, b) => {
              const order = ["presidente", "vice-presidente", "1-secretario", "2-secretario"];
              return order.indexOf(a.cargo || "") - order.indexOf(b.cargo || "");
            }).map(v => <Card key={v.id} v={v} />)}
          </div>
        </div>
      )}

      {/* Vereadores */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Vereadores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vereadores.map(v => <Card key={v.id} v={v} />)}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="font-bold text-lg text-gray-800 mb-4">
              {editId ? "Editar" : "Novo"} {form.poder === "executivo" ? "— Poder Executivo" : "Vereador"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Partido</label>
                <input value={form.partido} onChange={(e) => setForm({ ...form, partido: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {form.poder === "legislativo" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legislatura</label>
                  <input value={form.legislatura} onChange={(e) => setForm({ ...form, legislatura: e.target.value })} placeholder="Ex: 2025-2028" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.poder === "executivo" ? "Cargo" : "Cargo na Mesa Diretora"}
                </label>
                <select value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(form.poder === "executivo" ? cargosExecutivo : cargosMesa).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
