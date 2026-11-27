// Aba Governança (endereço /dashboard/projetos): abre o protótipo completo do painel, com a marca da Prefeitura.
// É uma demonstração com dados fictícios; os projetos reais ficam em Compliance > Projetos.
import AvisoNoTopo from './AvisoNoTopo';

export default function PaginaProjetos() {
  return (
    <div className="-mx-3 sm:-mx-5 -mt-3 flex flex-col h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-2.875rem)] min-h-[480px]">
      <AvisoNoTopo />
      {/* O protótipo roda isolado, e o sistema não vê o mouse dentro dele. Enquanto o mouse está no menu lateral,
          o quadro não captura o mouse: assim o menu percebe a saída e se fecha. */}
      <style>{"body:has([data-menu-lateral]:hover) iframe[data-prototipo]{pointer-events:none}"}</style>
      <iframe
        data-prototipo
        src="/api/projetos-prototipo"
        title="Governança: painel de projetos (demonstração)"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="clipboard-write"
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
}
