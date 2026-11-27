// Gera lib/projetosPrototipo/html.ts a partir de lib/projetosPrototipo/fonte.html.
//   node scripts/projetos-prototipo/gerar.mjs
// A fonte usa o Tailwind carregado de um site externo. Aqui os estilos são compilados com o Tailwind do projeto,
// para que a tela não execute nenhum programa de fora dentro do SEGOV.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pasta = path.join(raiz, 'lib/projetosPrototipo');
const fonte = readFileSync(path.join(pasta, 'fonte.html'), 'utf8').replace(/\r\n/g, '\n');

const achar = (re, oQue) => { const m = fonte.match(re); if (!m) throw new Error('não achei: ' + oQue); return m; };
const fontes = achar(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/, 'fontes de letra')[0];
const config = achar(/<script>\s*\/\*[^*]*\*\/\s*tailwind\.config = ([\s\S]*?);\s*<\/script>/, 'configuração de cores')[1];
const comTailwind = achar(/<style type="text\/tailwindcss">([\s\S]*?)<\/style>/, 'componentes')[1];
const estilos = [...fonte.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const inicioApp = fonte.indexOf('<div id="app">');
if (inicioApp < 0) throw new Error('não achei o corpo da página');
// a logomarca oficial entra dentro da própria página, uma única vez
const REF_LOGO = "'../../public/fazenda/nova-lima.png'";
if (fonte.split(REF_LOGO).length !== 2) throw new Error('não achei o endereço da logomarca');
const logo = readFileSync(path.join(raiz, 'public/fazenda/nova-lima.png')).toString('base64');
const corpo = fonte.slice(inicioApp).replace(REF_LOGO, () => `'data:image/png;base64,${logo}'`);

const tmp = mkdtempSync(path.join(tmpdir(), 'prototipo-'));
const cfg = vm.runInNewContext('(' + config + ')');
// classes montadas em tempo de execução (ex.: `badge-${k}`) não aparecem inteiras no código
const safelist = ['badge-con', 'badge-and', 'badge-ate', 'badge-atr', 'badge-neutro'];
writeFileSync(path.join(tmp, 'corpo.html'), corpo);
writeFileSync(path.join(tmp, 'tailwind.config.cjs'), `module.exports = ${JSON.stringify({ content: [path.join(tmp, 'corpo.html').replace(/\\/g, '/')], safelist, theme: cfg.theme })};\n`);
writeFileSync(path.join(tmp, 'entrada.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' + comTailwind);
const cli = path.join(path.dirname(createRequire(path.join(raiz, 'package.json')).resolve('tailwindcss/package.json')), 'lib/cli.js');
execFileSync(process.execPath, [cli, '-c', path.join(tmp, 'tailwind.config.cjs'), '-i', path.join(tmp, 'entrada.css'), '-o', path.join(tmp, 'saida.css'), '--minify'], { stdio: ['ignore', 'ignore', 'pipe'] });
const css = readFileSync(path.join(tmp, 'saida.css'), 'utf8');

// mesma ordem de antes: estilos próprios primeiro, Tailwind depois
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prefeitura de Nova Lima · Governança de Projetos</title>
${fontes}
${estilos.join('\n')}
<style>${css}</style>
</head>
<body>
${corpo}</body>
</html>
`;
if (/<script[^>]+src=/i.test(html)) throw new Error('a página ainda carrega programa externo');
writeFileSync(path.join(pasta, 'html.ts'),
  '// ARQUIVO GERADO por scripts/projetos-prototipo/gerar.mjs a partir de fonte.html. Não edite à mão.\n'
  + '// Protótipo de demonstração: pessoas, projetos e valores são FICTÍCIOS.\n'
  + `export const HTML_PROTOTIPO: string = ${JSON.stringify(html)};\n`);
if (process.argv[2]) writeFileSync(process.argv[2], html);
console.log(`gerado: ${Math.round(html.length / 1024)} KB, estilos compilados: ${Math.round(css.length / 1024)} KB`);
