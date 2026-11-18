// Conector do Portal da Transparência da Ábaco (Nova Lima: mgnl.abaco.com.br).
// SOMENTE LEITURA: abre telas públicas, aplica filtros e aciona exportações.
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { centavos } from '@/lib/financas/dinheiro';
import type { ComBruto, Conector, ContratoC, DespesaFuncaoMesC, DespesaNaturezaMesC, DespesaOrgaoMesC, EmpenhoC, FolhaLinhaC, FolhaMesC, ReceitaContaMesC, RestoPagarC, RetencaoC } from '../tipos';
import { conferirEmpenho, lerContratosXml, lerDespesaFuncaoXml, lerDespesaNaturezaXml, lerDespesaOrgaoXml, lerEmpenhoHtml, lerReceitaXml, lerRestosAPagarXml, lerRetencoesHtml } from './leitores';

const AGENTE = 'segov-gestao/1.0 (leitura de dados publicos)';

export interface ConfigAbaco {
  base: string; // https://mgnl.abaco.com.br/transparencia/servlet
  pausaMs?: number; // pausa entre requisições ao portal (gentileza)
  paralelo?: number; // requisições simultâneas de detalhe de empenho
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ConectorAbaco implements Conector {
  nome = 'portal-abaco';
  private browser?: Browser;
  private ctx?: BrowserContext;
  private page?: Page;
  constructor(private cfg: ConfigAbaco) {}

  async abrir() {
    // usa o Microsoft Edge já instalado no Windows (evita baixar navegador);
    // na versão online, trocar por PLAYWRIGHT_CANAL=chromium
    const canal = process.env.PLAYWRIGHT_CANAL || 'msedge';
    // Edge/Chrome recentes removeram o "--headless=old" que o Playwright 1.48 usa: pede o modo novo explicitamente
    this.browser = await chromium.launch(
      canal === 'chromium' ? { headless: true } : { channel: canal, headless: false, args: ['--headless=new'] },
    );
    this.ctx = await this.browser.newContext({ acceptDownloads: true, userAgent: AGENTE });
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(120_000);
  }
  async fechar() {
    await this.browser?.close();
  }

  private get p(): Page {
    if (!this.page) throw new Error('conector não aberto');
    return this.page;
  }

  private async ir(caminho: string) {
    await this.p.goto(`${this.cfg.base}/${caminho}`, { waitUntil: 'networkidle' });
  }

  /** Muda um <select> do GeneXus e espera a resposta do servidor. */
  private async mudar(sufixoId: string, valor: string, criarOpcao = false) {
    // nem toda mudança dispara requisição (ex.: valor já selecionado): espera curta + rede ociosa
    const r = this.p.waitForResponse((x) => x.url().includes('gx-no-cache'), { timeout: 20_000 }).catch(() => null);
    const t0 = Date.now();
    const ok = await this.p.evaluate(
      ({ sufixoId, valor, criarOpcao }) => {
        const s = document.querySelector<HTMLSelectElement>(`select[id$="${sufixoId}"]`);
        if (!s) return false;
        if (criarOpcao && ![...s.options].some((o) => o.value === valor)) {
          const o = document.createElement('option');
          o.value = valor;
          o.text = valor;
          s.add(o);
        }
        s.value = valor;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      { sufixoId, valor, criarOpcao },
    );
    if (!ok) throw new Error(`campo ${sufixoId} não encontrado`);
    const t1 = Date.now();
    await r;
    const t2 = Date.now();
    await this.p.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    if (process.env.GAVIX_DEPURAR) console.log(`[mudar ${sufixoId}=${valor}] evaluate ${Math.round((t1 - t0) / 1000)}s, resposta ${Math.round((t2 - t1) / 1000)}s, ociosa ${Math.round((Date.now() - t2) / 1000)}s`);
    await espera(300);
  }

  /** Troca de página e espera o grid realmente mudar (a resposta do GeneXus chega antes do redesenho). */
  private async irParaPagina(pg: number, assinatura: () => Promise<string>) {
    const antes = await assinatura();
    await this.mudar('vNPAGINAATUAL', String(pg), true);
    const limite = Date.now() + 180_000;
    while (Date.now() < limite) {
      const atual = await this.p.evaluate(() => (document.querySelector('select[id$="vNPAGINAATUAL"]') as HTMLSelectElement | null)?.value ?? '').catch((e) => `erro ${e}`);
      const agora = await assinatura().catch((e) => `erro ${e}`);
      if (process.env.GAVIX_DEPURAR_PAG) console.log(`[pagina ${pg}] select=${atual} antes=${antes} agora=${agora}`);
      if (agora !== antes && atual === String(pg)) return;
      await espera(500);
    }
    throw new Error(`página ${pg} não carregou`);
  }

  /** Muda o tamanho da página e espera o portal recalcular o número de páginas. Devolve {total, paginas}. */
  private async porPagina(tamanho: number) {
    await this.mudar('vNREGISTROSPORPAGINA', String(tamanho), true);
    const ler = async () => {
      const v = await this.p
        // atenção: sem funções nomeadas aqui dentro (o tsx injeta __name, que não existe na página)
        .evaluate(() =>
          Object.fromEntries(
            [['reg', 'vNREGISTROS'], ['pag', 'vNPAGINAS']].map(([k, suf]) => [
              k,
              [...document.querySelectorAll(`[id$="${suf}"]`)].map((e) => `${e.tagName}#${e.id}=${(e as HTMLInputElement).value}`),
            ]),
          ) as { reg: string[]; pag: string[] },
        )
        .catch((e) => ({ reg: [`erro: ${e?.message?.slice(0, 80)}`], pag: [] as string[] }));
      if (process.env.GAVIX_DEPURAR) console.log(`[campos] ${JSON.stringify(v)}`);
      const num = (xs: string[]) => Number((xs.find((x) => x.startsWith('INPUT'))?.split('=')[1] ?? '').trim() || 'NaN');
      return { total: num(v.reg), paginas: num(v.pag) };
    };
    const aguardar = async (ms: number) => {
      const limite = Date.now() + ms;
      while (Date.now() < limite) {
        const { total, paginas } = await ler();
        if (process.env.GAVIX_DEPURAR) console.log(`[porPagina ${tamanho}] total=${total} paginas=${paginas}`);
        if (total === 0) return { total, paginas: 0 };
        if (total > 0 && paginas === Math.max(1, Math.ceil(total / tamanho))) return { total, paginas };
        await espera(1000);
      }
      return null;
    };
    // na tela de servidores o tamanho vale direto; na de empenhos só depois de "Buscar"
    const r = (await aguardar(60_000)) ?? (await this.buscar(), await aguardar(180_000));
    if (!r) throw new Error(`o portal não aplicou ${tamanho} linhas por página`);
    return r;
  }

  private async buscar() {
    const r = this.p.waitForResponse((x) => x.url().includes('gx-no-cache'), { timeout: 60_000 }).catch(() => null);
    await this.p.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLInputElement>('input[type=image]')].find((e) => /buscar/i.test(e.title || e.alt));
      b?.click();
    });
    await r;
    await this.p.waitForLoadState('networkidle');
    await espera(300);
  }

  /** Aciona o botão de exportação e baixa o arquivo NA MESMA SESSÃO (o balanceador só tem o arquivo no servidor que o gerou). */
  private async exportar(formato: 'xml' | 'excel'): Promise<Buffer> {
    const pedido = this.p.waitForRequest((r) => r.url().includes('appdownloadarquivo'), { timeout: 300_000 });
    this.p.once('download', (d) => d.cancel().catch(() => {}));
    await this.p.evaluate((formato) => {
      const re = formato === 'xml' ? /xml/i : /excel/i;
      const b = [...document.querySelectorAll<HTMLInputElement>('input[type=image]')].find((e) => re.test(e.title || e.alt));
      if (!b) throw new Error('botão de exportação não encontrado');
      b.click();
    }, formato);
    const url = (await pedido).url();
    for (let i = 0; i < 5; i++) {
      const resp = await this.ctx!.request.get(url);
      const corpo = await resp.body();
      if (resp.ok() && corpo.length > 100) return corpo;
      await espera(1500);
    }
    throw new Error(`exportação ${formato} veio vazia: ${url}`);
  }

  async ultimaAtualizacao(): Promise<string> {
    await this.ir('wmoportal?0');
    const t = await this.p.innerText('body');
    return t.match(/Última atualização:\s*([\d/]+\s[\d:]+)/)?.[1] ?? '';
  }

  async despesaOrgaoMes(ano: number, mes: number): Promise<ComBruto<DespesaOrgaoMesC[]>> {
    await this.ir('wmdespesas?0,0');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const b = await this.exportar('xml');
    const dados = lerDespesaOrgaoXml(b.toString('utf-8'), ano, mes);
    const ref = `${ano}-${String(mes).padStart(2, '0')}`;
    return { dados, brutos: [{ tipo: 'despesa_orgao', referencia: ref, nomeSugerido: `despesa_orgao_${ref}.xml`, conteudo: b }] };
  }

  async despesaNaturezaMes(ano: number, mes: number): Promise<ComBruto<DespesaNaturezaMesC[]>> {
    await this.ir('wmdespesas?17,0');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const b = await this.exportar('xml');
    const dados = lerDespesaNaturezaXml(b.toString('utf-8'), ano, mes);
    const ref = `${ano}-${String(mes).padStart(2, '0')}`;
    return { dados, brutos: [{ tipo: 'despesa_natureza', referencia: ref, nomeSugerido: `despesa_natureza_${ref}.xml`, conteudo: b }] };
  }

  async despesaFuncaoMes(ano: number, mes: number): Promise<ComBruto<DespesaFuncaoMesC[]>> {
    await this.ir('wmdespesas?15,0');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const b = await this.exportar('xml');
    const dados = lerDespesaFuncaoXml(b.toString('utf-8'), ano, mes);
    const ref = `${ano}-${String(mes).padStart(2, '0')}`;
    return { dados, brutos: [{ tipo: 'despesa_funcao', referencia: ref, nomeSugerido: `despesa_funcao_${ref}.xml`, conteudo: b }] };
  }

  async receitasMes(ano: number, mes: number): Promise<ComBruto<ReceitaContaMesC[]>> {
    await this.ir('wmreceitas?1');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const b = await this.exportar('xml');
    const dados = lerReceitaXml(b.toString('utf-8'), ano, mes);
    const ref = `${ano}-${String(mes).padStart(2, '0')}`;
    return { dados, brutos: [{ tipo: 'receitas', referencia: ref, nomeSugerido: `receitas_${ref}.xml`, conteudo: b }] };
  }

  async contratos(): Promise<ComBruto<ContratoC[]>> {
    await this.ir('wmcontratoslicitacoes?0');
    const b = await this.exportar('xml');
    const dados = lerContratosXml(b.toString('utf-8'));
    return { dados, brutos: [{ tipo: 'contratos', referencia: 'todos', nomeSugerido: 'contratos.xml', conteudo: b }] };
  }

  /** Lista de restos a pagar do exercício (posição do dia: a tela do RP não traz a data de cada pagamento;
   *  as datas vêm do detalhe do empenho de origem, que lista também os pagamentos feitos nos anos seguintes). */
  async restosAPagar(exercicio: number): Promise<ComBruto<RestoPagarC[]>> {
    await this.ir('wmdespesas?18,0');
    await this.mudar('vFILTROANOEXERCICIO', String(exercicio));
    await this.buscar();
    const b = await this.exportar('xml');
    const dados = lerRestosAPagarXml(b.toString('utf-8'), exercicio);
    return { dados, brutos: [{ tipo: 'restos_a_pagar', referencia: String(exercicio), nomeSugerido: `restos_a_pagar_${exercicio}.xml`, conteudo: b }] };
  }

  async retencoesDoPagamento(pagamentoIdOrigem: number): Promise<RetencaoC[]> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = await fetch(`${this.cfg.base}/wppagamentodoc?${pagamentoIdOrigem}`, { headers: { 'User-Agent': AGENTE } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return lerRetencoesHtml(await r.text(), pagamentoIdOrigem);
      } catch (err) {
        ultimoErro = err;
        await espera(2000 * (tentativa + 1));
      }
    }
    throw ultimoErro;
  }

  async empenho(idOrigem: number): Promise<EmpenhoC | null> {
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = await fetch(`${this.cfg.base}/wmdespesas?13,${idOrigem}`, { headers: { 'User-Agent': AGENTE } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const e = lerEmpenhoHtml(await r.text(), idOrigem);
        if (e) {
          // valores que não fecham: grava como veio e marca (não decide quem está certo)
          e.inconsistencia = conferirEmpenho(e);
        }
        return e;
      } catch (err) {
        ultimoErro = err;
        await espera(2000 * (tentativa + 1));
      }
    }
    throw ultimoErro;
  }

  /** IDs internos dos empenhos de um mês, lidos da lista do portal (500 por página). */
  async idsEmpenhosDoMes(ano: number, mes: number, log?: (m: string) => void): Promise<{ ids: number[]; totalInformado: number }> {
    const t0 = Date.now();
    await this.ir('wmdespesas?6,0');
    await this.mudar('vFILTROEMPENHOANO', String(ano));
    await this.mudar('vFILTROEMPENHOMES', String(mes));
    await this.buscar();
    const { total: totalInformado, paginas } = await this.porPagina(500);
    const ids = new Set<number>();
    const lerIds = () =>
      this.p.evaluate(() => [...document.querySelectorAll('span[id*="EMPENHOID_"]')].map((s) => Number((s.textContent || '').trim())).filter((n) => n > 0));
    for (let pg = 1; pg <= paginas; pg++) {
      if (pg > 1) await this.irParaPagina(pg, async () => (await lerIds()).slice(0, 3).join(','));
      (await lerIds()).forEach((i) => ids.add(i));
    }
    log?.(`ids ${ano}/${mes}: ${ids.size} de ${totalInformado} em ${Math.round((Date.now() - t0) / 1000)}s`);
    return { ids: [...ids].sort((a, b) => a - b), totalInformado };
  }

  async idsEmpenhosDoAno(ano: number, ateMes = 12, log?: (m: string) => void): Promise<{ ids: number[]; totalInformado: number }> {
    const ids: number[] = [];
    let totalInformado = 0;
    for (let m = 1; m <= ateMes; m++) {
      const r = await this.idsEmpenhosDoMes(ano, m, log);
      if (r.ids.length !== r.totalInformado) throw new Error(`lista de empenhos ${ano}/${m} incompleta: ${r.ids.length} de ${r.totalInformado}`);
      ids.push(...r.ids);
      totalInformado += r.totalInformado;
    }
    return { ids: [...new Set(ids)].sort((a, b) => a - b), totalInformado };
  }

  async empenhosDoAno(opts: Parameters<Conector['empenhosDoAno']>[0]) {
    const hoje = new Date();
    const ateMes = opts.ano < hoje.getFullYear() ? 12 : hoje.getMonth() + 1;
    // relista o ano todo na 1ª carga e aos domingos (pega lançamentos com data retroativa e falhas antigas);
    // nos outros dias, só o mês atual e o anterior
    const conhecidos = new Set(opts.idsConhecidos);
    const desdeMes = opts.relistarAnoTodo || conhecidos.size === 0 ? 1 : Math.max(1, ateMes - 1);
    const ids: number[] = [];
    for (let m = desdeMes; m <= ateMes; m++) {
      const r = await this.idsEmpenhosDoMes(opts.ano, m, opts.progresso);
      if (r.ids.length !== r.totalInformado) throw new Error(`lista de empenhos ${opts.ano}/${m} incompleta: ${r.ids.length} de ${r.totalInformado}`);
      ids.push(...r.ids);
    }
    const novos = ids.filter((i) => !conhecidos.has(i));
    const fila = [...new Set([...novos, ...opts.idsParaReler])];
    opts.progresso?.(`empenhos a ler: ${novos.length} novos + ${opts.idsParaReler.length} com saldo em aberto`);
    let verificados = 0;
    let entregues = 0;
    const falhas: number[] = [];
    const paralelo = this.cfg.paralelo ?? 3;
    const pausa = this.cfg.pausaMs ?? 150;
    let pos = 0;
    const trabalhador = async () => {
      while (pos < fila.length) {
        const id = fila[pos++];
        try {
          const e = await this.empenho(id);
          if (e) {
            await opts.aoReceber(e);
            entregues++;
          }
        } catch {
          falhas.push(id); // tenta de novo na próxima coleta (não está gravado, então volta como "novo")
        }
        verificados++;
        if (verificados % 1000 === 0) opts.progresso?.(`empenhos: ${verificados}/${fila.length}`);
        await espera(pausa);
      }
    };
    await Promise.all(Array.from({ length: paralelo }, trabalhador));
    if (falhas.length) throw new Error(`${falhas.length} empenho(s) não puderam ser lidos (ficam para a próxima coleta): ${falhas.slice(0, 10).join(', ')}${falhas.length > 10 ? '…' : ''}`);
    return { verificados, entregues };
  }

  /** Número de registros que a tela de servidores informa hoje para o mês (sem ler as linhas). */
  async contagemFolha(anoMes: string): Promise<number> {
    const [ano, mes] = anoMes.split('/').map(Number);
    await this.ir('wmservidores?0');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const n = await this.p.evaluate(() => Number((document.querySelector('input[id$="vNREGISTROS"]') as HTMLInputElement | null)?.value ?? 'NaN'));
    if (!Number.isInteger(n) || n < 0) throw new Error(`folha ${anoMes}: o portal não informou o número de registros`);
    return n;
  }

  async folhaMes(anoMes: string): Promise<ComBruto<FolhaMesC>> {
    const [ano, mes] = anoMes.split('/').map(Number);
    await this.ir('wmservidores?0');
    await this.mudar('vFILTROANO', String(ano));
    await this.mudar('vFILTROMES', String(mes));
    await this.buscar();
    const { total: informado, paginas } = await this.porPagina(250);
    const linhas: FolhaLinhaC[] = [];
    const brutos = [];
    const primeiraLinha = () => this.p.evaluate(() =>
      ['PESSOAID', 'PESSOAMATRICULA', 'REMUNERACAOBRUTA'].map((c) => document.querySelector(`span[id$="vGRID${c}_0001"]`)?.textContent?.trim() ?? '').join('|'),
    );
    for (let pg = 1; pg <= paginas; pg++) {
      const tPg = Date.now();
      if (pg > 1) await this.irParaPagina(pg, primeiraLinha);
      if (process.env.GAVIX_DEPURAR) console.log(`[folha ${anoMes}] página ${pg}/${paginas} carregada em ${Math.round((Date.now() - tPg) / 1000)}s; linhas até agora ${linhas.length}`);
      const html = await this.p.content();
      brutos.push({ tipo: 'folha_tela', referencia: `${anoMes} p${pg}`, nomeSugerido: `folha_${anoMes.replace('/', '-')}_p${String(pg).padStart(2, '0')}.html`, conteudo: Buffer.from(html, 'utf-8') });
      // lê cada campo pelo id do GeneXus (W0044vGRID<CAMPO>_<linha>), não pela posição: há colunas vazias (ex.: ocupação)
      const registros: Record<string, string>[] = await this.p.evaluate(() => {
        const porLinha = new Map<string, Record<string, string>>();
        for (const s of document.querySelectorAll('span[id*="vGRID"]')) {
          const m = s.id.match(/vGRID([A-Z]+)_(\d{4,})$/);
          if (!m) continue;
          const r = porLinha.get(m[2]) ?? {};
          r[m[1]] = (s.textContent || '').replace(/\s+/g, ' ').trim();
          porLinha.set(m[2], r);
        }
        return [...porLinha.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map((e) => e[1]);
      });
      for (const r of registros) {
        if (!r.PESSOAMATRICULA) continue;
        // o portal escreve "2026/9" (sem zero à esquerda): compara ano e mês como números
        const [ra, rm] = (r.REMUNERACAOREFERENCIA ?? '').split('/').map(Number);
        if (ra !== ano || rm !== mes) throw new Error(`folha ${anoMes} p${pg}: linha de outro mês (${r.REMUNERACAOREFERENCIA})`);
        linhas.push({
          anoMes,
          seq: linhas.length + 1,
          matricula: r.PESSOAMATRICULA,
          nome: r.PESSOANOME ?? '',
          cargo: r.CARGODSC ?? '',
          ocupacao: r.OCUPACAONOME ?? '',
          tipoVinculo: r.SITFUNCIONALDSC ?? '',
          situacaoOriginal: r.STATUSSERVIDORSITDSC ?? '',
          lotacao: r.LOTACAONOME ?? '',
          vencimentos: centavos(r.VENCIMENTOBASICO),
          bruto: centavos(r.REMUNERACAOBRUTA),
          previdencia: centavos(r.DESCONTOPREVIDENCIA),
          desconto: centavos(r.DESCONTOSAUDE),
          irrf: centavos(r.DESCONTOIRRF),
          liquido: centavos(r.REMUNERACAOLIQUIDA),
        });
      }
    }
    return { dados: { anoMes, linhasInformadasPelaFonte: informado, linhas }, brutos };
  }
}
