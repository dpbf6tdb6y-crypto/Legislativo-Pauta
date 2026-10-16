import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.senha) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.ativo) return null;
        const ok = await bcrypt.compare(credentials.senha, user.senha);
        if (!ok) return null;
        // registra a entrada (usuário, aparelho e endereço) — consulta direta, fora da tela de Auditoria
        const h = (req as any)?.headers || {};
        await registrarAuditoria({
          acao: "login", entidade: "Acesso", referencia: "Login",
          detalhes: { ip: String(h["x-forwarded-for"] || "").split(",")[0].trim(), aparelho: String(h["user-agent"] || "").slice(0, 160) },
          usuarioId: user.id, usuarioNome: user.nome,
        });
        return {
          id: user.id, name: user.nome, email: user.email, perfil: user.perfil,
          podeVerIndicacoes: user.podeVerIndicacoes,
          acessos: user.acessos, fluxoResumido: user.fluxoResumido, senhaAreaRestrita: user.senhaAreaRestrita, podeUsarMicrofone: user.podeUsarMicrofone,
          podeCriar: user.podeCriar, podeEditar: user.podeEditar, podeExcluir: user.podeExcluir,
          podeImportar: user.podeImportar, podeExportar: user.podeExportar,
          podeGerenciarVereadores: user.podeGerenciarVereadores, podeVerAuditoria: user.podeVerAuditoria,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.perfil = u.perfil;
        token.podeVerIndicacoes = u.podeVerIndicacoes;
        token.acessos = u.acessos ?? null;
        token.fluxoResumido = !!u.fluxoResumido;
        token.senhaAreaRestrita = u.senhaAreaRestrita !== false;
        token.podeUsarMicrofone = u.podeUsarMicrofone !== false;
        token.podeCriar = u.podeCriar;
        token.podeEditar = u.podeEditar;
        token.podeExcluir = u.podeExcluir;
        token.podeImportar = u.podeImportar;
        token.podeExportar = u.podeExportar;
        token.podeGerenciarVereadores = u.podeGerenciarVereadores;
        token.podeVerAuditoria = u.podeVerAuditoria;
        token.invalido = false;
        token.checadoEm = Date.now();
      } else if (token.id && (!token.checadoEm || Date.now() - (token.checadoEm as number) > 20000)) {
        // usuário inativado (ou excluído) perde o acesso mesmo com a sessão ainda aberta
        try {
          const u = await prisma.user.findUnique({ where: { id: token.id as string }, select: { ativo: true } });
          token.invalido = !u || !u.ativo;
          token.checadoEm = Date.now();
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token.invalido) return {} as any; // sessão encerrada: getServerSession passa a devolver null
      if (session.user) {
        const su = session.user as any;
        su.id = token.id as string;
        su.perfil = token.perfil;
        su.podeVerIndicacoes = token.podeVerIndicacoes;
        su.acessos = token.acessos ?? null;
        su.fluxoResumido = !!token.fluxoResumido;
        su.senhaAreaRestrita = token.senhaAreaRestrita !== false;
        su.podeUsarMicrofone = token.podeUsarMicrofone !== false;
        su.podeCriar = token.podeCriar;
        su.podeEditar = token.podeEditar;
        su.podeExcluir = token.podeExcluir;
        su.podeImportar = token.podeImportar;
        su.podeExportar = token.podeExportar;
        su.podeGerenciarVereadores = token.podeGerenciarVereadores;
        su.podeVerAuditoria = token.podeVerAuditoria;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
