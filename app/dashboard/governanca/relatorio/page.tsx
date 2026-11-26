// Relatório executivo para a reunião: a carteira em uma folha A4, com espaço para anotar cada deliberação.
// Só nomes e funções de contato; nenhum telefone ou e-mail. Não usa os números do portal (despesa e receita).
import { brl, brlCurto } from '@/lib/financas/dinheiro';
import { acessoProjetos } from '../../fazenda/(modulos)/projetos/acesso';
import BotaoImprimir from '../../fazenda/(modulos)/projetos/BotaoImprimir';
import { fmtData } from '../../fazenda/(modulos)/projetos/Selos';
import { ROTULO_FASE, ROTULO_SAUDE, type Fase } from '@/lib/financas/projetos/regras';
import { coordenadora, lerGovernanca } from '../leitura';

const PAGINA = `@page { size: A4; margin: 12mm 12mm 15mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; } }
@media print { aside, header.bg-white, nav { display: none !important; } html, body, main, div:has(main) { height: auto !important; overflow: visible !important; position: static !important; } div:has(> aside) { display: none !important; } main { padding: 0 2px !important; } body, .bg-gray-100 { background: white !important; } thead { display: table-header-group; } tr { break-inside: avoid; } h2 { break-after: avoid; } }`;

export default async function RelatorioDeReuniao() {
  const { db, ator, s } = await acessoProjetos('Governança · Relatório de reunião');
  const hoje = new Date();
  const d = await lerGovernanca(db, ator, hoje);
  const aDecidir = d.projetos.filter((p) => p.fase === 'ideia' || p.fase === 'estudo');
  const retidas = new Set(d.esperas.map((b) => b.etapa.id)).size;

  return (
    <div className="space-y-4 text-sm">
      <style>{PAGINA}</style>
      <BotaoImprimir voltar="/dashboard/governanca" />
      <article className="bg-white border border-slate-300 rounded-md p-6 max-w-[210mm] print:border-0 print:p-0 print:max-w-none space-y-4">
        <div className="border-b-2 border-slate-800 pb-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Prefeitura de Nova Lima · SEGOV.TECH</p>
          <h1 className="text-xl font-semibold">Relatório executivo de projetos</h1>
          <p className="text-xs text-slate-600">
            Emitido em {hoje.toLocaleString('pt-BR')} por {s.nome}. Escopo: {ator.verTodos ? 'todos os projetos da carteira' : 'projetos em que a secretaria do usuário participa'} ({d.projetos.length}). Dados do cadastro de projetos na data da emissão.
          </p>
        </div>

        <section>
          <h2 className="font-semibold mb-1">1. Síntese</h2>
          <table className="tabela text-xs">
            <thead><tr><th className="n">Em aberto</th><th className="n">Em execução</th><th className="n">Atrasados</th><th className="n">Atenção</th><th className="n">Etapas aguardando</th><th className="n">Orçamento ativo</th></tr></thead>
            <tbody><tr><td className="n">{d.abertos.length}</td><td className="n">{d.ind.emExecucao}</td><td className="n">{d.ind.atrasados}</td><td className="n">{d.ind.atencao}</td><td className="n">{retidas}</td><td className="n">{brl(d.ind.orcamentoAtivo)}</td></tr></tbody>
          </table>
        </section>

        <section>
          <h2 className="font-semibold mb-1">2. Projetos que pedem decisão</h2>
          {d.prioridades.length === 0 ? <p className="text-xs text-slate-500">Nenhum projeto atrasado ou em atenção.</p> : (
            <table className="tabela text-xs">
              <thead><tr><th>Projeto</th><th>Situação</th><th>Por quê e deliberação</th></tr></thead>
              <tbody>
                {d.prioridades.map((p) => (
                  <tr key={p.id}>
                    <td className="w-[32%]"><b>{p.titulo}</b><div className="text-slate-600">{coordenadora(p)}{p.orcamento !== null ? ` · ${brlCurto(p.orcamento)}` : ''}</div></td>
                    <td className="w-[16%]"><b>{p.saude === 'atrasado' ? '■ ' : '▲ '}{ROTULO_SAUDE[p.saude]}</b><div className="text-slate-600">{p.avanco === null ? 'sem etapas' : `avanço ${p.avanco}%`}</div></td>
                    <td>{p.motivos.join('; ')}<div className="mt-1 pb-4 border-b border-dotted border-slate-500 text-slate-500">Deliberação:</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-1">3. Quem está esperando por quem</h2>
          {d.esperas.length === 0 ? <p className="text-xs text-slate-500">Nenhuma etapa retida por outra.</p> : (
            <table className="tabela text-xs">
              <thead><tr><th>Projeto</th><th>Quem espera</th><th>Está esperando</th><th>Causa</th></tr></thead>
              <tbody>
                {d.esperas.map((b) => (
                  <tr key={`${b.etapa.id}-${b.causa.id}`}>
                    <td>{b.titulo}</td>
                    <td><b>{d.nomeDe(b.etapa.orgaoCod)}</b><div>{b.etapa.titulo}</div></td>
                    <td><b>{d.nomeDe(b.causa.orgaoCod)}</b><div>{b.causa.titulo}</div></td>
                    <td>{b.diasVencida ? `vencida há ${b.diasVencida} dia(s)` : `prazo em ${fmtData(b.causa.fimPrevisto)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-1">4. Secretarias</h2>
          {d.secretarias.length === 0 ? <p className="text-xs text-slate-500">Sem projetos em aberto.</p> : (
            <table className="tabela text-xs">
              <thead><tr><th>Secretaria</th><th className="n">Coordena</th><th className="n">Participa</th><th className="n">Projetos atrasados</th><th className="n">Etapas atrasadas</th><th className="n">Retendo outras</th></tr></thead>
              <tbody>{d.secretarias.map((x) => <tr key={x.orgaoCod}><td>{x.orgaoNome}</td><td className="n">{x.lidera}</td><td className="n">{x.parceira}</td><td className="n">{x.atrasados}</td><td className="n">{x.etapas.atrasadas}</td><td className="n">{x.etapas.retendo}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-1">5. Aguardando aprovação</h2>
          {aDecidir.length === 0 ? <p className="text-xs text-slate-500">Nenhuma ideia ou estudo aguardando decisão.</p> : (
            <ul className="text-xs list-disc pl-5">{aDecidir.map((p) => <li key={p.id}><b>{p.titulo}</b> · {ROTULO_FASE[p.fase as Fase]} · {coordenadora(p)}{p.orcamento !== null ? ` · ${brlCurto(p.orcamento)}` : ' · sem orçamento'}</li>)}</ul>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-1">6. Riscos graves em aberto</h2>
          {d.riscosGraves.length === 0 ? <p className="text-xs text-slate-500">Nenhum.</p> : (
            <ul className="text-xs list-disc pl-5">{d.riscosGraves.map(({ projeto, risco }) => <li key={risco.id}><b>{risco.titulo}</b> ({projeto.titulo}) · {risco.mitigacao ? `plano: ${risco.mitigacao}` : 'sem plano'}</li>)}</ul>
          )}
        </section>
      </article>
    </div>
  );
}
