-- Cargo no gabinete (Prefeito, Vice-Prefeito, Assessor de Governança), usado na aba Governança.
-- Só acrescenta uma coluna opcional: os usuários existentes não mudam.
ALTER TABLE "User" ADD COLUMN "cargo" TEXT;
