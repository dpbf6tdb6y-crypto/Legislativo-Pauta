import Link from 'next/link';
import { exigir, usuarioDaSessao } from '@/lib/financas/auth';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import { TIPOS_DOC } from '@/lib/financas/documentos/fluxo';
import FormAcao, { Enviar } from '../FormAcao';
import { acaoEnviar } from '../acoes';

export default async function NovoDocumento() {
  const { s, db } = await exigir('documentos_enviar', 'Enviar documento');
  const u = (await usuarioDaSessao(s))!;
  const { orgaos } = await orgaosExecutivo(db, new Date());
  const minha = orgaos.find((o) => o.orgaoCod === u.orgaoCod);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Link href="/dashboard/fazenda/documentos" className="text-xs text-emerald-700 hover:underline">← documentos</Link>
        <h1 className="text-lg font-semibold">Enviar documento para assinatura</h1>
        <p className="text-sm text-slate-600">Assim que você enviar, o sistema confere o documento com os dados da última coleta (saldo, contrato, vigência, limite de pessoal). Depois o controlador ou o jurídico dá o parecer e o prefeito decide.</p>
      </div>
      <FormAcao acao={acaoEnviar} className="cartao grid gap-3 md:grid-cols-2 text-sm">
        <label>Tipo do documento
          <select name="tipo" required defaultValue="empenho" className="campo w-full mt-1">
            {Object.entries(TIPOS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Secretaria
          {u.perfil === 'secretaria'
            ? <div className="campo w-full mt-1 bg-slate-50">{minha ? `${minha.orgaoCod} · ${minha.orgaoNome}` : 'sem secretaria no cadastro'}</div>
            : (
              <select name="orgaoCod" required defaultValue="" className="campo w-full mt-1">
                <option value="" disabled>—</option>
                {orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
              </select>
            )}
        </label>
        <label className="md:col-span-2">Assunto (o que o prefeito vai assinar)
          <input name="assunto" required maxLength={200} placeholder="Ex.: Empenho para manutenção de ambulâncias, contrato 252/2025" className="campo w-full mt-1" />
        </label>
        <label>Valor (R$) <span className="text-slate-500">· na nomeação, a remuneração mensal</span>
          <input name="valor" inputMode="decimal" placeholder="150.000,00" className="campo w-full mt-1" />
        </label>
        <label>Data do ato<input name="dataAto" type="date" required defaultValue={hoje} className="campo w-full mt-1" /></label>
        <label>CNPJ/CPF do credor <span className="text-slate-500">(se houver)</span><input name="credorDoc" inputMode="numeric" className="campo w-full mt-1" /></label>
        <label>Nome do credor<input name="credorNome" maxLength={200} className="campo w-full mt-1" /></label>
        <label>Contrato (nº/ano) <span className="text-slate-500">(se houver)</span><input name="contrato" placeholder="252/2025" className="campo w-full mt-1" /></label>
        <label>Precisa ser assinado até<input name="prazo" type="date" className="campo w-full mt-1" /></label>
        <label className="md:col-span-2">Explicação para o prefeito
          <textarea name="descricao" rows={4} maxLength={4000} placeholder="Para que serve, por que agora, o que acontece se não for assinado" className="campo w-full mt-1" />
        </label>
        <label className="md:col-span-2">Arquivo do documento (PDF, até 15 MB cada; pode escolher mais de um)
          <input name="anexos" type="file" accept="application/pdf,.pdf" multiple className="block mt-1 text-sm" />
        </label>
        <div className="md:col-span-2"><Enviar>Enviar e conferir</Enviar></div>
      </FormAcao>
      <p className="text-xs text-slate-500">O PDF fica guardado com uma impressão digital (SHA-256). Na decisão do prefeito, o sistema registra exatamente quais arquivos estavam anexados.</p>
    </div>
  );
}
