"use client";
import { useEffect, useState } from "react";

type Vereador = { id: string; nome: string; partido: string; poder: string; cargo?: string };
type Comissao = { id: string; nome: string };
type Proposicao = {
  id: string; numero: string; ano: number; tipo: string; ementa: string;
  origemTipo: string; autorVereador?: Vereador; autorExterno?: string;
  dataEntrada: string; status: string; dispensaParecer: boolean; regimeUrgencia: boolean;
  comissoes: { comissao: Comissao; ordem: number }[];
};

const tipoLabel: Record<string, string> = { pl: "Projeto de Lei", resolucao: "Resolução", requerimento: "Requerimento", mocao: "Moção" };
const statusLabel: Record<string, string> = { em_tramitacao: "Em tramitação", aprovada: "Aprovada", rejeitada: "Rejeitada", arquivada: "Arquivada" };
const statusColor: Record<string, string> = {
  em_tramitacao: "bg-yellow-100 text-yellow-800", aprovada: "bg-green-100 text-green-800",
  rejeitada: "bg-red-100 text-red-800", arquivada: "bg-gray-100 text-gray-800",
};

const emptyForm = {
  numero: "", ano: new Date().getFullYear(), tipo: "pl", ementa: "",
  origemTipo: "vereador", autorVereadorId: "", autorExterno: "",
  dataEntrada: new Date().toISOString().slice(0, 10),
  dispensaParecer: false, regimeUrgencia: false,
  comissoes: [] as { comissaoId: string; ordem: number }[],
};

export default function ProposicoesPage() {
  const [lista, setLista] = useState<Proposicao[]>([]);
  const [vereadores, setVereadores] = useState<Vereador[]>([]);
  const [executivo, setExecutivo] = useState<Vereador[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  async function carregar() {
    const params = new URLSearchParams();
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (filtroStatus) params.set("status", filtroStatus);
    const [p, v, c] = await Promise.all([
      fetch(`/api/proposicoes?${params}`).then(r => r.json()),
      fetch("/api/vereadores").then(r => r.json()),
      fetch("/api/comissoes").then(r => r.json()),
    ]);
    setLista(p);
    setVereadores(v.filter((vr: any) => vr.ativo && vr.poder === "legislativo"));
    setExecutivo(v.filter((vr: any) => vr.ativo && vr.poder === "executivo"));
    setComissoes(c.filter((c: any) => c.ativa));
  }

  useEffect(() => { carregar(); }, [filtroTipo, filtroStatus]);

  function setComissaoOrdem(idx: number, comissaoId: string) {
    const novas = [...form.comissoes];
    novas[idx] = { comissaoId, ordem: idx + 1 };
    setForm({ ...form, comissoes: novas });
  }

  function addComissao() {
    if (form.comissoes.length < 3) {
      setForm({ ...form, comissoes: [...form.comissoes, { comissaoId: "", ordem: form.comissoes.length + 1 }] });
    }
  }

  function removeComissao(idx: number) {
    const novas = form.comissoes.filter((_, i) => i !== idx).map((c, i) => ({ ...c, ordem: i + 1 }));
    setForm({ ...form, comissoes: novas });
  }

  async function salvar() {
    await fetch("/api/proposicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, comissoes: form.comissoes.filter(c => c.comissaoId) }),
    });
    setModal(false);
    setForm(emptyForm);
    carregar();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Proposições</h1>
          <p className="text-gray-500 text-sm">{lista.length} registros</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
          + Nova Proposição
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Identificação</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Ementa</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Autor</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Comissões</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{tipoLabel[p.tipo]} {p.numero}/{p.ano}</p>
                  <p className="text-xs text-gray-400">{new Date(p.dataEntrada).toLocaleDateString("pt-BR")}</p>
                  {p.dispensaParecer && <span className="text-xs text-purple-600">Dispensada</span>}
                  {p.regimeUrgencia && <span className="text-xs text-orange-600 ml-1">Urgência</span>}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="text-gray-700 line-clamp-2">{p.ementa}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.origemTipo === "vereador" ? p.autorVereador?.nome : (p.autorExterno || "Executivo")}
                </td>
                <td className="px-4 py-3">
                  {p.comissoes.map((c) => (
                    <p key={c.comissao.id} className="text-xs text-gray-500">{c.ordem}. {c.comissao.nome}</p>
                  ))}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="text-center text-gray-400 py-8">Nenhuma proposição encontrada.</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-lg text-gray-800 mb-4">Nova Proposição</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                  <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
                  <input type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: +e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ementa</label>
                <textarea value={form.ementa} onChange={(e) => setForm({ ...form, ementa: e.target.value })} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
                <select value={form.origemTipo} onChange={(e) => setForm({ ...form, origemTipo: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="vereador">Vereador</option>
                  <option value="executivo">Executivo Municipal</option>
                </select>
              </div>
              <div>
                {form.origemTipo === "vereador" ? (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor (Vereador)</label>
                    <select value={form.autorVereadorId} onChange={(e) => setForm({ ...form, autorVereadorId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Selecione...</option>
                      {vereadores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Autor (Executivo)</label>
                    {executivo.length > 0 ? (
                      <select value={form.autorExterno} onChange={(e) => setForm({ ...form, autorExterno: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecione...</option>
                        {executivo.map(e => <option key={e.id} value={e.nome}>{e.nome} ({e.cargo === "prefeito" ? "Prefeito" : "Vice-Prefeito"})</option>)}
                      </select>
                    ) : (
                      <input value={form.autorExterno} onChange={(e) => setForm({ ...form, autorExterno: e.target.value })} placeholder="Ex: Prefeitura Municipal" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Entrada</label>
                <input type="date" value={form.dataEntrada} onChange={(e) => setForm({ ...form, dataEntrada: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.dispensaParecer} onChange={(e) => setForm({ ...form, dispensaParecer: e.target.checked })} className="rounded" />
                  Dispensa de parecer
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.regimeUrgencia} onChange={(e) => setForm({ ...form, regimeUrgencia: e.target.checked })} className="rounded" />
                  Regime de urgência
                </label>
              </div>

              {/* Comissões */}
              {!form.dispensaParecer && (
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Comissões (até 3)</label>
                    {form.comissoes.length < 3 && (
                      <button onClick={addComissao} className="text-blue-600 text-xs hover:underline">+ Adicionar comissão</button>
                    )}
                  </div>
                  {form.comissoes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-500 w-4">{i + 1}ª</span>
                      <select value={c.comissaoId} onChange={(e) => setComissaoOrdem(i, e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecione...</option>
                        {comissoes.map((cm) => <option key={cm.id} value={cm.id}>{cm.nome}</option>)}
                      </select>
                      <button onClick={() => removeComissao(i)} className="text-red-400 hover:text-red-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Cadastrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
