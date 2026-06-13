"use client";
import { useEffect, useState } from "react";

type Comissao = { id: string; nome: string };
type Analista = { id: string; nome: string; email?: string; telefone?: string; ativo: boolean; comissao: Comissao };

const empty = { nome: "", email: "", telefone: "", comissaoId: "" };

export default function AnalistasPage() {
  const [lista, setLista] = useState<Analista[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);

  async function carregar() {
    const [a, c] = await Promise.all([fetch("/api/analistas").then(r => r.json()), fetch("/api/comissoes").then(r => r.json())]);
    setLista(a);
    setComissoes(c.filter((c: any) => c.ativa));
  }
  useEffect(() => { carregar(); }, []);

  function editar(a: Analista) {
    setForm({ nome: a.nome, email: a.email || "", telefone: a.telefone || "", comissaoId: a.comissao.id });
    setEditId(a.id);
    setModal(true);
  }

  async function salvar() {
    if (editId) {
      await fetch(`/api/analistas/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    } else {
      await fetch("/api/analistas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setModal(false);
    setForm(empty);
    setEditId(null);
    carregar();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analistas</h1>
          <p className="text-gray-500 text-sm">Um analista por comissão</p>
        </div>
        <button onClick={() => { setForm(empty); setEditId(null); setModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Novo Analista
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.filter(a => a.ativo).map((a) => (
          <div key={a.id} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800">{a.nome}</p>
                <p className="text-sm text-blue-600">{a.comissao.nome}</p>
                {a.email && <p className="text-xs text-gray-500 mt-1">{a.email}</p>}
                {a.telefone && <p className="text-xs text-gray-500">{a.telefone}</p>}
              </div>
              <button onClick={() => editar(a)} className="text-gray-400 hover:text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{editId ? "Editar" : "Novo"} Analista</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comissão</label>
                <select value={form.comissaoId} onChange={(e) => setForm({ ...form, comissaoId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione...</option>
                  {comissoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
