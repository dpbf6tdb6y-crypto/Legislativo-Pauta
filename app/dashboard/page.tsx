import { prisma } from "@/lib/prisma";
import DashboardCharts from "./DashboardCharts";

export const dynamic = "force-dynamic";

const STATUS_LIST = [
  'Aguardando', 'Com Parecer', 'Em análise', 'Aprovado', 'Rejeitado', 'Arquivado', 'Retirado',
] as const;

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Aguardando':  { bg: 'bg-yellow-50',  text: 'text-yellow-700',  border: 'border-yellow-200'  },
  'Com Parecer': { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200'  },
  'Em análise':  { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  'Aprovado':    { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200'   },
  'Rejeitado':   { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  'Arquivado':   { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200'    },
  'Retirado':    { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200'  },
};

const ANO_ATUAL = new Date().getFullYear();

function isExec(item: { autorNome: string | null }) {
  return (item.autorNome || '').toLowerCase().includes('executivo')
      || (item.autorNome || '').toLowerCase().includes('prefeitura')
      || (item.autorNome || '').toLowerCase().includes('prefeito');
}

function isInstitucional(nome: string) {
  const n = nome.toLowerCase();
  return n.startsWith('mesa diretora') || n === 'autor personalizado';
}

// Divide o texto de autores por vírgula, mas ignora vírgulas dentro de parênteses
// (ex: "Mesa Diretora (Anisinho, Claudinho Valle)" não pode virar dois autores)
function splitAutores(campo: string | null): string[] {
  if (!campo) return [];
  const partes: string[] = [];
  let atual = '';
  let profundidade = 0;
  for (const ch of campo) {
    if (ch === '(') profundidade++;
    if (ch === ')') profundidade--;
    if (ch === ',' && profundidade === 0) { partes.push(atual.trim()); atual = ''; }
    else atual += ch;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

function resultadoDe(status: string): 'aprovado' | 'rejeitado' | 'tramitando' {
  if (status === 'Aprovado') return 'aprovado';
  if (status === 'Rejeitado') return 'rejeitado';
  return 'tramitando';
}

export default async function DashboardPage() {
  const [itens, requerimentos, vereadoresAtivos] = await Promise.all([
    prisma.segov.findMany({ include: { vereador: true }, orderBy: [{ ano: 'desc' }, { numero: 'asc' }] }),
    prisma.requerimento.findMany({ include: { vereador: true } }),
    prisma.vereador.count({ where: { ativo: true, poder: 'legislativo' } }),
  ]);

  const total = itens.length;
  const totalReq = requerimentos.filter(r => r.tipo === 'REQ').length;
  const totalMoc = requerimentos.filter(r => r.tipo === 'MOC').length;
  const totalInd = requerimentos.filter(r => r.tipo === 'IND').length;
  const totalGeral = total + requerimentos.length;

  // Por status — Proposições
  const porStatus: Record<string, number> = {};
  STATUS_LIST.forEach(s => { porStatus[s] = 0; });
  itens.forEach(item => { porStatus[item.status] = (porStatus[item.status] || 0) + 1; });

  // Por status — Requerimentos/Moções/Indicações
  const porStatusReq: Record<string, number> = {};
  STATUS_LIST.forEach(s => { porStatusReq[s] = 0; });
  requerimentos.forEach(item => { porStatusReq[item.status] = (porStatusReq[item.status] || 0) + 1; });

  // Resultado final — combinado, derivado do status real (não do fluxo manual, que não existe para dados importados)
  let aprovadoFinal = 0, rejeitadoFinal = 0, tramitando = 0;
  [...itens, ...requerimentos].forEach(item => {
    const r = resultadoDe(item.status);
    if (r === 'aprovado') aprovadoFinal++;
    else if (r === 'rejeitado') rejeitadoFinal++;
    else tramitando++;
  });
  const decididas = aprovadoFinal + rejeitadoFinal;
  const taxaAprovacao = decididas > 0 ? Math.round((aprovadoFinal / decididas) * 100) : null;

  const executivoItens = itens.filter(isExec);
  const totalExecutivo = executivoItens.length;

  // Atividade combinada por vereador (Proposições + Requerimentos/Moções/Indicações)
  const porVereadorMap: Record<string, number> = {};
  function contarAutoria(item: { vereador: { nome: string } | null; autorNome: string | null }, excluirExec: boolean) {
    if (excluirExec && isExec(item)) return;
    if (item.vereador?.nome) { porVereadorMap[item.vereador.nome] = (porVereadorMap[item.vereador.nome] || 0) + 1; return; }
    const nomes = splitAutores(item.autorNome).flatMap(n => n.split(/\s+e\s+/)).map(n => n.trim()).filter(Boolean);
    nomes.forEach(n => {
      if (!n || isExec({ autorNome: n }) || isInstitucional(n)) return;
      porVereadorMap[n] = (porVereadorMap[n] || 0) + 1;
    });
  }
  itens.forEach(item => contarAutoria(item, true));
  requerimentos.forEach(item => contarAutoria(item, true));

  const porVereador = Object.entries(porVereadorMap)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  const execStatus: Record<string, number> = {};
  executivoItens.forEach(item => { execStatus[item.status] = (execStatus[item.status] || 0) + 1; });
  const porStatusExecutivo = Object.entries(execStatus)
    .map(([status, total]) => ({ status, total }))
    .sort((a, b) => b.total - a.total);

  // Distribuição por tipo — Proposições
  const porTipoMap: Record<string, number> = {};
  itens.forEach(item => { porTipoMap[item.tipo] = (porTipoMap[item.tipo] || 0) + 1; });
  const porTipo = Object.entries(porTipoMap)
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total);

  // Tendência por ano — combinado, ignorando anos com erro de digitação evidente (fora de 2000..ano atual+1)
  const porAnoMap: Record<number, number> = {};
  function contarAno(ano: number) {
    if (ano < 2000 || ano > ANO_ATUAL + 1) return;
    porAnoMap[ano] = (porAnoMap[ano] || 0) + 1;
  }
  itens.forEach(item => contarAno(item.ano));
  requerimentos.forEach(item => contarAno(item.ano));
  const porAno = Object.entries(porAnoMap)
    .map(([ano, total]) => ({ ano: Number(ano), total }))
    .sort((a, b) => a.ano - b.ano);

  const proposicoes = itens.map(item => ({
    id: item.id,
    tipo: item.tipo,
    numero: item.numero,
    ano: item.ano,
    ementa: item.ementa || '',
    status: item.status,
    autorNome: item.autorNome || null,
    vereadorNome: item.vereador?.nome || null,
    isExec: isExec(item),
  }));

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
        <span className="text-gray-400 text-sm">— Visão geral do sistema legislativo</span>
      </div>

      {/* Stat cards — visão geral */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard
          label="Total de Matérias" value={totalGeral} color="#111827"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <StatCard
          label="Proposições" value={total} color="#8B0000"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <StatCard
          label="Requerimentos" value={totalReq} color="#0e7490"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <StatCard
          label="Moções" value={totalMoc} color="#6d28d9"
          icon="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z"
        />
        <StatCard
          label="Vereadores Ativos" value={vereadoresAtivos} color="#1d4ed8"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <StatCard
          label="Taxa de Aprovação"
          value={taxaAprovacao !== null ? `${taxaAprovacao}%` : '—'}
          color="#15803d"
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </div>

      {/* Status + Resultado Final — Proposições */}
      <div className="flex gap-3">
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Proposições por Status</p>
          <div className="grid grid-cols-7 gap-2">
            {STATUS_LIST.map(s => {
              const c = STATUS_STYLE[s];
              return (
                <div key={s} className={`rounded-lg border p-2 text-center ${c.bg} ${c.border}`}>
                  <p className={`text-xl font-bold ${c.text}`}>{porStatus[s] || 0}</p>
                  <p className={`text-xs mt-0.5 ${c.text} font-medium leading-tight`}>{s}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resultado Final (todas as matérias)</p>
          <div className="flex gap-2 h-[calc(100%-28px)] items-center">
            <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-green-700">{aprovadoFinal}</p>
              <p className="text-xs mt-0.5 text-green-600 font-medium">Aprovadas</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-red-700">{rejeitadoFinal}</p>
              <p className="text-xs mt-0.5 text-red-600 font-medium">Reprovadas</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-2 text-center">
              <p className="text-2xl font-bold text-gray-500">{tramitando}</p>
              <p className="text-xs mt-0.5 text-gray-500 font-medium">Tramitando</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status — Requerimentos, Moções e Indicações */}
      <div className="bg-white rounded-xl shadow-sm px-4 py-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Requerimentos, Moções e Indicações por Status
          <span className="ml-1 normal-case font-normal text-gray-300">— {requerimentos.length} registro(s)</span>
        </p>
        <div className="grid grid-cols-6 gap-2">
          {STATUS_LIST.filter(s => s !== 'Com Parecer').map(s => {
            const c = STATUS_STYLE[s];
            return (
              <div key={s} className={`rounded-lg border p-2 text-center ${c.bg} ${c.border}`}>
                <p className={`text-xl font-bold ${c.text}`}>{porStatusReq[s] || 0}</p>
                <p className={`text-xs mt-0.5 ${c.text} font-medium leading-tight`}>{s}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gráficos */}
      <DashboardCharts
        porVereador={porVereador}
        porStatusExecutivo={porStatusExecutivo}
        totalExecutivo={totalExecutivo}
        proposicoes={proposicoes}
        porAno={porAno}
        porTipo={porTipo}
      />
    </div>
  );
}

function StatCard({
  label, value, color, icon,
}: {
  label: string; value: string | number; color: string; icon: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm px-3 py-3 flex items-center gap-2.5 border-l-4" style={{ borderLeftColor: color }}>
      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: color }}>
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-gray-500 text-xs leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}
