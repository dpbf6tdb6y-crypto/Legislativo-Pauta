// Aba Projetos: abre o protótipo completo do painel de governança, como foi desenhado.
// É uma demonstração com dados fictícios; os projetos reais ficam em Compliance > Projetos e em Governança.
export default function PaginaProjetos() {
  return (
    <div className="-mx-3 sm:-mx-5 -mt-3 flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-2.875rem)] min-h-[480px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 sm:px-5 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
        <p><strong>Demonstração:</strong> município, pessoas, projetos e valores são fictícios. O que for digitado aqui não é salvo.</p>
        <a href="/api/projetos-prototipo" target="_blank" rel="noopener" className="font-semibold underline whitespace-nowrap">
          Abrir em tela inteira
        </a>
      </div>
      {/* O protótipo roda isolado, e o sistema não vê o mouse dentro dele. Enquanto o mouse está no menu lateral,
          o quadro não captura o mouse: assim o menu percebe a saída e se fecha. */}
      <style>{"body:has([data-menu-lateral]:hover) iframe[data-prototipo]{pointer-events:none}"}</style>
      <iframe
        data-prototipo
        src="/api/projetos-prototipo"
        title="Projetos: painel de governança (demonstração)"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="clipboard-write"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}
