import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { enviarBackupSistema } from "@/lib/email";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR");
}

function addSheet(wb: XLSX.WorkBook, nome: string, cols: string[], linhas: any[][]) {
  const ws = XLSX.utils.aoa_to_sheet([cols, ...linhas]);
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

export async function gerarBackupXlsx(): Promise<Buffer> {
  const [requerimentos, tags, segov, sessoes, vereadores, comissoes, analistas, auditLogs] = await Promise.all([
    prisma.requerimento.findMany({ orderBy: { createdAt: "desc" }, include: { vereador: true } }),
    prisma.tag.findMany({ orderBy: { createdAt: "desc" }, include: { vereador: true } }),
    prisma.segov.findMany({ orderBy: [{ ano: "desc" }, { numero: "asc" }], include: { vereador: true } }),
    prisma.sessao.findMany({ orderBy: { data: "desc" } }),
    prisma.vereador.findMany({ orderBy: { nome: "asc" } }),
    prisma.comissao.findMany({ orderBy: { nome: "asc" } }),
    prisma.analista.findMany({ orderBy: { nome: "asc" }, include: { comissao: true } }),
    prisma.auditLog.findMany({
      where: { criadoEm: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  const wb = XLSX.utils.book_new();

  addSheet(wb, "Requerimentos",
    ["Tipo", "Número", "Ano", "Descrição", "Vereador", "Status", "Envio"],
    requerimentos.map(r => [
      r.tipo, r.numero, r.ano, r.descricao, r.vereador?.nome ?? r.autorNome ?? "", r.status,
      fmtDate(r.dataEnvio),
    ]));

  addSheet(wb, "TAGs",
    ["Referência", "Data", "Vereador", "Pedido", "Status", "Relevância", "Origem", "Categoria", "Secretaria", "Conclusão", "Documentos"],
    tags.map(t => [
      t.referencia, fmtDate(t.data), t.vereador?.nome ?? "", t.pedido, t.status,
      t.relevancia ?? "", t.origem ?? "", t.categoria ?? "", t.secretaria ?? "",
      fmtDate(t.dataConclusao), t.documentos ?? "",
    ]));

  addSheet(wb, "Proposições (SEGOV)",
    ["Tipo", "Número", "Ano", "Ementa", "Autor", "Status", "Envio", "Parecer Comissão", "Próx. Comissão", "Data Parecer"],
    segov.map(s => [
      s.tipo, s.numero, s.ano, s.ementa, s.vereador?.nome ?? s.autorNome ?? "", s.status,
      fmtDate(s.dataEnvio), s.parecerComissao ?? "", s.proxComissao ?? "", fmtDate(s.dataParecere),
    ]));

  addSheet(wb, "Sessões",
    ["Tipo", "Número", "Ano", "Data", "Local", "Status"],
    sessoes.map(s => [s.tipo, s.numero ?? "", s.ano ?? "", fmtDate(s.data), s.local ?? "", s.status]));

  addSheet(wb, "Vereadores",
    ["Nome", "Partido", "Legislatura", "Telefone", "E-mail", "Cargo", "Poder", "Ativo"],
    vereadores.map(v => [v.nome, v.partido, v.legislatura, v.telefone ?? "", v.email ?? "", v.cargo ?? "", v.poder, v.ativo ? "Sim" : "Não"]));

  addSheet(wb, "Comissões",
    ["Nome", "Sigla", "Tipo", "Ativa"],
    comissoes.map(c => [c.nome, c.sigla ?? "", c.tipo, c.ativa ? "Sim" : "Não"]));

  addSheet(wb, "Analistas",
    ["Nome", "E-mail", "Telefone", "Comissão", "Ativo"],
    analistas.map(a => [a.nome, a.email ?? "", a.telefone ?? "", a.comissao?.nome ?? "", a.ativo ? "Sim" : "Não"]));

  addSheet(wb, "Log Auditoria",
    ["Data/Hora", "Usuário", "Ação", "Entidade", "Referência", "Detalhes"],
    auditLogs.map(l => [fmtDateTime(l.criadoEm), l.usuarioNome ?? "", l.acao, l.entidade, l.referencia ?? "", l.detalhes ?? ""]));

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer as Buffer;
}

export async function enviarBackupEmail(emailDestino: string) {
  const buffer = await gerarBackupXlsx();
  const nomeArquivo = `backup_legislativo-pauta_${new Date().toISOString().split("T")[0]}.xlsx`;

  const destinatarios = new Set<string>();
  emailDestino.split(";").map(e => e.trim()).filter(Boolean).forEach(e => destinatarios.add(e));

  await enviarBackupSistema({ para: Array.from(destinatarios).join(", "), buffer, nomeArquivo });
}
