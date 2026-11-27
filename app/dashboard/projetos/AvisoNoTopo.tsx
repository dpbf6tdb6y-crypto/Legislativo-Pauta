'use client';
// Aviso de demonstração na barra do alto, na mesma linha do botão "Atualizar".
import { useEffect } from 'react';
import { useTopbar } from '@/contexts/topbar';

export default function AvisoNoTopo() {
  const { setLeftContent } = useTopbar();
  useEffect(() => {
    // no celular o texto é mais curto, para a barra não crescer
    setLeftContent(
      <div className="flex-1 min-w-0 flex items-center justify-between gap-3 mr-3 px-3 py-1 md:py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs leading-tight md:leading-4 text-amber-900">
        <p>
          <strong>Demonstração:</strong>{' '}
          <span className="hidden lg:inline">pessoas, projetos e valores são fictícios. O que for digitado aqui não é salvo.</span>
          <span className="lg:hidden">dados fictícios; nada é salvo.</span>
        </p>
        <a href="/api/projetos-prototipo" target="_blank" rel="noopener" className="font-semibold underline whitespace-nowrap">
          <span className="hidden sm:inline">Abrir em tela inteira</span>
          <span className="sm:hidden">Tela inteira</span>
        </a>
      </div>,
    );
    return () => setLeftContent(null);
  }, [setLeftContent]);
  return null;
}
