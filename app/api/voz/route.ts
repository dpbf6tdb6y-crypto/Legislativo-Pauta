import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Voz neural (Azure Speech) para as respostas faladas da pesquisa. Sem a chave configurada responde 501 e o
// navegador usa a voz do próprio aparelho. Variáveis: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, AZURE_SPEECH_VOICE (opcional).
export const dynamic = "force-dynamic";

const cache = new Map<string, Buffer>();

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return NextResponse.json({ error: "Voz neural não configurada" }, { status: 501 });

  let texto = "";
  try {
    texto = String((await req.json())?.texto || "").trim();
  } catch {}
  if (!texto) return NextResponse.json({ error: "Texto vazio" }, { status: 400 });
  texto = texto.slice(0, 3000);

  const voz = process.env.AZURE_SPEECH_VOICE || "pt-BR-FranciscaNeural";
  const ck = voz + "|" + texto;
  const guardado = cache.get(ck);
  if (guardado) {
    return new NextResponse(new Uint8Array(guardado), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  }

  // ritmo um pouco mais calmo e pausas naturais entre as frases
  const ssml =
    `<speak version="1.0" xml:lang="pt-BR" xmlns="http://www.w3.org/2001/10/synthesis">` +
    `<voice name="${esc(voz)}"><prosody rate="-6%">${esc(texto).replace(/([.!?;:])\s+/g, '$1<break time="280ms"/> ')}</prosody></voice></speak>`;

  try {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "segov-tech",
      },
      body: ssml,
    });
    if (!r.ok) return NextResponse.json({ error: "Falha na voz neural" }, { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (cache.size > 60) cache.delete(cache.keys().next().value as string);
    cache.set(ck, buf);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Voz neural indisponível" }, { status: 502 });
  }
}
