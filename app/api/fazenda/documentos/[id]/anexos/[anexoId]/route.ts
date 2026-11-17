// Entrega o PDF anexado. Exige login ativo, permissão e que o documento esteja entre os que o usuário pode ver.
// Cada abertura fica no registro de acessos.
import { NextResponse } from 'next/server';
import { registrar, sessaoAtual, usuarioDaSessao } from '@/lib/financas/auth';
import { dbDa } from '@/lib/financas/db';
import { pode } from '@/lib/financas/perfis';
import { filtroVisivel } from '@/lib/financas/documentos/fluxo';
import { lerAnexo } from '@/lib/financas/documentos/anexos';

export const dynamic = 'force-dynamic';
const nada = () => new NextResponse('Não encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_: Request, { params }: { params: { id: string; anexoId: string } }) {
  const s = await sessaoAtual();
  if (!s) return new NextResponse('Não autorizado', { status: 401 });
  const u = await usuarioDaSessao(s);
  const veTudo = pode(s.perfil, 'documentos');
  if (!u || u.trocarSenha || (!veTudo && !pode(s.perfil, 'documentos_enviar'))) return new NextResponse('Sem permissão', { status: 403 });

  const db = dbDa(s.prefeituraId);
  const doc = await db.documentoAssinatura.findFirst({
    where: { id: Number(params.id) || 0, ...filtroVisivel({ id: u.id, nome: u.nome, perfil: u.perfil, orgaoCod: u.orgaoCod }, veTudo) },
    select: { id: true },
  });
  if (!doc) return nada();
  const a = await db.anexoDocumento.findFirst({ where: { id: Number(params.anexoId) || 0, documentoId: doc.id, removidoEm: null } });
  if (!a) return nada();

  let buf: Buffer;
  try { buf = lerAnexo(s.prefeituraId, a); } catch { return new NextResponse('Arquivo indisponível ou alterado', { status: 410, headers: { 'Cache-Control': 'no-store' } }); }
  await registrar(s, 'ver', 'Documento para assinar', `anexo #${a.id} do documento #${doc.id}`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="documento-${doc.id}-anexo-${a.id}.pdf"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
