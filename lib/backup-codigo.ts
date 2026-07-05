import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import archiver from "archiver";
import { enviarCodigoFonte } from "@/lib/email";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();

// Fallback usado apenas se `git ls-files` não estiver disponível em produção.
const DENYLIST_DIRS = new Set(["node_modules", ".git", ".next", "coverage"]);
const DENYLIST_FILE_PATTERNS = [/^\.env/, /\.tsbuildinfo$/, /\.db(-journal)?$/];

function listarArquivosFallback(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (DENYLIST_DIRS.has(entry.name)) continue;
      listarArquivosFallback(path.join(dir, entry.name), base, out);
    } else {
      if (DENYLIST_FILE_PATTERNS.some((re) => re.test(entry.name))) continue;
      out.push(path.relative(base, path.join(dir, entry.name)));
    }
  }
  return out;
}

async function listarArquivosVersionados(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 20,
    });
    const arquivos = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    if (arquivos.length === 0) throw new Error("git ls-files retornou vazio");
    return arquivos;
  } catch {
    return listarArquivosFallback(PROJECT_ROOT);
  }
}

export async function gerarZipCodigoFonte(): Promise<Buffer> {
  const arquivos = await listarArquivosVersionados();

  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", (err: any) => { if (err.code !== "ENOENT") reject(err); });
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const relPath of arquivos) {
      const abs = path.join(PROJECT_ROOT, relPath);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        archive.file(abs, { name: relPath });
      }
    }
    archive.finalize();
  });
}

export async function enviarCodigoFonteEmail(destino: string) {
  const buffer = await gerarZipCodigoFonte();
  const dataStr = new Date().toISOString().split("T")[0];
  await enviarCodigoFonte({
    para: destino,
    buffer,
    nomeArquivo: `legislativo-pauta-codigo-fonte_${dataStr}.zip`,
  });
}
