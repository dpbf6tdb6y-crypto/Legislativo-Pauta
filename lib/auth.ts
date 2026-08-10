import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.senha) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.ativo) return null;
        const ok = await bcrypt.compare(credentials.senha, user.senha);
        if (!ok) return null;
        return {
          id: user.id, name: user.nome, email: user.email, perfil: user.perfil,
          podeVerIndicacoes: user.podeVerIndicacoes,
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
        token.podeCriar = u.podeCriar;
        token.podeEditar = u.podeEditar;
        token.podeExcluir = u.podeExcluir;
        token.podeImportar = u.podeImportar;
        token.podeExportar = u.podeExportar;
        token.podeGerenciarVereadores = u.podeGerenciarVereadores;
        token.podeVerAuditoria = u.podeVerAuditoria;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const su = session.user as any;
        su.id = token.id as string;
        su.perfil = token.perfil;
        su.podeVerIndicacoes = token.podeVerIndicacoes;
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
