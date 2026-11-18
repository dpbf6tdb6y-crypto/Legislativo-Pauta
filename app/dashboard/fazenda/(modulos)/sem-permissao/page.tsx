export default function SemPermissao({ searchParams }: { searchParams: { motivo?: string } }) {
  return (
    <div className="cartao">
      <h1 className="font-semibold">Sem permissão</h1>
      {searchParams.motivo === 'perfil' ? (
        <p className="text-sm text-slate-600">
          Seu usuário ainda não tem um perfil do Compliance (prefeito, controlador, financeiro, RH, jurídico, auditor ou secretaria).
          Peça ao Master para escolher o perfil no seu cadastro de usuário.
        </p>
      ) : (
        <p className="text-sm text-slate-600">Seu perfil do Compliance não dá acesso a esta tela.</p>
      )}
    </div>
  );
}
