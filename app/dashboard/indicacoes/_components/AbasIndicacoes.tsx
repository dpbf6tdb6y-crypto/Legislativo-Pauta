"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const ABAS = [
  { href: "/dashboard/indicacoes/pedidos", rotulo: "Painel dos pedidos", exato: true },
  { href: "/dashboard/indicacoes/pedidos/gestao", rotulo: "Cadastro e gestão", exato: false },
  { href: "/dashboard/indicacoes", rotulo: "Indicações de cargos", exato: true },
]

export default function AbasIndicacoes() {
  const pathname = usePathname() || ""
  return (
    <nav className="flex gap-1 border-b border-gray-200 print:hidden" aria-label="Seções de Ind.">
      {ABAS.map(a => {
        const ativa = a.exato ? pathname === a.href : pathname.startsWith(a.href)
        return (
          <Link key={a.href} href={a.href}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition ${
              ativa ? "border-red-800 text-red-800" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {a.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
