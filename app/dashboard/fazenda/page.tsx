"use client";
import { useEffect } from "react";
import { useTopbar } from "@/contexts/topbar";

export default function FazendaPage() {
  const { setHideAtualizar } = useTopbar();

  // O painel já tem seu próprio botão Atualizar — some com o do cabeçalho
  // global enquanto essa página está aberta, pra não duplicar.
  useEffect(() => {
    setHideAtualizar(true);
    return () => setHideAtualizar(false);
  }, [setHideAtualizar]);

  return (
    // Desfaz o padding do <main> do layout (px-5 pt-3) pra o painel ocupar a
    // tela toda até embaixo do cabeçalho, igual ao relatório original.
    <div className="h-[calc(100vh-16px)] -mx-5 -mt-3">
      <iframe
        src="/fazenda/painel.html"
        title="Painel Receita e Despesas"
        className="w-full h-full border-0"
      />
    </div>
  );
}
