import { describe, it, expect } from "vitest"
import { chavesDoConjunto } from "./fluxo-conjunto"

const tres = { comissao1: { done: true }, comissao2: { done: true }, comissao3: { done: true } }

describe("parecer conjunto", () => {
  it("sem conjunto, nada é agrupado", () => {
    expect(chavesDoConjunto(tres)).toEqual([])
  })
  it("dados antigos (sem lista): vale para todas as comissões marcadas", () => {
    expect(chavesDoConjunto({ ...tres, comissaoConjunta: { done: true, data: { nome1: "Wesley" } } })).toEqual(["comissao1", "comissao2", "comissao3"])
  })
  it("conjunto de só 2 comissões", () => {
    expect(chavesDoConjunto({ ...tres, comissaoConjunta: { done: true, data: { comissoes: ["comissao2", "comissao3"] } } })).toEqual(["comissao2", "comissao3"])
  })
  it("com menos de 2 não forma conjunto", () => {
    expect(chavesDoConjunto({ ...tres, comissaoConjunta: { done: true, data: { comissoes: ["comissao3"] } } })).toEqual([])
  })
  it("ignora comissão escolhida que não está marcada", () => {
    expect(chavesDoConjunto({ comissao1: { done: true }, comissao2: { done: true }, comissaoConjunta: { done: true, data: { comissoes: ["comissao2", "comissao3"] } } })).toEqual([])
  })
})
