export default function Desligado({ searchParams }: { searchParams: { modulo?: string } }) {
  return <div className="cartao"><h1 className="font-semibold">Módulo desligado</h1><p className="text-sm text-slate-600">O módulo <b>{searchParams.modulo}</b> está desligado para esta prefeitura (Compliance → Administração → Chaves e perfis).</p></div>;
}
