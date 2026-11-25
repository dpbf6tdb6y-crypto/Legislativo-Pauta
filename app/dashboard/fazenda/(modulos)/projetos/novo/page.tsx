import Link from 'next/link';
import { redirect } from 'next/navigation';
import { orgaosExecutivo } from '@/lib/financas/auditoria/dados';
import FormAcao, { Enviar } from '../../documentos/FormAcao';
import { acessoProjetos } from '../acesso';
import { acaoCriarProjeto } from '../acoes';
import CamposProjeto from '../CamposProjeto';

export default async function NovoProjeto() {
  const { db, ator } = await acessoProjetos('Novo projeto');
  if (!ator.gerir && !(ator.secretaria && ator.orgaoCod)) redirect('/dashboard/fazenda/projetos');
  const { orgaos } = await orgaosExecutivo(db, new Date());
  const minha = orgaos.find((o) => o.orgaoCod === ator.orgaoCod);
  const nomeCurto = (n: string) => n.replace(/^SECRETARIA MUNICIPAL DE /i, '');

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <Link href="/dashboard/fazenda/projetos" className="text-xs text-[#0f4c81] hover:underline">← projetos</Link>
        <h1 className="text-lg font-semibold">Novo projeto</h1>
        <p className="text-sm text-slate-600">
          O projeto nasce como <b>ideia</b>. Depois você inclui as etapas e, quando o prefeito aprovar, ele passa a ter prazo e semáforo.
          Se outra secretaria participa, marque-a como parceira: o projeto aparece no cronograma das duas.
        </p>
      </div>
      <FormAcao acao={acaoCriarProjeto} className="cartao grid gap-3 md:grid-cols-2 text-sm">
        <label>Secretaria líder
          {ator.gerir
            ? (
              <select name="secretariaLider" required defaultValue="" className="campo w-full mt-1">
                <option value="" disabled>—</option>
                {orgaos.map((o) => <option key={o.orgaoCod} value={o.orgaoCod}>{o.orgaoCod} · {o.orgaoNome}</option>)}
              </select>
            )
            : <div className="campo w-full mt-1 bg-slate-50">{minha ? `${minha.orgaoCod} · ${minha.orgaoNome}` : 'sem secretaria no cadastro'}</div>}
        </label>
        <label>Quem responde pelo projeto na secretaria líder
          <input name="responsavel" maxLength={120} placeholder="Nome e cargo" className="campo w-full mt-1" />
        </label>
        <CamposProjeto />
        <fieldset className="md:col-span-2">
          <legend>Em conjunto com outras secretarias <span className="text-slate-500">(opcional)</span></legend>
          <div className="mt-1 max-h-44 overflow-y-auto border border-slate-300 rounded-md p-2 grid gap-1 sm:grid-cols-2 bg-white">
            {orgaos.filter((o) => o.orgaoCod !== ator.orgaoCod).map((o) => (
              <label key={o.orgaoCod} className="flex items-center gap-2 text-sm"><input type="checkbox" name="parceiras" value={o.orgaoCod} />{nomeCurto(o.orgaoNome)}</label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Se escolher a mesma secretaria da líder, ela é ignorada. Dá para incluir ou tirar parceiras depois, na ficha do projeto.</p>
        </fieldset>
        <div className="md:col-span-2"><Enviar>Cadastrar projeto</Enviar></div>
      </FormAcao>
    </div>
  );
}
