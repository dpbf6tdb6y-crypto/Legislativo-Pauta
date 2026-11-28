// Protótipo de Governança: tela "Hoje". Roda o programa da própria página gerada, sem navegador e sem banco.
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { HTML_PROTOTIPO } from '@/lib/projetosPrototipo/html';
import { injetarUsuario } from '@/lib/projetosPrototipo/usuario';
import { CARGOS, normalizaCargo } from '@/lib/cargos';

const PROGRAMA = HTML_PROTOTIPO.match(/<script>([\s\S]*)<\/script>/)![1].replace(/\niniciar\(\);\s*$/, '\n');
const ATAQUE = '</script><img src=x onerror=alert(1)>';

let rodar: <T = any>(codigo: string) => T;
function abrir(usuario?: { nome: string; cargo: string }) {
  const contexto = vm.createContext({ addEventListener() {}, document: { title: '' }, encodeURIComponent, ...(usuario ? { window: { __USUARIO__: usuario } } : {}) });
  vm.runInContext(PROGRAMA, contexto);
  rodar = (codigo) => vm.runInContext(codigo, contexto);
}
beforeEach(() => abrir());

const tela = (hora = 9) => rodar<string>(`VIEWS.hoje(new Date(2026, 10, 28, ${hora}))`);
const contador = (html: string, k: string) => Number(html.match(new RegExp(`data-contador="${k}">(\\d+)<`))![1]);
const resumo = () => rodar<string>('resumoDoDia()');

describe('resumo e indicadores', () => {
  it('a frase sai dos dados', () => {
    expect(resumo()).toBe('Hoje há 4 decisões do Prefeito pendentes. Seis projetos estão atrasados e somam R$ 231 milhões, ou 41% de tudo o que está investido nos projetos estratégicos. Duas ordens dadas em reunião já passaram do prazo.');
  });

  it('a frase muda com os dados', () => {
    rodar("filaP1().slice(1).forEach(aprovarDecisao); TAREFAS.filter(tarefaVencida).slice(1).forEach(t => concluirTarefa(t, 'ok'))");
    expect(resumo()).toContain('Hoje há 1 decisão do Prefeito pendente.');
    expect(resumo()).toContain('Uma ordem dada em reunião já passou do prazo.');
  });

  it('os três atalhos contam o que as seções mostram', () => {
    const html = tela();
    expect(contador(html, 'hj-decida')).toBe(rodar('p1Pendentes().length'));
    expect(contador(html, 'hj-cobre')).toBe(rodar('ordensVencidas().length + travas().length'));
    expect(contador(html, 'hj-agenda')).toBe((html.match(/<time datetime=/g) ?? []).length);
  });

  it('o índice da carteira é o mesmo da tela Indicadores', () => {
    expect(rodar<number>('Math.round(100 * idpCarteira())')).toBe(83);
    expect(tela()).toContain('83% foi feito. A meta é 95%.');
    expect(rodar<string>('VIEWS.indicadores()')).toContain('0,83');
  });

  it('cumprimenta conforme a hora', () => {
    expect(tela(11)).toContain('>Bom dia.<');
    expect(tela(12)).toContain('>Boa tarde.<');
    expect(tela(18)).toContain('>Boa noite.<');
    abrir({ nome: 'Maria Souza', cargo: 'Prefeito' });
    expect(tela(9)).toContain('>Bom dia, Maria Souza.<');
  });

  it('não usa siglas, termos técnicos nem "o senhor"', () => {
    const visivel = tela().replace(/<[^>]+>/g, ' ');
    expect(visivel).not.toMatch(/\b(IDS|IDP|SEMSA|SEMED|SEMOB|SEMUR|SEMMA|SEMDS|SEPLAG|SECULT)\b|[Cc]urva S|ponderad|p\.p\.|o senhor/);
  });

  it('o semáforo das secretarias segue as faixas', () => {
    expect(rodar('[85, 84, 70, 69].map(n => faixaSecretaria(n).rotulo).join()')).toBe('Bom,Atenção,Atenção,Crítico');
  });
});

