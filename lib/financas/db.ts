// Acesso ao banco para os dados financeiros (tabelas fin_*).
// Mesmo cliente Prisma do SEGOV; o "dbDa" prende toda consulta a UMA prefeitura e
// só libera as tabelas financeiras (as do SEGOV continuam pelo `prisma` normal).
import { prisma } from '@/lib/prisma';

export const prismaSistema = prisma;

/** A prefeitura acompanhada (única, por enquanto). */
export const PREFEITURA_PADRAO = 'nova-lima';

const MODELOS_FINANCEIROS = new Set([
  'Coleta', 'ArquivoBruto', 'DespesaOrgaoMes', 'DespesaNaturezaMes', 'DespesaFuncaoMes', 'ConferenciaOficial', 'Empenho', 'Liquidacao', 'Pagamento', 'RetencaoLeitura',
  'Retencao', 'RestoPagar', 'Contrato', 'LigacaoContratoEmpenho', 'ReceitaContaMes',
  'RegistroAcesso', 'Chave', 'ChaveHistorico', 'FolhaMes', 'FolhaLinha', 'IndicadorFiscal', 'Regra', 'Apontamento',
  'ResponsavelSecretaria', 'PontoAuditoria', 'EventoAuditoria', 'ReuniaoSecretaria',
  'DocumentoAssinatura', 'EventoDocumento', 'AnexoDocumento', 'RelatorioAuditoria',
]);
const LEITURA_ESCRITA_EM_MASSA = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany',
]);

/**
 * Cliente preso a UMA prefeitura. Toda consulta recebe `prefeituraId` à força,
 * mesmo que o código esqueça.
 */
export function dbDa(prefeituraId: string) {
  if (!prefeituraId) throw new Error('prefeituraId obrigatório');
  return prismaSistema.$extends({
    name: 'isolamento-prefeitura',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELOS_FINANCEIROS.has(model)) {
            throw new Error(`Acesso a ${model} não é permitido pelo cliente de uma prefeitura`);
          }
          const a = (args ?? {}) as Record<string, any>;
          if (LEITURA_ESCRITA_EM_MASSA.has(operation)) {
            a.where = { AND: [a.where ?? {}, { prefeituraId }] };
            if (operation === 'updateMany' && a.data && 'prefeituraId' in a.data) delete a.data.prefeituraId;
          } else if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            // a chave única pode não conter prefeituraId: confere depois de buscar (só leitura)
            const r = await query(a);
            if (r && (r as any).prefeituraId !== prefeituraId) {
              if (operation === 'findUnique') return null;
              throw new Error('Registro de outra prefeitura');
            }
            return r;
          } else if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
            // confere ANTES de alterar
            const delegado = (prismaSistema as any)[model.charAt(0).toLowerCase() + model.slice(1)];
            const atual = await delegado.findUnique({ where: a.where, select: { prefeituraId: true } });
            if (atual && atual.prefeituraId !== prefeituraId) throw new Error('Registro de outra prefeitura');
            if (operation === 'upsert') {
              a.create = { ...a.create, prefeituraId };
              if (a.update && 'prefeituraId' in a.update) delete a.update.prefeituraId;
            }
            if (operation === 'update' && a.data && 'prefeituraId' in a.data) delete a.data.prefeituraId;
          } else if (operation === 'create') {
            a.data = { ...a.data, prefeituraId };
          } else if (operation === 'createMany') {
            const d = Array.isArray(a.data) ? a.data : [a.data];
            a.data = d.map((x: any) => ({ ...x, prefeituraId }));
          } else {
            throw new Error(`Operação ${operation} não liberada no cliente da prefeitura`);
          }
          return query(a);
        },
      },
    },
  });
}
export type DbPrefeitura = ReturnType<typeof dbDa>;
