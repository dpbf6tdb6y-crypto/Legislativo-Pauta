export default function FazendaPage() {
  return (
    // Desfaz o padding do <main> do layout (px-5 pt-3) pra o painel ocupar a
    // tela toda até embaixo do cabeçalho, igual ao relatório original.
    <div className="h-[calc(100vh-56px)] -mx-5 -mt-3">
      <iframe
        src="/fazenda/painel.html"
        title="Painel Receita e Despesas"
        className="w-full h-full border-0"
      />
    </div>
  );
}
