import { describe, it, expect } from "vitest"
import { interpreta } from "./pesquisa-proposicoes"

const itens = [
  { id: "1", tipo: "PL", numero: "2758", ano: 2026, status: "Em análise" },
  { id: "2", tipo: "PLC", numero: "12", ano: 2026, status: "Aprovado" },
  { id: "3", tipo: "REQ", numero: "300", ano: 2025, status: "Arquivado" },
]
const vereadores = [
  { id: "v1", nome: "Gliverson Marques", apelido: "Gliverson" },
  { id: "v2", nome: "Adilson Braga", apelido: "Adilson" },
  { id: "v3", nome: "Anisio Filho", apelido: "Anisinho" },
]
const STATUS = ["Aguardando", "Em análise", "Aprovado", "Sancionado", "Promulgado", "Rejeitado", "Arquivado", "Retirado"]

describe("pesquisa de proposições por pergunta", () => {
  it("entende número, tipo e ano", () => {
    const r = interpreta("Qual a situação do PL 2.758 de 2026?", itens, vereadores, STATUS)
    expect(r.f.proposicao).toBe("pl 2758/2026")
  })
  it("entende situação e vereador", () => {
    const r = interpreta("proposições em análise do vereador Gliverson", itens, vereadores, STATUS)
    expect(r.f.status).toEqual(["Em análise"])
    expect(r.f.vereadorId).toBe("v1")
  })
  it("entende tipo por extenso e situação no feminino/plural", () => {
    const r = interpreta("projetos de lei complementar aprovados este ano", itens, vereadores, STATUS)
    expect(r.f.tipo).toBe("PLC")
    expect(r.f.status).toEqual(["Aprovado"])
    expect(r.f.ano).toBe(new Date().getFullYear())
  })
  it("entende paradas há N dias e assunto", () => {
    const a = interpreta("proposições paradas há mais de 30 dias", itens, vereadores, STATUS)
    expect(a.f.paradoDias).toBe(30)
    const b = interpreta("requerimentos sobre iluminação pública", itens, vereadores, STATUS)
    expect(b.f.tipo).toBe("REQ")
    expect(b.f.ementa).toBe("iluminação pública")
  })
  it("avisa quando não entende", () => {
    expect(interpreta("banana azul voadora", itens, vereadores, STATUS).entendeu).toBe(false)
  })
})
