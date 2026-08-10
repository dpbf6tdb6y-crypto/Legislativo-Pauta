"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/contexts/toast";
import { usePermissao } from "@/lib/usePermissao";

type Vereador = {
  id: string; nome: string; apelido?: string | null; partido: string; legislatura: string;
  telefone?: string; email?: string; cargo?: string; poder: string; ativo: boolean;
};

type CandidatoDuplicado = Vereador & { _count: { segov: number; requerimentos: number; proposicoes: number } };
type GrupoDuplicado = { chave: string; confianca: "alta" | "media"; itens: CandidatoDuplicado[] };

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

const empty = { nome: "", apelido: "", partido: "", legislatura: "2025-2028", telefone: "", email: "", cargo: "", poder: "legislativo", ativo: true };

export default function VereadoresPage() {
  const toast = useToast();
  const podeGerenciar = usePermissao("podeGerenciarVereadores");
  const [lista, setLista] = useState<Vereador[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [filtroSituacao, setFiltroSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [duplicados, setDuplicados] = useState<GrupoDuplicado[]>([]);
  const [mesclando, setMesclando] = useState<string | null>(null);
  const [escolhaPrincipal, setEscolhaPrincipal] = useState<Record<string, string>>({});
  const [configMesaAberta, setConfigMesaAberta] = useState(false);
  const [salvandoCargo, setSalvandoCargo] = useState<string | null>(null);

  async function carregar() {
    const res = await fetch("/api/vereadores?ativo=false");
    setLista(await res.json());
  }
  async function carregarDuplicados() {
    const res = await fetch("/api/vereadores/duplicados");
    if (res.ok) setDuplicados(await res.json());
  }
  useEffect(() => { carregar(); carregarDuplicados(); }, []);

  async function mesclar(grupo: GrupoDuplicado) {
    const principalId = escolhaPrincipal[grupo.chave] || grupo.itens.slice().sort((a, b) =>
      (b._count.segov + b._count.requerimentos + b._count.proposicoes) - (a._count.segov + a._count.requerimentos + a._count.proposicoes)
    )[0].id;
    const duplicadoId = grupo.itens.find(v => v.id !== principalId)?.id;
    if (!duplicadoId) return;
    if (!confirm("Mesclar esses cadastros? Todas as proposições/requerimentos do duplicado passam para o principal, e o duplicado é desativado.")) return;
    setMesclando(grupo.chave);
    const res = await fetch("/api/vereadores/mesclar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principalId, duplicadoId }),
    });
    setMesclando(null);
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Erro ao mesclar"); return; }
    toast.success("Cadastros mesclados com sucesso.");
    carregar(); carregarDuplicados();
  }

  const listaFiltrada = lista.filter(v =>
    filtroSituacao === "todos" ? true : filtroSituacao === "ativos" ? v.ativo : !v.ativo
  );

  async function salvar() {
    const payload = { ...form, cargo: form.cargo || null, apelido: form.apelido.trim() || null };
    const r = editId
      ? await fetch(`/api/vereadores/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/vereadores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) { const d = await r.json(); toast.error(d.error ?? "Erro ao salvar"); return; }
    setModal(false);
    setForm(empty);
    setEditId(null);
    carregar();
  }

  function editar(v: Vereador) {
    setForm({ nome: v.nome, apelido: v.apelido || "", partido: v.partido, legislatura: v.legislatura, telefone: v.telefone || "", email: v.email || "", cargo: v.cargo || "", poder: v.poder, ativo: v.ativo });
    setEditId(v.id);
    setModal(true);
  }

  function abrirNovo(poder: string) {
    setForm({ ...empty, poder, cargo: poder === "executivo" ? "prefeito" : "" });
    setEditId(null);
    setModal(true);
  }

  async function desativar(id: string) {
    if (!confirm("Desativar este cadastro? Ele deixa de aparecer nas opções de autoria em novas matérias, mas o histórico existente é preservado.")) return;
    const r = await fetch(`/api/vereadores/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); toast.error(d.error ?? "Erro ao desativar"); return; }
    toast.success("Vereador desativado.");
    carregar();
  }

  async function reativar(v: Vereador) {
    const r = await fetch(`/api/vereadores/${v.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: true }) });
    if (!r.ok) { const d = await r.json(); toast.error(d.error ?? "Erro ao reativar"); return; }
    toast.success("Vereador reativado.");
    carregar();
  }

  async function atribuirCargoMesa(cargo: string, novoVereadorId: string) {
    setSalvandoCargo(cargo);
    const ocupanteAtual = lista.find(v => v.poder === "legislativo" && v.cargo === cargo);
    try {
      if (ocupanteAtual && ocupanteAtual.id !== novoVereadorId) {
        await fetch(`/api/vereadores/${ocupanteAtual.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargo: null }) });
      }
      if (novoVereadorId) {
        await fetch(`/api/vereadores/${novoVereadorId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargo }) });
      }
      toast.success("Composição da Mesa Diretora atualizada.");
      await carregar();
    } finally {
      setSalvandoCargo(null);
    }
  }

  const vereadoresAtivosLegislatura = lista.filter(v => v.ativo && v.poder === "legislativo").length;
  const candidatosMesa = lista.filter(v => v.ativo && v.poder === "legislativo");

  const mesa = listaFiltrada.filter(v => v.poder === "legislativo" && v.cargo);
  const vereadores = listaFiltrada.filter(v => v.poder === "legislativo" && !v.cargo && v.legislatura !== "Mandato anterior");
  const mandatosAnteriores = listaFiltrada.filter(v => v.poder === "legislativo" && !v.cargo && v.legislatura === "Mandato anterior");
  const executivo = listaFiltrada.filter(v => v.poder === "executivo");

  function Card({ v }: { v: Vereador }) {
    const badge = v.cargo ? cargoBadge[v.cargo] : null;
    return (
      <div className={`bg-white rounded-xl shadow-sm p-5 ${!v.ativo ? "opacity-60" : ""}`} style={badge ? { borderTop: `4px solid ${badge.bg}` } : {}}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {badge && (
                <span className="text-xs font-bold px-2 py-0.5 rounded inline-block" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
              )}
              {!v.ativo && (
                <span className="text-xs font-bold px-2 py-0.5 rounded inline-block bg-gray-200 text-gray-500">Inativo</span>
              )}
            </div>
            <p className="font-semibold text-gray-800">{v.nome}</p>
            {v.apelido && <p className="text-xs text-gray-400 -mt-0.5">"{v.apelido}"</p>}
            <p className="text-sm font-medium text-blue-600">{v.partido}</p>
            {v.poder === "legislativo" && <p className="text-xs text-gray-500 mt-0.5">Legislatura: {v.legislatura}</p>}
            {v.telefone && <p className="text-xs text-gray-500">Tel: {v.telefone}</p>}
            {v.email && <p className="text-xs text-gray-500">{v.email}</p>}
          </div>
          {podeGerenciar && (
            <div className="flex gap-1 ml-2">
              <button onClick={() => editar(v)} className="text-gray-400 hover:text-blue-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              {v.ativo ? (
                <button onClick={() => desativar(v.id)} className="text-gray-400 hover:text-red-500"
                  title="Desativar — some das opções de autoria em novas matérias, mas o histórico existente é preservado">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : (
                <button onClick={() => reativar(v)} className="text-gray-400 hover:text-green-600"
                  title="Reativar — volta a aparecer nas opções de autoria em novas matérias">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vereadores / Executivo</h1>
          <p className="text-gray-500 text-sm">{listaFiltrada.length} cadastro(s) — {lista.filter(v => v.ativo).length} ativo(s), {lista.filter(v => !v.ativo).length} inativo(s)</p>
          <p className="text-gray-400 text-xs mt-0.5">{vereadoresAtivosLegislatura} vereador(es) ativo(s) na legislatura atual</p>
        </div>
        <div className="flex gap-2 items-center">
          <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          {podeGerenciar && (
            <>
              <button onClick={() => abrirNovo("legislativo")} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                + Vereador
              </button>
              <button onClick={() => abrirNovo("executivo")} className="text-white px-4 py-2 rounded-lg text-sm font-medium transition" style={{ background: "#065f46" }}>
                + Executivo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Possíveis Duplicados */}
      {duplicados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Possíveis Duplicados ({duplicados.length})
          </h2>
          {duplicados.map(grupo => (
            <div key={grupo.chave} className="bg-white rounded-lg border border-amber-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${grupo.confianca === "alta" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {grupo.confianca === "alta" ? "Nome idêntico" : "Nomes parecidos"}
                </span>
                {podeGerenciar && (
                  <button onClick={() => mesclar(grupo)} disabled={mesclando === grupo.chave}
                    className="text-xs font-semibold bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700 transition disabled:opacity-50">
                    {mesclando === grupo.chave ? "Mesclando..." : "Mesclar em 1 cadastro"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {grupo.itens.map(v => {
                  const total = v._count.segov + v._count.requerimentos + v._count.proposicoes;
                  return (
                    <label key={v.id} className="flex items-center gap-2 text-sm border border-gray-200 rounded px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                      <input type="radio" name={`principal-${grupo.chave}`}
                        checked={(escolhaPrincipal[grupo.chave] || grupo.itens.slice().sort((a, b) =>
                          (b._count.segov + b._count.requerimentos + b._count.proposicoes) - (a._count.segov + a._count.requerimentos + a._count.proposicoes)
                        )[0].id) === v.id}
                        onChange={() => setEscolhaPrincipal(prev => ({ ...prev, [grupo.chave]: v.id }))}
                        className="accent-amber-600" />
                      <span className="flex-1">
                        <span className="font-medium text-gray-800">{v.nome}</span>
                        <span className="text-gray-400"> — {total} matéria(s){!v.ativo && " · inativo"}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">A opção marcada vira o cadastro principal; o outro é desativado e suas matérias são transferidas.</p>
            </div>
          ))}
        </div>
      )}

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
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Mesa Diretora</h2>
          {podeGerenciar && (
            <button onClick={() => setConfigMesaAberta(v => !v)}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 transition flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {configMesaAberta ? "Fechar configuração" : "Configurar composição"}
            </button>
          )}
        </div>

        {configMesaAberta && podeGerenciar && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cargosMesa.filter(c => c.value).map(c => {
              const ocupante = lista.find(v => v.poder === "legislativo" && v.cargo === c.value);
              return (
                <div key={c.value}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{c.label}</label>
                  <select value={ocupante?.id || ""} disabled={salvandoCargo === c.value}
                    onChange={e => atribuirCargoMesa(c.value, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50">
                    <option value="">— Vago —</option>
                    {candidatosMesa.map(v => (
                      <option key={v.id} value={v.id}>{v.apelido || v.nome}{v.cargo && v.cargo !== c.value ? ` (${cargoBadge[v.cargo]?.label})` : ""}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {mesa.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mesa.sort((a, b) => {
              const order = ["presidente", "vice-presidente", "1-secretario", "2-secretario"];
              return order.indexOf(a.cargo || "") - order.indexOf(b.cargo || "");
            }).map(v => <Card key={v.id} v={v} />)}
          </div>
        )}
      </div>

      {/* Vereadores */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Vereadores</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vereadores.map(v => <Card key={v.id} v={v} />)}
        </div>
      </div>

      {/* Vereadores de Mandatos Anteriores */}
      {mandatosAnteriores.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Vereadores de Mandatos Anteriores</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mandatosAnteriores.map(v => <Card key={v.id} v={v} />)}
          </div>
        </div>
      )}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Apelido / nome de exibição</label>
                <input value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value })}
                  placeholder="Usado em listas e gráficos, se preenchido"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              {editId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Situação</label>
                  <select value={form.ativo ? "ativo" : "inativo"}
                    onChange={(e) => setForm({ ...form, ativo: e.target.value === "ativo" })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Inativo deixa de aparecer nas opções de autoria em novas matérias, mas o histórico existente é preservado.</p>
                </div>
              )}
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
