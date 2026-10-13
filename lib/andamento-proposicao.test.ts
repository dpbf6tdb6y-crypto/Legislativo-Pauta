import { describe, it, expect } from "vitest"
import { andamentoDe, achaProposicoes, achaPorPalavras, etapaPerguntada, respondeEtapa, ehPerguntaDeAndamento } from "./andamento-proposicao"

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
    expect(achaProposicoes({}, [{ ...item, tipo: "Projeto de Lei Ordinária" }], "como esta o andamento do pl 2681 de 2026")).toHaveLength(1)
    expect(achaProposicoes({}, [item], "como esta o andamento da proposicao 2.681/2026")).toHaveLength(1)
    expect(ehPerguntaDeAndamento("como esta o andamento do projeto 2681")).toBe(true)
  })

  it("procura por palavras-chave na ementa", () => {
    const itens = [
      { tipo: "PLO", numero: "10", ano: 2026, ementa: "Dispõe sobre o Plano Diretor do Município de Nova Lima." },
      { tipo: "PLO", numero: "11", ano: 2025, ementa: "Altera o Plano Diretor." },
      { tipo: "PLO", numero: "12", ano: 2026, ementa: "Cria o programa de esporte escolar." },
    ]
    const r = achaPorPalavras("como esta o andamento que fala sobre o plano diretor do ano de 2026", itens)
    expect(r.itens.map(i => i.numero)).toEqual(["10"])
    expect(achaProposicoes({}, itens, "como esta o andamento que fala sobre o plano diretor do ano de 2026")).toHaveLength(0)
  })
})
