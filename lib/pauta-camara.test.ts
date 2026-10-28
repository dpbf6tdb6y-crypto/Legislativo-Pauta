import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { analisarItens, chaveProposicao, lerPauta, resolverAutoresPauta, siglaDoTipo } from "./pauta-camara"

const pauta = (nome: string) => readFileSync(path.join(__dirname, "fixtures", "pautas", nome), "utf8")
const refs = (itens: { sigla: string; numero: string; ano: number }[]) => itens.map(i => `${i.sigla} ${i.numero}/${i.ano}`)

describe("tipos", () => {
  it("PL, Projeto de Lei e Projeto de Lei Ordinária são o mesmo tipo", () => {
    expect(siglaDoTipo("PL")).toBe("PL")
    expect(siglaDoTipo("Projeto de Lei")).toBe("PL")
    expect(siglaDoTipo("Projeto de Lei Ordinária")).toBe("PL")
    expect(siglaDoTipo("projeto de lei ordinaria")).toBe("PL")
  })
  it("PDL e Projeto de Decreto Legislativo são o mesmo tipo; PLC não se confunde com PL", () => {
    expect(siglaDoTipo("PDL")).toBe("PDL")
    expect(siglaDoTipo("Projeto de Decreto Legislativo")).toBe("PDL")
    expect(siglaDoTipo("Projeto de Lei Complementar")).toBe("PLC")
  })
  it("a chave ignora sigla x extenso e pontos/zeros do número", () => {
    expect(chaveProposicao("PL", "2.769", 2026)).toBe(chaveProposicao("Projeto de Lei Ordinária", "02769", 2026))
    expect(chaveProposicao("PL", "2769", 2026)).not.toBe(chaveProposicao("PLC", "2769", 2026))
  })
})

describe("pauta de 27/10/2026 (Word e PDF)", () => {
  const word = lerPauta(pauta("pauta-2026-10-27-word.txt"))
  const pdf = lerPauta(pauta("pauta-2026-10-27-pdf.txt"))

  it("lê as 8 proposições novas e a data da sessão", () => {
    expect(refs(word.itens)).toEqual(["PL 2775/2026", "PL 2776/2026", "PL 2777/2026", "PL 2778/2026", "PL 2779/2026", "PL 2780/2026", "PL 2781/2026", "PL 2782/2026"])
    expect(word.dataSessao).toBe("2026-10-27T12:00:00.000Z")
    expect(word.ignorados).toEqual([])
  })
  it("o PDF dá o mesmo resultado que o Word", () => {
    expect(pdf.dataSessao).toBe(word.dataSessao)
    expect(pdf.itens.map(i => [i.sigla, i.numero, i.ano, i.autorNome, i.observacao])).toEqual(word.itens.map(i => [i.sigla, i.numero, i.ano, i.autorNome, i.observacao]))
    // o PDF original traz "previdências" (erro de digitação da pauta) onde o Word digitado tem "providências"
    const norm = (s: string) => s.replace(/\s+/g, " ").replace(/previdências/g, "providências")
    expect(pdf.itens.map(i => norm(i.ementa))).toEqual(word.itens.map(i => norm(i.ementa)))
  })
  it("lê autor, ementa sem aspas nas pontas e a comissão de destino", () => {
    const pl2777 = word.itens.find(i => i.numero === "2777")!
    expect(pl2777.autorNome).toBe("Nilton Cruz")
    expect(pl2777.ementa.startsWith("Denomina")).toBe(true)
    expect(pl2777.ementa).toContain("“Praça da Benção”")
    expect(pl2777.ementa.endsWith("Nova Lima")).toBe(true)
    expect(pl2777.observacao).toBe("Comissão de Legislação e Justiça")
    expect(pl2777.tipo).toBe("Projeto de Lei Ordinária")
  })
  it("item com mais de um autor guarda todos em autorNome", () => {
    expect(word.itens.find(i => i.numero === "2779")!.autorNome).toBe("Pedro Dornas e Thiago Almeida")
  })
  it("a ementa de um item não vaza para o outro", () => {
    expect(word.itens.find(i => i.numero === "2775")!.ementa).not.toContain("futebol feminino")
    expect(word.itens.find(i => i.numero === "2776")!.ementa).toContain("futebol feminino")
  })
})

describe("pauta de 20/10/2026", () => {
  const leitura = lerPauta(pauta("pauta-2026-10-20-word.txt"))

  it("lê as 5 proposições e deixa o Projeto de Resolução de fora, avisando", () => {
    expect(refs(leitura.itens)).toEqual(["PL 2769/2026", "PL 2770/2026", "PL 2771/2026", "PL 2772/2026", "PL 2773/2026"])
    expect(leitura.ignorados).toHaveLength(1)
    expect(leitura.ignorados[0]).toMatchObject({ tipo: "Projeto de Resolução", numero: "210", ano: 2026 })
  })
  it("lê a comissão de destino mesmo sem o marcador de lista", () => {
    expect(leitura.itens.every(i => i.observacao === "Comissão de Legislação e Justiça")).toBe(true)
  })
  it("avisa que o número 2769 se repete na pauta (parecer de outro autor)", () => {
    const analisados = analisarItens(leitura, [], [])
    const pl2769 = analisados.find(i => i.numero === "2769")!
    expect(pl2769.autorNome).toBe("Pedro Dornas")
    expect(pl2769.repetidoNaPauta).toEqual(["leitura de pareceres (autoria Thiago Almeida)"])
    expect(analisados.filter(i => i.numero !== "2769").every(i => i.repetidoNaPauta.length === 0)).toBe(true)
  })
})

