-- Adiciona colunas de setor atual e protocolo (importação de planilha), aditivo e sem risco de perda de dados
ALTER TABLE "Proposicao" ADD COLUMN "setorAtual" TEXT;
ALTER TABLE "Proposicao" ADD COLUMN "protocolo" TEXT;

ALTER TABLE "Segov" ADD COLUMN "setorAtual" TEXT;
ALTER TABLE "Segov" ADD COLUMN "protocolo" TEXT;
