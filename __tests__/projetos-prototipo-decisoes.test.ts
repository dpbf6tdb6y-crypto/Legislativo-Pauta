// Protótipo de Governança: registrar decisão e acompanhar as tarefas das reuniões.
// Roda o programa da própria página gerada, sem navegador e sem banco.
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { HTML_PROTOTIPO } from '@/lib/projetosPrototipo/html';

const PROGRAMA = HTML_PROTOTIPO.match(/<script>([\s\S]*)<\/script>/)![1].replace(/\niniciar\(\);\s*$/, '\n');
const ATAQUE = '<img src=x onerror=alert(1)>';

let rodar: <T = any>(codigo: string) => T;
beforeEach(() => {
  const contexto = vm.createContext({ addEventListener() {}, document: { title: '' } });
  vm.runInContext(PROGRAMA, contexto);
  rodar = (codigo) => vm.runInContext(codigo, contexto);
});

const linhas = (html: string) => (html.match(/id="linha-t\d+"/g) ?? []).length;
const cartao = (html: string, k: string) => Number(html.match(new RegExp(`data-sit-tarefa="${k}"[\\s\\S]*?kpi-value block">(\\d+)<`))![1]);
const avisoDashboard = () => Number(rodar<string>('VIEWS.painel()').match(/(\d+) (?:decisão vencida|decisões vencidas)/)?.[1] ?? 0);
const registrar = (id: string, texto = 'Cobrar a concessionária.', reuniao = '2026-11-25', prazo = '2026-12-02') =>
  rodar<string>(`registrarDecisao(projDe('${id}'), { texto: ${JSON.stringify(texto)}, resp: 'Procuradoria', reuniao: dISO('${reuniao}'), prazo: dISO('${prazo}') }).id`);
const secaoDecisoes = () => rodar<string>('docReuniao()').split('2. Decisões solicitadas')[1].split('3. Projetos atrasados')[0];
const linhaDoRelatorio = (id: string) => {
  const nome = rodar<string>(`esc(projDe('${id}').nome)`);
  return secaoDecisoes().split('<tr>').find((tr) => tr.includes(nome))!;
};

describe('tarefas da reunião fictícia de 28/10/2026', () => {
  it('são 6: 2 concluídas, 2 vencidas e 2 abertas no prazo, em projetos existentes', () => {
    expect(rodar('TAREFAS.length')).toBe(6);
    expect(rodar('TAREFAS.every(t => projDe(t.proj) && isoDe(t.reuniao) === "2026-10-28")')).toBe(true);
    expect(rodar('TAREFAS.filter(t => t.concluida).length')).toBe(2);
    expect(rodar('TAREFAS.filter(tarefaVencida).length')).toBe(2);
    expect(rodar('TAREFAS.filter(t => !t.concluida && !tarefaVencida(t)).length')).toBe(2);
  });

  it('usam a data de posição como hoje: prazo no próprio dia não está vencido', () => {
    registrar('p01', 'Vence hoje', '2026-11-20', '2026-11-25');
    expect(rodar('TAREFAS.filter(tarefaVencida).length')).toBe(2);
    registrar('p01', 'Venceu ontem', '2026-11-20', '2026-11-24');
    expect(rodar('textoVencida(TAREFAS.at(-1))')).toBe('Vencida há 1 dia');
  });

  it('listam as vencidas primeiro, da mais antiga para a mais nova', () => {
    const l = JSON.parse(rodar<string>('JSON.stringify(listaDeTarefas().map(t => [tarefaVencida(t), isoDe(t.prazo)]))'));
    expect(l.slice(0, 2)).toEqual([[true, '2026-11-06'], [true, '2026-11-13']]);
    expect(l.slice(2).some(([vencida]: [boolean]) => vencida)).toBe(false);
  });
});

