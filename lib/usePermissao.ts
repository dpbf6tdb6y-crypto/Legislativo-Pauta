'use client'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { temPermissao, type ChavePermissao } from '@/lib/permissoes'
import { menuDaRota } from '@/lib/acessos'

/**
 * Hook client-side para checar permissão do usuário logado e esconder/desabilitar ações na UI.
 * Considera o menu da tela atual: quem só visualiza aquele menu não vê criar, editar, excluir nem importar.
 */
export function usePermissao(chave: ChavePermissao): boolean {
  const { data: session } = useSession()
  const pathname = usePathname() || ''
  const menu = menuDaRota(pathname) || undefined
  return temPermissao(session?.user as any, chave, menu)
}
