import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totalVereadores, totalComissoes, totalProposicoes, totalSessoes, liberadas, emTramitacao] =
    await Promise.all([
      prisma.vereador.count({ where: { ativo: true } }),
      prisma.comissao.count({ where: { ativa: true } }),
      prisma.proposicao.count(),
      prisma.sessao.count(),
      prisma.proposicao.count({ where: { status: "em_tramitacao", dispensaParecer: true } }),
      prisma.proposicao.count({ where: { status: "em_tramitacao" } }),
    ]);

  const ultimasProposicoes = await prisma.proposicao.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { autorVereador: true },
  });

  const proximasSessoes = await prisma.sessao.findMany({
    take: 3,
    where: { status: "agendada", data: { gte: new Date() } },
    orderBy: { data: "asc" },
    include: { _count: { select: { itens: true } } },
  });

  const stats = [
    { label: "Vereadores Ativos", value: totalVereadores, color: "bg-blue-500", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
    { label: "Comissões", value: totalComissoes, color: "bg-indigo-500", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { label: "Proposições", value: totalProposicoes, color: "bg-emerald-500", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { label: "Sessões", value: totalSessoes, color: "bg-amber-500", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  ];

  const tipoLabel: Record<string, string> = {
    pl: "PL", resolucao: "Resolução", requerimento: "Requerimento", mocao: "Moção",
  };
  const statusLabel: Record<string, string> = {
    em_tramitacao: "Em tramitação", aprovada: "Aprovada", rejeitada: "Rejeitada", arquivada: "Arquivada",
  };
  const statusColor: Record<string, string> = {
    em_tramitacao: "bg-yellow-100 text-yellow-800",
    aprovada: "bg-green-100 text-green-800",
    rejeitada: "bg-red-100 text-red-800",
    arquivada: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm">Visão geral do sistema legislativo</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
            <div className={`${s.color} rounded-lg p-3`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              <p className="text-gray-500 text-xs">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Últimas proposições */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Últimas Proposições</h2>
          {ultimasProposicoes.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma proposição cadastrada.</p>
          ) : (
            <div className="space-y-3">
              {ultimasProposicoes.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {tipoLabel[p.tipo]} {p.numero}/{p.ano}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-1">{p.ementa}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${statusColor[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas sessões */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Próximas Sessões</h2>
          {proximasSessoes.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhuma sessão agendada.</p>
          ) : (
            <div className="space-y-3">
              {proximasSessoes.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">{s.tipo} — {new Date(s.data).toLocaleDateString("pt-BR")}</p>
                    <p className="text-xs text-gray-500">{s._count.itens} item(s) na pauta</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">Agendada</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Em tramitação */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-2">Situação das Proposições</h2>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span>
            <span className="text-gray-600">Em tramitação: <strong>{emTramitacao}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-400 inline-block"></span>
            <span className="text-gray-600">Dispensadas (prontas para pauta): <strong>{liberadas}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
