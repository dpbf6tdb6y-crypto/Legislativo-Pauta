"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");
    const res = await signIn("credentials", { email, senha, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push("/dashboard");
    } else {
      setErro("Email ou senha inválidos");
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Lado esquerdo — identidade visual */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center text-white relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a0f1e 0%, #0f172a 50%, #111827 100%)" }}>

        {/* Decoração de fundo — linhas sutis */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "24px 24px" }} />

        {/* Círculo decorativo grande */}
        <div className="absolute top-[-120px] right-[-120px] w-80 h-80 rounded-full opacity-10"
          style={{ background: "linear-gradient(135deg, #f97316, #a855f7)" }} />
        <div className="absolute bottom-[-100px] left-[-100px] w-64 h-64 rounded-full opacity-10"
          style={{ background: "linear-gradient(135deg, #3b82f6, #22c55e)" }} />

        <div className="relative z-10 text-center px-10">
          {/* Logo */}
          <div className="w-28 h-28 mx-auto mb-8 rounded-3xl flex items-center justify-center shadow-2xl"
            style={{ background: "linear-gradient(135deg, #f97316 0%, #a855f7 100%)" }}>
            <svg className="w-16 h-16 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold mb-2 text-white tracking-tight">Legislativo</h1>
          <h2 className="text-2xl font-semibold mb-1" style={{ color: "#f97316" }}>Nova Lima</h2>
          <div className="w-14 h-0.5 mx-auto mt-5 mb-6 rounded"
            style={{ background: "linear-gradient(90deg, #f97316, #a855f7)" }} />
          <p className="text-base opacity-70 font-light tracking-wide">Sistema de Gestão de Pautas</p>
          <p className="text-sm opacity-40 mt-2 tracking-wider uppercase text-xs">Em compromisso com o cidadão</p>
        </div>
      </div>

      {/* Lado direito — formulário */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #f97316 0%, #a855f7 100%)" }}>
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Legislativo Nova Lima</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Entrar</h2>
            <p className="text-gray-400 text-sm mb-6">Sistema de Gestão de Pautas</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                  onFocus={e => e.target.style.borderColor = "#a855f7"}
                  onBlur={e => e.target.style.borderColor = "#d1d5db"}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Senha</label>
                  <a href="/esqueci-senha" className="text-xs font-medium" style={{ color: "#a855f7" }}>
                    Esqueci a senha
                  </a>
                </div>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none transition"
                  onFocus={e => e.target.style.borderColor = "#a855f7"}
                  onBlur={e => e.target.style.borderColor = "#d1d5db"}
                  placeholder="••••••••"
                  required
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
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Legislativo Nova Lima
          </p>
        </div>
      </div>
    </div>
  );
}
