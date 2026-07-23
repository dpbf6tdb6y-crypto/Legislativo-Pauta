import { enviarEmail } from "@/lib/gmail";

export async function enviarResetSenha({
  para,
  nome,
  token,
  baseUrl,
}: {
  para: string;
  nome: string;
  token: string;
  baseUrl: string;
}) {
  const link = `${baseUrl}/redefinir-senha/${token}`;

  await enviarEmail({
    to: para,
    subject: "Redefinição de senha — SEGOV.TECH (Câmara de Nova Lima)",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e293b; margin: 0;">SEGOV.TECH</h2>
          <p style="color: #8B0000; font-weight: bold; margin: 4px 0 0;">Câmara Municipal de Nova Lima</p>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; border: 1px solid #e2e8f0;">
          <p style="color: #374151; margin-top: 0;">Olá, <strong>${nome}</strong>!</p>
          <p style="color: #374151;">Recebemos uma solicitação para redefinir a senha da sua conta no sistema SEGOV.TECH.</p>
          <p style="color: #374151;">Clique no botão abaixo para criar uma nova senha:</p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${link}" style="background: #8B0000; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
              Redefinir Senha →
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
            Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição de senha, ignore este email.
          </p>
        </div>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 20px;">
          SEGOV.TECH · Câmara Municipal de Nova Lima · MG
        </p>
      </div>
    `,
  });
}

export async function enviarBackupSistema({
  para,
  buffer,
  nomeArquivo,
}: {
  para: string;
  buffer: Buffer;
  nomeArquivo: string;
}) {
  const data = new Date().toLocaleDateString("pt-BR");

  await enviarEmail({
    to: para,
    subject: `Backup do Sistema — SEGOV.TECH — ${data}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e293b; margin: 0;">SEGOV.TECH</h2>
          <p style="color: #8B0000; font-weight: bold; margin: 4px 0 0;">Câmara Municipal de Nova Lima</p>
        </div>
        <div style="background: white; border-radius: 10px; padding: 24px; border: 1px solid #e2e8f0;">
          <p style="color: #374151; margin-top: 0;">Olá!</p>
          <p style="color: #374151;">O backup do sistema foi gerado com sucesso em <strong>${data}</strong>.</p>
          <p style="color: #374151;">O arquivo <strong>${nomeArquivo}</strong> está anexado a este e-mail, contendo todas as abas: Requerimentos, TAGs, Proposições (SEGOV), Sessões, Vereadores, Comissões, Analistas e Log de Auditoria.</p>
        </div>
        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 20px;">
          SEGOV.TECH · Câmara Municipal de Nova Lima · MG
        </p>
      </div>
    `,
    attachments: [
      {
        filename: nomeArquivo,
        content: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });
}

export async function enviarCodigoFonte({
  para,
  buffer,
  nomeArquivo,
}: {
  para: string;
  buffer: Buffer;
  nomeArquivo: string;
}) {
  const data = new Date().toLocaleDateString("pt-BR");

  await enviarEmail({
    to: para,
    subject: `Backup do código-fonte — SEGOV.TECH — ${data}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #1e293b; margin: 0;">SEGOV.TECH</h2>
          <p style="color: #8B0000; font-weight: bold; margin: 4px 0 0;">Câmara Municipal de Nova Lima</p>
        </div>
        <div style="background: white; border-radius: 10px; padding: 24px; border: 1px solid #e2e8f0;">
          <p style="color: #374151; margin-top: 0;">Segue em anexo o backup do código-fonte do sistema, gerado em ${data}.</p>
          <p style="color: #374151;">O arquivo contém apenas o código versionado no GitHub — sem dados do sistema e sem variáveis de ambiente/segredos.</p>
        </div>
        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 20px;">
          SEGOV.TECH · Câmara Municipal de Nova Lima · MG
        </p>
      </div>
    `,
    attachments: [
      { filename: nomeArquivo, content: buffer, contentType: "application/zip" },
    ],
  });
}
