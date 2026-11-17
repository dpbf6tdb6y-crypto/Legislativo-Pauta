import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigir, usuarioDaSessao } from '@/lib/financas/auth';
import { brl } from '@/lib/financas/dinheiro';
import { pode } from '@/lib/financas/perfis';
import { filtroVisivel, lerChecagens, PARECERES, prazoTexto, ROTULO_STATUS_DOC, semaforo, TIPOS_DOC, type StatusDoc } from '@/lib/financas/documentos/fluxo';
import BolaSemaforo, { COR_SEMAFORO } from '../Semaforo';
import FormAcao, { Enviar } from '../FormAcao';
import { acaoAnexar, acaoCancelar, acaoDecidir, acaoParecer, acaoReconferir, acaoRetirarAnexo } from '../acoes';

const COR_CH = { ok: 'bg-emerald-100 text-emerald-900', atencao: 'bg-amber-100 text-amber-900', sem_dado: 'bg-slate-100 text-slate-700' };
const ROT_CH = { ok: 'ok', atencao: 'atenção', sem_dado: 'sem dado' };
const ROT_EV: Record<string, string> = { anexo: 'Anexo', enviado: 'Enviado', conferido: 'Conferência', parecer: 'Parecer', assinado: 'Assinado', devolvido: 'Devolvido', cancelado: 'Retirado', nota: 'Nota' };
const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—');

