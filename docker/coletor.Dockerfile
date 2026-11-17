# syntax=docker/dockerfile:1
# Coletor da Gestão $$$: lê o Portal da Transparência com navegador automático (Playwright).
# Imagem separada do app: o Chromium não entra na imagem do SEGOV, e o contêiner só existe
# enquanto a coleta roda (docker compose run --rm). A versão da imagem acompanha o pacote
# "playwright" do package.json (mesmo número, senão o navegador não bate).
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV PLAYWRIGHT_CANAL=chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    FIN_DADOS_DIR=/dados

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

COPY tsconfig.json ./
COPY lib ./lib
COPY scripts/financas ./scripts/financas

CMD ["npx", "tsx", "scripts/financas/coletar.ts"]
