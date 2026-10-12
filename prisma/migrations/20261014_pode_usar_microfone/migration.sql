-- Por usuário: pode usar a pesquisa por pergunta / microfone do Painel de Gestão
ALTER TABLE "User" ADD COLUMN "podeUsarMicrofone" BOOLEAN NOT NULL DEFAULT true;