describe('cartões, filtros e Dashboard', () => {
  it('cada cartão mostra o número de linhas da lista que abre, com e sem filtros', () => {
    registrar('p01', 'Nova', '2026-11-01', '2026-11-10');
    for (const filtro of ["{ sec: '', resp: '' }", "{ sec: 'smo', resp: '' }", "{ sec: '', resp: 'Procuradoria' }", "{ sec: 'sct', resp: 'Procuradoria' }"]) {
      rodar(`Object.assign(PEND, { aba: 'tarefas', sit: '' }, ${filtro})`);
      const geral = rodar<string>('conteudoTarefas()');
      for (const k of ['abertas', 'vencidas', 'concluidas']) {
        rodar(`PEND.sit = '${k}'`);
        expect(linhas(rodar<string>('conteudoTarefas()')), `${k} ${filtro}`).toBe(cartao(geral, k));
      }
    }
  });

  it('o aviso do Dashboard é igual ao cartão Vencidas e abre a aba já filtrada, sem filtros antigos', () => {
    rodar("Object.assign(PEND, { sec: 'sme', resp: 'SEMMA' })");
    expect(rodar<string>('VIEWS.painel()')).toContain('href="#pendencias-vencidas"');
    const aba = rodar<string>("VIEWS.pendencias('vencidas')");
    expect(avisoDashboard()).toBe(2);
    expect(cartao(aba, 'vencidas')).toBe(2);
    expect(linhas(aba)).toBe(2);
  });

  it('o endereço da tela escolhe a aba, e a aba Documentos continua como era', () => {
    const documentos = rodar<string>('VIEWS.pendencias()');
    expect(documentos).toContain('Pendências Documentais');
    expect(documentos).not.toContain('data-sit-tarefa');
    expect(rodar<string>("VIEWS.pendencias('tarefa', 't03')")).toContain('tarefa-destaque');
  });

  it('concluir atualiza cartões, Dashboard, ficha e Histórico', () => {
    rodar("concluirTarefa(tarefaDe('t01'), 'Cronograma recebido.')");
    const aba = rodar<string>("VIEWS.pendencias('tarefas')");
    expect([cartao(aba, 'abertas'), cartao(aba, 'vencidas'), cartao(aba, 'concluidas')]).toEqual([3, 1, 3]);
    expect(avisoDashboard()).toBe(1);
    expect(rodar<string>("VIEWS.projeto('p08')")).toContain('O que foi feito: Cronograma recebido.');
    expect(rodar("historico(projDe('p08')).some(h => h.acao.includes('Tarefa concluída') && h.acao.includes('Cronograma recebido.'))")).toBe(true);
  });

  it('sem vencidas, o aviso some do Dashboard', () => {
    rodar("TAREFAS.filter(tarefaVencida).forEach(t => concluirTarefa(t, 'Feito.'))");
    expect(rodar<string>('VIEWS.painel()')).not.toContain('#pendencias-vencidas');
  });
});

