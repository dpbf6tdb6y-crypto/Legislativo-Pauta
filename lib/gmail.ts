import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

function base64UrlEncode(str: Buffer | string) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

interface Anexo {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface EnviarEmailParams {
  to: string;
  subject: string;
  html: string;
  attachments?: Anexo[];
}

export async function enviarEmail({ to, subject, html, attachments = [] }: EnviarEmailParams) {
  const boundary = `boundary_${Date.now()}`;
  const from = process.env.EMAIL_USER;

  const linhas = [
    `From: "Legislativo Pauta - Câmara de Nova Lima" <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];

  for (const anexo of attachments) {
    linhas.push(
      `--${boundary}`,
      `Content-Type: ${anexo.contentType}; name="${anexo.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${anexo.filename}"`,
      "",
      anexo.content.toString("base64")
    );
  }
  linhas.push(`--${boundary}--`);

  const raw = base64UrlEncode(linhas.join("\r\n"));

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
