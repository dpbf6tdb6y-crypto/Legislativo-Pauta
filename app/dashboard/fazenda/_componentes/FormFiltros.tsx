'use client';
// Formulário dos filtros das colunas: escolher em uma lista filtra na hora; nos campos de texto, Enter filtra.
import type { ReactNode } from 'react';

export default function FormFiltros({ children }: { children: ReactNode }) {
  return (
    <form method="get" onChange={(e) => { if ((e.target as HTMLElement).tagName === 'SELECT') e.currentTarget.requestSubmit(); }}>
      {children}
    </form>
  );
}
