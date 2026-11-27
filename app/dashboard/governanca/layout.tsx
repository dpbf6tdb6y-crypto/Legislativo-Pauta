// Governança de projetos, sobre os mesmos projetos cadastrados no Compliance. Saiu do menu lateral, a pedido:
// as telas continuam no endereço /dashboard/governanca, com o mesmo controle de acesso.
// Cada página confere a própria permissão (acessoProjetos).
import type { ReactNode } from 'react';
import AbasGovernanca from './AbasGovernanca';

export const dynamic = 'force-dynamic';

export default function LayoutGovernanca({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[1800px] mx-auto pb-6">
      <AbasGovernanca />
      {children}
    </div>
  );
}
