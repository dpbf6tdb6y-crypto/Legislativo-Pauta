import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getUsuarioIndicacoes() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user || !user.ativo) return null;

  const autorizado = user.perfil === "master" || user.podeVerIndicacoes;
  if (!autorizado) return null;

  return user;
}
