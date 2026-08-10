'use client'
import { createContext, useCallback, useContext, useState } from 'react'

type Tipo = 'success' | 'error' | 'info'
type ToastItem = { id: number; tipo: Tipo; mensagem: string }

type ToastContextValue = {
  success: (mensagem: string) => void
  error: (mensagem: string) => void
  info: (mensagem: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ESTILO: Record<Tipo, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: 'M5 13l4 4L19 7' },
  error:   { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   icon: 'M6 18L18 6M6 6l12 12' },
  info:    { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
}

let proximoId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([])

  const mostrar = useCallback((tipo: Tipo, mensagem: string) => {
    const id = proximoId++
    setItens(prev => [...prev, { id, tipo, mensagem }])
    setTimeout(() => setItens(prev => prev.filter(i => i.id !== id)), 5000)
  }, [])

  const value: ToastContextValue = {
    success: (m) => mostrar('success', m),
    error: (m) => mostrar('error', m),
    info: (m) => mostrar('info', m),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-full max-w-sm">
        {itens.map(item => {
          const e = ESTILO[item.tipo]
          return (
            <div key={item.id}
              className={`flex items-start gap-2 rounded-lg border shadow-lg px-4 py-3 text-sm ${e.bg} ${e.border} ${e.text} animate-in fade-in slide-in-from-bottom-2`}>
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={e.icon} />
              </svg>
              <span className="flex-1">{item.mensagem}</span>
              <button onClick={() => setItens(prev => prev.filter(i => i.id !== item.id))}
                className="text-current opacity-50 hover:opacity-100 transition flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}
