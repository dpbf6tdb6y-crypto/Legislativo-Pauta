import { prisma } from "@/lib/prisma";

interface LogParams {
  acao: string;
  entidade: string;
  entidadeId?: string;
  referencia?: string;
  detalhes?: Record<string, any>;
  usuarioId?: string;
  usuarioNome?: string;
}

export async function registrarAuditoria(params: LogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        acao: params.acao,
        entidade: params.entidade,
        entidadeId: params.entidadeId ?? null,
        referencia: params.referencia ?? null,
        detalhes: params.detalhes ? JSON.stringify(params.detalhes) : null,
        usuarioId: params.usuarioId ?? null,
        usuarioNome: params.usuarioNome ?? null,
      },
    });
  } catch {
    // Nunca deixar falha de log quebrar a operação principal
  }
}
