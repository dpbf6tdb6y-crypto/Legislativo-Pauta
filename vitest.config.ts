import { defineConfig } from 'vitest/config'
import os from 'os'
import path from 'path'

// Testes da Gestão $$$ que usam banco (*.db.test.ts): só com FIN_TESTE_BANCO=1 e um DATABASE_URL de TESTE
// (o CI sobe um Postgres vazio). Nunca rodar com o banco da produção.
const comBanco = process.env.FIN_TESTE_BANCO === '1'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    exclude: ['**/node_modules/**', '**/.next/**', ...(comBanco ? [] : ['**/*.db.test.ts'])],
    // o banco de teste é um só: arquivos em sequência
    fileParallelism: !comBanco,
    testTimeout: 120000,
    hookTimeout: 120000,
    env: { FIN_DADOS_DIR: path.join(os.tmpdir(), `fin-teste-${process.pid}`) },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
