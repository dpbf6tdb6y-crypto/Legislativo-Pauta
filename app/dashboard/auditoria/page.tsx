"use client";
import { useState, useEffect } from "react";

function rotuloAcao(acao: string) {
  const [tipo, ...resto] = acao.split("_");
  const icones: Record<string, string> = {
    criar: "+", atualizar: "✎", excluir: "✕", arquivar: "🗄", importar: "⬆",
  };
  return `${icones[tipo] ?? ""} ${resto.join(" ")}`.trim();
}

function corAcao(acao: string) {
  if (acao.startsWith("criar")) return "bg-green-50 text-green-700 border-green-200";
  if (acao.startsWith("atualizar")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (acao.startsWith("excluir") || acao.startsWith("arquivar")) return "bg-red-50 text-red-700 border-red-200";
  if (acao.startsWith("importar")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function fmtDetalhes(json: string | null) {
  if (!json) return "—";
  try {
    const obj = JSON.parse(json);
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(" · ");
  } catch {
    return json;
  }
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroRef, setFiltroRef] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const POR_PAGINA = 20;

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, filtroUsuario, filtroRef]);

  async function buscar() {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        por_pagina: String(POR_PAGINA),
        ...(filtroUsuario ? { usuario: filtroUsuario } : {}),
        ...(filtroRef ? { referencia: filtroRef } : {}),
      });
      const r = await fetch(`/api/auditoria?${params}`);
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao carregar"); return; }
      setLogs(d.logs ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setCarregando(false);
    }
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Auditoria</h1>
        <p className="text-sm text-gray-500">Registro de todas as ações realizadas no sistema. {total} registro(s).</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={filtroUsuario}
          onChange={e => { setFiltroUsuario(e.target.value); setPagina(1); }}
          placeholder="Filtrar por usuário..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30"
        />
        <input
          type="text"
          value={filtroRef}
          onChange={e => { setFiltroRef(e.target.value); setPagina(1); }}
          placeholder="Filtrar por referência..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-800/30 w-60"
        />
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data/Hora</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuário</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ação</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Referência</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {carregando ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum registro encontrado.</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(log.criadoEm).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 font-medium text-gray-700">{log.usuarioNome || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full border ${corAcao(log.acao)}`}>
                    {rotuloAcao(log.acao)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-semibold" style={{ color: "#8B0000" }}>{log.referencia || "—"}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{fmtDetalhes(log.detalhes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} registro{total !== 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              ← Anterior
            </button>
            <span className="px-3 py-1">{pagina} / {totalPaginas}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
              className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