describe("pauta de 06/10/2026", () => {
  const leitura = lerPauta(pauta("pauta-2026-10-06-word.txt"))
  it("lê PDL e PL, com o tipo por extenso", () => {
    expect(refs(leitura.itens)).toEqual(["PDL 531/2026", "PDL 532/2026", "PDL 534/2026", "PDL 535/2026", "PL 2767/2026"])
    expect(leitura.itens[0].tipo).toBe("Projeto de Decreto Legislativo")
    expect(leitura.itens[0].observacao).toBe("Comissão Especial")
  })
})

describe("cruzamento com o que já existe", () => {
  const leitura = lerPauta(pauta("pauta-2026-10-27-word.txt"))
  const existe = (tipo: string, numero: string) => ({ id: "x1", tipo, numero, ano: 2026, autorNome: "Alguém", ementa: "Ementa antiga", status: "Aguardando" })

  it("acha existente gravada por extenso ou por sigla", () => {
    const a = analisarItens(leitura, [existe("Projeto de Lei Ordinária", "2775"), existe("PL", "2776")], [])
    expect(a.find(i => i.numero === "2775")!.jaExiste).toMatchObject({ id: "x1", autorNome: "Alguém" })
    expect(a.find(i => i.numero === "2776")!.jaExiste).not.toBeNull()
    expect(a.find(i => i.numero === "2777")!.jaExiste).toBeNull()
  })
  it("não confunde PL com PLC nem ano diferente", () => {
    const a = analisarItens(leitura, [existe("Projeto de Lei Complementar", "2775"), { ...existe("PL", "2776"), ano: 2025 }], [])
    expect(a.find(i => i.numero === "2775")!.jaExiste).toBeNull()
    expect(a.find(i => i.numero === "2776")!.jaExiste).toBeNull()
  })
  it("informa quando a mesma numeração já está duplicada no sistema", () => {
    const a = analisarItens(leitura, [existe("PL", "2775"), existe("Projeto de Lei Ordinária", "2775")], [])
    expect(a.find(i => i.numero === "2775")!.jaExiste!.quantidade).toBe(2)
  })
})

describe("autores", () => {
  const vereadores = [
    { id: "v1", nome: "Pedro Dornas", apelido: null },
    { id: "v2", nome: "Thiago Almeida", apelido: null },
    { id: "v3", nome: "Claudio José", apelido: "Claudinho Valle" },
    { id: "v4", nome: "Anisio Filho", apelido: "Anisinho" },
  ]
  it("liga todos os autores citados e usa o primeiro como principal", () => {
    const r = resolverAutoresPauta("Pedro Dornas e Thiago Almeida", vereadores)
    expect(r.vereadorId).toBe("v1")
    expect(r.ligados.map(l => l.vereadorId)).toEqual(["v1", "v2"])
  })
  it("casa pelo apelido cadastrado", () => {
    expect(resolverAutoresPauta("Claudinho Valle", vereadores).vereadorId).toBe("v3")
    expect(resolverAutoresPauta("Anisinho", vereadores).vereadorId).toBe("v4")
  })
  it("Poder Executivo fica sem vereador e sem aviso de autor não encontrado", () => {
    const leitura = lerPauta(pauta("pauta-2026-10-20-word.txt"))
    const r = resolverAutoresPauta("Poder Executivo", vereadores)
    expect(r.vereadorId).toBeNull()
    expect(analisarItens(leitura, [], vereadores).every(i => !i.autoresSemVinculo.includes("Poder Executivo"))).toBe(true)
  })
  it("autor sem cadastro vira aviso, sem derrubar o item", () => {
    const leitura = lerPauta(pauta("pauta-2026-10-20-word.txt"))
    const a = analisarItens(leitura, [], vereadores.filter(v => v.id !== "v4"))
    expect(a.find(i => i.numero === "2770")!.vereadorId).toBeNull()
    expect(a.find(i => i.numero === "2770")!.autoresSemVinculo).toEqual(["Anisinho"])
    expect(analisarItens(leitura, [], vereadores).find(i => i.numero === "2770")!.vereadorId).toBe("v4")
  })
})

describe("textos inesperados", () => {
  it("sem a seção c) avisa e não inventa itens", () => {
    const r = lerPauta("PAUTA ORDEM DO DIA\nI – PRIMEIRA PARTE:\na) Leitura da ata")
    expect(r.itens).toEqual([])
    expect(r.avisos.some(a => a.includes("Apresentação de proposições"))).toBe(true)
  })
  it("tipo fora do escopo (Requerimento) é ignorado, não cadastrado", () => {
    const r = lerPauta("c) Apresentação de proposições;\n1) Requerimento nº 12/2026, autoria Vereador Fulano, que “Pede algo”.\nd) Leitura de Parecer;")
    expect(r.itens).toEqual([])
    expect(r.ignorados).toHaveLength(1)
  })
})