describe('decida hoje', () => {
  it('tem um cartão por P1, na ordem da fila', () => {
    const ids = [...tela().matchAll(/data-aprovar="(p\d+)"/g)].map((m) => m[1]);
    expect(ids.join()).toBe(rodar('filaPrioridades().filter(p => nivelPrioridade(prioridade(p)) === "P1").map(p => p.id).join()'));
    expect(ids).toHaveLength(4);
  });

  it('o texto do gabinete substitui o automático, sempre como texto', () => {
    rodar(`projDe('p08').porque = ${JSON.stringify(ATAQUE)}`);
    expect(tela()).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(tela()).not.toContain('<img src=x');
  });

  it('o motivo automático segue a ordem e ignora itens padrão da demonstração', () => {
    expect(rodar("porqueDe(projDe('p13')).tipo")).toBe('trava');
    expect(rodar("porqueDe(projDe('p08')).tipo")).toBe('risco');
    expect(rodar("riscosCadastrados(projDe('p05')).length + dependenciasCadastradas(projDe('p05')).length")).toBe(0);
    expect(rodar("porqueDe(projDe('p05')).tipo")).toBe('documento');
  });

  it('aprovar registra a decisão com o gestor e 7 dias, e o contador diminui', () => {
    const antes = rodar('TAREFAS.length');
    rodar("aprovarDecisao(projDe('p08'))");
    expect(rodar('TAREFAS.length')).toBe((antes as number) + 1);
    expect(rodar('const t = TAREFAS.at(-1); [t.resp, isoDe(t.prazo), t.texto === encaminhamento(projDe("p08"))].join("|")')).toBe('Renata Coutinho|2026-12-02|true');
    const html = tela();
    expect(contador(html, 'hj-decida')).toBe(3);
    expect(html).toContain('✓ Decisão aprovada. Renata Coutinho tem 7 dias de prazo.');
    expect(html).toContain('ninguém é avisado automaticamente');
    expect(html).not.toContain('foi avisado');
    expect(rodar("aprovarDecisao(projDe('p08'))")).toBe(null);
  });

  it('desfazer remove a tarefa e a linha do histórico', () => {
    const historico = () => rodar<string>("VIEWS.projeto('p08', 'historico')");
    const antes = historico();
    rodar("const nova = aprovarDecisao(projDe('p08'))");
    expect(historico()).not.toBe(antes);
    expect(rodar('desfazerDecisao(nova)')).toBe(true);
    expect(historico()).toBe(antes);
    expect(contador(tela(), 'hj-decida')).toBe(4);
  });

  it('não desfaz decisões de reuniões anteriores', () => {
    expect(rodar('desfazerDecisao(TAREFAS[0])')).toBe(false);
    expect(rodar('TAREFAS.length')).toBe(6);
  });

  it('chamar para reunião registra o pedido sem contar como decisão', () => {
    rodar("pedirReuniao(projDe('p26')); pedirReuniao(projDe('p26'))");
    const html = tela();
    expect(html).toContain('✓ Reunião pedida ao Gabinete.');
    expect(contador(html, 'hj-decida')).toBe(4);
    expect(rodar("projDe('p26').registros.filter(r => r.categoria === 'Reunião').length")).toBe(1);
  });

  it('o ajuste abre o diálogo existente já preenchido', () => {
    const html = rodar<string>("formDecisao(projDe('p08'), { resp: 'Renata Coutinho', prazo: somaDias(HOJE, 7) })");
    expect(html).toContain('<option value="Renata Coutinho" selected>');
    expect(html).toContain('value="2026-12-02"');
    expect(rodar<string>("formDecisao(projDe('p08'))")).not.toContain('selected>');
  });
});

