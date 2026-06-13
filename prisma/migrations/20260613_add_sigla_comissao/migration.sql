ALTER TABLE "Comissao" ADD COLUMN "sigla" TEXT;

UPDATE "Comissao" SET "sigla" = 'CLJ'  WHERE "nome" LIKE '%Legislação e Justiça%';
UPDATE "Comissao" SET "sigla" = 'SPM'  WHERE "nome" LIKE '%Serviços Públicos Municipais%';
UPDATE "Comissao" SET "sigla" = 'OFTC' WHERE "nome" LIKE '%Orçamento%';
UPDATE "Comissao" SET "sigla" = 'MA'   WHERE "nome" LIKE '%Meio Ambiente%';
UPDATE "Comissao" SET "sigla" = 'DH'   WHERE "nome" LIKE '%Direitos Humanos%';
UPDATE "Comissao" SET "sigla" = 'PP'   WHERE "nome" LIKE '%Participação Popular%';
UPDATE "Comissao" SET "sigla" = 'SPTT' WHERE "nome" LIKE '%Segurança Pública%';
UPDATE "Comissao" SET "sigla" = 'SP'   WHERE "nome" LIKE '%Saúde Pública%';
UPDATE "Comissao" SET "sigla" = 'CE'   WHERE "nome" LIKE '%Educação%';
UPDATE "Comissao" SET "sigla" = 'CR'   WHERE "nome" LIKE '%Redação%';
