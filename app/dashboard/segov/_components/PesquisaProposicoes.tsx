"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"

// Pesquisa por pergunta (texto ou voz) na lista de proposições. Não calcula nada por conta própria:
// traduz a frase em filtros da própria lista, e a lista mostra o resultado. Funciona por regras.

import { interpreta, type FiltrosPesquisa } from "@/lib/pesquisa-proposicoes"
import { andamentoDe, achaProposicoes, ehPerguntaDeAndamento, etapaPerguntada, respondeEtapa, type Andamento } from "@/lib/andamento-proposicao"
export type { FiltrosPesquisa }

type Props = {
  itens: any[]
  vereadores: any[]
  statusList: string[]
  total: number
  aplicar: (f: FiltrosPesquisa) => void
  limpar: () => void
}

const SUGESTOES = [
  "Proposições em análise",
  "Projetos de lei aprovados este ano",
  "Proposições paradas há mais de 30 dias",
  "Proposições do vereador Gliverson",
  "PL 2758 de 2026",
  "Qual o andamento do PL 2758 de 2026?",
  "Quem pediu dispensa de interstício do PL 2758 de 2026?",
]

export default function PesquisaProposicoes(props: Props) {
  // a pesquisa por pergunta/microfone depende da permissão do usuário (Master e Admin sempre têm)
  const { data: session } = useSession()
  const u = session?.user as any
  const pode = !u || u.perfil === "master" || u.perfil === "admin" || u.podeUsarMicrofone !== false
  if (!pode) return null
  return <PesquisaInterna {...props} />
}

