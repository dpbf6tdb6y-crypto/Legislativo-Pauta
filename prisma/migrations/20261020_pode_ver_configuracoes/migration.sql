-- Por usuário: autorizado a entrar em Configurações (além do Master, que sempre entra). Pede a senha de login.
ALTER TABLE "User" ADD COLUMN "podeVerConfiguracoes" BOOLEAN NOT NULL DEFAULT false;
