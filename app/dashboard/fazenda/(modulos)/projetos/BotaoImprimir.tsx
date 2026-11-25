'use client';

export default function BotaoImprimir({ voltar }: { voltar: string }) {
  return (
    <div className="print:hidden flex items-center gap-3 mb-3">
      <button type="button" className="btn" onClick={() => window.print()}>🖨 Imprimir ou salvar em PDF</button>
      <a href={voltar} className="text-sm text-[#0f4c81] hover:underline">← voltar</a>
      <span className="text-xs text-slate-500">Na janela de impressão, escolha “Salvar como PDF”.</span>
    </div>
  );
}
