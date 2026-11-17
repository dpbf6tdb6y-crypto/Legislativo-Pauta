'use client';
// Formulário que chama uma ação do servidor e mostra o erro na própria tela (sem página de erro).
import type { ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { Resultado } from './acoes';

export function Enviar({ children, className = 'btn', name, value }: { children: ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} name={name} value={value}>{pending ? 'Aguarde…' : children}</button>;
}

export default function FormAcao({ acao, children, className }: {
  acao: (r: Resultado, f: FormData) => Promise<Resultado>; children: ReactNode; className?: string;
}) {
  const [r, despachar] = useFormState(acao, null);
  return (
    <form action={despachar} className={className}>
      {children}
      {r?.erro && <p className="text-sm text-red-700 mt-1" role="alert">{r.erro}</p>}
    </form>
  );
}
