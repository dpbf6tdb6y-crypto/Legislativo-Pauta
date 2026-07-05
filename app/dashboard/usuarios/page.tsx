"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  createdAt: string;
};

export default function UsuariosPage() {
  const { data: session } = useSession();
  const meuId = (session?.user as any)?.id;

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState<null | "novo" | Usuario>(null);
  const [erro, setErro] = useState("");
  const [msgReset, setMsgReset] = useState("");
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch("/api/usuarios");
      const d = await r.json();
      if (r.ok) setUsuarios(d);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const isNovo = modal === "novo";
  const u = isNovo ? null : (modal as Usuario | null);

  function abrirModal(alvo: "novo" | Usuario | null) {
    setModal(alvo);
    setErro("");
    setMsgReset("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    const fd = new FormData(e.currentTarget);

    try {
      if (isNovo) {
        const r = await fetch("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: fd.get("nome"),
            email: fd.get("email"),
            perfil: fd.get("perfil"),
            senha: fd.get("senha"),
          }),
        });
        const d = await r.json();
        if (!r.ok) { setErro(d.error ?? "Erro ao criar usuário"); return; }
      } else if (u) {
        const r = await fetch(`/api/usuarios/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: fd.get("nome"),
            perfil: fd.get("perfil"),
            ativo: fd.get("ativo") === "true",
            novaSenha: fd.get("novaSenha") || undefined,
          }),
        });
        const d = await r.json();
        if (!r.ok) { setErro(d.error ?? "Erro ao atualizar usuário"); return; }
      }
      abrirModal(null);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm("Excluir este usuário?")) return;
    const r = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { alert(d.error ?? "Erro ao excluir"); return; }
    carregar();
  }

  async function handleEnviarReset(id: string) {
    setEnviandoReset(true);
    setMsgReset("");
    setErro("");
    try {
      const r = await fetch(`/api/usuarios/${id}/reset-senha`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setErro(d.error ?? "Erro ao enviar e-mail"); return; }
      setMsgReset(d.message);
    } finally {
      setEnviandoReset(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Usuários</h1>
          <p className="text-sm text-gray-500">{usuarios.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={() => abrirModal("novo")}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #f97316 0%, #a855f7 100%)" }}>
          + Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">E-mail</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Perfil</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {carregando ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : usuarios.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum usuário cadastrado.</td></tr>
            ) : usuarios.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-700">{item.nome}</td>
                <td className="px-4 py-3 text-gray-500">{item.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-full border ${
                    item.perfil === "admin" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {item.perfil === "admin" ? "Administrador" : "Operador"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                    item.ativo ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {item.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => abrirModal(item)} className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                      Editar
                    </button>
                    {item.id !== meuId && (
                      <button onClick={() => handleExcluir(item.id)} className="text-xs font-semibold text-red-600 hover:text-red-800">
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-5">
              {isNovo ? "Novo Usuário" : `Editar: ${u?.nome}`}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Nome Completo <span className="text-red-400">*</span>
                </label>
                <input name="nome" required defaultValue={u?.nome ?? ""}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    E-mail {isNovo && <span className="text-red-400">*</span>}
                  </label>
                  <input name="email" type="email" required={isNovo} disabled={!isNovo} defaultValue={u?.email ?? ""}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 disabled:bg-gray-50 disabled:text-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Perfil</label>
                  <select name="perfil" defaultValue={u?.perfil ?? "operador"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 bg-white text-gray-800">
                    <option value="admin">Administrador</option>
                    <option value="operador">Operador</option>
                  </select>
                </div>
              </div>

              {!isNovo && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
                  <select name="ativo" defaultValue={u?.ativo ? "true" : "false"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40 bg-white text-gray-800">
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {isNovo ? "Senha" : "Redefinir Senha"} {isNovo && <span className="text-red-400">*</span>}
                  <span className="text-gray-400 font-normal normal-case ml-1">(mín. 6 car.)</span>
                </label>
                <div className="flex gap-2">
                  <input name={isNovo ? "senha" : "novaSenha"} type="password"
                    required={isNovo}
                    placeholder={isNovo ? "Mínimo 6 caracteres" : "Deixe em branco para não alterar"}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/40" />
                  {!isNovo && u && (
                    <button type="button"
                      onClick={() => handleEnviarReset(u.id)}
                      disabled={enviandoReset}
                      className="whitespace-nowrap bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold px-3 rounded-lg transition-colors disabled:opacity-50">
                      {enviandoReset ? "Enviando..." : "✉️ Enviar e-mail para redefinir senha"}
                    </button>
                  )}
                </div>
                {msgReset && <p className="text-green-600 text-xs mt-1">{msgReset}</p>}
              </div>

              {erro && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{erro}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => abrirModal(null)}
                  className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #f97316 0%, #a855f7 100%)" }}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