describe('registrar decisão', () => {
  it('o botão está no Painel de prioridades e no Encaminhamento ao Gabinete da ficha', () => {
    const sala = rodar<string>('VIEWS.sala()');
    expect((sala.match(/data-decidir="/g) ?? []).length).toBe(rodar('filaPrioridades().length'));
    expect(rodar<string>("VIEWS.projeto('p01')")).toContain('data-decidir="p01"');
  });

  it('o formulário vem com o encaminhamento, a data de posição e só gestores ativos e órgãos', () => {
    const form = rodar<string>("formDecisao(projDe('p01'))");
    expect(form).toContain(`>${rodar("esc(encaminhamento(projDe('p01')))")}</textarea>`);
    expect(form).toContain('id="dc-reuniao" type="date" class="input" value="2026-11-25"');
    for (const nome of ['Procuradoria', 'Controle Interno', 'Gabinete', 'Fernanda Albuquerque']) expect(form).toContain(`<option value="${nome}">`);
    expect(form).not.toContain('Vanessa Drummond');
  });

  it('não salva com campo obrigatório vazio nem com prazo anterior à reunião', () => {
    const erro = (campo: string, valor: string) => rodar<string>(`regrasDecisao('2026-11-25')['${campo}'](${JSON.stringify(valor)})`);
    for (const campo of ['dc-texto', 'dc-resp', 'dc-reuniao', 'dc-prazo']) expect(erro(campo, ''), campo).not.toBe('');
    expect(erro('dc-prazo', '2026-11-24')).toContain('anterior');
    expect(erro('dc-prazo', '2026-11-25')).toBe('');
    expect(erro('dc-prazo', '2026-12-01')).toBe('');
    expect(rodar("regrasConclusao()['cc-feito']('')")).not.toBe('');
  });

  it('cria tarefa e aparece no item, na ficha, no Histórico e no relatório', () => {
    expect(linhaDoRelatorio('p01')).toContain('<span class="doc-linha">Deliberação:</span>');
    const id = registrar('p01', 'Cobrar a concessionária.');
    expect(rodar('TAREFAS.length')).toBe(7);
    for (const tela of [rodar<string>('VIEWS.sala()'), rodar<string>("VIEWS.projeto('p01')")]) {
      expect(tela).toContain('Decisão registrada');
      expect(tela).toContain(`href="#tarefa-${id}"`);
      expect(tela).toContain('Responsável: Procuradoria · Prazo: <span class="tabular-nums">02/12/2026</span>');
    }
    expect(rodar<string>("VIEWS.projeto('p01', 'historico')")).toContain('Decisão registrada: “Cobrar a concessionária.”');
    const linha = linhaDoRelatorio('p01');
    expect(linha).toContain('Cobrar a concessionária.');
    expect(linha).toContain('Responsável: Procuradoria · Prazo: 02/12/2026');
    expect(linha).not.toContain('doc-linha');
    expect(rodar<string>('relatorioTexto()')).toContain('Deliberação: Cobrar a concessionária.');
    expect(linhaDoRelatorio('p13')).toContain('<span class="doc-linha">Deliberação:</span>');
  });

  it('um projeto pode ter várias decisões', () => {
    registrar('p01', 'Primeira decisão');
    registrar('p01', 'Segunda decisão');
    expect(rodar("tarefasDoProjeto('p01').length")).toBe(2);
    expect(linhaDoRelatorio('p01')).toContain('Primeira decisão');
    expect(linhaDoRelatorio('p01')).toContain('Segunda decisão');
  });

  it('não muda situação, prioridade nem o IDS, nem ao concluir', () => {
    const retrato = () => rodar<string>('JSON.stringify([PROJETOS.map(p => [p.status, prioridade(p), +p.atualizado]), ranking().map(x => x.d.ids)])');
    const antes = retrato();
    const id = registrar('p01', 'Qualquer', '2026-11-01', '2026-11-02');
    rodar(`concluirTarefa(tarefaDe('${id}'), 'Feito.')`);
    expect(retrato()).toBe(antes);
  });

  it('mostra o texto digitado como texto em todas as telas', () => {
    const id = registrar('p01', ATAQUE, '2026-11-01', '2026-11-02');
    const telas = () => [
      rodar<string>('VIEWS.sala()'), rodar<string>("VIEWS.projeto('p01')"), rodar<string>("VIEWS.projeto('p01', 'historico')"),
      rodar<string>("VIEWS.pendencias('tarefas')"), rodar<string>('VIEWS.relatorios()'), rodar<string>("VIEWS.ficha('p01')"),
      rodar<string>(`formConclusao(tarefaDe('${id}'))`),
    ];
    for (const html of telas()) expect(html).not.toContain('<img src=x');
    expect(telas().join('')).toContain('&lt;img src=x onerror=alert(1)&gt;');
    rodar(`concluirTarefa(tarefaDe('${id}'), ${JSON.stringify(ATAQUE)})`);
    for (const html of telas()) expect(html).not.toContain('<img src=x');
  });
});

describe('registrar conversa com o Prefeito', () => {
  /* p03 está em dia e fora do Painel de prioridades */
  const conversar = (tarefa = 'null', resumo = 'Alinhamento sobre o andamento.') =>
    rodar<string>(`registrarConversa(projDe('p03'), { data: dISO('2026-11-24'), participantes: 'Prefeito e gestor', resumo: ${JSON.stringify(resumo)}, tarefa: ${tarefa} }).id`);
  const TAREFA = "{ texto: 'Enviar cronograma', resp: 'Gabinete', prazo: dISO('2026-11-24') }";

  it('o botão está na ficha de qualquer projeto, inclusive em dia e concluído, sem conversas de início', () => {
    expect(rodar("projDe('p03').status === 'and' && !filaPrioridades().includes(projDe('p03'))")).toBe(true);
    for (const id of rodar<string>('PROJETOS.map(p => p.id).join()').split(',')) {
      expect(rodar<string>(`VIEWS.projeto('${id}')`), id).toContain(`data-conversar="${id}"`);
    }
    expect(rodar('CONVERSAS.length')).toBe(0);
    expect(rodar<string>("VIEWS.projeto('p03')")).toContain('Nenhuma conversa registrada');
  });

  it('exige data, participantes e o que foi conversado; os campos da tarefa só quando marcada', () => {
    const campos = (gerou: boolean) => rodar<string>(`Object.keys(regrasConversa({ data: '2026-11-24', gerou: ${gerou} })).join()`);
    expect(campos(false)).toBe('cv-data,cv-quem,cv-resumo');
    expect(campos(true)).toBe('cv-data,cv-quem,cv-resumo,cv-oque,cv-resp,cv-prazo');
    const erro = (campo: string, valor: string) => rodar<string>(`regrasConversa({ data: '2026-11-24', gerou: true })['${campo}']('${valor}')`);
    for (const campo of campos(true).split(',')) expect(erro(campo, ''), campo).not.toBe('');
    expect(erro('cv-data', '2026-11-26')).toContain('posterior');
    expect(erro('cv-data', '2026-11-25')).toBe('');
    expect(erro('cv-prazo', '2026-11-23')).toContain('anterior');
    expect(erro('cv-prazo', '2026-11-24')).toBe('');
  });

  it('sem tarefa: aparece na ficha e no Histórico, sem prazo nem cobrança', () => {
    conversar();
    expect(rodar('TAREFAS.length')).toBe(6);
    expect(avisoDashboard()).toBe(2);
    const ficha = rodar<string>("VIEWS.projeto('p03')");
    expect(ficha).toContain('Alinhamento sobre o andamento.');
    expect(ficha).toContain('Participantes: Prefeito e gestor');
    expect(ficha).toContain('Sem tarefa.');
    expect(rodar<string>("VIEWS.projeto('p03', 'historico')")).toContain('Conversa registrada, de 24/11/2026');
  });

  it('com tarefa: cria uma tarefa ligada à conversa, que segue as regras de cobrança', () => {
    conversar(TAREFA);
    expect(rodar('TAREFAS.length')).toBe(7);
    expect(rodar('TAREFAS.at(-1).id === CONVERSAS[0].tarefa')).toBe(true);
    expect(avisoDashboard()).toBe(3);
    const ficha = rodar<string>("VIEWS.projeto('p03')");
    expect(ficha).toContain('Gerou tarefa para Gabinete');
    expect(ficha).toContain('Conversa de 24/11/2026');
    expect(rodar<string>("VIEWS.pendencias('tarefas')")).toContain('Enviar cronograma');
  });

  it('o texto da conversa fica só na ficha: não vai para o Histórico, o relatório nem o PDF', () => {
    conversar('null', 'Assunto reservado XYZ');
    expect(rodar<string>("VIEWS.projeto('p03')")).toContain('Assunto reservado XYZ');
    for (const tela of ["VIEWS.projeto('p03', 'historico')", "VIEWS.ficha('p03')", 'docReuniao()', 'relatorioTexto()', 'VIEWS.painel()']) {
      expect(rodar<string>(tela), tela).not.toContain('Assunto reservado XYZ');
    }
  });

  it('não muda situação, prioridade nem o IDS', () => {
    const retrato = () => rodar<string>('JSON.stringify([PROJETOS.map(p => [p.status, prioridade(p), +p.atualizado]), ranking().map(x => x.d.ids)])');
    const antes = retrato();
    conversar(TAREFA);
    expect(retrato()).toBe(antes);
  });

  it('mostra o texto digitado como texto', () => {
    rodar(`registrarConversa(projDe('p03'), { data: HOJE, participantes: ${JSON.stringify(ATAQUE)}, resumo: ${JSON.stringify(ATAQUE)}, tarefa: { texto: ${JSON.stringify(ATAQUE)}, resp: 'Gabinete', prazo: HOJE } })`);
    for (const tela of ["VIEWS.projeto('p03')", "VIEWS.projeto('p03', 'historico')", "VIEWS.pendencias('tarefas')", "VIEWS.ficha('p03')"]) {
      expect(rodar<string>(tela), tela).not.toContain('<img src=x');
    }
    expect(rodar<string>("VIEWS.projeto('p03')")).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('regras de demonstração', () => {
  it('não chama servidor nem usa armazenamento do navegador, e mantém o aviso', () => {
    expect(PROGRAMA).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB)\b|document\.cookie/);
    expect(HTML_PROTOTIPO).toContain('Protótipo com dados fictícios');
  });
});
