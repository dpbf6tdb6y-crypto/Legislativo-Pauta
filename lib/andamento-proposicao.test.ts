import { describe, it, expect } from "vitest"
import { andamentoDe, achaProposicoes, etapaPerguntada, respondeEtapa, ehPerguntaDeAndamento } from "./andamento-proposicao"

const item = {
  tipo: "PLO", numero: "2681", ano: 2026, status: "Aprovado", ementa: "Altera e retifica descrições de áreas.",
  fluxo: {
    protocolado: { done: true, doneAt: "2026-08-17" },
    dispensaParecer: { done: true, doneAt: "2026-08-18", data: { autores: ["Silvanio"] } },
    dispensaIntersticio: { done: true, doneAt: "2026-08-18", data: { autores: ["Silvanio"] } },
    resultadoFinal: { done: true, doneAt: "2026-08-18", data: { resultado: "aprovado" } },
  },
}

describe("andamento da proposição", () => {
  it("responde a última informação do fluxo", () => {
    const a = andamentoDe(item)
    expect(a.fala).toContain("votado em plenário")
    expect(a.fala).toContain("18 de agosto")
    expect(a.fala).toContain("sanção ou o veto")
  })
  it("diz a comissão em que está", () => {
    const a = andamentoDe({ ...item, status: "Em análise", fluxo: { protocolado: { done: true, doneAt: "2026-08-10" },
      comissao1: { done: true, doneAt: "2026-08-12", data: { comissaoNome: "CLJR — Comissão de Justiça e Redação" } } } })
    expect(a.fala).toContain("Comissão de Justiça e Redação")
  })
  it("diz quem pediu a dispensa de interstício", () => {
    expect(etapaPerguntada("quem pediu dispensa de intersticio do projeto 2681/2026")).toBe("dispensaIntersticio")
    expect(respondeEtapa(item, "dispensaIntersticio").fala).toContain("Silvanio")
  })
  it("acha a proposição só pelo número", () => {
    expect(achaProposicoes({}, [item], "quem pediu dispensa de intersticio do projeto 2681/2026")).toHaveLength(1)
    expect(achaProposicoes({}, [item], "andamento do projeto 2681")).toHaveLength(1)
    expect(ehPerguntaDeAndamento("como esta o andamento do projeto 2681")).toBe(true)
  })
})
