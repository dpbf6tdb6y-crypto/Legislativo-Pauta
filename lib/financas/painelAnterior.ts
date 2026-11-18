// Painel anterior (HTML gerado à parte): quem não tem a permissão de folha não recebe as linhas por servidor.
const INICIO = 'const DATA = ';
const FIM = ';\nconst LOGO_SRC';

/**
 * Tira do HTML a lista de servidores (cargo, lotação e valores de cada um). Os totais continuam.
 * Devolve null se o arquivo tiver dados e não for possível limpar: nesse caso nada é entregue.
 */
export function removerFolhaDoPainel(html: string): string | null {
  const i = html.indexOf(INICIO);
  if (i < 0) return html.includes('"rh":') ? null : html;
  const ini = i + INICIO.length;
  const fim = html.indexOf(FIM, ini);
  if (fim < 0) return null;
  try {
    const dados = JSON.parse(html.slice(ini, fim));
    dados.rh = [];
    return html.slice(0, ini) + JSON.stringify(dados) + html.slice(fim);
  } catch {
    return null;
  }
}
