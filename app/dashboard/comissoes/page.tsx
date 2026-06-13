"use client";
import { useEffect, useState } from "react";

type Vereador = { id: string; nome: string; partido: string; cargo?: string; poder: string };
type Membro = { id: string; vereador: Vereador; papel: string };
type Comissao = { id: string; nome: string; sigla?: string; tipo: string; ativa: boolean; membros: Membro[]; analistas: { id: string; nome: string }[] };

const papeis = ["presidente", "vice", "relator"];
const papelLabel: Record<string, string> = { presidente: "Presidente", vice: "Vice-Presidente", relator: "Relator" };

function similaridade(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/comiss[aã]o\s+(de\s+)?/g, "").trim();
  const s2 = b.toLowerCase().replace(/comiss[aã]o\s+(de\s+)?/g, "").trim();
  if (s1 === s2) return 1;
  const w1 = s1.split(/\s+/).filter(w => w.length > 2);
  const w2 = s2.split(/\s+/).filter(w => w.length > 2);
  if (w1.length === 0 || w2.length === 0) return 0;
  const comuns = w1.filter(w => w2.includes(w));
  return comuns.length / Math.max(w1.length, w2.length);
}

export default function ComissoesPage() {
  const [lista, setLista] = useState<Comissao[]>([]);
  const [vereadores, setVereadores] = useState<Vereador[]>([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [tipo, setTipo] = useState("permanente");
  const [membros, setMembros] = useState<{ papel: string; vereadorId: string }[]>(
    papeis.map((p) => ({ papel: p, vereadorId: "" }))
  );
  const [avisoSimilar, setAvisoSimilar] = useState<string | null>(null);

  async function carregar() {
    const [c, v] = await Promise.all([fetch("/api/comissoes").then(r => r.json()), fetch("/api/vereadores").then(r => r.json())]);
    setLista(c);
    setVereadores(v.filter((vr: any) => vr.ativo));
  }
  useEffect(() => { carregar(); }, []);

  const vereadoresSemPresidente = vereadores.filter(v => v.poder === "legislativo" && v.cargo !== "presidente");

  function verificarSimilaridade(nomeDigitado: string) {
    if (!nomeDigitado.trim()) { setAvisoSimilar(null); return; }
    const similar = lista.find(c => c.id !== editId && similaridade(nomeDigitado, c.nome) >= 0.6);
    setAvisoSimilar(similar ? `Nome parecido com "${similar.nome}" já cadastrada.` : null);
  }

  function abrirNovo() {
    setNome(""); setSigla(""); setTipo("permanente"); setEditId(null); setAvisoSimilar(null);
    setMembros(papeis.map((p) => ({ papel: p, vereadorId: "" })));
    setModal(true);
  }

  function editar(c: Comissao) {
    setNome(c.nome); setSigla(c.sigla || ""); setTipo(c.tipo); setEditId(c.id); setAvisoSimilar(null);
    setMembros(papeis.map((p) => {
      const m = c.membros.find((mb) => mb.papel === p);
      return { papel: p, vereadorId: m?.vereador.id || "" };
    }));
    setModal(true);
  }

  async function salvar() {
    const body = { nome, sigla, tipo, membros: membros.filter((m) => m.vereadorId) };
    if (editId) {
      await fetch(`/api/comissoes/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/comissoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setModal(false);
    carregar();
  }

  async function excluir(id: string, nomeComissao: string) {
    if (!confirm(`Excluir a comissão "${nomeComissao}"?`)) return;
    await fetch(`/api/comissoes/${id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Comissões</h1>
          <p className="text-gray-500 text-sm">{lista.filter(c => c.ativa).length} ativas</p>
        </div>
        <button onClick={abrirNovo} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Nova Comissão
        </button>
      </div>

      <div className="space-y-4">
        {lista.filter(c => c.ativa).map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800">{c.nome}</p>
                  {c.sigla && (
                    <span className="text-xs px-2 py-0.5 rounded font-bold border" style={{ color: "#8B0000", borderColor: "#8B0000", background: "#fff5f5" }}>
                      {c.sigla}
                    </span>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.tipo === "permanente" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  {c.tipo === "permanente" ? "Permanente" : "Especial"}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => editar(c)} className="text-gray-400 hover:text-blue-600" title="Editar">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => excluir(c.id, c.nome)} className="text-gray-400 hover:text-red-500" title="Excluir">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {papeis.map((papel) => {
                const m = c.membros.find((mb) => mb.papel === papel);
                return (
                  <div key={papel} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 font-medium">{papelLabel[papel]}</p>
                    <p className="text-sm text-gray-800 mt-1">{m ? m.vereador.nome : <span className="text-gray-400 italic">Não definido</span>}</p>
                  </div>
                );
              })}
            </div>
            {c.analistas.length > 0 && (
              <p className="text-xs text-gray-500 mt-3">Analista: <strong>{c.analistas[0].nome}</strong></p>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="font-bold text-lg text-gray-800 mb-4">{editId ? "Editar" : "Nova"} Comissão</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Comissão</label>
                <input
                  value={nome}
                  onChange={(e) => { setNome(e.target.value); verificarSimilaridade(e.target.value); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {avisoSimilar && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    {avisoSimilar}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sigla</label>
                <input value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ex: CLJ" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="permanente">Permanente</option>
                  <option value="especial">Especial</option>
                </select>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Membros</p>
                <p className="text-xs text-gray-400 mb-2">O Presidente da Mesa não participa de comissões.</p>
                {membros.map((m, i) => (
                  <div key={m.papel} className="flex items-center gap-3 mb-2">
                    <span className="w-28 text-xs text-gray-600 font-medium">{papelLabel[m.papel]}</span>
                    <select value={m.vereadorId} onChange={(e) => { const n = [...membros]; n[i].vereadorId = e.target.value; setMembros(n); }} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Selecione...</option>
                      {vereadoresSemPresidente.map((v) => <option key={v.id} value={v.id}>{v.nome} ({v.partido})</option>)}
                    </select>
                  </div>
                ))}
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
