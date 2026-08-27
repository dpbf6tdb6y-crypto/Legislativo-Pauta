# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
ENV DOCKER_BUILD=1
# Trava o heap do build — evita que o "next build" derrube a VPS inteira
# por consumo de memória sem limite (mesmo problema já visto no projeto
# gavix.tech em 23/07/2026).
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl postgresql-client wget
ENV NODE_ENV=production
ENV PORT=3000
# O server.js standalone do Next.js usa HOSTNAME pra decidir onde escutar;
# sem isso ele só escuta no IP interno do container, quebrando o HEALTHCHECK
# abaixo (que fala com o app de dentro do próprio container).
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# node_modules completo (não só o standalone) — "prisma migrate deploy" em
# runtime precisa do CLI do Prisma, que a árvore podada do standalone não inclui.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
