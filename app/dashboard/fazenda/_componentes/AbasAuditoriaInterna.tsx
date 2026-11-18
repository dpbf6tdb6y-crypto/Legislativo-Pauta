import Link from 'next/link';

/** Dentro da Auditoria interna: os apontamentos e as regras que os geram. */
export default function AbasAuditoriaInterna({ atual }: { atual: 'apontamentos' | 'regras' }) {
  const abas = [['apontamentos', 'Apontamentos'], ['regras', 'Regras de conferência']] as const;
  return (
    <div className="flex gap-2">
      {abas.map(([k, r]) => <Link key={k} href={`/dashboard/fazenda/${k}`} aria-current={k === atual ? 'page' : undefined} className={k === atual ? 'btn' : 'btn-sec'}>{r}</Link>)}
    </div>
  );
}