describe('cobrança', () => {
  it('telefone fictício conta como não cadastrado, e a mensagem avisa que é demonstração', () => {
    const link = rodar<string>('linkWhatsApp(TAREFAS.find(tarefaVencida))');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toMatch(/^\[Demonstração: dados fictícios\] Olá, /);
  });

  it('telefone válido vai para o endereço, com o código do país', () => {
    rodar("GESTORES.find(g => g.nome === 'Renata Coutinho').tel1 = '(31) 99999-0000'");
    expect(rodar("telefoneWhatsApp('Renata Coutinho')")).toBe('5531999990000');
  });

  it('guarda o novo prazo de 48 horas sem apagar o atraso, e vai para o histórico', () => {
    rodar('const t = ordensVencidas()[0]; registrarCobranca(t); registrarCobranca(t)');
    expect(rodar('tarefaVencida(t)')).toBe(true);
    expect(rodar('isoDe(COBRANCAS.get(t.id).novoPrazo)')).toBe('2026-11-27');
    expect(rodar("projDe(t.proj).registros.filter(r => r.categoria === 'Cobrança').length")).toBe(1);
    expect(tela()).toContain('WhatsApp aberto com a cobrança pronta. Novo prazo: 48 horas.');
    expect(tela()).not.toContain('Cobrança enviada');
  });
});

describe('agenda, reuniões e menu', () => {
  it('a agenda cobre só os próximos 30 dias, em ordem de data', () => {
    const l = JSON.parse(rodar<string>('JSON.stringify(agendaPreventiva().map(i => diasEntre(HOJE, i.data)))')) as number[];
    expect(l).toHaveLength(12);
    expect(l.every((d) => d >= 0 && d <= 30)).toBe(true);
    expect([...l].sort((a, b) => a - b)).toEqual(l);
  });

  it('recomenda reuniões pelas três regras', () => {
    const titulos = rodar<string>('reunioesRecomendadas().map(r => r.titulo).join("\\n")');
    expect(titulos).toContain('Prefeito com Concessionária de saneamento');
    expect(titulos).toContain('Reunião das secretarias: Planejamento e Gestão · Obras e Infraestrutura');
    expect(titulos).toContain('Acompanhamento da Secretaria de Desenvolvimento Social');
    expect(titulos).not.toContain('Procuradoria');
  });

  it('a pauta só entra no relatório depois de montada', () => {
    expect(rodar<string>('docReuniao()')).not.toContain('Pauta da semana');
    rodar('PAUTA.montada = true');
    expect(rodar<string>('docReuniao()')).toContain('6. Pauta da semana');
  });

  it('Hoje é a tela inicial', () => {
    rodar("var location = { hash: '' }");
    expect(rodar('lerRota().nome')).toBe('hoje');
  });

  it('o menu curto vale só para os três cargos', () => {
    const menu = () => rodar<string>('menuDoUsuario().flatMap(g => g[1]).map(i => i[1]).join(" · ")');
    for (const cargo of CARGOS) {
      abrir({ nome: 'Pessoa', cargo });
      expect(menu()).toBe('Hoje · Projetos · Secretarias · Reuniões e decisões');
    }
    abrir({ nome: 'Pessoa', cargo: '' });
    expect(menu()).toContain('Sala de Situação');
    expect(menu().startsWith('Hoje · Dashboard')).toBe(true);
  });

  it('a lista de cargos é a mesma no servidor e na página', () => {
    expect(rodar('CARGOS_GABINETE.join()')).toBe(CARGOS.join());
    expect(normalizaCargo('Prefeito')).toBe('Prefeito');
    expect(normalizaCargo('master')).toBeNull();
    expect(normalizaCargo(undefined)).toBeNull();
  });
});

describe('nome e cargo escritos pelo servidor', () => {
  it('o nome não consegue sair do script e chega inteiro', () => {
    const nome = `${ATAQUE} & "$&' \u2028fim`;
    const html = injetarUsuario(HTML_PROTOTIPO, { nome, cargo: 'Prefeito' });
    const script = html.match(/<script>window\.__USUARIO__ = (.*?);<\/script>/)![1];
    expect(script).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(script)).toEqual({ nome, cargo: 'Prefeito' });
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it('na tela, o nome aparece como texto', () => {
    abrir({ nome: ATAQUE, cargo: '' });
    expect(tela()).not.toContain('<img src=x');
    expect(rodar<string>('blocoUsuario()')).not.toContain('<img src=x');
  });
});
