// Entrega à página do protótipo quem está logado, só com nome e cargo, para a saudação da tela Hoje.
// A página é isolada e não enxerga o login: esses dois dados são escritos nela pelo servidor.

export type UsuarioDaTela = { nome: string; cargo: string };

// "<", ">", "&" e os separadores de linha U+2028 e U+2029 viram \uXXXX: o texto continua o mesmo
// dentro do JavaScript, mas não consegue fechar o <script> nem abrir outra marcação.
const PERIGOSOS = /[<>&\u2028\u2029]/g;
const escapar = (c: string) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');

const MARCA = '<div id="app">';

export function injetarUsuario(html: string, { nome, cargo }: UsuarioDaTela): string {
  const dados = JSON.stringify({ nome, cargo }).replace(PERIGOSOS, escapar);
  // função no replace: um "$" no nome não é interpretado
  return html.replace(MARCA, () => `<script>window.__USUARIO__ = ${dados};</script>\n${MARCA}`);
}
