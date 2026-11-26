// Governança de projetos: aba própria do SEGOV, sobre os mesmos projetos cadastrados no Compliance.
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
