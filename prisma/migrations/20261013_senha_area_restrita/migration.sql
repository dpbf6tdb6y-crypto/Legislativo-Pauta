-- Por usuário: exigir ou não a senha ao entrar na área restrita (Ind.)
ALTER TABLE "User" ADD COLUMN "senhaAreaRestrita" BOOLEAN NOT NULL DEFAULT true;
