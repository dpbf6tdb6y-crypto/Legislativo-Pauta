"use client";
import { useEffect } from "react";
import { useTopbar } from "@/contexts/topbar";

// Painel anterior: continua disponível só para comparação, até o robô único ser validado.
export default function PainelAnterior() {
  const { setHideAtualizar } = useTopbar();

  // O painel já tem seu próprio botão Atualizar: some com o do cabeçalho para não duplicar.
  useEffect(() => {
    setHideAtualizar(true);
    return () => setHideAtualizar(false);
  }, [setHideAtualizar]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
        Painel anterior, mantido só para comparação. Os números que valem estão no Painel do Compliance.
      </p>
      <div className="h-[calc(100dvh-170px)] min-h-[480px] bg-white border border-slate-200 rounded-lg overflow-hidden">
        <iframe src="/api/fazenda/painel" title="Painel anterior" allow="microphone; autoplay" className="w-full h-full border-0" />
      </div>
    </div>
  );
}
