"use client";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    if (senha !== confirmar) { setErro("As senhas não coincidem."); return; }

    setLoading(true);
    try {
      const r = await fetch("/api/redefinir-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, senha }),
      });
      const d = await r.json();
      if (!r.ok) { setErro(d.erro ?? "Erro ao redefinir senha."); return; }
      setSucesso(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setErro("Erro ao redefinir senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {sucesso ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 bg-green-50">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-800 mb-2">Senha redefinida!</h2>
              <p className="text-sm text-gray-500">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Nova senha</h2>
              <p className="text-gray-400 text-sm mb-6">Digite sua nova senha de acesso.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                  <input
                    type="password"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                    onFocus={e => (e.target.style.borderColor = "#a855f7")}
                    onBlur={e => (e.target.style.borderColor = "#d1d5db")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    required
                    placeholder="Repita a senha"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                    onFocus={e => (e.target.style.borderColor = "#a855f7")}
                    onBlur={e => (e.target.style.borderColor = "#d1d5db")}
                  />
                </div>

                {erro && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-red-600 text-sm">{erro}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 transition hover:opacity-90 shadow-md"
                  style={{ background: "linear-gradient(135deg, #f97316 0%, #a855f7 100%)" }}>
                  {loading ? "Salvando..." : "Redefinir senha"}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-5 text-center border-t border-gray-100">
            <Link href="/login" className="text-xs font-medium text-gray-500 hover:text-gray-700">
              ← Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
