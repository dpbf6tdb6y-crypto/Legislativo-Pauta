'use client'
import { useSession } from 'next-auth/react'
import { temPermissao, type ChavePermissao } from '@/lib/permissoes'

/** Hook client-side para checar permissão do usuário logado e esconder/desabilitar ações na UI. */
export function usePermissao(chave: ChavePermissao): boolean {
  const { data: session } = useSession()
  return temPermissao(session?.user as any, chave)
}
