"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import IndicacoesGate from "../../_components/IndicacoesGate"
import { Pedido, STATUS_PEDIDO, STATUS_COR, fmtData } from "@/lib/pedidos"

export default function RelatorioPedidosPage() {
  return (
    <IndicacoesGate>
      <RelatorioConteudo />
    </IndicacoesGate>
  )
}

function RelatorioConteudo() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [nome, setNome] = useState("")
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const vereadorId = new URLSearchParams(window.location.search).get("vereadorId") || ""
    fetch(`/api/indicacoes/pedidos?vereadorId=${encodeURIComponent(vereadorId)}`)
      .then(r => r.json())
      .then((lista: Pedido[]) => {
        const l = Array.isArray(lista) ? lista : []
        setPedidos(l)
        setNome(l[0]?.vereador?.nome || "")
        setCarregando(false)
      })
  }, [])

  const contagem: Record<string, number> = {}
  STATUS_PEDIDO.forEach(s => { contagem[s] = pedidos.filter(p => p.status === s).length })

  if (carregando) return <p className="p-8 text-gray-400">Carregando relatório…</p>

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 print:p-0">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard/indicacoes/pedidos"))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </button>
        <p className="text-sm text-gray-500">Pré-visualização do relatório</p>
        <button onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50">
          🖨️ Imprimir / salvar em PDF
        </button>
      </div>

      <header className="text-center border-t-4 border-b border-blue-900 py-3 mb-4">
        <p className="text-[11px] tracking-[0.16em] font-bold text-blue-900">PREFEITURA MUNICIPAL DE NOVA LIMA · MINAS GERAIS</p>
        <h1 className="text-xl font-extrabold text-blue-900 mt-1">RELATÓRIO DE PEDIDOS DO VEREADOR</h1>
        <p className="text-sm text-gray-600">{nome || "Vereador não identificado"} · emitido em {new Date().toLocaleDateString("pt-BR")}</p>
      </header>

      {pedidos.length === 0 ? (
        <p className="text-center text-gray-400 py-10">Nenhum pedido cadastrado para este vereador.</p>
      ) : (
        <>
          <p className="text-sm mb-4">
            <b>{pedidos.length}</b> pedido(s):{" "}
            {STATUS_PEDIDO.map(s => `${contagem[s]} ${s.toLowerCase()}`).join(" · ")}.
          </p>

          <div className="space-y-4">
            {pedidos.map((p, i) => (
              <section key={p.id} className="border border-gray-300 rounded-lg p-3 break-inside-avoid">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-800">{i + 1}. {p.tipo}{p.referencia ? ` · Ref. ${p.referencia}` : ""}</p>
                    <p className="text-sm text-gray-700 mt-0.5">{p.descricao}</p>
                    {p.endereco && <p className="text-xs text-gray-500 mt-0.5">Local: {p.endereco}</p>}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border whitespace-nowrap ${STATUS_COR[p.status] || ""}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Pedido em {fmtData(p.dataPedido)}
                  {p.prazo ? ` · prazo ${fmtData(p.prazo)}` : ""}
                  {p.dataFechamento ? ` · fechado em ${fmtData(p.dataFechamento)}` : ""}
                  {" · "}última atualização {fmtData(p.ultimaAtualizacao)}
                </p>
                {p.andamentos.length > 0 && (
                  <table className="w-full text-xs mt-2 border-t border-gray-200">
                    <tbody>
                      {p.andamentos.map(a => (
                        <tr key={a.id} className="border-b border-gray-100 align-top">
                          <td className="py-1 pr-3 whitespace-nowrap font-semibold text-gray-600 w-24">{fmtData(a.data)}</td>
                          <td className="py-1 text-gray-800">{a.descricao}</td>
                          <td className="py-1 pl-3 whitespace-nowrap text-right text-gray-500">{a.status ? `→ ${a.status}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
