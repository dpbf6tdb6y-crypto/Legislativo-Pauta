import Link from 'next/link';
import { brlCurto } from '@/lib/financas/dinheiro';
import { DIAS_SEM_ATUALIZAR } from '@/lib/financas/projetos/regras';
import { STATUS_RISCO, type StatusRisco } from '@/lib/financas/projetos/riscos';
import { acessoProjetos } from '../fazenda/(modulos)/projetos/acesso';
import { BarraAvanco, SeloFase, SeloSaude } from '../fazenda/(modulos)/projetos/Selos';
import { coordenadora, lerGovernanca } from './leitura';
import { Cartao, QuemEsperaQuem } from './Pecas';

const ficha = (id: number) => `/dashboard/governanca/projetos/${id}`;

export default async function SalaDeSituacao() {
  const { db, ator } = await acessoProjetos('Governança · Sala de Situação');
  const hoje = new Date();
  const d = await lerGovernanca(db, ator, hoje);
  const retidas = new Set(d.esperas.map((b) => b.etapa.id)).size;

  const quadro: [string, string, string, string][] = [
    ['Em execução', String(d.ind.emExecucao), 'projetos andando', ''],
    ['Atrasados', String(d.ind.atrasados), 'prazo ou etapa vencidos', d.ind.atrasados ? 'text-red-700' : ''],
    ['Atenção', String(d.ind.atencao), 'ritmo, prazo curto ou sem notícia', d.ind.atencao ? 'text-amber-700' : ''],
    ['Etapas aguardando', String(retidas), 'retidas por outra etapa', retidas ? 'text-amber-700' : ''],
    ['Riscos graves', String(d.riscosGraves.length), 'em aberto', d.riscosGraves.length ? 'text-red-700' : ''],
    ['Orçamento ativo', brlCurto(d.ind.orcamentoAtivo), d.ind.semOrcamentoAtivo ? `${d.ind.semOrcamentoAtivo} sem orçamento` : 'aprovados, em execução e paralisados', ''],
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Sala de Situação</h1>
        <p className="text-sm text-slate-600">
          {ator.verTodos ? 'Todos os projetos da carteira' : 'Os projetos em que a sua secretaria participa'}, em {hoje.toLocaleDateString('pt-BR')}. Os números vêm do que está cadastrado em Compliance › Projetos.
        </p>
      </header>

      {d.projetos.length === 0 && (
        <p className="cartao text-sm">Nenhum projeto cadastrado ainda. <Link href="/dashboard/fazenda/projetos" className="text-[#0f4c81] hover:underline">Abrir os projetos no Compliance</Link>.</p>
      )}

      <dl className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {quadro.map(([rotulo, valor, nota, cor]) => (
          <div key={rotulo} className="cartao">
            <dt className="text-xs text-slate-500">{rotulo}</dt>
            <dd><div className={`text-2xl font-bold ${cor}`}>{valor}</div><div className="text-xs text-slate-500">{nota}</div></dd>
          </div>
        ))}
      </dl>

      <Cartao titulo="Painel de prioridades" nota="atrasados primeiro, depois os que pedem atenção">
        {d.prioridades.length === 0 ? <p className="text-sm text-slate-500">Nenhum projeto atrasado ou em atenção.</p> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Projeto</th><th>Coordenadora</th><th>Situação</th><th>Por quê</th><th>Avanço</th></tr></thead>
              <tbody>
                {d.prioridades.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={ficha(p.id)} className="text-[#0f4c81] hover:underline font-medium">{p.titulo}</Link><div className="mt-0.5"><SeloFase fase={p.fase} /></div></td>
                    <td className="text-xs">{coordenadora(p)}</td>
                    <td><SeloSaude saude={p.saude} diasAtraso={p.diasAtraso} /></td>
                    <td className="text-xs"><ul>{p.motivos.map((m) => <li key={m}>{m}</li>)}</ul></td>
                    <td><BarraAvanco pct={p.avanco} saude={p.saude} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Quem está esperando por quem" nota="etapas retidas por dependência">
        <QuemEsperaQuem lista={d.esperas} nomeDe={d.nomeDe} />
      </Cartao>

      <Cartao titulo="Secretarias" nota="projetos em aberto; o orçamento conta só para a coordenadora">
        {d.secretarias.length === 0 ? <p className="text-sm text-slate-500">Sem projetos em aberto.</p> : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Secretaria</th><th className="n">Coordena</th><th className="n">Participa</th><th className="n">Projetos atrasados</th><th className="n">Etapas atrasadas</th><th className="n">Retendo outras</th><th className="n">Aguardando</th><th className="n">Orçamento coordenado</th></tr></thead>
              <tbody>
                {d.secretarias.map((s) => (
                  <tr key={s.orgaoCod}>
                    <td><Link href={`/dashboard/governanca/projetos?secretaria=${s.orgaoCod}`} className="text-[#0f4c81] hover:underline">{s.orgaoNome}</Link></td>
                    <td className="n">{s.lidera}</td><td className="n">{s.parceira}</td><td className="n">{s.atrasados}</td>
                    <td className="n">{s.etapas.atrasadas}</td><td className="n">{s.etapas.retendo}</td><td className="n">{s.etapas.aguardando}</td>
                    <td className="n">{brlCurto(s.orcamentoLiderado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.semDona && <p className="text-xs text-amber-700 mt-2">Há etapas atrasadas ou retidas sem secretaria responsável definida. O prefeito ou o controlador define o responsável em “Secretarias e etapas”.</p>}
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Cartao titulo="Sem atualização" nota={`em execução há mais de ${DIAS_SEM_ATUALIZAR} dias sem registro`}>
          {d.semAtualizacao.length === 0 ? <p className="text-sm text-slate-500">Nenhum projeto parado de notícia.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.semAtualizacao.map(({ projeto, dias }) => (
                <li key={projeto.id} className="flex justify-between gap-3 py-1.5">
                  <span><Link href={ficha(projeto.id)} className="text-[#0f4c81] hover:underline">{projeto.titulo}</Link><span className="block text-xs text-slate-500">{coordenadora(projeto)}</span></span>
                  <b className="whitespace-nowrap">{dias} dias</b>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        <Cartao titulo="Riscos graves em aberto">
          {d.riscosGraves.length === 0 ? <p className="text-sm text-slate-500">Nenhum risco de gravidade alta em aberto.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.riscosGraves.map(({ projeto, risco }) => (
                <li key={risco.id} className="py-1.5">
                  <b>{risco.titulo}</b> <span className="text-xs text-slate-500">· {STATUS_RISCO[risco.status as StatusRisco]}</span>
                  <div className="text-xs"><Link href={`/dashboard/fazenda/projetos/${projeto.id}#riscos`} className="text-[#0f4c81] hover:underline">{projeto.titulo}</Link> · {risco.mitigacao ? `plano: ${risco.mitigacao}` : 'sem plano de resposta'}</div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}
