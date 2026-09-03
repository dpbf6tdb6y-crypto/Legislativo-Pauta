'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type TopbarCtx = {
  leftContent: ReactNode
  setLeftContent: (content: ReactNode) => void
  rightContent: ReactNode
  setRightContent: (content: ReactNode) => void
  // Deixa a página esconder o botão "Atualizar" fixo do cabeçalho global —
  // usado por telas que já têm seu próprio botão equivalente (ex.: a barra
  // fixa da edição de proposição do SEGOV), pra não duplicar.
  hideAtualizar: boolean
  setHideAtualizar: (hide: boolean) => void
}

const TopbarContext = createContext<TopbarCtx>({
  leftContent: null, setLeftContent: () => {},
  rightContent: null, setRightContent: () => {},
  hideAtualizar: false, setHideAtualizar: () => {},
})

export function TopbarProvider({ children }: { children: ReactNode }) {
  const [leftContent, setLeftContent] = useState<ReactNode>(null)
  const [rightContent, setRightContent] = useState<ReactNode>(null)
  const [hideAtualizar, setHideAtualizar] = useState(false)
  return (
    <TopbarContext.Provider value={{ leftContent, setLeftContent, rightContent, setRightContent, hideAtualizar, setHideAtualizar }}>
      {children}
    </TopbarContext.Provider>
  )
}

export const useTopbar = () => useContext(TopbarContext)
