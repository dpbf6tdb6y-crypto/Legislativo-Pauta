"use client"
import { useEffect, useState } from "react"

const CHAVE_SESSAO = "indicacoes_desbloqueado"

export default function IndicacoesGate({ children }: { children: React.ReactNode }) {
  const [desbloqueado, setDesbloqueado] = useState<boolean | null>(null)
  const [senha, setSenha] = useState("")
  const [erro, setErro] = useState("")
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setDesbloqueado(sessionStorage.getItem(CHAVE_SESSAO) === "1")
  }, [])

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setErro("")
    setEnviando(true)
    try {
      const res = await fetch("/api/auth/reautenticar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      })
      if (!res.ok) {
        const d = await res.json()
        setErro(d.error || "Senha incorreta")
        return
      }
      sessionStorage.setItem(CHAVE_SESSAO, "1")
      setDesbloqueado(true)
    } finally {
      setEnviando(false)
    }
  }

  if (desbloqueado === null) return null

  if (!desbloqueado) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="font-bold text-gray-800 mb-1">Área restrita</h1>
          <p className="text-xs text-gray-500 mb-4">Informações sigilosas. Confirme sua senha para continuar.</p>
          <form onSubmit={confirmar} className="space-y-3">
            <input type="password" autoFocus required value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="Sua senha de login"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-red-800/30" />
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <button type="submit" disabled={enviando}
              className="w-full px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ background: "#8B0000" }}>
              {enviando ? "Verificando..." : "Confirmar"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
