"use client"
import { useEffect, useRef } from "react"

// Quem só visualiza um menu não vê botões de cadastro (novo, editar, excluir, importar, salvar...).
// O bloqueio de verdade está no servidor (API devolve 403); aqui a tela só deixa de oferecer a ação.
const ACAO = /^[+\u2795\s]*(nov[oa]s?|criar|cadastrar|adicionar|incluir|importar|excluir|remover|apagar|editar|salvar|lançar|lancar|marcar como)\b/i
const ROTA_CADASTRO = /\/(novo|importar)(\/|\?|$)/

export default function SomenteLeitura({ children, bloqueiaCampos }: { children: React.ReactNode; bloqueiaCampos: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raiz = ref.current
    if (!raiz) return
    const aplicar = () => {
      raiz.querySelectorAll<HTMLElement>("a, button, [role=button]").forEach(el => {
        if (el.dataset.somenteLeituraOk) return
        const texto = (el.textContent || "").trim()
        const rotulo = el.getAttribute("title") || el.getAttribute("aria-label") || ""
        const href = el.getAttribute("href") || ""
        if (ROTA_CADASTRO.test(href) || ACAO.test(texto) || ACAO.test(rotulo) || (el instanceof HTMLButtonElement && el.type === "submit")) {
          el.style.display = "none"
        }
      })
    }
    aplicar()
    const obs = new MutationObserver(() => aplicar())
    obs.observe(raiz, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} data-somente-leitura="1">
      {/* tela de edição aberta só para consulta: os campos ficam desabilitados */}
      <fieldset disabled={bloqueiaCampos} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {children}
      </fieldset>
    </div>
  )
}