export default async function Documento({ params }: { params: { id: string } }) {
  const { s, db } = await exigir(null, 'Documento para assinar', { detalhe: `#${params.id}` });
  const u = (await usuarioDaSessao(s))!;
  const veTudo = pode(s.perfil, 'documentos');
  if (!veTudo && !pode(s.perfil, 'documentos_enviar')) notFound();
  const d = await db.documentoAssinatura.findFirst({
    where: { id: Number(params.id) || 0, ...filtroVisivel({ id: u.id, nome: u.nome, perfil: u.perfil, orgaoCod: u.orgaoCod }, veTudo) },
    include: { eventos: { orderBy: { quando: 'asc' } }, anexos: { where: { removidoEm: null }, orderBy: { id: 'asc' } } },
  });
  if (!d) notFound();

  const ch = lerChecagens(d.checagens);
  const sem = semaforo({ parecer: d.parecer, checagens: ch });
  const c = COR_SEMAFORO[sem.cor];
  const aberto = d.status === 'em_conferencia' || d.status === 'para_assinatura';
  const podeParecer = aberto && pode(s.perfil, 'documentos_parecer');
  const podeDecidir = aberto && pode(s.perfil, 'documentos_decidir');
  const podeReconferir = aberto && (pode(s.perfil, 'documentos_enviar') || pode(s.perfil, 'documentos_parecer'));
  const podeRetirar = aberto && (d.enviadoPorId === u.id || pode(s.perfil, 'documentos_parecer'));
  const pz = aberto ? prazoTexto(d.prazo, new Date()) : '';

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/dashboard/fazenda/documentos" className="text-xs text-emerald-700 hover:underline">← documentos</Link>

      {/* ---------- a resposta para o prefeito, em primeiro lugar ---------- */}
      {aberto ? (
        <section className={`rounded-lg border-2 p-4 flex gap-4 items-center ${c.fundo} ${c.borda}`}>
          <BolaSemaforo cor={sem.cor} grande />
          <div>
            <div className={`text-2xl font-bold ${c.texto}`}>{c.rotulo}</div>
            <div className="text-[15px]">{sem.frase}</div>
            {pz && <div className={`text-sm font-semibold mt-1 ${pz.startsWith('prazo vencido') || pz === 'assinar hoje' ? 'text-red-700' : ''}`}>{pz}</div>}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4">
          <div className="text-xl font-bold">{ROTULO_STATUS_DOC[d.status as StatusDoc]}{d.decisaoPor ? ` por ${d.decisaoPor}` : ''}{d.decisaoEm ? ` em ${d.decisaoEm.toLocaleString('pt-BR')}` : ''}</div>
          {d.decisaoTexto && <p className="text-[15px] mt-1">{d.decisaoTexto}</p>}
        </section>
      )}

      {/* ---------- o documento ---------- */}
      <section className="cartao">
        <div className="text-xs text-slate-500">#{d.id} · {TIPOS_DOC[d.tipo] ?? d.tipo} · enviado por {d.enviadoPor} em {d.enviadoEm.toLocaleString('pt-BR')}</div>
        <h1 className="text-xl font-semibold">{d.assunto}</h1>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm mt-2">
          <div><dt className="inline text-slate-500">Valor: </dt><dd className="inline font-semibold">{brl(d.valor)}{d.tipo === 'nomeacao' ? ' por mês' : ''}</dd></div>
          <div><dt className="inline text-slate-500">Secretaria: </dt><dd className="inline">{d.orgaoCod} · {d.orgaoNome}</dd></div>
          <div><dt className="inline text-slate-500">Data do ato: </dt><dd className="inline">{fmt(d.dataAto)}</dd></div>
          {d.prazo && <div><dt className="inline text-slate-500">Assinar até: </dt><dd className="inline">{fmt(d.prazo)}</dd></div>}
          {(d.credorNome || d.credorDoc) && <div><dt className="inline text-slate-500">Credor: </dt><dd className="inline">{d.credorNome}{d.credorDoc ? ` (${d.credorDoc})` : ''}</dd></div>}
          {d.contrato && <div><dt className="inline text-slate-500">Contrato: </dt><dd className="inline">{d.contrato}</dd></div>}
        </dl>
        {d.descricao && <p className="text-[15px] mt-3 whitespace-pre-wrap">{d.descricao}</p>}
      </section>

      {/* ---------- o PDF do documento ---------- */}
      <section className="cartao">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <h2 className="font-semibold mr-auto">Arquivo do documento</h2>
          {d.anexos.length > 0 && <span className="text-xs text-slate-500">{d.anexos.length} arquivo(s)</span>}
        </div>
        {d.anexos.length === 0 && <p className="text-sm text-slate-500">Nenhum PDF anexado. {aberto ? 'Peça à secretaria o arquivo antes de assinar.' : ''}</p>}
        <ul className="space-y-1 text-sm">
          {d.anexos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <a href={`/api/fazenda/documentos/${d.id}/anexos/${a.id}`} target="_blank" rel="noopener" className="text-emerald-700 hover:underline font-medium">📄 {a.nome}</a>
              <span className="text-xs text-slate-500" title={`SHA-256 ${a.sha256}`}>{(a.bytes / 1024).toFixed(0)} KB · {a.enviadoPor} · {a.enviadoEm.toLocaleString('pt-BR')}</span>
              {podeRetirar && (
                <FormAcao acao={acaoRetirarAnexo} className="inline">
                  <input type="hidden" name="id" value={d.id} /><input type="hidden" name="anexoId" value={a.id} />
                  <Enviar className="text-xs text-slate-500 hover:text-red-700 hover:underline">retirar</Enviar>
                </FormAcao>
              )}
            </li>
          ))}
        </ul>
        {d.anexos[0] && (
          <iframe src={`/api/fazenda/documentos/${d.id}/anexos/${d.anexos[0].id}#view=FitH`} title={`PDF: ${d.anexos[0].nome}`} className="w-full h-[70vh] mt-3 rounded border border-slate-200" />
        )}
        {podeReconferir && (
          <FormAcao acao={acaoAnexar} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="id" value={d.id} />
            <input name="anexos" type="file" accept="application/pdf,.pdf" multiple required className="text-sm" />
            <Enviar className="btn-sec">Anexar PDF</Enviar>
          </FormAcao>
        )}
      </section>

      {/* ---------- conferência automática ---------- */}
      <section className="cartao">
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <h2 className="font-semibold mr-auto">Conferência automática</h2>
          <span className="text-xs text-slate-500">feita em {d.checadoEm.toLocaleString('pt-BR')} · {d.dadosDe}</span>
          {podeReconferir && (
            <FormAcao acao={acaoReconferir}><input type="hidden" name="id" value={d.id} /><Enviar className="btn-sec text-xs py-1">conferir de novo</Enviar></FormAcao>
          )}
        </div>
        <ul className="space-y-2">
          {ch.map((x, i) => (
            <li key={i} className="border-b border-slate-100 pb-2">
              <span className={`selo ${COR_CH[x.resultado]} mr-2`}>{ROT_CH[x.resultado]}</span><b>{x.item}</b>
              <div className="text-sm">{x.detalhe}</div>
              <div className="text-xs text-slate-500">Base: {x.base}</div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-2">A conferência mostra o que os dados públicos indicam; não é parecer. Ela nunca marca vermelho sozinha: isso cabe ao parecer.</p>
      </section>

      {/* ---------- parecer ---------- */}
      <section className="cartao">
        <h2 className="font-semibold mb-1">Parecer do controlador ou do jurídico</h2>
        {d.parecer
          ? <p className="text-[15px]"><b>{PARECERES[d.parecer]}</b> · {d.parecerPor} em {d.parecerEm?.toLocaleString('pt-BR')}{d.parecerTexto ? <><br />{d.parecerTexto}</> : ''}</p>
          : <p className="text-sm text-slate-500">Ainda sem parecer.</p>}
        {podeParecer && (
          <FormAcao acao={acaoParecer} className="mt-3 space-y-2 text-sm">
            <input type="hidden" name="id" value={d.id} />
            <div className="flex flex-wrap gap-4">
              {Object.entries(PARECERES).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1"><input type="radio" name="parecer" value={k} required defaultChecked={d.parecer === k} /> {v}</label>
              ))}
            </div>
            <textarea name="texto" rows={3} placeholder="Fundamento do parecer (obrigatório na ressalva e no &quot;não assinar&quot;)" className="campo w-full" />
            <Enviar>{d.parecer ? 'Refazer parecer' : 'Registrar parecer'}</Enviar>
          </FormAcao>
        )}
      </section>

      {/* ---------- decisão do prefeito ---------- */}
      {podeDecidir && (
        <section className={`rounded-lg border-2 p-4 ${c.borda} bg-white`}>
          <h2 className="font-semibold mb-1">Sua decisão</h2>
          <p className="text-sm text-slate-600 mb-2">
            Ao decidir, o sistema registra o que estava nesta tela: o semáforo, o parecer e os pontos de atenção.
            {sem.cor !== 'verde' && ' Como o semáforo não está verde, para assinar é preciso escrever a justificativa.'}
            {d.anexos.length === 0 && <b className="text-red-700"> Não há PDF anexado: para assinar, escreva a justificativa.</b>}
          </p>
          <FormAcao acao={acaoDecidir} className="space-y-2 text-sm">
            <input type="hidden" name="id" value={d.id} />
            <textarea name="texto" rows={3} placeholder={sem.cor === 'verde' ? 'Observação (opcional para assinar; obrigatória para devolver)' : 'Justificativa (obrigatória)'} className="campo w-full" />
            <div className="flex flex-wrap gap-2">
              <Enviar className="btn text-base px-5" name="decisao" value="assinado">Assinei</Enviar>
              <Enviar className="btn-sec text-base px-5" name="decisao" value="devolvido">Devolver à secretaria</Enviar>
            </div>
          </FormAcao>
        </section>
      )}

      {podeRetirar && (
        <details className="cartao">
          <summary className="cursor-pointer text-sm text-emerald-700">Retirar o documento da fila</summary>
          <FormAcao acao={acaoCancelar} className="mt-2 space-y-2 text-sm">
            <input type="hidden" name="id" value={d.id} />
            <input name="motivo" required placeholder="Motivo" className="campo w-full" />
            <Enviar className="btn-sec">Retirar</Enviar>
          </FormAcao>
        </details>
      )}

      {/* ---------- histórico ---------- */}
      <section className="cartao">
        <h2 className="font-semibold mb-2">Histórico</h2>
        <ol className="border-l-2 border-slate-200 pl-3 space-y-1.5">
          {d.eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-xs text-slate-500">{e.quando.toLocaleString('pt-BR')} · {e.por}</span>
              <div><b>{ROT_EV[e.tipo] ?? e.tipo}:</b> {e.texto}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