function PesquisaInterna({ itens, vereadores, statusList, total, aplicar, limpar }: Props) {
  const [texto, setTexto] = useState("")
  const [resumo, setResumo] = useState<{ ok: boolean; partes: string[] } | null>(null)
  const [ouvindo, setOuvindo] = useState(false)
  const [voz, setVoz] = useState(false)
  const [sugestoes, setSugestoes] = useState(false)
  const [andamentos, setAndamentos] = useState<Andamento[]>([])
  const falarDepois = useRef(false)
  const recRef = useRef<any>(null)
  const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null

  useEffect(() => { try { setVoz(localStorage.getItem("busca_voz") === "1") } catch {} }, [])

  // voz: o navegador corta falas longas e engole o começo depois de cancelar. Por isso a fala é
  // quebrada em frases curtas, enfileirada e começa um instante depois do cancelamento.
  function falar(t: string) {
    try {
      if (!("speechSynthesis" in window) || !t) return
      const texto = t.replace(/R\$\s*([\d.,]+)/g, "$1 reais").replace(/%/g, " por cento").replace(/\s+/g, " ").trim()
      const partes: string[] = []
      texto.replace(/([.!?;:])\s+/g, "$1\n").split("\n").forEach(fr => {
        let f = fr.trim()
        while (f.length > 160) {
          let k = f.lastIndexOf(",", 160)
          if (k < 50) k = f.lastIndexOf(" ", 160)
          if (k < 20) k = 160
          partes.push(f.slice(0, k + 1).trim()); f = f.slice(k + 1).trim()
        }
        if (f) partes.push(f)
      })
      speechSynthesis.cancel()
      // prefere as vozes neurais/naturais (soam como gente conversando); as de computador ficam por último
      const nota = (x: SpeechSynthesisVoice) => (/pt[-_]BR/i.test(x.lang) ? 20 : 0) + (/natural|neural/i.test(x.name) ? 100 : 0) + (/online/i.test(x.name) ? 60 : 0)
        + (/francisca|thalita|vitoria|camila|luciana|maria|google/i.test(x.name) ? 30 : 0) - (/antonio|daniel|felipe|ricardo/i.test(x.name) ? 10 : 0) - (/desktop|espeak|compact/i.test(x.name) ? 40 : 0)
      const voz = speechSynthesis.getVoices().filter(x => /^pt/i.test(x.lang)).sort((a, b) => nota(b) - nota(a))[0]
      let i = 0
      const prox = () => {
        if (i >= partes.length) return
        const u = new SpeechSynthesisUtterance(partes[i++])
        u.lang = "pt-BR"; u.rate = 0.95; u.volume = 1
        if (voz) u.voice = voz
        u.onend = prox; u.onerror = prox
        speechSynthesis.speak(u)
      }
      setTimeout(prox, 180)
    } catch {}
  }

  // na primeira pergunta de cada período (manhã, tarde, noite) cumprimenta antes de responder
  const [saudacao, setSaudacao] = useState("")
  const saudacaoDaVez = () => {
    try {
      const h = new Date(), hr = h.getHours()
      const per = hr >= 5 && hr < 12 ? "dia" : hr < 18 ? "tarde" : "noite"
      const chave = `${h.getFullYear()}-${h.getMonth() + 1}-${h.getDate()}:${per}`
      if (localStorage.getItem("busca_saud") === chave) return ""
      localStorage.setItem("busca_saud", chave)
      return "Olá, " + (per === "dia" ? "bom dia" : per === "tarde" ? "boa tarde" : "boa noite") + "!"
    } catch { return "" }
  }

  const frase = useMemo(() => {
    if (!resumo || !resumo.ok) return ""
    if (andamentos.length) return `${saudacao ? saudacao + " " : ""}${andamentos.map(a => a.fala).join(" ")}`
    return `${saudacao ? saudacao + " " : ""}Encontrei ${total} ${total === 1 ? "proposição" : "proposições"}. Filtros: ${resumo.partes.join(", ")}.`
  }, [resumo, total, saudacao, andamentos])

  // fala depois que a lista já recalculou com os novos filtros
  useEffect(() => {
    if (falarDepois.current && resumo?.ok) { falarDepois.current = false; falar(frase) }
  }, [total, frase, resumo])

  function perguntar(t: string, porVoz: boolean) {
    const s = t.trim()
    if (!s) return
    setSugestoes(false)
    const r = interpreta(s, itens, vereadores, statusList)
    setSaudacao(saudacaoDaVez())
    // "como está o andamento do PL 2681/2026?": responde com a última informação do fluxo detalhado
    const norm = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const etapa = etapaPerguntada(norm)
    const achadas = etapa || ehPerguntaDeAndamento(norm) ? achaProposicoes(r.f, itens, norm) : []
    const respostas = achadas.slice(0, 3).map(i => (etapa ? respondeEtapa(i, etapa) : andamentoDe(i)))
    setAndamentos(respostas)
    // achou a proposição só pelo número ("projeto 2681/2026"): conta como entendido e filtra a lista por ela
    const f = { ...r.f }
    const partes = [...r.partes]
    let entendeu = r.entendeu
    if (achadas.length && !f.proposicao) {
      const i0 = achadas[0]
      f.proposicao = `${i0.tipo} ${i0.numero}/${i0.ano}`.toLowerCase()
      partes.push(`proposição ${i0.tipo} ${i0.numero}/${i0.ano}`)
    }
    if (achadas.length) entendeu = true
    setResumo({ ok: entendeu, partes })
    // pergunta feita pelo microfone é respondida em voz alta
    if (entendeu) { aplicar(f); falarDepois.current = porVoz }
    else if (porVoz) falar("Não entendi a pergunta. Tente falar o tipo, a situação ou o nome do vereador.")
  }

  function microfone() {
    if (!SR) { setResumo({ ok: false, partes: [] }); return }
    if (ouvindo) { try { recRef.current?.stop() } catch {} return }
    const rec = new SR()
    recRef.current = rec
    rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false
    let ultimo = ""
    rec.onstart = () => setOuvindo(true)
    rec.onresult = (ev: any) => {
      let t = ""
      for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript
      ultimo = t; setTexto(t)
    }
    rec.onerror = () => setOuvindo(false)
    rec.onend = () => { setOuvindo(false); if (ultimo.trim()) perguntar(ultimo, true) }
    try { rec.start() } catch {}
  }

  function limparTudo() { setTexto(""); setResumo(null); setAndamentos([]); limpar() }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex gap-2 items-center">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onFocus={() => { if (!texto) setSugestoes(true) }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); perguntar(texto, false) } if (e.key === "Escape") setSugestoes(false) }}
          enterKeyHint="search"
          placeholder={ouvindo ? "Ouvindo… fale a pergunta" : "Pergunte: proposições em análise do vereador Gliverson · PL 2758 de 2026"}
          aria-label="Pesquisa inteligente de proposições"
          className="flex-1 min-w-0 border border-gray-300 rounded-full px-4 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button type="button" onClick={microfone} aria-label="Falar a pergunta" title={SR ? "Falar a pergunta" : "Este navegador não reconhece voz: use o microfone do teclado"}
          className={`flex-shrink-0 w-11 h-11 rounded-full border text-lg ${ouvindo ? "bg-pink-600 border-pink-600 text-white animate-pulse" : "bg-white border-gray-300 hover:border-gray-400"} ${SR ? "" : "opacity-50"}`}>
          🎤
        </button>
        <button type="button" onClick={() => perguntar(texto, false)}
          className="hidden sm:block flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700">
          Perguntar
        </button>
      </div>

      {sugestoes && !texto && (
        <div className="flex flex-wrap gap-2 mt-2">
          {SUGESTOES.map(s => (
            <button key={s} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setTexto(s); perguntar(s, false) }}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:border-blue-400 hover:text-blue-700 text-left">
              {s}
            </button>
          ))}
        </div>
      )}

      {resumo?.ok && andamentos.length > 0 && (
        <div className="mt-3 space-y-2">
          {andamentos.map(a => (
            <div key={a.titulo} className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
              <div className="text-sm font-bold text-gray-800">{a.titulo}</div>
              <dl className="mt-1 grid grid-cols-[110px_1fr] gap-x-3 gap-y-0.5 text-sm">
                {a.linhas.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className={`text-gray-800 ${k === "Última etapa" ? "font-semibold" : ""}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      {resumo && (
        <div className="mt-2 text-sm">
          {resumo.ok ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {saudacao && <span className="font-bold text-blue-700 w-full">{saudacao}</span>}
              <span className="text-gray-500">Entendi:</span>
              {resumo.partes.map(p => <span key={p} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-xs font-semibold">{p}</span>)}
              <span className="font-semibold text-gray-800">→ {total} {total === 1 ? "proposição" : "proposições"}</span>
              <button type="button" onClick={() => { falar(frase); setSaudacao("") }} className="text-xs font-semibold text-blue-700 hover:underline">🔊 Ouvir</button>
              <button type="button" onClick={limparTudo} className="text-xs font-semibold text-gray-500 hover:underline">limpar pesquisa</button>
              <label className="ml-auto text-xs text-gray-500 flex items-center gap-1.5">
                <input type="checkbox" checked={voz} onChange={e => { setVoz(e.target.checked); try { localStorage.setItem("busca_voz", e.target.checked ? "1" : "0") } catch {} }} />
                responder em voz alta
              </label>
            </div>
          ) : (
            <p className="text-amber-700">
              {SR ? "Não entendi a pergunta. Diga o tipo, a situação ou o vereador (ex.: “projetos de lei aprovados do vereador Gliverson”)."
                : "Este navegador não reconhece voz. Toque no campo e use o microfone do teclado do celular, ou digite a pergunta."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
