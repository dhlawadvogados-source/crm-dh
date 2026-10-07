/*************************************************************
 * CODIGO DO CRM (o mesmo Codigo.gs do Apps Script)
 *
 * Este arquivo roda no navegador atraves do js/gas-shim.js, que
 * imita o SpreadsheetApp. Para mudar regras do CRM, edite aqui do
 * mesmo jeito que voce editava o Codigo.gs (ou cole a versao nova).
 * Funcoes de e-mail/gatilho (MailApp, ScriptApp) nao funcionam na
 * versao web - veja o LEIA-ME.
 *************************************************************/
/*************************************************************
 * CRM FINANCEIRO DH LAW  -  v2  (Google Apps Script)
 * Backend. Banco = Google Sheets criado pelo proprio app.
 *************************************************************/

// >>> EDITE: quem pode acessar o app
var ALLOWED_EMAILS = [
  "adm@advogadosdh.com.br",
  "mariana@advogadosdh.com.br",
  "daphynii.work@gmail.com"
];

var DB_NAME = "CRM_DH_LAW_BASE (banco do app - nao editar)";

// Estrutura do banco (cabecalhos de cada aba)
var SHEETS = {
  Clientes:      ["ID","Nome","Tipo","Status","DataInicio","DataFim","DataReajuste","IndiceReajuste","ValorMensalidade","HorasContratadas","ProcessosContratados","ValorHoraExtra","ValorProcessoExtra","ValorAudiencia","Subtipo","PercGanho","Responsavel","Obs","DiaVencimento","FormaPagamento","PIX","Agencia","Conta","TitularConta"],
  Receber:       ["ID","Cliente","Tipo","IdentificarValor","Vencimento","Valor","Cobrado","Recebido","Conferido","DataRecebimento","AcaoCobranca","Obs"],
  Pagar:         ["ID","Descricao","Categoria","Valor","Data","Pago","Conferido"],
  Comissoes:     ["ID","Advogado","Contrato","ValorRecebido","PercIR","ValorIR","Base","PercComissao","ValorComissao","DataPaga"],
  Parcelas:      ["ID","ComissaoID","Advogado","Contrato","Parcela","ValorParcela","Mes","DataPaga","Status"],
  Rentabilidade: ["ID","Cliente","Advogado","ValorHora","HorasConsultivo","HorasProcessual","ValorPagoMes","Mes"],
  Propostas:     ["ID","Cliente","Advogado","Status","DataEnvio","DataCobrar","Valor","Obs","ContratoGerado","ContratoEnviado"],
  Advogados:     ["Nome","ValorHora"],
  Tarefas:       ["ID","Descricao","Data","Prioridade","Feito"],
  FechamentoConsultivo: ["Mes","Cliente","Tarefa","Data","Duracao","Responsavel"],
  FechamentoExtras:     ["Mes","Cliente","HorasProcessual","Audiencias","ValorAudiencias","ExcessoProcessos","ValorProcessos","DescricaoProcessos","Custas","DescricaoCustas","DescricaoAudiencias"],
  Colaboradores: ["ID","Nome","SalarioFixo","PassagemDia","DiariaValor","DiariaDia","EmpValor","EmpParcelaRef","EmpMesRef","EmpTotal","DataInicio","PIX","Conta","Ativo","Obs"],
  SalariosAjuste: ["Mes","Nome","Comissao","Reembolso","ReembolsoDesc","Passagem","Emprestimo","Outros","OutrosDesc","Obs","PassagemExcluida","PassagemDiasManual","DiariaQtdManual"],
  LancamentosSalario: ["ID","Mes","Nome","Tipo","Descricao","Cliente","Valor","ParcelaAtual","ParcelaTotal"],
  Ferias:        ["ID","Nome","Inicio","Fim","Dias","Status","Obs","Vencimento","Saldo"],
  Aniversarios:  ["ID","Nome","Data","PrevisaoReajuste","Obs"],
  FeriasHistorico: ["ID","Nome","Inicio","Fim","Dias","Obs"],
  Config:        ["Chave","Valor"],
  PagarPadrao:   ["Descricao","Valor","Categoria","DiaVencimento"],
  Extrato:       ["ID","Data","Descricao","Valor","Conta","Classe","Categoria","Chave","Obs","Importado"],
  ExtratoRegras: ["ID","Contem","Classe","Categoria","Conta","Ordem"],
  PLRFaixas:     ["ID","AnosMin","AnosMax","Percentual","Obs"],
  HistoricoSalarial: ["ID","Mes","Nome","Base"],
  Decimo13PLRAjuste: ["ID","Ano","Nome","AnosCasaManual","Adiantamento13","Adiantamento13Obs","ValorPLRManual","PLRParcela1Manual","Parcela13_1Manual","Parcela13_2Manual"]
};

// Advogados de referencia. VERSAO WEB: os valores/hora ficam so na aba Advogados da planilha.
var ADVOGADOS_REF = [];
var CONFIG_REF = [
  ["PercIR",11.5],["PercComissao",35],["DiasFollowUp",2],
  ["BoletoDias","05,10,15,25,28"],
  ["FaixaMuitoRentavel",50],["FaixaRentavel",30],["FaixaAtencao",15],["FaixaBaixa",0]
];
// Colaboradores (folha). Cols: Nome,SalarioFixo,PassagemDia,DiariaValor,DiariaDia,EmpValor,EmpParcelaRef,EmpMesRef,EmpTotal,DataInicio,PIX,Conta,Ativo,Obs
// VERSAO WEB: os dados dos colaboradores (PIX/CPF/salario) ficam so na aba Colaboradores da planilha.
var COLAB_SEED = [];
// Faixas do bônus de final de ano (PLR) por tempo de casa, sobre 1 salário — editável na tela "13º e PLR".
// AnosMin/AnosMax = anos completos de casa (AnosMax vazio = sem limite).
var PLR_SEED = [
  ["0","1","65","até 1 ano de casa"],
  ["1","2","75","até 2 anos de casa"],
  ["2","4","85","3 anos de casa"],
  ["4","","100","acima de 4 anos de casa"]
];

/* ---------- BANCO ---------- */
var _DB_CACHE = null;
function getDb_() {
  if (_DB_CACHE) return _DB_CACHE;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("DB_ID_V2");
  if (id) {
    try { _DB_CACHE = ensureSheets_(SpreadsheetApp.openById(id)); return _DB_CACHE; }
    catch (e) { throw new Error("Não consegui abrir a planilha configurada (ID " + id + "). NÃO vou criar uma planilha vazia. Rode corrigirBanco (ou apontarPlanilha com a URL certa). Detalhe: " + e.message); }
  }
  _DB_CACHE = setup();
  return _DB_CACHE;
}
/* DIAGNOSTICO: rode esta funcao no editor (selecione diagDB e clique Executar) e veja o Log/Execucoes.
   Mostra QUAL planilha o app esta lendo e quantas linhas tem em cada aba. */
function diagDB() {
  var ss = getDb_();
  var out = "Planilha que o app está lendo:\n" + ss.getUrl() + "\n\nLinhas por aba (fora o cabeçalho):\n";
  ["Clientes","Receber","Pagar","Comissoes","Parcelas","Propostas","Rentabilidade","Advogados"].forEach(function(n){
    var sh = ss.getSheetByName(n); out += "- " + n + ": " + (sh ? Math.max(0, sh.getLastRow()-1) : "(aba não existe)") + "\n";
  });
  Logger.log(out);
  return out;
}
/* CORRECAO: se o diagDB mostrar a planilha errada/vazia, rode apontarPlanilha com a URL da planilha CERTA.
   Ex.: apontarPlanilha("https://docs.google.com/spreadsheets/d/XXXXXXXX/edit") */
function apontarPlanilha(urlOuId) {
  var m = String(urlOuId||"").match(/[-\w]{25,}/);
  if (!m) throw new Error("Informe a URL ou o ID da planilha correta.");
  var ss = SpreadsheetApp.openById(m[0]); // valida o acesso
  ensureSheets_(ss);
  PropertiesService.getScriptProperties().setProperty("DB_ID_V2", m[0]);
  _DB_CACHE = null;
  return "Pronto! Agora o app vai ler: " + ss.getUrl();
}
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ex = props.getProperty("DB_ID_V2");
  if (ex) { return ensureSheets_(SpreadsheetApp.openById(ex)); } // já existe: nunca cria outra
  var ss = SpreadsheetApp.create(DB_NAME);
  ensureSheets_(ss);
  var d = ss.getSheetByName("Sheet1"); if (d) ss.deleteSheet(d);
  props.setProperty("DB_ID_V2", ss.getId());
  return ss;
}
// Atalho: reaponta o app para a planilha CERTA (banco do app) sem precisar digitar a URL.
function corrigirBanco() { return apontarPlanilha("1HooYBCmjCsP6NiSp5VH4w0rcjJ1D1Y_OxtVc2XCWsL8"); }

/* ---------- CONFIG / NOTA GRACIOLA / LEMBRETE ---------- */
// Grava (ou atualiza) uma chave na aba Config.
function apiSetConfig(chave, valor){
  try{
    var sh=getDb_().getSheetByName("Config");
    var vals=sh.getDataRange().getValues(); var head=vals[0];
    var ck=head.indexOf("Chave"), cv=head.indexOf("Valor");
    for(var i=1;i<vals.length;i++){ if(String(vals[i][ck])===String(chave)){ sh.getRange(i+1,cv+1).setValue(valor); return ok_({updated:true}); } }
    sh.appendRow([chave, valor]);
    return ok_({added:true});
  }catch(e){return err_(e.message);}
}
// Marca (ou desmarca) a Nota Graciola como gerada no mes ym ("yyyy-MM").
function apiMarcarNotaGraciola(ym, feito){
  try{
    var cfg=configMap_(); var set={};
    String(cfg.NotaGraciolaFeitos||"").split(",").forEach(function(x){ x=x.trim(); if(x) set[x]=true; });
    if(feito) set[ym]=true; else delete set[ym];
    var lista=Object.keys(set).sort().join(",");
    apiSetConfig("NotaGraciolaFeitos", lista);
    return ok_({feitos:lista});
  }catch(e){return err_(e.message);}
}
// Data-alvo da Nota Graciola no mes (dia 15; se cair sabado/domingo, dia util anterior). Retorna Date.
function notaGraciolaAlvo_(ano, mes){ // mes 0-11
  var d=new Date(ano, mes, 15); var dow=d.getDay(); // 0=dom,6=sab
  if(dow===6) d=new Date(ano, mes, 14);        // sabado -> sexta
  else if(dow===0) d=new Date(ano, mes, 13);   // domingo -> sexta
  return d;
}
// Cria o gatilho diario que dispara o e-mail de lembrete. Rodar UMA vez.
function criarGatilhoLembrete(){
  try{
    ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==="enviarLembreteNotaGraciola") ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger("enviarLembreteNotaGraciola").timeBased().everyDays(1).atHour(8).create();
    return "Gatilho diario criado. Vou te lembrar da Nota Graciola por e-mail.";
  }catch(e){ return "Erro: "+e.message; }
}
// Enviado pelo gatilho diario: manda e-mail 2 dias antes e no dia da Nota Graciola, se ainda nao marcada.
function enviarLembreteNotaGraciola(){
  var hoje=new Date(); hoje.setHours(0,0,0,0);
  var alvo=notaGraciolaAlvo_(hoje.getFullYear(), hoje.getMonth()); alvo.setHours(0,0,0,0);
  var ym=Utilities.formatDate(alvo, tz_(), "yyyy-MM");
  var cfg=configMap_();
  var feito = String(cfg.NotaGraciolaFeitos||"").split(",").map(function(x){return x.trim();}).indexOf(ym)>=0;
  if(feito) return;
  var diff=Math.round((alvo.getTime()-hoje.getTime())/86400000);
  if(diff!==2 && diff!==0) return; // avisa 2 dias antes e no dia
  var para = cfg.EmailLembrete || Session.getEffectiveUser().getEmail();
  var dataFmt=Utilities.formatDate(alvo, tz_(), "dd/MM/yyyy");
  var quando = diff===0 ? "HOJE ("+dataFmt+")" : "em 2 dias ("+dataFmt+")";
  MailApp.sendEmail(para, "Lembrete: GERAR NOTA GRACIOLA - "+quando,
    "Oi Mari,\n\nLembrete do CRM DH LAW: a NOTA GRACIOLA precisa ser gerada "+quando+".\n\n"+
    "Regra: todo dia 15; se cair no sabado ou domingo, no dia util anterior.\n\n"+
    "Quando gerar, marque como feita no painel do CRM para parar os lembretes deste mes.");
}
// cria as abas que faltam, SEM apagar dados existentes
function ensureSheets_(ss) {
  Object.keys(SHEETS).forEach(function(name){
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1,1,1,SHEETS[name].length).setValues([SHEETS[name]])
        .setFontWeight("bold").setBackground("#364B9B").setFontColor("#FFFFFF");
      sh.setFrozenRows(1);
      if (name === "Advogados" && ADVOGADOS_REF.length)
        sh.getRange(2,1,ADVOGADOS_REF.length,2).setValues(ADVOGADOS_REF);
      if (name === "Config" && CONFIG_REF.length)
        sh.getRange(2,1,CONFIG_REF.length,2).setValues(CONFIG_REF);
      if (name === "Colaboradores" && COLAB_SEED.length){
        var rows=COLAB_SEED.map(function(r){ return [Utilities.getUuid().replace(/-/g,"").slice(0,8)].concat(r); });
        sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
      }
      if (name === "PLRFaixas" && PLR_SEED.length){
        var plrRows=PLR_SEED.map(function(r){ return [Utilities.getUuid().replace(/-/g,"").slice(0,8)].concat(r); });
        sh.getRange(2,1,plrRows.length,plrRows[0].length).setValues(plrRows);
      }
    } else {
      // adiciona colunas novas ao final, sem apagar dados
      var lastCol = sh.getLastColumn() || 1;
      var head = sh.getRange(1,1,1,lastCol).getValues()[0];
      SHEETS[name].forEach(function(col){
        if (head.indexOf(col) === -1) {
          head.push(col);
          sh.getRange(1,head.length).setValue(col).setFontWeight("bold").setBackground("#364B9B").setFontColor("#FFFFFF");
        }
      });
    }
  });
  return ss;
}

/* ---------- ACESSO ---------- */
// Retorna o e-mail que o Apps Script consegue identificar na sessao.
// Em algumas implantacoes getActiveUser() pode vir vazio; nesse caso,
// usamos getEffectiveUser() como fallback.
function getAccessEmail_() {
  var active = "";
  var effective = "";

  try { active = Session.getActiveUser().getEmail() || ""; } catch (e) {}
  try { effective = Session.getEffectiveUser().getEmail() || ""; } catch (e) {}

  return String(active || effective || "").trim().toLowerCase();
}

function isAllowed_() {
  var email = getAccessEmail_();
  if (!email) return false;

  return ALLOWED_EMAILS.some(function(x) {
    return String(x || "").trim().toLowerCase() === email;
  });
}

// Diagnostico opcional: execute pelo editor para conferir qual conta
// o Apps Script esta reconhecendo.
function diagnosticarAcesso() {
  var active = "";
  var effective = "";
  try { active = Session.getActiveUser().getEmail() || ""; } catch (e) {}
  try { effective = Session.getEffectiveUser().getEmail() || ""; } catch (e) {}

  var out = {
    activeUser: active,
    effectiveUser: effective,
    emailUsado: getAccessEmail_(),
    autorizado: isAllowed_()
  };
  Logger.log(JSON.stringify(out));
  return out;
}

function doGet() {
  if (!isAllowed_()) {
    var email = getAccessEmail_();
    return HtmlService.createHtmlOutput(
      "<div style='font-family:Arial;padding:40px;color:#364B9B'>" +
      "<h2>Acesso restrito</h2>" +
      "<p>Esta ferramenta é privada da DH LAW.</p>" +
      "<p>Conta identificada: <strong>" + (email || "não identificada pelo Google") + "</strong></p>" +
      "<p>Se esta conta deveria ter acesso, entre novamente com a conta corporativa autorizada.</p>" +
      "</div>");
  }

  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("CRM Financeiro DH LAW")
    .addMetaTag("viewport","width=device-width, initial-scale=1");
}

/* ---------- LEITURA ---------- */
function objRows_(name) {
  var sh = getDb_().getSheetByName(name);
  var vals = sh.getDataRange().getValues();
  var head = vals[0]; var out = [];
  for (var i=1;i<vals.length;i++){
    var o = {}; var empty = true;
    for (var j=0;j<head.length;j++){
      var cell = vals[i][j];
      // datas viram texto (o transporte do Apps Script nao serializa Date com seguranca)
      if (Object.prototype.toString.call(cell) === "[object Date]")
        cell = Utilities.formatDate(cell, tz_(), "yyyy-MM-dd");
      o[head[j]] = cell;
      if (cell !== "") empty = false;
    }
    if (!empty) out.push(o);
  }
  return out;
}
function configMap_() {
  var m = {}; objRows_("Config").forEach(function(r){ m[r.Chave] = r.Valor; }); return m;
}
// Popular UMA vez a Programação de Férias e os Aniversários (dados do quadro do Monday). Não repete depois.
function seedFeriasAniv_(){
  try{
    var cfg=configMap_(); if(String(cfg.FeriasAnivSeed||"")==="sim") return;
    var ss=getDb_();
    var shF=ss.getSheetByName("Ferias"); var fv=shF?shF.getDataRange().getValues():[[]];
    if(shF && fv.length<=1){
      var FER=[
        ["Cíntia Wolf","2026-08-01",17,"Pendente"],
        ["Ana Carolina de Souza","2026-06-01",22,"Pendente"],
        ["Igor Palheta","2026-08-01",32,"Pendente"],
        ["Camilla Cambui","2026-07-01",1,"Pendente"],
        ["Daphyni da Silva","2026-06-01",37,"Pendente"],
        ["André","2026-11-01",22,"Pendente"],
        ["Janaína","2027-06-01",9,"2027"],
        ["Amanda","2027-03-01",0,"2027"]
      ];
      FER.forEach(function(r){ apiAdd("Ferias",{Nome:r[0],Vencimento:r[1],Saldo:r[2],Status:r[3],Obs:""}); });
    }
    var shA=ss.getSheetByName("Aniversarios"); var av=shA?shA.getDataRange().getValues():[[]];
    if(shA && av.length<=1){
      var ANI=[
        ["Mariana Domingues","02/05"],["André Caresia","23/11"],["Ana Carolina de Souza","24/10"],
        ["Luiz Alencar","14/06"],["Daphyni da Silva","06/06"],["Cíntia Wolf","02/08"],
        ["Igor Palheta","03/11"],["Camilla Cambui","23/07"]
      ];
      ANI.forEach(function(r){ apiAdd("Aniversarios",{Nome:r[0],Data:r[1],Obs:""}); });
    }
    apiSetConfig("FeriasAnivSeed","sim");
  }catch(_e){}
}
function apiGetAll() {
  try {
    seedFeriasAniv_();
    var d = {
      today: Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd"),
      email: Session.getActiveUser().getEmail() || "",
      config: configMap_(),
      clientes: objRows_("Clientes"),
      receber: objRows_("Receber"),
      pagar: objRows_("Pagar"),
      comissoes: objRows_("Comissoes"),
      parcelas: objRows_("Parcelas"),
      rentabilidade: objRows_("Rentabilidade"),
      propostas: objRows_("Propostas"),
      advogados: objRows_("Advogados"),
      tarefas: objRows_("Tarefas"),
      colaboradores: objRows_("Colaboradores"),
      ferias: objRows_("Ferias"),
      aniversarios: objRows_("Aniversarios"),
      feriasHistorico: objRows_("FeriasHistorico"),
      lancamentosSalario: objRows_("LancamentosSalario"),
      extrato: objRows_("Extrato"),
      extratoRegras: objRows_("ExtratoRegras"),
      plrFaixas: objRows_("PLRFaixas"),
      historicoSalarial: objRows_("HistoricoSalarial"),
      decimo13PLRAjuste: objRows_("Decimo13PLRAjuste")
    };
    d.dash = dashboardFrom_(d);   // dashboard calculado sem reler as abas
    return ok_(d);
  } catch (e) { return err_(e.message); }
}
function tz_(){ return Session.getScriptTimeZone() || "America/Sao_Paulo"; }
function ok_(data){ return { success:true, data:data }; }
function err_(msg){ return { success:false, error:String(msg) }; }

/* ---------- PAGAMENTOS PREVISTOS PADRAO ---------- */
/* [Descricao, Valor, Categoria, DiaVencimento]
   VERSAO WEB: a lista agora fica na aba "PagarPadrao" da planilha (nao no codigo),
   para que salarios e valores nao fiquem visiveis no GitHub. */
function defaultPagar_(){
  var sh=getDb_().getSheetByName("PagarPadrao"); if(!sh) return [];
  return objRows_("PagarPadrao").filter(function(r){ return String(r.Descricao||"").trim(); })
    .map(function(r){ return [String(r.Descricao).trim(), money_(r.Valor), r.Categoria||"Outros", parseInt(r.DiaVencimento,10)||1]; });
}
function monthKeyOf_(v){
  if(!v) return "";
  if(Object.prototype.toString.call(v)==="[object Date]"){ return Utilities.formatDate(v, tz_(), "yyyy-MM"); }
  var s=String(v).trim();
  var m=s.match(/^(\d{4})-(\d{2})/); if(m) return m[1]+"-"+m[2];
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(m) return m[3]+"-"+m[2];
  return "";
}
// Gera as contas previstas do mes informado (ym = "2026-08"), com data de vencimento.
// Nao duplica: pula a conta que ja existe naquele mes.
function apiGerarPagarMes(ym){
  try{
    ym = String(ym||"").slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(ym)) return err_("mês inválido");
    var existing = {};
    objRows_("Pagar").forEach(function(r){
      if(monthKeyOf_(r.Data) === ym) existing[String(r.Descricao).trim().toLowerCase()] = 1;
    });
    var add = 0;
    var DEFAULT_PAGAR = defaultPagar_();
    if(!DEFAULT_PAGAR.length) return err_("Cadastre as contas fixas na aba PagarPadrao da planilha (colunas Descricao, Valor, Categoria, DiaVencimento).");
    DEFAULT_PAGAR.forEach(function(t){
      var key = String(t[0]).trim().toLowerCase();
      if(existing[key]) return;
      var dia = ("0"+(t[3]||1)).slice(-2);
      apiAdd("Pagar",{Descricao:t[0], Valor:t[1], Categoria:t[2], Data: ym+"-"+dia, Pago:"Não"});
      add++;
    });
    return ok_({added:add});
  }catch(e){return err_(e.message);}
}
// Lanca em Contas a Receber a mensalidade de cada contrato ATIVO no mes informado.
// DET vira Tipo "DET"; assessoria/mensal vira Tipo "Mensal". Nao duplica no mesmo mes.
var RECEBER_LABEL = {Mensal:"Mensal",DET:"DET","Audiência":"Audiência",Consultivo:"Horas consultivo",Processual:"Horas processual",Reembolso:"Reembolso de custas",Outros:"Outros"};
function eqNome_(a,b){ return String(a).trim().toLowerCase()===String(b).trim().toLowerCase(); }
function firstReceberVenc_(nome,ym){ var v=null; objRows_("Receber").forEach(function(r){ if(!v && eqNome_(r.Cliente,nome) && monthKeyOf_(r.Vencimento)===ym) v=r.Vencimento; }); return v; }
function diaFrom_(v){ if(v===""||v==null) return 0; var s=String(v).trim(); var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return parseInt(m[3],10); m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return parseInt(m[1],10); var n=parseInt(s,10); return (n>=1&&n<=31)?n:0; }
// Le valor monetario tolerando texto tipo "R$ 4.200,00" (ponto de milhar, virgula decimal).
function money_(v){ if(typeof v==="number") return v; var s=String(v==null?"":v).replace(/[^0-9.,-]/g,""); if(s.indexOf(",")>=0&&s.indexOf(".")>=0){ s=s.replace(/\./g,"").replace(",","."); } else if(s.indexOf(",")>=0){ s=s.replace(",","."); } var n=parseFloat(s); return isNaN(n)?0:n; }
function findReceberRow_(nome,ym,canon){ var f=null; objRows_("Receber").forEach(function(r){ if(!f && eqNome_(r.Cliente,nome) && monthKeyOf_(r.Vencimento)===ym && tipoKey_(r.Tipo)===canon) f={id:r.ID,valor:money_(r.Valor)}; }); return f; }
// Cria/atualiza/apaga os lancamentos de um cliente num mes (um por tipo).
function apiUpsertReceberCliente(cliente, ym, valores, base){
  try{
    base=base||{}; ym=String(ym||"").slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(ym)) return err_("mês inválido");
    var fallbackVenc = base.Vencimento || firstReceberVenc_(cliente,ym) || (ym+"-10");
    (valores||[]).forEach(function(v){
      var canon=tipoKey_(v.Tipo); var val=Number(v.Valor)||0;
      var ex=findReceberRow_(cliente,ym,canon);
      if(val>0){
        if(ex){ apiUpdate("Receber",ex.id,"Valor",val); }
        else{ apiAdd("Receber",{Cliente:cliente,Tipo:(RECEBER_LABEL[canon]||v.Tipo),Vencimento:fallbackVenc,IdentificarValor:(base.IdentificarValor||""),Valor:val,Cobrado:"Não",Recebido:"Não"}); }
      } else if(ex){ apiDelete("Receber",ex.id); }
    });
    if(base.Vencimento!==undefined || base.IdentificarValor!==undefined){
      objRows_("Receber").forEach(function(r){
        if(eqNome_(r.Cliente,cliente) && monthKeyOf_(r.Vencimento)===ym){
          if(base.Vencimento) apiUpdate("Receber",r.ID,"Vencimento",base.Vencimento);
          if(base.IdentificarValor!==undefined) apiUpdate("Receber",r.ID,"IdentificarValor",base.IdentificarValor);
        }
      });
    }
    return ok_(true);
  }catch(e){return err_(e.message);}
}
// Atualiza campos (Vencimento/Cobrado/Recebido/Conferido/AcaoCobranca) em todos os lancamentos do cliente no mes.
function apiUpdateReceberCliente(cliente, ym, obj){
  try{
    var snap=objRows_("Receber").filter(function(r){ return eqNome_(r.Cliente,cliente) && monthKeyOf_(r.Vencimento)===ym; });
    snap.forEach(function(r){ Object.keys(obj).forEach(function(k){ apiUpdate("Receber",r.ID,k,obj[k]); }); });
    return ok_(true);
  }catch(e){return err_(e.message);}
}
function apiDeleteReceberCliente(cliente, ym){
  try{
    var ids=[]; objRows_("Receber").forEach(function(r){ if(eqNome_(r.Cliente,cliente) && monthKeyOf_(r.Vencimento)===ym) ids.push(r.ID); });
    ids.forEach(function(id){ apiDelete("Receber",id); });
    return ok_({removed:ids.length});
  }catch(e){return err_(e.message);}
}
// Sincroniza as mensalidades (assessoria + DET) dos contratos ATIVOS para o mes.
function apiSincronizarReceber(ym){
  try{
    ym=String(ym||"").slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(ym)) return err_("mês inválido");
    var agg={};
    objRows_("Clientes").forEach(function(c){
      var st=norm_(c.Status); if(st.indexOf("ativo")<0||st.indexOf("inativo")>=0) return;
      var v=Number(c.ValorMensalidade)||0; if(v<=0) return;
      var nome=c.Nome; if(!agg[nome])agg[nome]={mAss:0,mDet:0,dia:0};
      if(String(c.Tipo||"").toLowerCase().indexOf("det")>=0) agg[nome].mDet+=v; else agg[nome].mAss+=v;
      var d=diaFrom_(c.DiaVencimento); if(d && !agg[nome].dia) agg[nome].dia=d;
    });
    var created=0, updated=0, venctos=0;
    Object.keys(agg).forEach(function(nome){
      var a=agg[nome];
      var want = a.dia ? (ym+"-"+("0"+a.dia).slice(-2)) : (firstReceberVenc_(nome,ym)||ym+"-10");
      [["Mensal",a.mAss],["DET",a.mDet]].forEach(function(p){
        var canon=p[0], val=p[1]; if(val<=0) return;
        var ex=findReceberRow_(nome,ym,canon);
        if(ex){ if(ex.valor!==val){ apiUpdate("Receber",ex.id,"Valor",val); updated++; } }
        else{ apiAdd("Receber",{Cliente:nome,Tipo:canon,Vencimento:want,Valor:val,Cobrado:"Não",Recebido:"Não"}); created++; }
      });
      // se o contrato tem dia definido, alinha o vencimento de todas as cobrancas do cliente no mes
      if(a.dia){
        objRows_("Receber").forEach(function(r){
          if(eqNome_(r.Cliente,nome) && monthKeyOf_(r.Vencimento)===ym && String(r.Vencimento).slice(0,10)!==want){
            apiUpdate("Receber",r.ID,"Vencimento",want); venctos++;
          }
        });
      }
    });
    return ok_({created:created, updated:updated, venctos:venctos, added:created});
  }catch(e){return err_(e.message);}
}
// Gera parcelas de um contrato pontual em Contas a Receber, distribuidas mes a mes.
// tipo: rotulo da cobranca (ex "Outros","Horas processual"); n: numero de parcelas; primeiroVenc: yyyy-mm-dd.
function apiGerarParcelasPontual(cliente, tipo, valorTotal, n, primeiroVenc){
  try{
    cliente=String(cliente||"").trim(); if(!cliente) return err_("Informe o cliente");
    n=parseInt(n,10); if(!(n>=1)) return err_("Número de parcelas inválido");
    valorTotal=money_(valorTotal); if(valorTotal<=0) return err_("Valor total inválido");
    tipo=String(tipo||"Outros").trim()||"Outros";
    var m=String(primeiroVenc||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
    var y,mo,day;
    if(m){ y=parseInt(m[1],10); mo=parseInt(m[2],10)-1; day=parseInt(m[3],10); }
    else { var t=new Date(); y=t.getFullYear(); mo=t.getMonth(); day=10; }
    var base=Math.floor(valorTotal/n*100)/100, soma=0, valores=[];
    for(var i=0;i<n;i++){ var v=(i===n-1)?Math.round((valorTotal-soma)*100)/100:base; soma=Math.round((soma+v)*100)/100; valores.push(v); }
    var created=0;
    for(var j=0;j<n;j++){
      var d=new Date(y, mo+j, 1); var yy=d.getFullYear(), mm=d.getMonth();
      var lastDay=new Date(yy, mm+1, 0).getDate(); var dd=Math.min(day, lastDay);
      var venc=yy+"-"+("0"+(mm+1)).slice(-2)+"-"+("0"+dd).slice(-2);
      apiAdd("Receber",{Cliente:cliente, Tipo:tipo, Vencimento:venc, Valor:valores[j], Cobrado:"Não", Recebido:"Não", IdentificarValor:(n>1?("Parcela "+(j+1)+"/"+n):"")});
      created++;
    }
    return ok_({created:created});
  }catch(e){return err_(e.message);}
}
// Importa a lista de contratos pontuais (clientes + parcelas em Contas a Receber). Rodar UMA vez.
// Encerrados entram como ja recebidos; Ativos entram em aberto (exceto os marcados pago:true). Coluna "Outros".
function apiImportarPontuais(){
  // VERSAO WEB: a lista fixa de clientes/valores foi retirada do codigo (os dados ja estao na planilha).
  return err_("Importação inicial de pontuais desativada na versão web (os dados já estão na planilha).");
  try{
    function seq(n,v,pago){ var a=[]; for(var i=0;i<n;i++) a.push({off:i,v:v,pago:pago}); return a; }
    var P=[];
    var existingCli={}; objRows_("Clientes").forEach(function(c){ existingCli[norm_(c.Nome)]=true; });
    var recRows=objRows_("Receber");
    function recExists(nome,venc,valor){ return recRows.some(function(r){ return eqNome_(r.Cliente,nome) && String(r.Vencimento).slice(0,10)===venc && Math.abs(money_(r.Valor)-valor)<0.005; }); }
    var cliCriados=0, parcCriadas=0, parcPulos=0;
    P.forEach(function(it){
      if(!existingCli[norm_(it.nome)]){
        apiAdd("Clientes",{Nome:it.nome, Tipo:"Pontual", Status:it.status, DataInicio:it.ini, Responsavel:it.resp||"Mariana", Obs:it.obs||"", Subtipo:"Parcelado"});
        existingCli[norm_(it.nome)]=true; cliCriados++;
      }
      var m=it.ini.match(/^(\d{4})-(\d{2})-(\d{2})/); var y=parseInt(m[1],10), mo=parseInt(m[2],10)-1, day=parseInt(m[3],10);
      var total=it.parc.length;
      it.parc.forEach(function(p,idx){
        var d=new Date(y, mo+p.off, 1); var yy=d.getFullYear(), mm=d.getMonth();
        var last=new Date(yy,mm+1,0).getDate(); var dd=Math.min(day,last);
        var venc=yy+"-"+("0"+(mm+1)).slice(-2)+"-"+("0"+dd).slice(-2);
        if(recExists(it.nome,venc,p.v)){ parcPulos++; return; }
        var pago = p.pago===true;
        apiAdd("Receber",{Cliente:it.nome, Tipo:"Outros", Vencimento:venc, Valor:p.v, Cobrado:(pago?"Sim":"Não"), Recebido:(pago?"Sim":"Não"), Conferido:(pago?"Sim":"Não"), IdentificarValor:(total>1?("Parcela "+(idx+1)+"/"+total):"")});
        recRows.push({Cliente:it.nome, Vencimento:venc, Valor:p.v});
        parcCriadas++;
      });
    });
    return ok_({clientes:cliCriados, parcelas:parcCriadas, pulados:parcPulos});
  }catch(e){return err_(e.message);}
}
// Remove contas a pagar que ficaram sem data (dados de teste antigos).
function apiLimparPagarSemData(){
  try{
    var sh = getDb_().getSheetByName("Pagar");
    var vals = sh.getDataRange().getValues(); var head = vals[0];
    var dc = head.indexOf("Data");
    var removed = 0;
    for(var i=vals.length-1;i>=1;i--){
      var dv = dc>=0 ? vals[i][dc] : "";
      if(dv===""||dv===null||typeof dv==="undefined"){ sh.deleteRow(i+1); removed++; }
    }
    return ok_({removed:removed});
  }catch(e){return err_(e.message);}
}

/* ---------- ESCRITA (guiada pelos cabecalhos reais da aba) ---------- */
function newId_(){ return Utilities.getUuid().substring(0,8); }
function headOf_(sh){ return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; }

function apiAdd(name, obj) {
  try {
    var sh = getDb_().getSheetByName(name);
    var head = headOf_(sh);
    var row = head.map(function(c){
      if (c === "ID") return obj.ID || newId_();
      return (obj[c] !== undefined && obj[c] !== null) ? obj[c] : "";
    });
    if (name === "Comissoes") row = calcComissaoRow_(head, row);
    sh.appendRow(row);
    return ok_({ id: row[head.indexOf("ID")] });
  } catch (e) { return err_(e.message); }
}
// Cria um lancamento por tipo que teve valor (>0), tudo no mesmo cliente/vencimento.
function apiAddReceberMulti(base, valores) {
  try {
    var sh = getDb_().getSheetByName("Receber");
    var head = headOf_(sh);
    var added = 0, ids = [];
    (valores || []).forEach(function(v){
      var valor = Number(v.Valor);
      if (!valor || valor <= 0) return;
      var obj = {
        Cliente: base.Cliente || "",
        Tipo: v.Tipo,
        IdentificarValor: base.IdentificarValor || "",
        Vencimento: base.Vencimento || "",
        Valor: valor,
        Cobrado: "Não",
        Recebido: "Não"
      };
      var row = head.map(function(c){ return c === "ID" ? newId_() : ((obj[c] !== undefined && obj[c] !== null) ? obj[c] : ""); });
      sh.appendRow(row);
      ids.push(row[head.indexOf("ID")]);
      added++;
    });
    return ok_({ added: added, ids: ids });
  } catch (e) { return err_(e.message); }
}
function apiUpdate(name, id, field, value) {
  try {
    var sh = getDb_().getSheetByName(name);
    var vals = sh.getDataRange().getValues(); var head = vals[0];
    var idc = head.indexOf("ID"), fc = head.indexOf(field);
    if (fc < 0) return err_("campo " + field + " nao existe");
    for (var i=1;i<vals.length;i++){
      if (String(vals[i][idc]) === String(id)) {
        sh.getRange(i+1, fc+1).setValue(value);
        if (name === "Comissoes") recalcComissaoAtRow_(sh, i+1);
        return ok_(true);
      }
    }
    return err_("registro nao encontrado");
  } catch (e) { return err_(e.message); }
}
function apiUpdateRow(name, id, obj) {
  try {
    var sh = getDb_().getSheetByName(name);
    var vals = sh.getDataRange().getValues(); var head = vals[0]; var idc = head.indexOf("ID");
    for (var i=1;i<vals.length;i++){
      if (String(vals[i][idc]) === String(id)) {
        head.forEach(function(c,ci){ if (c!=="ID" && obj[c]!==undefined) vals[i][ci]=obj[c]; });
        if (name === "Comissoes") vals[i] = calcComissaoRow_(head, vals[i]);
        sh.getRange(i+1,1,1,head.length).setValues([vals[i]]);
        return ok_(true);
      }
    }
    return err_("registro nao encontrado");
  } catch (e) { return err_(e.message); }
}
function apiDelete(name, id) {
  try {
    var sh = getDb_().getSheetByName(name);
    var vals = sh.getDataRange().getValues(); var head = vals[0]; var idc = head.indexOf("ID");
    for (var i=1;i<vals.length;i++){
      if (String(vals[i][idc]) === String(id)) { sh.deleteRow(i+1); return ok_(true); }
    }
    return err_("registro nao encontrado");
  } catch (e) { return err_(e.message); }
}

/* ---------- CALCULOS ---------- */
// Comissao: IR = recebido*%IR ; Base = recebido-IR ; Comissao = Base*%comissao
function calcComissaoRow_(head, row) {
  var cfg = configMap_();
  var rec = Number(row[head.indexOf("ValorRecebido")]) || 0;
  var pIR = Number(row[head.indexOf("PercIR")]) || Number(cfg.PercIR) || 0;
  var pC  = Number(row[head.indexOf("PercComissao")]) || Number(cfg.PercComissao) || 0;
  var ir = rec * pIR/100;
  var base = rec - ir;
  var com = base * pC/100;
  row[head.indexOf("PercIR")] = pIR;
  row[head.indexOf("PercComissao")] = pC;
  row[head.indexOf("ValorIR")] = round2_(ir);
  row[head.indexOf("Base")] = round2_(base);
  row[head.indexOf("ValorComissao")] = round2_(com);
  return row;
}
function recalcComissaoAtRow_(sh, rowNum) {
  var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var vals = sh.getRange(rowNum,1,1,head.length).getValues()[0];
  vals = calcComissaoRow_(head, vals);
  sh.getRange(rowNum,1,1,head.length).setValues([vals]);
}
function round2_(n){ return Math.round(n*100)/100; }
function addMonth_(ym, n){ var y=parseInt(String(ym).slice(0,4),10), m=parseInt(String(ym).slice(5,7),10)+n; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return y+"-"+("0"+m).slice(-2); }
// Cria a comissao e ja gera as N parcelas (padrao 3), comecando no mes seguinte ao do contrato.
function apiAddComissao(obj, nParcelas, mesContrato){
  try{
    obj = obj||{};
    var rec=Number(obj.ValorRecebido)||0; if(rec<0) return err_("Valor recebido não pode ser negativo.");
    var cfg=configMap_();
    var pIR=(obj.PercIR===''||obj.PercIR==null)?(Number(cfg.PercIR)||11.5):Number(obj.PercIR);
    var pC =(obj.PercComissao===''||obj.PercComissao==null)?(Number(cfg.PercComissao)||35):Number(obj.PercComissao);
    if(isNaN(pIR)||pIR<0||pIR>100) return err_("% de IR inválido.");
    if(isNaN(pC)||pC<0||pC>100) return err_("% de comissão inválido.");
    var n=parseInt(nParcelas,10)||3; if(n<1)n=1; if(n>36)n=36;
    var addRes=apiAdd("Comissoes",{Advogado:obj.Advogado||"", Contrato:obj.Contrato||"", ValorRecebido:rec, PercIR:pIR, PercComissao:pC, DataPaga:obj.DataPaga||""});
    if(!addRes.success) return addRes;
    var comId=addRes.data.id;
    var ir=round2_(rec*pIR/100), base=round2_(rec-ir), total=round2_(base*pC/100);
    var mc = /^\d{4}-\d{2}$/.test(String(mesContrato||"")) ? String(mesContrato) : Utilities.formatDate(new Date(), tz_(), "yyyy-MM");
    var primeiro = addMonth_(mc, 1); // parcelas comecam no mes seguinte ao contrato
    var p=round2_(total/n), acc=0;
    for(var i=0;i<n;i++){
      var val=(i===n-1)?round2_(total-acc):p; acc=round2_(acc+p);
      apiAdd("Parcelas",{ComissaoID:comId, Advogado:obj.Advogado||"", Contrato:obj.Contrato||"", Parcela:(i+1)+"/"+n, ValorParcela:val, Mes:addMonth_(primeiro,i), DataPaga:"", Status:"Pendente"});
    }
    return ok_({id:comId, total:total, parcelas:n, primeiroMes:primeiro});
  }catch(e){return err_(e.message);}
}
function apiEditComissao(id, obj, nParcelas, mesContrato){
  try{
    obj=obj||{};
    var rec=Number(obj.ValorRecebido)||0; if(rec<0) return err_("Valor recebido não pode ser negativo.");
    var pIR=Number(obj.PercIR); var pC=Number(obj.PercComissao);
    if(isNaN(pIR)||pIR<0||pIR>100) return err_("% de IR inválido.");
    if(isNaN(pC)||pC<0||pC>100) return err_("% de comissão inválido.");
    var upRes=apiUpdateRow("Comissoes", id, {Advogado:obj.Advogado||"", Contrato:obj.Contrato||"", ValorRecebido:rec, PercIR:pIR, PercComissao:pC, DataPaga:obj.DataPaga||""});
    if(!upRes.success) return upRes;
    var ps=objRows_("Parcelas").filter(function(r){return String(r.ComissaoID)===String(id);});
    var anyPaid=ps.some(function(r){return norm_(r.Status)=="pago";});
    if(anyPaid) return ok_({regenerated:false});
    ps.forEach(function(r){apiDelete("Parcelas",r.ID);});
    var ir=round2_(rec*pIR/100), base=round2_(rec-ir), total=round2_(base*pC/100);
    var n=parseInt(nParcelas,10)||3; if(n<1)n=1; if(n>36)n=36;
    var mc=/^\d{4}-\d{2}$/.test(String(mesContrato||""))?String(mesContrato):Utilities.formatDate(new Date(),tz_(),"yyyy-MM");
    var primeiro=addMonth_(mc,1), p=round2_(total/n), acc=0;
    for(var i=0;i<n;i++){ var val=(i===n-1)?round2_(total-acc):p; acc=round2_(acc+p); apiAdd("Parcelas",{ComissaoID:id, Advogado:obj.Advogado||"", Contrato:obj.Contrato||"", Parcela:(i+1)+"/"+n, ValorParcela:val, Mes:addMonth_(primeiro,i), DataPaga:"", Status:"Pendente"}); }
    return ok_({regenerated:true});
  }catch(e){return err_(e.message);}
}
function apiDeleteComissao(id){
  try{
    var ids=[]; objRows_("Parcelas").forEach(function(r){ if(String(r.ComissaoID)===String(id)) ids.push(r.ID); });
    ids.forEach(function(pid){ apiDelete("Parcelas",pid); });
    return apiDelete("Comissoes",id);
  }catch(e){return err_(e.message);}
}
/* ----- CORRECAO DA IMPORTACAO DE COMISSOES -----
   Cada contrato = 1 comissao com N parcelas. Competencia (Mes = YYYY-MM) != data de pagamento.
   Parcelas nascem PENDENTES (DataPaga vazia). ValorComissao = soma das parcelas (historico). */
var COMISSOES_SEED = []; // VERSAO WEB: a importacao inicial de comissoes ja foi feita; os dados ficam na planilha
function limparAba_(name){
  var sh=getDb_().getSheetByName(name); var last=sh.getLastRow();
  if(last>1) sh.deleteRows(2,last-1);
}
function appendRaw_(name,obj){
  var sh=getDb_().getSheetByName(name); var head=headOf_(sh);
  var row=head.map(function(c){ if(c==="ID")return obj.ID||newId_(); return (obj[c]!==undefined&&obj[c]!==null)?obj[c]:""; });
  sh.appendRow(row); return row[head.indexOf("ID")];
}
function apiReconstruirComissoes(){
  try{
    if(!COMISSOES_SEED.length) return err_("A correção da importação inicial de comissões foi desativada na versão web (ela apagaria as comissões atuais). Os dados já estão na planilha.");
    limparAba_("Comissoes"); limparAba_("Parcelas");
    var porAdv={}, totParc=0, totCom=0;
    COMISSOES_SEED.forEach(function(c){
      var rec = (c.rec===null||c.rec===undefined) ? "" : Number(c.rec);
      var pIR = (rec==="") ? "" : 11.5;
      var vIR = (rec==="") ? "" : round2_(rec*0.115);
      var base= (rec==="") ? "" : round2_(rec - vIR);
      var pC  = (rec==="") ? "" : 35;
      var total = round2_(c.parc.reduce(function(s,p){return s+p[1];},0)); // comissao = soma das parcelas (historico)
      var comId = appendRaw_("Comissoes",{Advogado:c.adv,Contrato:c.contrato,ValorRecebido:rec,PercIR:pIR,ValorIR:vIR,Base:base,PercComissao:pC,ValorComissao:total,DataPaga:""});
      var n=c.parc.length;
      c.parc.forEach(function(p,i){
        appendRaw_("Parcelas",{ComissaoID:comId,Advogado:c.adv,Contrato:c.contrato,Parcela:(i+1)+"/"+n,ValorParcela:p[1],Mes:p[0],DataPaga:"",Status:"Pendente"});
        totParc++;
      });
      porAdv[c.adv]=(porAdv[c.adv]||0)+1; totCom+=total;
    });
    return ok_({ comissoes: COMISSOES_SEED.length, parcelas: totParc, porAdvogado: porAdv, comissaoTotal: round2_(totCom) });
  }catch(e){return err_(e.message);}
}
function apiPagarParcela(id, dataPaga){
  try{
    var dt = (dataPaga && String(dataPaga).trim()) ? String(dataPaga) : Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd");
    apiUpdate("Parcelas", id, "Status", "Pago");
    apiUpdate("Parcelas", id, "DataPaga", dt);
    return ok_(true);
  }catch(e){return err_(e.message);}
}
function apiDespagarParcela(id){
  try{ apiUpdate("Parcelas", id, "Status", "Pendente"); apiUpdate("Parcelas", id, "DataPaga", ""); return ok_(true); }catch(e){return err_(e.message);}
}
function apiUpdateParcelaData(id, data){
  try{ apiUpdate("Parcelas", id, "DataPaga", data||""); return ok_(true); }catch(e){return err_(e.message);}
}
function apiUpdateParcelaValor(id, val){
  try{
    val=Number(val); if(isNaN(val)||val<0) return err_("Valor da parcela inválido.");
    apiUpdate("Parcelas", id, "ValorParcela", round2_(val));
    var par=objRows_("Parcelas").filter(function(r){return String(r.ID)===String(id);})[0];
    if(par && par.ComissaoID){
      var soma=0; objRows_("Parcelas").forEach(function(r){ if(String(r.ComissaoID)===String(par.ComissaoID)) soma+=Number(r.ValorParcela)||0; });
      apiUpdate("Comissoes", par.ComissaoID, "ValorComissao", round2_(soma));
    }
    return ok_(true);
  }catch(e){return err_(e.message);}
}

/* ---------- DASHBOARD (calculado a partir dos dados ja lidos) ---------- */
function dashboardFrom_(d){
  var cfg=d.config||{};
  var today=new Date(); today.setHours(0,0,0,0);
  var amanha=new Date(today.getTime()+86400000);
  var diasFU=Number(cfg.DiasFollowUp)||2;
  var clientes=d.clientes||[], props=d.propostas||[], pagar=d.pagar||[], receber=d.receber||[], parcelas=d.parcelas||[];

  var comPagas=0, comPendentes=0;
  parcelas.forEach(function(p){ var v=Number(p.ValorParcela)||0; if(norm_(p.Status)=="pago") comPagas+=v; else comPendentes+=v; });

  var mensAtivos=clientes.filter(function(c){return norm_(c.Tipo).indexOf("mensal")>=0 && norm_(c.Status)=="ativo";}).length;
  var pontAtivos=clientes.filter(function(c){return norm_(c.Tipo).indexOf("pontual")>=0 && norm_(c.Status)=="ativo";}).length;
  var detAtivos=clientes.filter(function(c){return norm_(c.Tipo).indexOf("det")>=0 && norm_(c.Status)=="ativo";}).length;

  var pAnalise=props.filter(function(p){return norm_(p.Status)=="em analise";});
  var pAceitas=props.filter(function(p){return norm_(p.Status)=="aceita";}).length;
  var pNegadas=props.filter(function(p){return norm_(p.Status)=="negada";}).length;

  var followups=[];
  pAnalise.forEach(function(p){
    var env=parseDate_(p.DataEnvio), cob=parseDate_(p.DataCobrar);
    var precisa=false, motivo="";
    if (cob && cob<=today){ precisa=true; motivo="Data de cobrança chegou"; }
    else if (env){ var dias=Math.round((today-env)/86400000); if(dias>=diasFU){ precisa=true; motivo=dias+" dias sem retorno"; } }
    if (precisa) followups.push({ id:p.ID, cliente:p.Cliente, advogado:p.Advogado, valor:p.Valor, envio:fmt_(env), motivo:motivo });
  });

  var pagarTarefas=[];
  pagar.forEach(function(x){
    if (norm_(x.Pago)=="sim") return;
    var dt=parseDate_(x.Data); if(!dt) return;
    if (sameDay_(dt,today)||sameDay_(dt,amanha))
      pagarTarefas.push({ id:x.ID, descricao:x.Descricao, valor:x.Valor, data:fmt_(dt), quando: sameDay_(dt,today)?"Hoje":"Amanhã" });
  });

  var em7=new Date(today.getTime()+7*86400000);
  var pagarProximos=[]; var pagarVencN=0, pagarVencV=0;
  pagar.forEach(function(x){
    if (norm_(x.Pago)=="sim") return;
    var dt=parseDate_(x.Data); if(!dt) return;
    if (dt<today){ pagarVencN++; pagarVencV+=money_(x.Valor); }
    else if (dt<=em7){
      pagarProximos.push({ id:x.ID, descricao:x.Descricao, categoria:x.Categoria||"", valor:x.Valor,
        data:fmt_(dt), dias:Math.round((dt-today)/86400000) });
    }
  });
  pagarProximos.sort(function(a,b){return a.dias-b.dias;});

  var receberTarefas=[];
  receber.forEach(function(x){
    if (norm_(x.Recebido)=="sim") return;
    var dt=parseDate_(x.Vencimento); if(!dt) return;
    if (dt<=amanha){
      var venceu=dt<today;
      receberTarefas.push({ id:x.ID, cliente:x.Cliente, tipo:x.Tipo, valor:x.Valor, data:fmt_(dt),
        cobrado: norm_(x.Cobrado)=="sim", quando: venceu?"VENCIDO":(sameDay_(dt,today)?"Hoje":"Amanhã") });
    }
  });

  var reajustes=[];
  clientes.forEach(function(c){
    if (norm_(c.Status)!=="ativo") return;
    var dr=parseDate_(c.DataReajuste); if(!dr) return;
    // Reajuste é anual: parte da data cadastrada (com o ano) e avança de ano em ano SÓ enquanto já passou.
    // Uma data futura (ex.: 2027) permanece no futuro e não aparece até chegar perto.
    var occ=new Date(dr.getFullYear(), dr.getMonth(), dr.getDate());
    var dias=Math.round((occ-today)/86400000);
    var guard=0;
    while (dias < -31 && guard<20){ occ=new Date(occ.getFullYear()+1, occ.getMonth(), occ.getDate()); dias=Math.round((occ-today)/86400000); guard++; }
    // só mostra quando a próxima ocorrência está a no máximo 30 dias (ou passou há até 31 dias)
    if (dias>=-31 && dias<=5) reajustes.push({ id:c.ID, nome:c.Nome, data:fmt_(occ), indice:c.IndiceReajuste||"", dias:dias });
  });
  reajustes.sort(function(a,b){return a.dias-b.dias;});

  // Reajuste salarial (INPC): aparece 5 dias antes do 5º dia útil ligado ao aniversário de DH de cada pessoa.
  // Regra: o pagamento é o 1º "5º dia útil" que cai DEPOIS da data do aniversário (ex.: 14/06 -> 5º dia útil de julho).
  var aniv=d.aniversarios||[];
  var reajustesSal=[];
  function fifthBiz_(yy,mo){ return quintoDiaUtil_(yy+"-"+("0"+mo).slice(-2)); } // mo 1-12
  aniv.forEach(function(a){
    var p=String(a.Data||"").split("/"); var dd=parseInt(p[0],10), mm=parseInt(p[1],10);
    if(!dd||!mm||mm<1||mm>12) return;
    function paydayFor(yy){ var aniDate=new Date(yy,mm-1,dd); var pm=mm,py=yy,f=fifthBiz_(py,pm); if(f<=aniDate){ pm=mm+1; if(pm>12){pm=1;py=yy+1;} f=fifthBiz_(py,pm); } return f; }
    var y=today.getFullYear(); var pay=paydayFor(y); var dias=Math.round((pay-today)/86400000);
    var g=0; while(dias < -2 && g<3){ y++; pay=paydayFor(y); dias=Math.round((pay-today)/86400000); g++; }
    if(dias>=-2 && dias<=5) reajustesSal.push({ nome:a.Nome, data:fmt_(pay), dias:dias, previsao:String(a.PrevisaoReajuste||"") });
  });
  reajustesSal.sort(function(a,b){return a.dias-b.dias;});

  // Fechar salários: 2 dias antes do 5º dia útil (conta sábado). Se o deste mês já passou, olha o próximo mês.
  var curYM=Utilities.formatDate(today, tz_(), "yyyy-MM");
  var d5=quintoDiaUtil_(curYM);
  var dias5=Math.round((d5-today)/86400000);
  if(dias5 < -1){ var nd=new Date(d5.getFullYear(), d5.getMonth()+1, 1); d5=quintoDiaUtil_(Utilities.formatDate(nd, tz_(), "yyyy-MM")); dias5=Math.round((d5-today)/86400000); }
  var salarioFechar = (dias5>=0 && dias5<=2) ? { data:fmt_(d5), dias:dias5 } : null;

  return {
    salarioFechar:salarioFechar,
    clientesMensais:mensAtivos, clientesPontuais:pontAtivos, clientesDET:detAtivos,
    propAnalise:pAnalise.length, propAceitas:pAceitas, propNegadas:pNegadas, propAbertas:pAnalise.length,
    followups:followups, pagarTarefas:pagarTarefas, receberTarefas:receberTarefas,
    pagarProximos:pagarProximos, pagarVencidosN:pagarVencN, pagarVencidosV:pagarVencV,
    comPagas:round2_(comPagas), comPendentes:round2_(comPendentes),
    reajustes:reajustes, reajustesSalariais:reajustesSal, boletoDias:String(cfg.BoletoDias||"")
  };
}
function apiDashboard(){
  try{
    return ok_(dashboardFrom_({ config:configMap_(), clientes:objRows_("Clientes"),
      propostas:objRows_("Propostas"), pagar:objRows_("Pagar"), receber:objRows_("Receber"), parcelas:objRows_("Parcelas") }));
  }catch(e){ return err_(e.message); }
}

function norm_(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }
function parseDate_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v)==="[object Date]") { var d=new Date(v); d.setHours(0,0,0,0); return d; }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  var d = new Date(s); if (!isNaN(d)) { d.setHours(0,0,0,0); return d; }
  return null;
}
function fmt_(d){ return d ? Utilities.formatDate(d, tz_(), "dd/MM/yyyy") : ""; }
function sameDay_(a,b){ return a && b && a.getFullYear()==b.getFullYear() && a.getMonth()==b.getMonth() && a.getDate()==b.getDate(); }

/* ================= RELATORIOS ================= */
var MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
var MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function inYM_(v, y, m){ var d=parseDate_(v); return !!d && d.getFullYear()==y && (d.getMonth()+1)==m; }
function ativoNoMes_(c, y, m){
  var ini=parseDate_(c.DataInicio), fim=parseDate_(c.DataFim);
  var inicioMes=new Date(y, m-1, 1), fimMes=new Date(y, m, 0);
  if (!ini) ini = new Date(2000,0,1);
  if (ini > fimMes) return false;
  if (fim && fim < inicioMes) return false;
  return true;
}
function brl_(n){ n=Number(n)||0; var neg=n<0; n=Math.abs(n); var s=n.toFixed(2).split("."); var i=s[0].replace(/\B(?=(\d{3})+(?!\d))/g,"."); return (neg?"-R$ ":"R$ ")+i+","+s[1]; }
function faixaNome_(m, cfg){
  var mr=Number(cfg.FaixaMuitoRentavel)||50, r=Number(cfg.FaixaRentavel)||30, at=Number(cfg.FaixaAtencao)||15;
  if (m<0) return "Prejuízo"; if (m<at) return "Baixa rentabilidade"; if (m<r) return "Atenção"; if (m<mr) return "Rentável"; return "Muito rentável";
}

function tipoKey_(t){t=String(t||"").toLowerCase();if(t.indexOf("det")>=0)return "DET";if(t.indexOf("mensal")>=0)return "Mensal";if(t.indexOf("audi")>=0)return "Audiência";if(t.indexOf("consult")>=0)return "Consultivo";if(t.indexOf("process")>=0)return "Processual";if(t.indexOf("reembolso")>=0||t.indexOf("custas")>=0)return "Reembolso";if(t.indexOf("hora")>=0)return "Consultivo";return "Outros";}
function relatorioMensal_(ano, mes){
  var cfg=configMap_(), today=new Date(); today.setHours(0,0,0,0);
  var rec=objRows_("Receber"), pag=objRows_("Pagar"), com=objRows_("Comissoes"),
      rent=objRows_("Rentabilidade"), prop=objRows_("Propostas"), cli=objRows_("Clientes");

  var receitaPrevista=0, receitaRecebida=0, receitaVencida=0, receitaPorTipo={};
  rec.forEach(function(x){
    if (!inYM_(x.Vencimento, ano, mes)) return;
    var v=money_(x.Valor); receitaPrevista+=v;
    if (norm_(x.Recebido)=="sim") { receitaRecebida+=v; var k=tipoKey_(x.Tipo); receitaPorTipo[k]=(receitaPorTipo[k]||0)+v; }
    else { var d=parseDate_(x.Vencimento); if (d && d<today) receitaVencida+=v; }
  });
  var despesasPrevistas=0, despesasPagas=0;
  pag.forEach(function(x){ if(!inYM_(x.Data,ano,mes))return; var v=money_(x.Valor); despesasPrevistas+=v; if(norm_(x.Pago)=="sim") despesasPagas+=v; });
  var resultado=receitaRecebida-despesasPagas;
  var margem=receitaRecebida?resultado/receitaRecebida*100:0;

  var cmap={};
  com.forEach(function(x){
    var a=x.Advogado||"—"; if(!cmap[a]) cmap[a]={advogado:a,gerado:0,pago:0,aPagar:0};
    var vc=Number(x.ValorComissao)||0; cmap[a].gerado+=vc;
    if (x.DataPaga && String(x.DataPaga).trim()!=="") cmap[a].pago+=vc; else cmap[a].aPagar+=vc;
  });
  var comissoes=Object.keys(cmap).map(function(k){return cmap[k];}).sort(function(a,b){return b.gerado-a.gerado;});

  var rlist=rent.map(function(x){
    var vh=Number(x.ValorHora)||0,h=(Number(x.HorasConsultivo)||0)+(Number(x.HorasProcessual)||0),pg=Number(x.ValorPagoMes)||0;
    var custo=h*vh, res=pg-custo, mg=pg?res/pg*100:0;
    return {cliente:x.Cliente,advogado:x.Advogado,horas:h,custo:custo,pago:pg,resultado:res,margem:mg,faixa:faixaNome_(mg,cfg)};
  });
  var margemMedia=rlist.length?rlist.reduce(function(s,x){return s+x.margem;},0)/rlist.length:0;
  var horasTotais=rlist.reduce(function(s,x){return s+x.horas;},0);

  var mensAtivos=cli.filter(function(c){return norm_(c.Tipo).indexOf("mensal")>=0 && ativoNoMes_(c,ano,mes);}).length;
  var pontAtivos=cli.filter(function(c){return norm_(c.Tipo).indexOf("pontual")>=0 && ativoNoMes_(c,ano,mes);}).length;
  var novos=cli.filter(function(c){return inYM_(c.DataInicio,ano,mes);}).length;
  var encerrados=cli.filter(function(c){return inYM_(c.DataFim,ano,mes);}).length;

  var env=prop.filter(function(p){return inYM_(p.DataEnvio,ano,mes);});
  var aceitas=env.filter(function(p){return norm_(p.Status)=="aceita";});
  var negadas=env.filter(function(p){return norm_(p.Status)=="negada";}).length;
  var analise=env.filter(function(p){return norm_(p.Status)=="em analise";}).length;
  var taxaConv=env.length?aceitas.length/env.length*100:0;
  var valorConv=aceitas.reduce(function(s,p){return s+money_(p.Valor);},0);

  return {
    ano:ano, mes:mes, mesNome:MESES_FULL[mes-1],
    receitaPrevista:receitaPrevista, receitaRecebida:receitaRecebida, receitaVencida:receitaVencida,
    despesasPrevistas:despesasPrevistas, despesasPagas:despesasPagas, resultado:resultado, margem:margem, receitaPorTipo:receitaPorTipo,
    clientesMensais:mensAtivos, clientesPontuais:pontAtivos, novosClientes:novos, encerrados:encerrados,
    propEnviadas:env.length, propAceitas:aceitas.length, propNegadas:negadas, propAnalise:analise,
    taxaConversao:taxaConv, valorConvertido:valorConv,
    comissoes:comissoes,
    rentabilidade:{ lista:rlist, margemMedia:margemMedia, horasTotais:horasTotais,
      rentaveis:rlist.filter(function(x){return x.margem>=30;}).length,
      atencao:rlist.filter(function(x){return x.margem>=0 && x.margem<30;}).length,
      prejuizo:rlist.filter(function(x){return x.margem<0;}).length }
  };
}
function apiRelatorioMensal(ano, mes){ try{ return ok_(relatorioMensal_(Number(ano),Number(mes))); }catch(e){ return err_(e.message);} }

function relatorioAnual_(ano){
  var out=[];
  for (var m=1;m<=12;m++){
    var r=relatorioMensal_(ano,m);
    out.push({ mes:MESES_PT[m-1], receita:r.receitaRecebida, despesas:r.despesasPagas, resultado:r.resultado,
      comissoes:r.comissoes.reduce(function(s,c){return s+c.gerado;},0),
      propEnviadas:r.propEnviadas, propAceitas:r.propAceitas, clientesAtivos:r.clientesMensais+r.clientesPontuais });
  }
  var totEnv=out.reduce(function(s,x){return s+x.propEnviadas;},0);
  var totAce=out.reduce(function(s,x){return s+x.propAceitas;},0);
  return { ano:ano, meses:out,
    totais:{ receita:out.reduce(function(s,x){return s+x.receita;},0),
      despesas:out.reduce(function(s,x){return s+x.despesas;},0),
      resultado:out.reduce(function(s,x){return s+x.resultado;},0),
      comissoes:out.reduce(function(s,x){return s+x.comissoes;},0),
      propEnviadas:totEnv, propAceitas:totAce,
      taxaConversao: totEnv? (totAce/totEnv*100):0 } };
}
function apiRelatorioAnual(ano){ try{ return ok_(relatorioAnual_(Number(ano))); }catch(e){ return err_(e.message);} }

/* ---- PDF ---- */
function logoBanner_(titulo){
  return "<div style='background:#364B9B;padding:18px 26px;border-bottom:3px solid #F86C2E;display:flex;justify-content:space-between;align-items:center'>"+
    "<span style='color:#fff;font-family:Arial;font-size:22px;font-weight:bold;letter-spacing:1px'>DH LAW</span>"+
    "<span style='color:#23B9D6;font-family:Arial;font-size:13px'>"+titulo+"</span></div>";
}
function linha_(k,v,cor){ return "<tr><td style='padding:9px 12px;border-bottom:1px solid #eee;color:#555;font-family:Arial;font-size:13px'>"+k+"</td><td style='padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;font-family:Arial;font-size:13px;color:"+(cor||"#364B9B")+"'>"+v+"</td></tr>"; }
function secTit_(t){ return "<div style='color:#364B9B;font-family:Arial;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:22px 0 8px;border-left:3px solid #F86C2E;padding-left:8px'>"+t+"</div>"; }

function buildRelatorioMensalHtml_(r){
  var h="<html><body style='margin:0;background:#fff'>"+logoBanner_("Relatório Mensal · "+r.mesNome+"/"+r.ano)+"<div style='padding:24px 30px;font-family:Arial;color:#20293f'>";
  h+=secTit_("Resumo executivo")+"<table style='width:100%;border-collapse:collapse'>";
  h+=linha_("Receita prevista", brl_(r.receitaPrevista));
  h+=linha_("Receita recebida", brl_(r.receitaRecebida), "#2f8f5b");
  h+=linha_("Receita vencida", brl_(r.receitaVencida), "#b23a48");
  h+=linha_("Despesas pagas", brl_(r.despesasPagas), "#b23a48");
  h+=linha_("Resultado do mês", brl_(r.resultado), r.resultado>=0?"#2f8f5b":"#b23a48");
  h+=linha_("Margem", r.margem.toFixed(1)+"%");
  h+="</table>";
  h+=secTit_("Receita recebida por tipo de serviço")+"<table style='width:100%;border-collapse:collapse'>";
  var _t=r.receitaPorTipo||{}; var _ks=Object.keys(_t);
  if(!_ks.length) h+="<tr><td style='padding:9px 12px;color:#999;font-size:13px'>Sem recebimentos no mês.</td></tr>";
  _ks.forEach(function(k){ h+=linha_(k, brl_(_t[k])); });
  h+="</table>";
  h+=secTit_("Clientes")+"<table style='width:100%;border-collapse:collapse'>";
  h+=linha_("Mensalistas ativos", r.clientesMensais);
  h+=linha_("Pontuais ativos", r.clientesPontuais);
  h+=linha_("Novos no mês", r.novosClientes);
  h+=linha_("Encerrados no mês", r.encerrados)+"</table>";
  h+=secTit_("Comercial")+"<table style='width:100%;border-collapse:collapse'>";
  h+=linha_("Propostas enviadas", r.propEnviadas);
  h+=linha_("Aceitas", r.propAceitas, "#2f8f5b");
  h+=linha_("Negadas", r.propNegadas, "#b23a48");
  h+=linha_("Em análise", r.propAnalise);
  h+=linha_("Taxa de conversão", r.taxaConversao.toFixed(1)+"%");
  h+=linha_("Valor convertido", brl_(r.valorConvertido), "#2f8f5b")+"</table>";
  h+=secTit_("Comissões por advogado");
  h+="<table style='width:100%;border-collapse:collapse'><tr><th style='text-align:left;padding:7px 12px;background:#364B9B;color:#fff;font-size:11px'>Advogado</th><th style='text-align:right;padding:7px 12px;background:#364B9B;color:#fff;font-size:11px'>Gerado</th><th style='text-align:right;padding:7px 12px;background:#364B9B;color:#fff;font-size:11px'>Pago</th><th style='text-align:right;padding:7px 12px;background:#364B9B;color:#fff;font-size:11px'>A pagar</th></tr>";
  if(!r.comissoes.length) h+="<tr><td colspan=4 style='padding:9px 12px;color:#999;font-size:13px'>Sem registros.</td></tr>";
  r.comissoes.forEach(function(c){ h+="<tr><td style='padding:8px 12px;border-bottom:1px solid #eee;font-size:13px'>"+c.advogado+"</td><td style='padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px'>"+brl_(c.gerado)+"</td><td style='padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;color:#2f8f5b'>"+brl_(c.pago)+"</td><td style='padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;color:#b3792a'>"+brl_(c.aPagar)+"</td></tr>"; });
  h+="</table>";
  h+=secTit_("Rentabilidade")+"<table style='width:100%;border-collapse:collapse'>";
  h+=linha_("Contratos rentáveis (margem ≥ 30%)", r.rentabilidade.rentaveis, "#2f8f5b");
  h+=linha_("Contratos em atenção", r.rentabilidade.atencao, "#b3792a");
  h+=linha_("Contratos em prejuízo", r.rentabilidade.prejuizo, "#b23a48");
  h+=linha_("Margem média", r.rentabilidade.margemMedia.toFixed(1)+"%");
  h+=linha_("Horas trabalhadas", r.rentabilidade.horasTotais+"h")+"</table>";
  h+="<p style='margin-top:26px;font-size:11px;color:#999;font-family:Arial'>Gerado automaticamente pelo CRM Financeiro DH LAW · "+r.mesNome+"/"+r.ano+"</p>";
  h+="</div></body></html>";
  return h;
}
function apiRelatorioPdf(ano, mes){
  try{
    var r=relatorioMensal_(Number(ano),Number(mes));
    var blob=Utilities.newBlob(buildRelatorioMensalHtml_(r),"text/html","r.html").getAs("application/pdf");
    return ok_({ name:"Relatorio_DH_LAW_"+MESES_PT[mes-1]+"_"+ano+".pdf", data:Utilities.base64Encode(blob.getBytes()) });
  }catch(e){ return err_(e.message); }
}
function buildRelatorioAnualHtml_(a){
  var h="<html><body style='margin:0;background:#fff'>"+logoBanner_("Relatório Anual · "+a.ano)+"<div style='padding:24px 30px;font-family:Arial;color:#20293f'>";
  h+="<table style='width:100%;border-collapse:collapse;font-size:12px'><tr>"+
     ["Mês","Receita","Despesas","Resultado","Comissões","Prop.","Aceitas","Clientes"].map(function(t){return "<th style='background:#364B9B;color:#fff;padding:7px 8px;text-align:right;font-size:11px'>"+t+"</th>";}).join("").replace("text-align:right","text-align:left")+"</tr>";
  a.meses.forEach(function(m){ h+="<tr><td style='padding:6px 8px;border-bottom:1px solid #eee'>"+m.mes+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+brl_(m.receita)+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+brl_(m.despesas)+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:"+(m.resultado>=0?"#2f8f5b":"#b23a48")+"'>"+brl_(m.resultado)+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+brl_(m.comissoes)+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+m.propEnviadas+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+m.propAceitas+"</td>"+
     "<td style='padding:6px 8px;border-bottom:1px solid #eee;text-align:right'>"+m.clientesAtivos+"</td></tr>"; });
  h+="<tr style='font-weight:bold'><td style='padding:8px;border-top:2px solid #364B9B'>Total</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+brl_(a.totais.receita)+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+brl_(a.totais.despesas)+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+brl_(a.totais.resultado)+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+brl_(a.totais.comissoes)+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+a.totais.propEnviadas+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B;text-align:right'>"+a.totais.propAceitas+"</td>"+
     "<td style='padding:8px;border-top:2px solid #364B9B'></td></tr>";
  h+="</table><p style='margin-top:16px;font-size:12px;color:#20293f;font-family:Arial'><b>Taxa de conversão no ano:</b> "+a.totais.taxaConversao.toFixed(1)+"% ("+a.totais.propAceitas+" aceitas de "+a.totais.propEnviadas+" enviadas)</p>";
  h+="<p style='margin-top:8px;font-size:11px;color:#999'>Gerado automaticamente pelo CRM Financeiro DH LAW · "+a.ano+"</p></div></body></html>";
  return h;
}
function apiRelatorioAnualPdf(ano){
  try{
    var a=relatorioAnual_(Number(ano));
    var blob=Utilities.newBlob(buildRelatorioAnualHtml_(a),"text/html","a.html").getAs("application/pdf");
    return ok_({ name:"Relatorio_Anual_DH_LAW_"+ano+".pdf", data:Utilities.base64Encode(blob.getBytes()) });
  }catch(e){ return err_(e.message); }
}

/* ================= RELATÓRIO MENSAL DO CLIENTE (contratos mensais) ================= */
// Converte "hh:mm", "hh:mm:ss", "1 day, 3:10:40", número (horas) ou "-" em horas decimais.
function hoursToDec_(v){
  if(v==null) return 0;
  if(typeof v==="number") return v; // ja em horas (numero decimal)
  var s=String(v).trim(); if(!s||s==="-") return 0;
  // Proteção: valor corrompido que virou data (ex.: "1899-12-30", "2026-08-01") NÃO é duração -> 0.
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return 0;
  if(/^(sun|mon|tue|wed|thu|fri|sat)/i.test(s)) return 0;
  var days=0; var m=s.match(/(\d+)\s*day/i); if(m){ days=parseInt(m[1],10); s=s.replace(/.*day[s]?,?\s*/i,""); }
  var p=s.split(":"); if(p.length<2) return 0; // sem "hh:mm" não é duração válida
  var h=parseInt(p[0],10)||0, mi=parseInt(p[1],10)||0, se=parseInt(p[2],10)||0;
  return days*24 + h + mi/60 + se/3600;
}
function decToHMS_(dec){ dec=dec<0?0:dec; var tot=Math.round(dec*3600); var h=Math.floor(tot/3600); tot-=h*3600; var mi=Math.floor(tot/60); var se=tot-mi*60; return ("0"+h).slice(-2)+":"+("0"+mi).slice(-2)+":"+("0"+se).slice(-2); }
function round2_(n){ return Math.round((Number(n)||0)*100)/100; }

// Cria (se faltarem) as abas onde o jurídico cola o fechamento.
function apiPrepararImportFechamento(){
  try{
    var ss=getDb_();
    function mk(name,head){ var sh=ss.getSheetByName(name); if(!sh){ sh=ss.insertSheet(name); } sh.getRange(1,1,1,head.length).setValues([head]).setFontWeight("bold").setBackground("#364B9B").setFontColor("#FFFFFF"); sh.setFrozenRows(1); return sh; }
    mk("IMPORT_CONSULTIVO",["Cliente","Tarefa","Data","Duracao","Responsavel"]);
    mk("IMPORT_EXTRAS",["Cliente","HorasProcessual","Audiencias","ValorAudiencias","ExcessoProcessos","ValorProcessos","DescricaoProcessos","Custas","DescricaoCustas","DescricaoAudiencias"]);
    return ok_({url:ss.getUrl()});
  }catch(e){ return err_(e.message); }
}
// Nucleo: grava o fechamento do mes (substitui o que houver do mes) a partir de arrays ja montados.
// cons: linhas [mes,cli,tar,data,dur,resp] | ext: linhas [mes,cli,HorasProc,Aud,ValAud,ExcProc,ValProc,DescProc,Custas,DescCustas]
function processarFechamento_(mes, cons, ext, clientesSet){
  var ss=getDb_();
  limparMesFechamento_("FechamentoConsultivo",mes); limparMesFechamento_("FechamentoExtras",mes);
  gravarPorHeader_(ss.getSheetByName("FechamentoConsultivo"), cons);
  gravarPorHeader_(ss.getSheetByName("FechamentoExtras"), ext);
  _DB_CACHE=null; // recarrega leitura das abas de fechamento
  // Preenche TUDO no Contas a Receber: mensalidades dos contratos ativos + os extras de cada cliente do fechamento.
  var sinc={created:0,updated:0}; try{ var rs=apiSincronizarReceber(mes); if(rs&&rs.data) sinc=rs.data; }catch(_e){}
  var extrasLancados=0; var clientesRel=[];
  Object.keys(clientesSet).forEach(function(k){ clientesRel.push(clientesSet[k]); try{ var rl=apiLancarExtrasReceber(clientesSet[k], mes); if(rl&&rl.data) extrasLancados+=(rl.data.lancados||0); }catch(_e){} });
  return { consultivo:cons.length, extras:ext.length, mes:mes, mensalidadesCriadas:sinc.created||0, extrasLancados:extrasLancados, clientes:clientesRel.sort() };
}
// Le as abas IMPORT_* e grava o fechamento do mes (substitui o que houver do mes).
function apiImportarFechamento(mes){
  try{
    mes=String(mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido.");
    var ss=getDb_();
    var shC=ss.getSheetByName("IMPORT_CONSULTIVO"), shE=ss.getSheetByName("IMPORT_EXTRAS");
    if(!shC||!shE) return err_("Crie as abas de importação primeiro (botão 'Preparar importação').");
    var cvals=shC.getDataRange().getDisplayValues(); var evals=shE.getDataRange().getDisplayValues();
    var cons=[]; var clientesSet={};
    for(var i=1;i<cvals.length;i++){ var r=cvals[i]; var cli=String(r[0]||"").trim(); var tar=String(r[1]||"").trim(); if(!cli||!tar) continue; cons.push({Mes:mes,Cliente:cli,Tarefa:tar,Data:String(r[2]||"").trim(),Duracao:String(r[3]||"").trim(),Responsavel:String(r[4]||"").trim()}); clientesSet[norm_(cli)]=cli; }
    var ext=[];
    for(var j=1;j<evals.length;j++){ var e=evals[j]; var c2=String(e[0]||"").trim(); if(!c2) continue; ext.push({Mes:mes,Cliente:c2,HorasProcessual:String(e[1]||"").trim(),Audiencias:String(e[2]||"").trim(),ValorAudiencias:String(e[3]||"").trim(),ExcessoProcessos:String(e[4]||"").trim(),ValorProcessos:String(e[5]||"").trim(),DescricaoProcessos:String(e[6]||"").trim(),Custas:String(e[7]||"").trim(),DescricaoCustas:String(e[8]||"").trim(),DescricaoAudiencias:String(e[9]||"").trim()}); clientesSet[norm_(c2)]=c2; }
    return ok_(processarFechamento_(mes, cons, ext, clientesSet));
  }catch(e){ return err_(e.message); }
}
// Recebe os dados ja parseados no navegador (upload de .xlsx) e grava o fechamento do mes.
// consObjs: [{Cliente,Tarefa,Data,Duracao,Responsavel}] | extObjs: [{Cliente,HorasProcessual,Audiencias,ExcessoProcessos,Custas,DescricaoCustas,DescricaoProcessos}]
function apiImportarFechamentoDados(mes, consObjs, extObjs){
  try{
    mes=String(mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido.");
    consObjs=consObjs||[]; extObjs=extObjs||[];
    var cons=[]; var clientesSet={}; var vazio="-";
    function clean(v){ v=String(v==null?"":v).trim(); return (v===vazio)?"":v; }
    consObjs.forEach(function(r){ var cli=String(r.Cliente||"").trim(); var tar=String(r.Tarefa||"").trim(); if(!cli||!tar) return; cons.push({Mes:mes,Cliente:cli,Tarefa:tar,Data:String(r.Data||"").trim(),Duracao:String(r.Duracao||"").trim(),Responsavel:String(r.Responsavel||"").trim()}); clientesSet[norm_(cli)]=cli; });
    var ext=[];
    extObjs.forEach(function(e){ var c2=String(e.Cliente||"").trim(); if(!c2) return;
      ext.push({Mes:mes,Cliente:c2,HorasProcessual:clean(e.HorasProcessual),Audiencias:clean(e.Audiencias),ValorAudiencias:"",ExcessoProcessos:clean(e.ExcessoProcessos),ValorProcessos:"",DescricaoProcessos:clean(e.DescricaoProcessos),Custas:clean(e.Custas),DescricaoCustas:clean(e.DescricaoCustas),DescricaoAudiencias:clean(e.DescricaoAudiencias)}); clientesSet[norm_(c2)]=c2; });
    if(!cons.length && !ext.length) return err_("A planilha não trouxe linhas válidas. Confira se as abas CONSULTIVO e PROCESSUAL E EXTRAS estão preenchidas.");
    return ok_(processarFechamento_(mes, cons, ext, clientesSet));
  }catch(e){ return err_(e.message); }
}
// ===== IMPORT DE HORAS (RENTABILIDADE) =====
// Casa o nome do advogado da planilha com o cadastro (ex.: "Igor Palheta" -> "Igor") e devolve valor/hora.
function rentAdv_(nome, advs){
  var n=norm_(nome); var best=null,bestLen=0;
  advs.forEach(function(a){ var an=norm_(a.Nome); if(!an) return; if(n===an || n.indexOf(an)>=0 || an.indexOf(n)>=0){ if(an.length>bestLen){ bestLen=an.length; best=a; } } });
  return best?{nome:best.Nome, vh:money_(best.ValorHora)}:{nome:nome, vh:0};
}
// Casa o código de cliente da planilha (ex.: "AKTRION") com o nome do CRM (ex.: "Ak Group (Aktrion)").
function rentCli_(code, clientes){
  var c=norm_(code).replace(/[^a-z0-9]/g,""); if(!c) return {nome:code, achou:false};
  var best=null,score=0;
  clientes.forEach(function(cl){ var cn=norm_(cl.Nome).replace(/[^a-z0-9]/g,""); if(!cn) return;
    var ml=Math.min(cn.length,c.length), s=0;
    if(cn===c) s=1000;                                                     // igual
    else if((cn.indexOf(c)===0||c.indexOf(cn)===0) && ml>=3) s=ml+2;       // prefixo (ex.: "RCE" -> "RCE Construtora Ltda")
    else if((cn.indexOf(c)>=0||c.indexOf(cn)>=0) && ml>=4) s=ml;           // contido no meio, exige 4+ caracteres
    if(s>score){ score=s; best=cl; }
  });
  return (best && score>0)?{nome:best.Nome, achou:true}:{nome:code, achou:false};
}
// Recebe as horas processuais já parseadas [{advogado, cliente, horas}] de UM mês e grava na Rentabilidade.
function apiImportarHorasRent(mes, rows){
  try{
    mes=String(mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido.");
    rows=rows||[];
    var ss=getDb_(); var sh=ss.getSheetByName("Rentabilidade");
    var advs=objRows_("Advogados"), clientes=objRows_("Clientes"), receber=objRows_("Receber");
    // pago por cliente no mês (soma do Receber)
    var pagoCli={}; receber.forEach(function(r){ if(monthKeyOf_(r.Vencimento)===mes){ var k=norm_(r.Cliente); pagoCli[k]=(pagoCli[k]||0)+money_(r.Valor); } });
    // limpa as linhas deste mês (em bloco)
    var v=sh.getDataRange().getValues(); var head=v[0]; var mi=head.indexOf("Mes");
    var keep=[]; for(var i=1;i<v.length;i++){ if(mi<0 || monthKeyOf_(v[i][mi])!==mes) keep.push(v[i]); }
    if(v.length>1){ sh.getRange(2,1,v.length-1,head.length).clearContent(); if(keep.length) sh.getRange(2,1,keep.length,head.length).setValues(keep); }
    // monta novas linhas
    var ci={}; head.forEach(function(h,idx){ ci[h]=idx; });
    var novos=[]; var semCli={}, semAdv={}, matched={};
    rows.forEach(function(r){
      var h=Number(r.horas)||0; if(h<=0) return;
      var cli=String(r.cliente||"").trim(), adv=String(r.advogado||"").trim(); if(!cli||!adv) return;
      var A=rentAdv_(adv, advs); if(A.vh<=0) semAdv[adv]=1;
      var C=rentCli_(cli, clientes); if(!C.achou) semCli[cli]=1; else matched[C.nome]=1;
      var pago=pagoCli[norm_(C.nome)]||0;
      var row=head.map(function(){return "";});
      row[ci.ID]=Utilities.getUuid().replace(/-/g,"").slice(0,8);
      row[ci.Cliente]=C.nome; row[ci.Advogado]=A.nome; row[ci.ValorHora]=A.vh;
      if(ci.HorasConsultivo!=null) row[ci.HorasConsultivo]=0;
      row[ci.HorasProcessual]=round2_(h); row[ci.ValorPagoMes]=round2_(pago);
      if(ci.Mes!=null) row[ci.Mes]=mes;
      novos.push(row);
    });
    if(novos.length){ sh.getRange(sh.getLastRow()+1,1,novos.length,head.length).setValues(novos); }
    _DB_CACHE=null;
    return ok_({ importados:novos.length, mes:mes, clientesSemMatch:Object.keys(semCli), advSemValorHora:Object.keys(semAdv) });
  }catch(e){ return err_(e.message); }
}
// Índice de pago por cliente/mês, com busca tolerante a diferença de nome.
function buildPagoIndex_(receber){
  var idx={}, nomes={};
  receber.forEach(function(r){ var m=monthKeyOf_(r.Vencimento); if(!m) return; var nn=norm_(r.Cliente); if(!nn) return; if(!idx[nn]) idx[nn]={}; idx[nn][m]=(idx[nn][m]||0)+money_(r.Valor); nomes[nn]=1; });
  return { idx:idx, nomes:Object.keys(nomes) };
}
function pagoDe_(cliNome, mes, P){
  var nn=norm_(cliNome);
  if(P.idx[nn] && P.idx[nn][mes]!=null) return P.idx[nn][mes];
  var a=nn.replace(/[^a-z0-9]/g,""); if(!a) return 0;
  for(var i=0;i<P.nomes.length;i++){ var b=P.nomes[i].replace(/[^a-z0-9]/g,""); if(b && (a.indexOf(b)>=0 || b.indexOf(a)>=0)){ var o=P.idx[P.nomes[i]]; if(o && o[mes]!=null) return o[mes]; } }
  return 0;
}
// Casa o "Responsável" do consultivo (nome completo OU e-mail, ex.: "janaina@advogadosdh.com.br",
// "Amanda Botelho de Moraes", "Igor Palheta") com o advogado cadastrado e devolve o valor/hora.
function advDeResp_(resp, advs){
  var s=String(resp||"");
  if(s.indexOf("@")>=0) s=s.split("@")[0];               // e-mail -> parte local
  var rt=norm_(s).replace(/[^a-z ]/g," ").split(/\s+/).filter(Boolean);
  if(!rt.length) return {nome:resp, vh:0, achou:false};
  var rjoin=rt.join("");
  var best=null,bestScore=0;
  advs.forEach(function(a){
    var at=norm_(a.Nome).replace(/[^a-z ]/g," ").split(/\s+/).filter(Boolean); if(!at.length) return;
    var score=0;
    at.forEach(function(t){ if(t.length<3) return;
      rt.forEach(function(r){
        if(r===t) score+=10;
        else if(r.indexOf(t)===0) score+=6;   // "anacarolina" começa com "ana"
        else if(t.indexOf(r)===0 && r.length>=3) score+=4;
      });
      if(rjoin.indexOf(t)>=0) score+=1;        // "anacarolina" contém "carolina"
    });
    if(score>bestScore){ bestScore=score; best=a; }
  });
  return (best && bestScore>0)?{nome:best.Nome, vh:money_(best.ValorHora), achou:true}:{nome:resp, vh:0, achou:false};
}
// Traz as horas de CONSULTIVO (já gravadas na aba FechamentoConsultivo pelo fechamento mensal) para a Rentabilidade.
// Agrupa por advogado (do Responsável) + cliente + mês, soma as durações e casa nas linhas existentes
// (mesmo advogado/cliente/mês recebe HorasConsultivo; se só houver consultivo, cria a linha com HorasProcessual=0).
// Núcleo do upsert de consultivo: recebe agg {chave:{cli,adv,vh,mes,horas}} e mesesSet, e grava na coluna HorasConsultivo.
// Zera o consultivo dos meses presentes antes de aplicar (autoritativo para esses meses) e preserva o processual.
function aplicarConsultivoAgg_(agg, mesesSet){
  var ss=getDb_(); var sh=ss.getSheetByName("Rentabilidade"); if(!sh) return {atualizados:0,criados:0,meses:[]};
  var P=buildPagoIndex_(objRows_("Receber"));
  var v=sh.getDataRange().getValues(); var head=v[0]; var ci={}; head.forEach(function(h,idx){ ci[h]=idx; });
  if(ci.HorasConsultivo==null){ return {atualizados:0,criados:0,meses:[],aviso:"Sem coluna HorasConsultivo"}; }
  var rowIdx={};
  for(var i=1;i<v.length;i++){ var cli=v[i][ci.Cliente]; if(!cli) continue; rowIdx[norm_(cli)+"|"+norm_(v[i][ci.Advogado])+"|"+monthKeyOf_(v[i][ci.Mes])]=i; }
  for(var i2=1;i2<v.length;i2++){ if(mesesSet[monthKeyOf_(v[i2][ci.Mes])]) v[i2][ci.HorasConsultivo]=0; }
  var novos=[], upd=0, cre=0;
  Object.keys(agg).forEach(function(k){
    var e=agg[k]; var idx=rowIdx[k];
    if(idx!=null){
      v[idx][ci.HorasConsultivo]=round2_(e.horas);
      if(ci.ValorHora!=null && money_(v[idx][ci.ValorHora])<=0 && e.vh>0) v[idx][ci.ValorHora]=e.vh;
      upd++;
    } else {
      var row=head.map(function(){return "";});
      row[ci.ID]=Utilities.getUuid().replace(/-/g,"").slice(0,8);
      row[ci.Cliente]=e.cli; row[ci.Advogado]=e.adv;
      if(ci.ValorHora!=null) row[ci.ValorHora]=e.vh;
      row[ci.HorasConsultivo]=round2_(e.horas);
      if(ci.HorasProcessual!=null) row[ci.HorasProcessual]=0;
      if(ci.ValorPagoMes!=null) row[ci.ValorPagoMes]=round2_(pagoDe_(e.cli, e.mes, P));
      if(ci.Mes!=null) row[ci.Mes]=e.mes;
      novos.push(row); cre++;
    }
  });
  // Monta o corpo final descartando linhas que ficaram sem horas (consultivo=0 e processual=0),
  // como as linhas fantasma de nomes que não casavam antes (ex.: "RCE" em vez de "RCE Construtora Ltda").
  var body=[], removidos=0;
  for(var j=1;j<v.length;j++){
    var hc=money_(v[j][ci.HorasConsultivo]); var hp=(ci.HorasProcessual!=null)?money_(v[j][ci.HorasProcessual]):0;
    if(!v[j][ci.Cliente]) { continue; }
    if(hc>0 || hp>0){ body.push(v[j]); } else { removidos++; }
  }
  body=body.concat(novos);
  if(v.length>1) sh.getRange(2,1,v.length-1,head.length).clearContent();
  if(body.length) sh.getRange(2,1,body.length,head.length).setValues(body);
  _DB_CACHE=null;
  return {atualizados:upd, criados:cre, removidos:removidos, meses:Object.keys(mesesSet).sort()};
}
// Traz o consultivo da aba FechamentoConsultivo (fechamento mensal) para a Rentabilidade.
function syncConsultivoRent_(){
  var advs=objRows_("Advogados"), clientes=clientesRentCandidatos_();
  var agg={}, mesesSet={}, semAdv={};
  objRows_("FechamentoConsultivo").forEach(function(f){
    var mes=monthKeyOf_(f.Mes); if(!/^\d{4}-\d{2}$/.test(String(mes||""))) return;
    var horas=hoursToDec_(f.Duracao); if(horas<=0) return;
    var A=advDeResp_(f.Responsavel, advs); if(A.vh<=0) semAdv[String(f.Responsavel||"").trim()]=1;
    var C=rentCli_(String(f.Cliente||"").trim(), clientes);
    var cliNome=C.achou?C.nome:String(f.Cliente||"").trim(); if(!cliNome) return;
    var key=norm_(cliNome)+"|"+norm_(A.nome)+"|"+mes;
    if(!agg[key]) agg[key]={cli:cliNome, adv:A.nome, vh:A.vh, mes:mes, horas:0};
    agg[key].horas+=horas; mesesSet[mes]=1;
  });
  var r=aplicarConsultivoAgg_(agg, mesesSet); r.advSemValorHora=Object.keys(semAdv); return r;
}
// Candidatos de cliente p/ casar o consultivo: cadastro (aba Clientes) + nomes que JÁ estão na Rentabilidade
// vindos do processo (HorasProcessual>0). Assim "RCE" casa com "RCE Construtora Ltda" mesmo fora do cadastro.
function clientesRentCandidatos_(){
  var seen={}, out=[];
  objRows_("Clientes").forEach(function(c){ var n=norm_(c.Nome); if(c.Nome && !seen[n]){ seen[n]=1; out.push({Nome:c.Nome}); } });
  objRows_("Rentabilidade").forEach(function(r){ if(r.Cliente && money_(r.HorasProcessual)>0){ var n=norm_(r.Cliente); if(!seen[n]){ seen[n]=1; out.push({Nome:r.Cliente}); } } });
  return out;
}
// Importa o consultivo de TODOS os meses a partir da planilha do Monday (Advogado › Cliente).
// rows = [{advogado, cliente, mes:"2026-08", horas}]. Autoritativo para os meses presentes; preserva o processual.
function apiImportarConsultivoRentTodos(rows){
  try{
    rows=rows||[];
    var advs=objRows_("Advogados"), clientes=clientesRentCandidatos_();
    var agg={}, mesesSet={}, semAdv={}, semCli={};
    rows.forEach(function(r){
      var h=Number(r.horas)||0; if(h<=0) return;
      var mes=String(r.mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return;
      var cli=String(r.cliente||"").trim(), adv=String(r.advogado||"").trim(); if(!cli||!adv) return;
      var A=advDeResp_(adv, advs); if(A.vh<=0) semAdv[adv]=1;
      var C=rentCli_(cli, clientes); if(!C.achou) semCli[cli]=1;
      var cliNome=C.achou?C.nome:cli;
      var key=norm_(cliNome)+"|"+norm_(A.nome)+"|"+mes;
      if(!agg[key]) agg[key]={cli:cliNome, adv:A.nome, vh:A.vh, mes:mes, horas:0};
      agg[key].horas+=h; mesesSet[mes]=1;
    });
    if(!Object.keys(agg).length) return err_("A planilha não trouxe horas de consultivo válidas.");
    var r=aplicarConsultivoAgg_(agg, mesesSet);
    return ok_({ atualizados:r.atualizados, criados:r.criados, meses:r.meses, clientesSemMatch:Object.keys(semCli), advSemValorHora:Object.keys(semAdv) });
  }catch(e){ return err_(e.message); }
}
// Importa TODOS os meses de uma vez. rows = [{advogado, cliente, mes:"2026-08", horas}].
function apiImportarHorasRentTodos(rows){
  try{
    rows=rows||[];
    var sh=getDb_().getSheetByName("Rentabilidade");
    var advs=objRows_("Advogados"), clientes=objRows_("Clientes"), receber=objRows_("Receber");
    var P=buildPagoIndex_(receber);
    var mesesSet={}; rows.forEach(function(r){ var m=String(r.mes||"").slice(0,7); if(/^\d{4}-\d{2}$/.test(m)) mesesSet[m]=1; });
    var v=sh.getDataRange().getValues(); var head=v[0]; var mi=head.indexOf("Mes");
    var keep=[]; for(var i=1;i<v.length;i++){ var mm=mi>=0?monthKeyOf_(v[i][mi]):""; if(!mm || !mesesSet[mm]) keep.push(v[i]); }
    if(v.length>1){ sh.getRange(2,1,v.length-1,head.length).clearContent(); if(keep.length) sh.getRange(2,1,keep.length,head.length).setValues(keep); }
    var ci={}; head.forEach(function(h,idx){ ci[h]=idx; });
    var novos=[]; var semCli={}, semAdv={};
    rows.forEach(function(r){
      var h=Number(r.horas)||0; if(h<=0) return;
      var mes=String(r.mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return;
      var cli=String(r.cliente||"").trim(), adv=String(r.advogado||"").trim(); if(!cli||!adv) return;
      var A=rentAdv_(adv,advs); if(A.vh<=0) semAdv[adv]=1;
      var C=rentCli_(cli,clientes); if(!C.achou) semCli[cli]=1;
      var pg=pagoDe_(C.nome, mes, P);
      var row=head.map(function(){return "";});
      row[ci.ID]=Utilities.getUuid().replace(/-/g,"").slice(0,8);
      row[ci.Cliente]=C.nome; row[ci.Advogado]=A.nome; row[ci.ValorHora]=A.vh;
      if(ci.HorasConsultivo!=null) row[ci.HorasConsultivo]=0;
      row[ci.HorasProcessual]=round2_(h); row[ci.ValorPagoMes]=round2_(pg);
      if(ci.Mes!=null) row[ci.Mes]=mes;
      novos.push(row);
    });
    if(novos.length){ sh.getRange(sh.getLastRow()+1,1,novos.length,head.length).setValues(novos); }
    _DB_CACHE=null;
    return ok_({ importados:novos.length, meses:Object.keys(mesesSet).sort(), clientesSemMatch:Object.keys(semCli), advSemValorHora:Object.keys(semAdv) });
  }catch(e){ return err_(e.message); }
}
// Recalcula o "pago no mês" de cada linha da Rentabilidade com o Contas a Receber atual (sem mexer nas horas).
function apiSincronizarRentPago(){
  try{
    var sh=getDb_().getSheetByName("Rentabilidade");
    var v=sh.getDataRange().getValues(); if(v.length<2) return ok_({atualizados:0});
    var head=v[0]; var ci={}; head.forEach(function(h,idx){ ci[h]=idx; });
    if(ci.Cliente==null||ci.Mes==null||ci.ValorPagoMes==null) return err_("Aba Rentabilidade sem as colunas necessárias.");
    var P=buildPagoIndex_(objRows_("Receber"));
    var n=0;
    for(var i=1;i<v.length;i++){ var cli=v[i][ci.Cliente], mes=monthKeyOf_(v[i][ci.Mes]); if(!cli||!mes) continue; var pg=round2_(pagoDe_(cli, mes, P)); if(String(v[i][ci.ValorPagoMes])!==String(pg)){ v[i][ci.ValorPagoMes]=pg; n++; } }
    sh.getRange(1,1,v.length,head.length).setValues(v);
    _DB_CACHE=null;
    return ok_({atualizados:n});
  }catch(e){ return err_(e.message); }
}
// Remove as linhas do mes em BLOCO (rapido): regrava so o que sobra, em vez de apagar linha a linha.
function limparMesFechamento_(aba,mes){
  var sh=getDb_().getSheetByName(aba); if(!sh) return;
  var v=sh.getDataRange().getValues(); if(v.length<2) return;
  var nCols=v[0].length; var keep=[];
  for(var i=1;i<v.length;i++){ if(monthKeyOf_(v[i][0])!==mes) keep.push(v[i]); }
  sh.getRange(2,1,v.length-1,nCols).clearContent();
  if(keep.length) sh.getRange(2,1,keep.length,nCols).setValues(keep);
}
// Grava uma lista de objetos numa aba, casando cada campo pela coluna do cabecalho (independe da ordem das colunas).
// Forca o formato TEXTO nas celulas gravadas, para que "2026-08" nao vire data e "01:05:00" nao vire hora.
function gravarPorHeader_(sh, objList){
  if(!sh || !objList || !objList.length) return;
  var lastCol=sh.getLastColumn();
  var head=sh.getRange(1,1,1,lastCol).getValues()[0];
  var matrix=objList.map(function(o){ return head.map(function(h){ var k=String(h).trim(); return (k in o)?String(o[k]==null?"":o[k]):""; }); });
  var rng=sh.getRange(sh.getLastRow()+1,1,matrix.length,lastCol);
  rng.setNumberFormat("@");
  rng.setValues(matrix);
}

/* ================= FOLHA DE SALARIOS ================= */
function diasNoMes_(ym){ var p=ym.split("-"); return new Date(parseInt(p[0],10), parseInt(p[1],10), 0).getDate(); }
function diasUteis_(ym){ var p=ym.split("-"),y=parseInt(p[0],10),m=parseInt(p[1],10)-1,dm=new Date(y,m+1,0).getDate(),c=0; for(var d=1;d<=dm;d++){ var wd=new Date(y,m,d).getDay(); if(wd>=1&&wd<=5)c++; } return c; }
// 5º dia útil do mês CONTANDO o sábado (só domingo não é útil).
function quintoDiaUtil_(ym){ var p=String(ym).split("-"),y=parseInt(p[0],10),m=parseInt(p[1],10)-1,dm=new Date(y,m+1,0).getDate(),c=0; for(var d=1;d<=dm;d++){ if(new Date(y,m,d).getDay()!==0){ c++; if(c===5) return new Date(y,m,d); } } return new Date(y,m,dm); }
function contaDiaSemana_(ym,wd){ wd=parseInt(wd,10); var p=ym.split("-"),y=parseInt(p[0],10),m=parseInt(p[1],10)-1,dm=new Date(y,m+1,0).getDate(),c=0; for(var d=1;d<=dm;d++){ if(new Date(y,m,d).getDay()===wd)c++; } return c; }
function mesIndex_(ym){ var p=String(ym).split("-"); return parseInt(p[0],10)*12+(parseInt(p[1],10)-1); }
function prevMes_(ym){ var p=ym.split("-"),y=parseInt(p[0],10),m=parseInt(p[1],10)-1; m-=1; if(m<0){m=11;y-=1;} return y+"-"+("0"+(m+1)).slice(-2); }
// Soma as parcelas de comissão AGENDADAS para o mês ym (as parcelas já começam no mês seguinte ao contrato).
function comissaoDoMes_(nome, ym){
  var s=0;
  objRows_("Parcelas").forEach(function(pc){
    if(eqNome_(pc.Advogado,nome) && monthKeyOf_(pc.Mes)===ym) s+=money_(pc.ValorParcela);
  });
  return round2_(s);
}

// Tipos que DESCONTAM do total (o resto soma).
function tipoDesconta_(t){ t=norm_(t); return t.indexOf("emprest")>=0 || t.indexOf("desconto")>=0; }
function folhaMesRows_(mes){
  var cols=objRows_("Colaboradores");
  var lancPorNome={}; objRows_("LancamentosSalario").forEach(function(l){ if(monthKeyOf_(l.Mes)!==mes) return; var k=norm_(l.Nome); (lancPorNome[k]=lancPorNome[k]||[]).push(l); });
  var ajustePorNome={}; objRows_("SalariosAjuste").forEach(function(a){ if(monthKeyOf_(a.Mes)!==mes) return; ajustePorNome[norm_(a.Nome)]=a; });
  var diasMes=diasNoMes_(mes);
  var mIdx=mesIndex_(mes);
  var rows=[];
  cols.forEach(function(c){
    if(norm_(c.Ativo).indexOf("sim")<0 && String(c.Ativo||"")!=="") return;
    var ini=String(c.DataInicio||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
    var iniY,iniM,iniD;
    if(ini){ iniY=parseInt(ini[1],10); iniM=parseInt(ini[2],10)-1; iniD=parseInt(ini[3],10); if(mesIndex_(ini[1]+"-"+ini[2])>mIdx) return; }
    var salFixo=money_(c.SalarioFixo), diariaV=money_(c.DiariaValor);
    var ajuste=ajustePorNome[norm_(c.Nome)];
    var base=0, baseInfo="";
    var diariaQtdAuto=0, diariaQtdManual=null;
    if(diariaV>0){
      diariaQtdAuto=contaDiaSemana_(mes, c.DiariaDia||2);
      var dqRaw=(ajuste && ajuste.DiariaQtdManual!=null)?String(ajuste.DiariaQtdManual).trim():"";
      var dqManual=dqRaw!==""?parseFloat(dqRaw.replace(",",".")):null;
      if(dqManual!=null && !isNaN(dqManual)) diariaQtdManual=dqManual;
      var q=(diariaQtdManual!=null)?diariaQtdManual:diariaQtdAuto;
      base=round2_(diariaV*q);
      baseInfo=q+" diária(s) x R$ "+brl2_(diariaV)+(diariaQtdManual!=null?" (ajustado; automático seria "+diariaQtdAuto+")":"");
    }
    else{
      base=salFixo; baseInfo="Salário fixo";
      if(ini && iniY===parseInt(mes.split("-")[0],10) && (iniM+1)===parseInt(mes.split("-")[1],10) && iniD>1){
        var diasTrab=diasMes-(iniD-1); base=round2_(salFixo*diasTrab/diasMes); baseInfo="Proporcional "+diasTrab+"/"+diasMes+" dias (início "+("0"+iniD).slice(-2)+"/"+("0"+(iniM+1)).slice(-2)+")";
      }
    }
    var itens=(lancPorNome[norm_(c.Nome)]||[]).map(function(l){ return {id:l.ID, tipo:String(l.Tipo||"Outros"), desc:String(l.Descricao||""), cliente:String(l.Cliente||""), valor:money_(l.Valor), pAtual:String(l.ParcelaAtual||""), pTotal:String(l.ParcelaTotal||"")}; });
    var sums={comissao:0,reembolso:0,passagem:0,diaria:0,outros:0,emprestimo:0};
    var add=0, sub=0;
    itens.forEach(function(it){ var t=norm_(it.tipo);
      if(t.indexOf("comiss")>=0)sums.comissao+=it.valor; else if(t.indexOf("reembol")>=0)sums.reembolso+=it.valor; else if(t.indexOf("passa")>=0)sums.passagem+=it.valor; else if(t.indexOf("diar")>=0)sums.diaria+=it.valor; else if(tipoDesconta_(it.tipo))sums.emprestimo+=it.valor; else sums.outros+=it.valor;
      if(tipoDesconta_(it.tipo))sub+=it.valor; else add+=it.valor;
    });
    // Empréstimo recorrente do cadastro: desconta sozinho todo mês e a parcela avança até o total.
    var empAuto=0, empAutoParc="";
    var empValor=money_(c.EmpValor);
    if(empValor>0 && String(c.EmpMesRef||"")){
      var parc=(parseInt(c.EmpParcelaRef,10)||0)+(mIdx-mesIndex_(String(c.EmpMesRef).slice(0,7)));
      var tot=parseInt(c.EmpTotal,10)||0;
      if(parc>=1 && (tot===0||parc<=tot)){ empAuto=empValor; empAutoParc=parc+(tot?("/"+tot):""); }
    }
    // Passagem recorrente do cadastro: dias úteis (seg-sex) do mês x valor por dia. Aparece sempre, como lembrete e já calculada.
    // A quantidade de dias pode ser ajustada manualmente para um mês específico (os dias úteis reais variam: feriados, faltas etc.) via SalariosAjuste.PassagemDiasManual.
    var passAuto=0, passAutoInfo="", passDiasAuto=0, passDiasManual=null;
    var passDia=money_(c.PassagemDia);
    if(passDia>0){
      passDiasAuto=diasUteis_(mes);
      var pdRaw=(ajuste && ajuste.PassagemDiasManual!=null)?String(ajuste.PassagemDiasManual).trim():"";
      var pdManual=pdRaw!==""?parseFloat(pdRaw.replace(",",".")):null;
      if(pdManual==null && ajuste && norm_(ajuste.PassagemExcluida)==="sim") pdManual=0; // compatibilidade com o botão "excluir" antigo
      if(pdManual!=null && !isNaN(pdManual)) passDiasManual=pdManual;
      var du=(passDiasManual!=null)?passDiasManual:passDiasAuto;
      passAutoInfo=du+" dia(s) útil(eis) x R$ "+brl2_(passDia)+(passDiasManual!=null?" (ajustado; automático seria "+passDiasAuto+")":"");
      passAuto=round2_(passDia*du);
    }
    var total=round2_(base+add+passAuto-sub-empAuto);
    rows.push({ nome:c.Nome, base:round2_(base), baseInfo:baseInfo,
      comissao:round2_(sums.comissao), reembolso:round2_(sums.reembolso), passagem:round2_(sums.passagem+passAuto),
      diaria:round2_(sums.diaria), outros:round2_(sums.outros), emprestimo:round2_(sums.emprestimo+empAuto),
      empAuto:round2_(empAuto), empAutoParc:empAutoParc, passAuto:round2_(passAuto), passAutoInfo:passAutoInfo,
      passDiasAuto:passDiasAuto, passDiasManual:passDiasManual,
      diariaQtdAuto:diariaQtdAuto, diariaQtdManual:diariaQtdManual, diariaValor:money_(c.DiariaValor),
      itens:itens, total:total, pix:String(c.PIX||""), conta:String(c.Conta||""), obs:String(c.Obs||"") });
  });
  return rows;
}
// Soma/subtrai meses de uma chave "YYYY-MM".
function ymAddMonths_(ym, n){ var p=String(ym).slice(0,7).split("-"); var y=parseInt(p[0],10), m=parseInt(p[1],10)-1+(parseInt(n,10)||0); y+=Math.floor(m/12); m=((m%12)+12)%12; return y+"-"+("0"+(m+1)).slice(-2); }
// Projeta as parcelas futuras de um lançamento manual (ex.: comissão 1/3 em 2026-09 gera 2/3 em 10 e 3/3 em 11).
// Idempotente: não recria a parcela que já existir no mês. Vale para qualquer colaborador.
function apiProjetarParcelas(id){
  try{
    id=String(id||"");
    var all=objRows_("LancamentosSalario");
    var base=null; for(var i=0;i<all.length;i++){ if(String(all[i].ID)===id){ base=all[i]; break; } }
    if(!base) return err_("Lançamento não encontrado.");
    var a=parseInt(base.ParcelaAtual,10)||0, t=parseInt(base.ParcelaTotal,10)||0;
    if(t<=0 || a<=0) return err_("Este lançamento não tem parcela (ex.: 1/3) para projetar.");
    if(t<=a) return ok_({criados:0, motivo:"ultima"});
    var mes0=monthKeyOf_(base.Mes);
    if(!/^\d{4}-\d{2}$/.test(mes0)) return err_("Mês do lançamento inválido.");
    var chave=function(nome,tipo,desc,pa,mes){ return norm_(nome)+"|"+norm_(tipo)+"|"+norm_(desc)+"|"+String(pa)+"|"+mes; };
    var existe={}; all.forEach(function(l){ existe[chave(l.Nome,l.Tipo,l.Descricao,l.ParcelaAtual,monthKeyOf_(l.Mes))]=1; });
    var criados=0;
    for(var p=a+1;p<=t;p++){
      var mesP=ymAddMonths_(mes0, p-a);
      if(existe[chave(base.Nome,base.Tipo,base.Descricao,p,mesP)]) continue;
      apiAdd("LancamentosSalario",{ Mes:mesP, Nome:base.Nome, Tipo:base.Tipo, Descricao:base.Descricao, Cliente:base.Cliente, Valor:base.Valor, ParcelaAtual:p, ParcelaTotal:t });
      existe[chave(base.Nome,base.Tipo,base.Descricao,p,mesP)]=1;
      criados++;
    }
    return ok_({criados:criados});
  }catch(e){ return err_(e.message); }
}
// Puxa as comissões previstas do mês (aba Comissões/Parcelas) como lançamentos, para o colaborador poder editar/excluir.
function apiPuxarComissoesMes(mes, nome){
  try{
    mes=String(mes||"").slice(0,7); nome=String(nome||"").trim();
    if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido.");
    var parc=objRows_("Parcelas");
    // Ordena as parcelas de cada comissão por mês para calcular "parcela atual / total" de forma limpa (1/4, 2/4...).
    var byCom={}; parc.forEach(function(p){ var k=String(p.ComissaoID||""); (byCom[k]=byCom[k]||[]).push(p); });
    Object.keys(byCom).forEach(function(k){ byCom[k].sort(function(a,b){ return String(monthKeyOf_(a.Mes)).localeCompare(String(monthKeyOf_(b.Mes))); }); });
    var jaTem={}; objRows_("LancamentosSalario").forEach(function(l){ if(monthKeyOf_(l.Mes)===mes && eqNome_(l.Nome,nome) && norm_(l.Tipo).indexOf("comiss")>=0){ jaTem[norm_(l.Descricao)+"|"+String(l.ParcelaAtual)]=1; } });
    var criados=0;
    parc.forEach(function(p){
      if(!eqNome_(p.Advogado,nome) || monthKeyOf_(p.Mes)!==mes) return;
      var desc=String(p.Contrato||"Comissão");
      var arr=byCom[String(p.ComissaoID||"")]||[]; var idx=arr.indexOf(p);
      var pa=String(idx>=0?idx+1:""); var pt=String(arr.length||"");
      if(jaTem[norm_(desc)+"|"+pa]) return;
      apiAdd("LancamentosSalario",{Mes:mes,Nome:nome,Tipo:"Comissão",Descricao:desc,Cliente:"",Valor:money_(p.ValorParcela),ParcelaAtual:pa,ParcelaTotal:pt});
      criados++;
    });
    _DB_CACHE=null;
    return ok_({criados:criados});
  }catch(e){ return err_(e.message); }
}
function apiFolhaMes(mes){ try{ mes=String(mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido."); var rows=folhaMesRows_(mes); var total=0; rows.forEach(function(r){ total+=r.total; }); return ok_({mes:mes, rows:rows, total:round2_(total), dataPagamento:fmt_(quintoDiaUtil_(mes))}); }catch(e){ return err_(e.message); } }
function apiSetSalarioAjuste(mes, nome, obj){
  try{
    mes=String(mes||"").slice(0,7); nome=String(nome||"").trim(); obj=obj||{};
    var sh=getDb_().getSheetByName("SalariosAjuste");
    if(!sh){ sh=getDb_().insertSheet("SalariosAjuste"); sh.getRange(1,1,1,12).setValues([["Mes","Nome","Comissao","Reembolso","ReembolsoDesc","Passagem","Emprestimo","Outros","OutrosDesc","PassagemExcluida","PassagemDiasManual","DiariaQtdManual"]]); }
    // auto-corrige: cria as colunas que faltarem, para nunca falhar a gravação
    var head0=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0];
    var precisa=["Mes","Nome","Comissao","Reembolso","ReembolsoDesc","Passagem","Emprestimo","Outros","OutrosDesc","PassagemExcluida","PassagemDiasManual","DiariaQtdManual"];
    var faltam=precisa.filter(function(c){ return head0.indexOf(c)<0; });
    if(faltam.length){ sh.getRange(1,head0.length+1,1,faltam.length).setValues([faltam]); }
    var vals=sh.getDataRange().getValues(); var head=vals[0];
    var ci={}; head.forEach(function(h,i){ ci[h]=i; });
    var lin=-1; for(var i=1;i<vals.length;i++){ if(String(vals[i][ci.Mes])===mes && norm_(vals[i][ci.Nome])===norm_(nome)){ lin=i; break; } }
    var row=(lin>=0)?vals[lin].slice():head.map(function(){return "";});
    if("Comissao" in obj) row[ci.Comissao]=obj.Comissao;
    if("Reembolso" in obj) row[ci.Reembolso]=obj.Reembolso;
    if("ReembolsoDesc" in obj) row[ci.ReembolsoDesc]=obj.ReembolsoDesc;
    if("Passagem" in obj && ci.Passagem!=null) row[ci.Passagem]=obj.Passagem;
    if("Emprestimo" in obj && ci.Emprestimo!=null) row[ci.Emprestimo]=obj.Emprestimo;
    if("Outros" in obj && ci.Outros!=null) row[ci.Outros]=obj.Outros;
    if("OutrosDesc" in obj && ci.OutrosDesc!=null) row[ci.OutrosDesc]=obj.OutrosDesc;
    if("PassagemExcluida" in obj && ci.PassagemExcluida!=null) row[ci.PassagemExcluida]=obj.PassagemExcluida;
    if("PassagemDiasManual" in obj && ci.PassagemDiasManual!=null) row[ci.PassagemDiasManual]=obj.PassagemDiasManual;
    if("DiariaQtdManual" in obj && ci.DiariaQtdManual!=null) row[ci.DiariaQtdManual]=obj.DiariaQtdManual;
    row[ci.Mes]=mes; row[ci.Nome]=nome;
    if(lin>=0) sh.getRange(lin+1,1,1,row.length).setValues([row]); else sh.appendRow(row);
    return ok_({saved:true});
  }catch(e){ return err_(e.message); }
}
// Toda vez que a folha de um mês é lançada no Contas a Pagar, aproveita e já grava o salário/diária BASE
// (sem reembolso/comissão/passagem) de cada colaborador naquele mês na aba HistoricoSalarial — assim, a partir
// do momento em que a folha realmente é processada mês a mês (ex.: 2027 em diante), o 13º proporcional já fica
// correto automaticamente, sem precisar digitar o histórico na mão (isso só é necessário retroativamente, pra meses
// que já passaram antes dessa automação existir). Nunca quebra o lançamento da folha caso dê algum erro.
function autoRegistrarHistoricoSalarial_(mes, rows){
  try{
    var ano=parseInt(mes.slice(0,4),10); if(!ano) return;
    var linhas=rows.filter(function(r){ return !ehSocioForaDecimoPLR_(r.nome); })
      .map(function(r){ return {nome:r.nome, mes:mes, base:r.base}; });
    if(linhas.length) apiSalvarHistoricoSalarial(ano, linhas);
  }catch(e){ /* não interrompe o lançamento da folha por causa disso */ }
}
function apiLancarFolhaPagar(mes){
  try{
    mes=String(mes||"").slice(0,7); if(!/^\d{4}-\d{2}$/.test(mes)) return err_("Mês inválido.");
    var r=folhaMesRows_(mes); var total=0; r.forEach(function(x){ total+=x.total; }); total=round2_(total);
    if(total<=0) return err_("Folha do mês está zerada.");
    autoRegistrarHistoricoSalarial_(mes, r);
    var venc=Utilities.formatDate(quintoDiaUtil_(mes), tz_(), "yyyy-MM-dd"); // 5º dia útil (conta sábado)
    var desc="Folha de salários "+mes+" ("+r.length+" colaboradores)";
    var prefixo="Folha de salários "+mes;
    // evita duplicar: procura QUALQUER folha deste mês (Categoria Salário + descrição começando com "Folha de salários {mes}")
    // e atualiza a primeira, apagando eventuais duplicatas antigas.
    var achadas=[]; objRows_("Pagar").forEach(function(p){ if(norm_(p.Categoria)==="salario" && String(p.Descricao||"").indexOf(prefixo)===0) achadas.push(p); });
    if(achadas.length){
      apiUpdateRow("Pagar", achadas[0].ID, {Descricao:desc, Valor:total, Data:venc, Categoria:"Salário"});
      for(var k=1;k<achadas.length;k++){ apiDelete("Pagar", achadas[k].ID); } // remove duplicatas de lançamentos anteriores
      return ok_({atualizado:true, total:total, colaboradores:r.length, duplicatasRemovidas:achadas.length-1});
    }
    apiAdd("Pagar",{Descricao:desc, Categoria:"Salário", Valor:total, Data:venc, Pago:"Não"});
    return ok_({criado:true, total:total, colaboradores:r.length});
  }catch(e){ return err_(e.message); }
}

/* ---------- 13º SALÁRIO E PARTICIPAÇÃO NOS LUCROS (PLR) ---------- */
// Quantos avos (meses) do 13º um colaborador tem direito num ano, pela regra de 15 dias:
// admitido até o dia 15 do mês conta o mês inteiro; depois do dia 15, só a partir do mês seguinte.
function avosNoAno_(dataInicioStr, ano){
  var m=String(dataInicioStr||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return 12; // sem data de início cadastrada: assume o ano inteiro
  var y=parseInt(m[1],10), mes=parseInt(m[2],10), dia=parseInt(m[3],10);
  if(y>ano) return 0;
  if(y<ano) return 12;
  var mesInicioEfetivo = dia<=15 ? mes : mes+1;
  if(mesInicioEfetivo>12) return 0;
  return 12-mesInicioEfetivo+1;
}
// Linhas do 13º salário de um ano.
// Soma, mês a mês (cada avo), o salário/diária BASE realmente vigente naquele mês — usando a aba HistoricoSalarial
// quando ela tiver o valor daquele mês/pessoa, e caindo para a base vigente em dezembro (cadastro atual) quando não tiver.
// Isso deixa o 13º "proporcional" de verdade quando houve reajuste no meio do ano (ex.: Igor em setembro/2026).
// Sócios/pró-labore não entram no 13º/PLR de empregados (têm distribuição de lucros própria, à parte).
// Prestadores/diaristas que não são funcionários (ex.: limpeza) também ficam de fora do 13º/PLR,
// mesmo continuando no quadro normal de Salários (são pagos, só não entram nesse benefício).
var NOMES_FORA_13_PLR = ["mariana","jane"];
function ehSocioForaDecimoPLR_(nome){ var nk=norm_(nome); return NOMES_FORA_13_PLR.some(function(s){ return nk===s || nk.indexOf(s+" ")===0; }); }
function decimoTerceiroRows_(ano){
  var hist={};
  objRows_("HistoricoSalarial").forEach(function(h){
    var mk=monthKeyOf_(h.Mes); if(mk.slice(0,4)!==String(ano)) return;
    (hist[mk]=hist[mk]||{})[norm_(h.Nome)]=money_(h.Base);
  });
  var baseDezRows=folhaMesRows_(ano+"-12");
  var baseDezByName={}; baseDezRows.forEach(function(r){ baseDezByName[norm_(r.nome)]=Number(r.base)||0; });
  var cols=objRows_("Colaboradores");
  var rows=[];
  cols.forEach(function(c){
    if(norm_(c.Ativo).indexOf("sim")<0 && String(c.Ativo||"")!=="") return;
    if(ehSocioForaDecimoPLR_(c.Nome)) return;
    var avos=avosNoAno_(c.DataInicio, ano);
    if(avos<=0) return;
    var nk=norm_(c.Nome);
    var baseDez=baseDezByName[nk]; if(baseDez==null) baseDez=money_(c.SalarioFixo);
    var mesFim=12, mesIni=mesFim-avos+1;
    var somaBases=0, detalhesMeses=[], temHistorico=false;
    for(var mm=mesIni; mm<=mesFim; mm++){
      var mk2=ano+"-"+("0"+mm).slice(-2);
      var doHist=(hist[mk2]&&hist[mk2][nk]!=null)?hist[mk2][nk]:null;
      var valorMes=(doHist!=null)?doHist:baseDez;
      if(doHist!=null) temHistorico=true;
      somaBases+=valorMes;
      detalhesMeses.push({mes:mk2, valor:round2_(valorMes), origem:(doHist!=null)?"historico":"atual"});
    }
    var integral=round2_(somaBases/12);
    var p1=round2_(integral/2), p2=round2_(integral-p1);
    rows.push({ nome:c.Nome, base:round2_(baseDez), avos:avos, integral:integral, parcela1:p1, parcela2:p2, detalhesMeses:detalhesMeses, temHistorico:temHistorico });
  });
  return rows;
}
// Retorna o % de PLR (sobre 1 salário-base) para X anos completos de casa, conforme a tabela PLRFaixas.
function percentualPLR_(anosCompletos, faixas){
  var pct=0;
  faixas.forEach(function(f){
    var min=parseFloat(f.AnosMin); if(isNaN(min))min=0;
    var maxRaw=String(f.AnosMax==null?"":f.AnosMax).trim();
    var max=maxRaw===""?null:parseFloat(maxRaw);
    if(anosCompletos>=min && (max==null || anosCompletos<max)) pct=parseFloat(f.Percentual)||0;
  });
  return pct;
}
// Linhas da PLR de um ano: tempo de casa em anos completos até 31/dez do ano de referência, x % da tabela PLRFaixas, x base de dezembro.
// ajustes: mapa norm(nome)->linha de Decimo13PLRAjuste do ano (opcional). Se tiver AnosCasaManual preenchido,
// usa esse número direto (sem precisar da Data de início) — é o que a tela "dentro de cada funcionário" alimenta.
function plrRows_(ano, ajustes){
  ajustes=ajustes||{};
  var faixas=objRows_("PLRFaixas");
  var refDate=new Date(ano,11,31);
  var baseRows=folhaMesRows_(ano+"-12");
  var baseByName={}; baseRows.forEach(function(r){ baseByName[norm_(r.nome)]=Number(r.base)||0; });
  var cols=objRows_("Colaboradores");
  var rows=[];
  cols.forEach(function(c){
    if(norm_(c.Ativo).indexOf("sim")<0 && String(c.Ativo||"")!=="") return;
    if(ehSocioForaDecimoPLR_(c.Nome)) return;
    var nk=norm_(c.Nome);
    var base=baseByName[nk]; if(base==null) base=money_(c.SalarioFixo);
    var ajuste=ajustes[nk];
    var row=null;
    var manualRaw=(ajuste && ajuste.AnosCasaManual!=null)?String(ajuste.AnosCasaManual).trim():"";
    if(manualRaw!==""){
      var anosManual=parseFloat(manualRaw.replace(",","."));
      if(!isNaN(anosManual)){
        var pctM=percentualPLR_(Math.floor(anosManual), faixas);
        row={ nome:c.Nome, dataInicio:String(c.DataInicio||""), anos:Math.floor(anosManual), percentual:pctM, base:round2_(base), valor:round2_(base*pctM/100), manual:true };
      }
    }
    if(!row){
      var m=String(c.DataInicio||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(!m) { row={nome:c.Nome, dataInicio:"", anos:0, percentual:0, base:round2_(base), valor:0, semData:true}; }
      else {
        var ini=new Date(parseInt(m[1],10),parseInt(m[2],10)-1,parseInt(m[3],10));
        if(ini>refDate) { row={nome:c.Nome, dataInicio:String(c.DataInicio||""), anos:0, percentual:0, base:round2_(base), valor:0, aindaNaoEntrou:true}; } // ainda não tinha entrado até 31/dez daquele ano
        else {
          var anos=Math.floor((refDate-ini)/(1000*60*60*24*365.25));
          var pct=percentualPLR_(anos, faixas);
          row={ nome:c.Nome, dataInicio:String(c.DataInicio||""), anos:anos, percentual:pct, base:round2_(base), valor:round2_(base*pct/100) };
        }
      }
    }
    // Override manual do VALOR final da PLR: "a gente paga do jeito que a gente quiser" — ignora a regra geral
    // pra essa pessoa específica, mas continua mostrando os anos de casa/percentual calculados como referência.
    var valorManualRaw=(ajuste && ajuste.ValorPLRManual!=null)?String(ajuste.ValorPLRManual).trim():"";
    if(valorManualRaw!==""){
      var valorManualN=money_(valorManualRaw);
      row.valor=round2_(valorManualN);
      row.valorManual=true;
    }
    rows.push(row);
  });
  return rows;
}
// Linhas finais do 13º+PLR de um ano: soma os dois cálculos e abate eventual adiantamento do 13º
// (lançado dentro do próprio colaborador) primeiro da 2ª parcela e, se sobrar, da 1ª.
function apiDecimoPLR(ano){
  try{
    ano=parseInt(ano,10); if(!ano) return err_("Ano inválido.");
    var ajustes={};
    objRows_("Decimo13PLRAjuste").forEach(function(a){ if(parseInt(a.Ano,10)===ano) ajustes[norm_(a.Nome)]=a; });
    var d13=decimoTerceiroRows_(ano);
    var plr=plrRows_(ano, ajustes);
    var plrByName={}; plr.forEach(function(p){ plrByName[norm_(p.nome)]=p; });
    var rows=d13.map(function(r){
      var nk=norm_(r.nome);
      var p=plrByName[nk]||{anos:0,percentual:0,valor:0,semData:false,manual:false};
      var ajuste=ajustes[nk];
      var adiant=money_(ajuste?ajuste.Adiantamento13:0);
      // Total líquido do 13º (já descontado o adiantamento). Por padrão divide IGUAL nas duas parcelas —
      // não faz sentido jogar o desconto inteiro numa parcela só e deixar a outra cheia.
      // Dá pra lançar, por funcionário, a 1ª e/ou a 2ª parcela na mão (uma alimenta a outra; as duas juntas, usa exatamente o que foi digitado).
      var totalLiquido=round2_(Math.max(0, r.integral-adiant));
      var p13_1Raw=(ajuste && ajuste.Parcela13_1Manual!=null)?String(ajuste.Parcela13_1Manual).trim():"";
      var p13_2Raw=(ajuste && ajuste.Parcela13_2Manual!=null)?String(ajuste.Parcela13_2Manual).trim():"";
      var p1aj, p2aj, parcela13Manual=false;
      if(p13_1Raw!=="" && p13_2Raw!==""){
        p1aj=round2_(money_(p13_1Raw)); p2aj=round2_(money_(p13_2Raw)); parcela13Manual=true;
      } else if(p13_1Raw!==""){
        p1aj=round2_(Math.max(0, Math.min(money_(p13_1Raw), totalLiquido))); p2aj=round2_(totalLiquido-p1aj); parcela13Manual=true;
      } else if(p13_2Raw!==""){
        p2aj=round2_(Math.max(0, Math.min(money_(p13_2Raw), totalLiquido))); p1aj=round2_(totalLiquido-p2aj); parcela13Manual=true;
      } else {
        p1aj=round2_(totalLiquido/2); p2aj=round2_(totalLiquido-p1aj);
      }
      return { nome:r.nome, base:r.base, avos:r.avos, integral13:r.integral,
        parcela1Bruta:r.parcela1, parcela2Bruta:r.parcela2, adiantamento13:round2_(adiant), adiantamento13Obs:String(ajuste?(ajuste.Adiantamento13Obs||""):""),
        parcela1:p1aj, parcela2:p2aj, parcela13Manual:parcela13Manual,
        anosCasa:p.anos||0, percentualPLR:p.percentual||0, valorPLR:p.valor||0, semDataInicio:!!p.semData, anosCasaManual:!!p.manual,
        valorPLRManual:!!p.valorManual, plrParcela1Manual:String(ajuste?(ajuste.PLRParcela1Manual!=null?ajuste.PLRParcela1Manual:""):""),
        detalhesMeses:r.detalhesMeses||[], temHistorico:!!r.temHistorico,
        total: round2_(p1aj+p2aj+(p.valor||0)) };
    });
    var totais={integral13:0,parcela1:0,parcela2:0,adiantamento:0,plr:0,geral:0};
    rows.forEach(function(r){ totais.integral13+=r.integral13; totais.parcela1+=r.parcela1; totais.parcela2+=r.parcela2; totais.adiantamento+=r.adiantamento13; totais.plr+=r.valorPLR; totais.geral+=r.total; });
    Object.keys(totais).forEach(function(k){ totais[k]=round2_(totais[k]); });
    return ok_({ano:ano, rows:rows, totais:totais});
  }catch(e){ return err_(e.message); }
}
// Salva, por colaborador+ano, o tempo de casa manual (pra PLR) e/ou o adiantamento do 13º — tudo "dentro do funcionário".
function apiSetDecimo13PLRAjuste(ano, nome, obj){
  try{
    ano=parseInt(ano,10); nome=String(nome||"").trim(); obj=obj||{};
    if(!ano) return err_("Ano inválido."); if(!nome) return err_("Nome inválido.");
    var sh=getDb_().getSheetByName("Decimo13PLRAjuste");
    var head0=sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0];
    var precisa=["ID","Ano","Nome","AnosCasaManual","Adiantamento13","Adiantamento13Obs","ValorPLRManual","PLRParcela1Manual","Parcela13_1Manual","Parcela13_2Manual"];
    var faltam=precisa.filter(function(c){ return head0.indexOf(c)<0; });
    if(faltam.length){ sh.getRange(1,head0.length+1,1,faltam.length).setValues([faltam]); }
    var vals=sh.getDataRange().getValues(); var head=vals[0];
    var ci={}; head.forEach(function(h,i){ ci[h]=i; });
    var lin=-1; for(var i=1;i<vals.length;i++){ if(parseInt(vals[i][ci.Ano],10)===ano && norm_(vals[i][ci.Nome])===norm_(nome)){ lin=i; break; } }
    var row=(lin>=0)?vals[lin].slice():head.map(function(){return "";});
    if("AnosCasaManual" in obj && ci.AnosCasaManual!=null) row[ci.AnosCasaManual]=obj.AnosCasaManual;
    if("Adiantamento13" in obj && ci.Adiantamento13!=null) row[ci.Adiantamento13]=obj.Adiantamento13;
    if("Adiantamento13Obs" in obj && ci.Adiantamento13Obs!=null) row[ci.Adiantamento13Obs]=obj.Adiantamento13Obs;
    if("ValorPLRManual" in obj && ci.ValorPLRManual!=null) row[ci.ValorPLRManual]=obj.ValorPLRManual;
    if("PLRParcela1Manual" in obj && ci.PLRParcela1Manual!=null) row[ci.PLRParcela1Manual]=obj.PLRParcela1Manual;
    if("Parcela13_1Manual" in obj && ci.Parcela13_1Manual!=null) row[ci.Parcela13_1Manual]=obj.Parcela13_1Manual;
    if("Parcela13_2Manual" in obj && ci.Parcela13_2Manual!=null) row[ci.Parcela13_2Manual]=obj.Parcela13_2Manual;
    row[ci.Ano]=ano; row[ci.Nome]=nome;
    if(ci.ID!=null && !row[ci.ID]) row[ci.ID]=newId_();
    if(lin>=0) sh.getRange(lin+1,1,1,row.length).setValues([row]); else sh.appendRow(row);
    return ok_({saved:true});
  }catch(e){ return err_(e.message); }
}
function apiSetPLRFaixa(obj){
  try{
    obj=obj||{};
    var anosMin=String(obj.anosMin==null?"":obj.anosMin).trim();
    var percentual=String(obj.percentual==null?"":obj.percentual).trim();
    if(anosMin===""||percentual==="") return err_("Informe ao menos 'anos a partir de' e o percentual.");
    var payload={AnosMin:anosMin, AnosMax:String(obj.anosMax==null?"":obj.anosMax).trim(), Percentual:percentual, Obs:obj.obs||""};
    if(obj.id){ apiUpdateRow("PLRFaixas", obj.id, payload); return ok_({updated:true}); }
    var r=apiAdd("PLRFaixas", payload);
    return ok_({created:true, id:r&&r.data&&r.data.id});
  }catch(e){ return err_(e.message); }
}
function apiDeletePLRFaixa(id){ try{ apiDelete("PLRFaixas", id); return ok_({deleted:true}); }catch(e){ return err_(e.message); } }
// Salva (ou limpa) o salário-base real de um colaborador em meses específicos de um ano, pra corrigir o 13º
// quando houve reajuste no meio do ano. linhas: [{nome, mes:"YYYY-MM", base:"1234,56"}] — base vazio apaga o override (volta a usar o valor atual/dezembro).
function apiSalvarHistoricoSalarial(ano, linhas){
  try{
    ano=parseInt(ano,10); if(!ano) return err_("Ano inválido.");
    linhas=linhas||[];
    var existentes=objRows_("HistoricoSalarial");
    var porChave={}; existentes.forEach(function(h){ porChave[monthKeyOf_(h.Mes)+"|"+norm_(h.Nome)]=h; });
    var salvos=0;
    linhas.forEach(function(l){
      var mes=String(l.mes||"").slice(0,7); var nome=String(l.nome||"").trim();
      if(!/^\d{4}-\d{2}$/.test(mes) || mes.slice(0,4)!==String(ano) || !nome) return;
      var chave=mes+"|"+norm_(nome);
      var existente=porChave[chave];
      var valorRaw=String(l.base==null?"":l.base).trim();
      if(valorRaw===""){
        if(existente){ apiDelete("HistoricoSalarial", existente.ID); salvos++; }
        return;
      }
      var valor=money_(valorRaw);
      if(existente){
        if(Number(existente.Base)!==valor){ apiUpdateRow("HistoricoSalarial", existente.ID, {Mes:mes, Nome:nome, Base:valor}); salvos++; }
      } else {
        apiAdd("HistoricoSalarial", {Mes:mes, Nome:nome, Base:valor}); salvos++;
      }
    });
    return ok_({salvos:salvos});
  }catch(e){ return err_(e.message); }
}
// Lança no Contas a Pagar o total de uma parcela (13º 1ª/2ª) ou da PLR de um ano, somando todos os colaboradores num único lançamento.
// Atualiza o lançamento existente (evita duplicar) se já tiver sido lançado antes para o mesmo ano/tipo.
// tipo: "parcela1"/"parcela2" (13º, 50/50 automático) ou "plr1"/"plr2" (PLR, dividida no % que a Daphyni escolher em
// percentual1 — ex.: 60 significa 60% na 1ª parcela e 40% na 2ª) ou "plr" (PLR inteira, de uma vez só — mantido por compatibilidade).
function apiLancarDecimoPLRPagar(ano, tipo, dataVenc, percentual1){
  try{
    ano=parseInt(ano,10); if(!ano) return err_("Ano inválido.");
    var res=apiDecimoPLR(ano); if(!res.success) return res;
    var total=0, desc="", descBase="";
    if(tipo==="parcela1"){ total=res.data.totais.parcela1; desc="13º salário (1ª parcela) "+ano; descBase=desc; if(!dataVenc) dataVenc=ano+"-11-30"; }
    else if(tipo==="parcela2"){ total=res.data.totais.parcela2; desc="13º salário (2ª parcela) "+ano; descBase=desc; if(!dataVenc) dataVenc=ano+"-12-20"; }
    else if(tipo==="plr"){ total=res.data.totais.plr; desc="Participação nos lucros (PLR) "+ano; descBase=desc; }
    else if(tipo==="plr1" || tipo==="plr2"){
      // Cada colaborador pode ter sua própria divisão (PLRParcela1Manual, lançada dentro do funcionário);
      // quem não tiver nada lançado usa o % padrão informado na tela (percentual1, default 50/50).
      var pctPadrao=Number(percentual1); if(isNaN(pctPadrao)||pctPadrao<0||pctPadrao>100) pctPadrao=50;
      var somaP1=0, somaP2=0;
      (res.data.rows||[]).forEach(function(r){
        var p1;
        var manualRaw=String(r.plrParcela1Manual||"").trim();
        if(manualRaw!==""){ p1=round2_(Math.max(0, Math.min(money_(manualRaw), r.valorPLR))); }
        else { p1=round2_(r.valorPLR*pctPadrao/100); }
        var p2=round2_(r.valorPLR-p1);
        somaP1+=p1; somaP2+=p2;
      });
      total=(tipo==="plr1")?round2_(somaP1):round2_(somaP2);
      descBase="Participação nos lucros (PLR) ("+(tipo==="plr1"?"1ª":"2ª")+" parcela) "+ano;
      desc=descBase+" — soma individual de cada colaborador";
    }
    else return err_("Tipo inválido.");
    if(!dataVenc) return err_("Informe a data de pagamento.");
    if(total<=0) return err_("Valor total é zero — nada para lançar.");
    var achadas=[]; objRows_("Pagar").forEach(function(p){ if(norm_(p.Categoria)==="salario" && String(p.Descricao||"").indexOf(descBase)===0) achadas.push(p); });
    if(achadas.length){
      apiUpdateRow("Pagar", achadas[0].ID, {Descricao:desc, Valor:total, Data:dataVenc, Categoria:"Salário"});
      for(var k=1;k<achadas.length;k++){ apiDelete("Pagar", achadas[k].ID); }
      return ok_({atualizado:true, total:total});
    }
    apiAdd("Pagar",{Descricao:desc, Categoria:"Salário", Valor:total, Data:dataVenc, Pago:"Não"});
    return ok_({criado:true, total:total});
  }catch(e){ return err_(e.message); }
}

// Monta os dados calculados do relatório de um cliente/mes.
function relatorioClienteData_(cliente, mes){
  var cli=null; objRows_("Clientes").forEach(function(c){ if(!cli && eqNome_(c.Nome,cliente)) cli=c; });
  if(!cli) throw new Error("Cliente não encontrado no cadastro: "+cliente);
  var contratadas=hoursToDec_(cli.HorasContratadas);
  var vHoraExtra=money_(cli.ValorHoraExtra), vAudiencia=money_(cli.ValorAudiencia), vProcExtra=money_(cli.ValorProcessoExtra);
  var procContratados=Number(cli.ProcessosContratados)||0, mensalidade=money_(cli.ValorMensalidade);
  var tarefas=[], consDec=0;
  objRows_("FechamentoConsultivo").forEach(function(r){ if(monthKeyOf_(r.Mes)===mes && eqNome_(r.Cliente,cliente)){ var d=hoursToDec_(r.Duracao); consDec+=d; tarefas.push({tarefa:r.Tarefa, data:r.Data, dur:decToHMS_(d), resp:r.Responsavel}); } });
  var ext=null; objRows_("FechamentoExtras").forEach(function(r){ if(!ext && monthKeyOf_(r.Mes)===mes && eqNome_(r.Cliente,cliente)) ext=r; });
  var procDec=ext?hoursToDec_(ext.HorasProcessual):0;
  var audiencias=ext?(parseInt(ext.Audiencias,10)||0):0;
  var excProc=ext?(parseInt(ext.ExcessoProcessos,10)||0):0;
  var custas=ext?money_(ext.Custas):0;
  var descCustas=ext?String(ext.DescricaoCustas||""):"";
  var descProcessos=ext?String(ext.DescricaoProcessos||""):"";
  var descAudiencias=ext?String(ext.DescricaoAudiencias||""):"";
  var vAudInf=ext?money_(ext.ValorAudiencias):0;   // valor informado pelo juridico
  var vProcInf=ext?money_(ext.ValorProcessos):0;
  var excHoras=Math.max(0, consDec-contratadas);
  var cobrExtras=round2_(excHoras*vHoraExtra);
  var cobrAud=round2_(vAudInf>0 ? vAudInf : audiencias*vAudiencia);   // usa valor da planilha; senão qtd x taxa do contrato
  var cobrProc=round2_(vProcInf>0 ? vProcInf : excProc*vProcExtra);
  var totalExtra=round2_(cobrExtras+cobrAud+cobrProc+custas);
  // VALORES A COBRAR = espelho do Contas a Receber do cliente no mes (mensalidade, DET, processos, o que houver)
  var LBL={Mensal:"Mensalidade de assessoria",DET:"Mensalidade DET","Audiência":"Audiências",Consultivo:"Horas de consultivo (excedente)",Processual:"Processos / horas processuais",Reembolso:"Reembolso de custas",Outros:"Outros"};
  var agg={}, totalReceber=0;
  objRows_("Receber").forEach(function(r){ if(eqNome_(r.Cliente,cliente) && monthKeyOf_(r.Vencimento)===mes){ var k=tipoKey_(r.Tipo); var v=money_(r.Valor); agg[k]=(agg[k]||0)+v; totalReceber+=v; } });
  var ordem=["Mensal","DET","Audiência","Consultivo","Processual","Reembolso","Outros"];
  var cobrancas=[]; ordem.forEach(function(k){ if(round2_(agg[k]||0)>0) cobrancas.push({label:LBL[k]||k, valor:round2_(agg[k])}); });
  totalReceber=round2_(totalReceber);
  return {
    cliente:cli.Nome, mes:mes,
    contratadas:contratadas, consDec:consDec, procDec:procDec,
    vHoraExtra:vHoraExtra, vAudiencia:vAudiencia, vProcExtra:vProcExtra, procContratados:procContratados, mensalidade:mensalidade,
    tarefas:tarefas, audiencias:audiencias, excProc:excProc, custas:custas, descCustas:descCustas, descProcessos:descProcessos, descAudiencias:descAudiencias,
    excHoras:excHoras, cobrExtras:cobrExtras, cobrAud:cobrAud, cobrProc:cobrProc, totalExtra:totalExtra,
    cobrancas:cobrancas, totalReceber:totalReceber,
    totalMes: totalReceber>0 ? totalReceber : round2_(mensalidade+totalExtra)
  };
}
var LOGO_B64="data:image/png;base64,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";
var MESES_PT_LONG=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
// Quebra a descrição de audiências em itens: separa cada audiência (que começa por uma data dd/mm/aaaa)
// mesmo quando o jurídico junta duas com " e ". Também aceita quebra por ponto e vírgula ou linha.
function splitAud_(txt){
  txt=String(txt||"").trim(); if(!txt || txt==="-") return [];
  var parts=txt.split(/\s*(?:;|\n)\s*|\s+e\s+(?=\d{1,2}\/\d{1,2}\/\d{2,4})/);
  return parts.map(function(s){return s.trim();}).filter(Boolean);
}
function buildRelatorioClienteHtml_(d){
  var mi=parseInt(d.mes.split("-")[1],10)-1, ano=d.mes.split("-")[0];
  var periodo=(MESES_PT_LONG[mi]||"")+" "+ano;
  var css="font-family:Arial,Helvetica,sans-serif;color:#20293f;";
  var h="<html><head><meta charset='utf-8'></head><body style='margin:0;background:#fff;"+css+"'>";
  h+="<div style='padding:22px 40px 6px;text-align:right'><img src='"+LOGO_B64+"' style='height:60px'></div>";
  h+="<div style='text-align:center;margin-top:6px'><div style='font-size:19px;font-weight:bold;text-decoration:underline'>RELATÓRIO MENSAL</div><div style='font-size:15px;font-weight:bold;margin-top:4px'>Período: "+periodo+"</div></div>";
  h+="<hr style='border:none;border-top:1px solid #cfd4de;margin:14px 40px'>";
  h+="<div style='padding:4px 40px 30px'>";
  h+="<p style='font-size:13px'><b style='text-decoration:underline'>CLIENTE:</b> "+d.cliente+"</p>";
  // resumo contrato
  h+="<p style='font-size:13px'><b style='text-decoration:underline'>RESUMO CONTRATO:</b></p><ul style='font-size:13px;margin-top:-6px'>";
  h+="<li><b>Audiências</b>: "+(d.vAudiencia>0?("R$ "+brl2_(d.vAudiencia)+" por audiência realizada"):"sem previsão de cobrança por audiência realizada")+"</li>";
  h+="<li><b>Consultivo</b>: "+Math.round(d.contratadas)+"h/mês (caso seja excedido, cobrar R$ "+brl2_(d.vHoraExtra)+" por hora trabalhada)</li>";
  if(d.procContratados>0) h+="<li><b>Processos judiciais</b>: "+d.procContratados+" ativos (acima de "+d.procContratados+", cobrar R$ "+brl2_(d.vProcExtra)+" por novo processo por mês)</li>";
  h+="</ul>";
  // controle de horas
  h+="<div style='font-size:15px;font-weight:bold;text-decoration:underline;margin:22px 0 10px'>CONTROLE DE HORAS UTILIZADAS</div>";
  function rowH(lb,val){ return "<tr><td style='background:#2e75b6;color:#fff;font-weight:bold;font-size:12px;padding:7px 12px;border:1px solid #b7c7dd;width:270px'>"+lb+"</td><td style='font-size:13px;padding:7px 12px;border:1px solid #b7c7dd'>"+val+"</td></tr>"; }
  h+="<table style='border-collapse:collapse'>"+
     rowH("Horas Contratadas",decToHMS_(d.contratadas))+
     rowH("Horas Utilizadas - Consultivo",decToHMS_(d.consDec))+
     rowH("Horas Utilizadas - Processual",decToHMS_(d.procDec))+
     rowH("Horas extras",decToHMS_(d.excHoras))+
     rowH("Cobrança horas extras",d.cobrExtras>0?("R$ "+brl2_(d.cobrExtras)):"-")+
     rowH("Custas",d.custas>0?("R$ "+brl2_(d.custas)):"-")+
     "</table>";
  if(d.excHoras>0) h+="<p style='font-size:13px;margin:10px 0 0'>Neste mês o consultivo <b>extrapolou em "+decToHMS_(d.excHoras)+"</b> além das "+decToHMS_(d.contratadas)+" contratadas ("+decToHMS_(d.consDec)+" utilizadas), gerando cobrança de horas extras de <b>R$ "+brl2_(d.cobrExtras)+"</b>.</p>";
  // time sheet consultivo
  if(d.tarefas.length){
    h+="<div style='font-size:14px;font-weight:bold;text-decoration:underline;margin:24px 0 8px'>TIME SHEET CONSULTIVO</div>";
    h+="<table style='border-collapse:collapse;width:100%;table-layout:fixed'><thead><tr>"+
       "<th style='background:#364B9B;color:#fff;font-size:10px;padding:6px 8px;text-align:left;border:1px solid #364B9B'>Tarefa</th>"+
       "<th style='background:#364B9B;color:#fff;font-size:10px;padding:6px 6px;border:1px solid #364B9B;width:72px'>Data</th>"+
       "<th style='background:#364B9B;color:#fff;font-size:10px;padding:6px 6px;border:1px solid #364B9B;width:66px'>Duração</th>"+
       "<th style='background:#364B9B;color:#fff;font-size:10px;padding:6px 8px;border:1px solid #364B9B;width:150px'>Responsável</th></tr></thead><tbody>";
    d.tarefas.forEach(function(t,ix){ var bg=(ix%2)?"#f6f7f9":"#fff"; h+="<tr style='background:"+bg+"'><td style='font-size:10.5px;padding:5px 8px;border:1px solid #e2e2e2;word-wrap:break-word'>"+t.tarefa+"</td><td style='font-size:10.5px;padding:5px 6px;border:1px solid #e2e2e2;text-align:center;white-space:nowrap'>"+fmtDataBr_(t.data)+"</td><td style='font-size:10.5px;padding:5px 6px;border:1px solid #e2e2e2;text-align:center;white-space:nowrap'>"+t.dur+"</td><td style='font-size:10.5px;padding:5px 8px;border:1px solid #e2e2e2;word-wrap:break-word'>"+t.resp+"</td></tr>"; });
    h+="<tr style='background:#eef1f6'><td colspan='2' style='font-size:11px;font-weight:bold;padding:6px 8px;border:1px solid #e2e2e2;text-align:right'>TOTAL CONSULTIVO</td><td style='font-size:11px;font-weight:bold;padding:6px 6px;border:1px solid #e2e2e2;text-align:center;white-space:nowrap'>"+decToHMS_(d.consDec)+"</td><td style='border:1px solid #e2e2e2'></td></tr>";
    h+="</tbody></table>";
  }
  // custas
  h+="<div style='font-size:15px;font-weight:bold;text-decoration:underline;margin:24px 0 8px'>CUSTAS</div>";
  h+="<ul style='font-size:13px;margin-top:0'>"+(d.custas>0?("<li>"+(d.descCustas||("Custas do mês: R$ "+brl2_(d.custas)))+"</li>"):"<li>Sem custas a serem cobradas no mês de referência</li>")+"</ul>";
  // audiencias / processos
  if(d.audiencias>0||d.cobrAud>0||d.excProc>0||d.cobrProc>0){
    h+="<div style='font-size:15px;font-weight:bold;text-decoration:underline;margin:20px 0 8px'>AUDIÊNCIAS E PROCESSOS</div><ul style='font-size:13px;margin-top:0'>";
    if(d.audiencias>0||d.cobrAud>0){
      h+="<li><b>Audiências realizadas</b>: "+(d.audiencias>0?d.audiencias+" audiência(s)":"")+" &ndash; <b>R$ "+brl2_(d.cobrAud)+"</b>";
      var la=splitAud_(d.descAudiencias);
      if(la.length){ h+="<ul style='margin:4px 0 0'>"; la.forEach(function(a){ h+="<li>"+a+"</li>"; }); h+="</ul>"; }
      h+="</li>";
    }
    if(d.excProc>0||d.cobrProc>0){
      h+="<li><b>Excesso de processos</b>: "+(d.excProc>0?d.excProc+" processo(s) acima do contratado":"")+" &ndash; <b>R$ "+brl2_(d.cobrProc)+"</b>";
      var lp=String(d.descProcessos||"").split(/[;\n]+/).map(function(s){return s.trim();}).filter(Boolean);
      if(lp.length){ h+="<ul style='margin:4px 0 0'>"; lp.forEach(function(p){ h+="<li>"+p+"</li>"; }); h+="</ul>"; }
      h+="</li>";
    }
    h+="</ul>";
  }
  // valores a cobrar
  h+="<div style='margin-top:22px;border:2px solid #F86C2E;border-radius:8px;padding:14px 18px;background:#FFF4EE'>";
  h+="<div style='font-size:13px;font-weight:bold;color:#D4561C;margin-bottom:8px'>VALORES A COBRAR NO MÊS</div><table style='width:100%;border-collapse:collapse;font-size:13px'>";
  var linhasCob=(d.cobrancas&&d.cobrancas.length)?d.cobrancas:[];
  if(!linhasCob.length){ // fallback quando ainda não foi importado/lançado no Receber
    linhasCob=[{label:"Mensalidade de assessoria",valor:d.mensalidade}];
    if(d.cobrExtras>0)linhasCob.push({label:"Horas extras de consultivo",valor:d.cobrExtras});
    if(d.cobrAud>0)linhasCob.push({label:"Audiências",valor:d.cobrAud});
    if(d.cobrProc>0)linhasCob.push({label:"Excesso de processos",valor:d.cobrProc});
    if(d.custas>0)linhasCob.push({label:"Reembolso de custas",valor:d.custas});
  }
  linhasCob.forEach(function(it){ h+="<tr><td style='padding:3px 0'>"+it.label+"</td><td style='text-align:right'>R$ "+brl2_(it.valor)+"</td></tr>"; });
  h+="<tr><td style='padding:8px 0 0;font-weight:bold;border-top:1px solid #F5D5C4'>TOTAL DO MÊS</td><td style='text-align:right;font-weight:bold;border-top:1px solid #F5D5C4;padding-top:8px'>R$ "+brl2_(d.totalMes)+"</td></tr>";
  h+="</table></div>";
  h+="</div>";
  h+="<div style='text-align:center;font-size:10px;color:#888;padding:14px 40px 24px'>Av. Anita Garibaldi, 850, Sala 104, Success, Ed. Infinity Prime Offices. Curitiba/PR - CEP: 80540-180<br>(41) 3077-4292 / 3019-4292 | contato@advogadosdh.com.br | www.advogadosdh.com.br</div>";
  h+="</body></html>";
  return h;
}
function brl2_(n){ n=Number(n)||0; var s=n.toFixed(2).split("."); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+s[1]; }
function fmtDataBr_(v){ if(!v) return ""; var s=String(v).trim(); var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[3]+"/"+m[2]+"/"+m[1]; m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return s; return s; }

function apiRelatorioClientePdf(cliente, mes){
  try{
    var d=relatorioClienteData_(cliente, String(mes||"").slice(0,7));
    var blob=Utilities.newBlob(buildRelatorioClienteHtml_(d),"text/html","rel.html").getAs("application/pdf");
    var nome=String(cliente).replace(/[^\w]+/g,"_").slice(0,40);
    return ok_({ name:"Relatorio_"+nome+"_"+d.mes+".pdf", data:Utilities.base64Encode(blob.getBytes()), calc:{excHoras:decToHMS_(d.excHoras),cobrExtras:d.cobrExtras,cobrAud:d.cobrAud,cobrProc:d.cobrProc,custas:d.custas,totalExtra:d.totalExtra,mensalidade:d.mensalidade,totalMes:d.totalMes} });
  }catch(e){ return err_(e.message); }
}
// Lança as cobranças extras (horas, audiência, processos, custas) no Contas a Receber do mês.
function apiLancarExtrasReceber(cliente, mes){
  try{
    var d=relatorioClienteData_(cliente, String(mes||"").slice(0,7));
    var venc=firstReceberVenc_(cliente, d.mes) || (d.mes+"-10");
    // Remove os lançamentos automáticos anteriores deste cliente/mês (consultivo, processual, audiência, custas)
    // para que a reimportação sempre reflita o fechamento atual e limpe valores antigos/errados.
    var managed={Consultivo:1, Processual:1, "Audiência":1, Reembolso:1};
    var toDel=[];
    objRows_("Receber").forEach(function(r){
      if(!eqNome_(r.Cliente,cliente) || monthKeyOf_(r.Vencimento)!==d.mes) return;
      var k=tipoKey_(r.Tipo);
      if(managed[k]) toDel.push(r.ID);
      else if(k==="Outros" && /processo/i.test(String(r.IdentificarValor||""))) toDel.push(r.ID); // legado: processo que caiu em Outros
    });
    toDel.forEach(function(id){ apiDelete("Receber", id); });
    var itens=[];
    if(d.cobrExtras>0) itens.push({Tipo:"Horas consultivo", Valor:d.cobrExtras, Ident:decToHMS_(d.excHoras)+" excedentes x R$ "+brl2_(d.vHoraExtra)});
    if(d.cobrAud>0) itens.push({Tipo:"Audiência", Valor:d.cobrAud, Ident:d.audiencias+" audiência(s)"});
    if(d.cobrProc>0) itens.push({Tipo:"Processos extras", Valor:d.cobrProc, Ident:d.excProc+" processo(s) x R$ "+brl2_(d.vProcExtra)});
    if(d.custas>0) itens.push({Tipo:"Reembolso de custas", Valor:d.custas, Ident:"Reembolso de custas"});
    var criados=0;
    itens.forEach(function(it){
      apiAdd("Receber",{Cliente:cliente, Tipo:it.Tipo, Vencimento:venc, Valor:it.Valor, Cobrado:"Não", Recebido:"Não", IdentificarValor:it.Ident}); criados++;
    });
    return ok_({lancados:itens.length, criados:criados, totalExtra:d.totalExtra});
  }catch(e){ return err_(e.message); }
}

/* ================= EXTRATO BANCÁRIO (versão web) =================
   Lançamentos importados dos extratos (OFX/CSV/Excel) do Banco do Brasil e da Caixa.
   Classe: Receita, Despesa, Pró-labore sócia, Retirada sócia, Aporte sócia, Aplicação,
   Resgate, Transferência entre contas, Outros (fora do lucro), A classificar. */
function extratoSheet_(){ var sh=getDb_().getSheetByName("Extrato"); if(!sh) throw new Error("Aba Extrato não encontrada."); return sh; }
// Grava de uma vez só (rápido) os lançamentos novos; ignora os que já existem (mesma Chave).
function apiExtratoImportar(linhas){
  try{
    var sh=extratoSheet_(); var head=headOf_(sh);
    var ic=head.indexOf("Chave"); var vals=sh.getDataRange().getValues(); var ja={};
    for(var i=1;i<vals.length;i++){ var k=String(vals[i][ic]||""); if(k) ja[k]=1; }
    var novos=[], rep=0, agora=Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd HH:mm");
    (linhas||[]).forEach(function(o){
      var k=String(o.Chave||""); if(!k){ rep++; return; }
      if(ja[k]){ rep++; return; } ja[k]=1;
      o.Importado=agora;
      novos.push(head.map(function(c){ if(c==="ID") return newId_(); return (o[c]!==undefined&&o[c]!==null)?o[c]:""; }));
    });
    if(novos.length){ var start=Math.max(sh.getLastRow(),1)+1; sh.getRange(start,1,novos.length,head.length).setValues(novos); }
    return ok_({ novos:novos.length, repetidos:rep });
  }catch(e){ return err_(e.message); }
}
// Atualiza os mesmos campos em vários lançamentos (classificar em lote).
function apiExtratoAtualizar(ids, obj){
  try{
    var sh=extratoSheet_(); var vals=sh.getDataRange().getValues(); var head=vals[0]; var idc=head.indexOf("ID");
    var set={}; (ids||[]).forEach(function(x){ set[String(x)]=1; }); var n=0;
    for(var i=1;i<vals.length;i++){
      if(!set[String(vals[i][idc])]) continue;
      head.forEach(function(c,ci){ if(c!=="ID" && obj[c]!==undefined) vals[i][ci]=obj[c]; });
      sh.getRange(i+1,1,1,head.length).setValues([vals[i]]); n++;
    }
    return ok_({ atualizados:n });
  }catch(e){ return err_(e.message); }
}
// Divide um lançamento em partes (ex.: fatura do cartão = despesas do escritório + gastos da sócia).
function apiExtratoDividir(id, partes){
  try{
    if(!partes || partes.length<2) return err_("Informe pelo menos duas partes.");
    var sh=extratoSheet_(); var vals=sh.getDataRange().getValues(); var head=vals[0];
    var idc=head.indexOf("ID"), vc=head.indexOf("Valor"), kc=head.indexOf("Chave");
    for(var i=1;i<vals.length;i++){
      if(String(vals[i][idc])!==String(id)) continue;
      var orig=vals[i].slice(), total=round2_(money_(orig[vc])), soma=0;
      partes.forEach(function(p){ soma+=Number(p.Valor)||0; });
      if(Math.abs(round2_(soma)-total)>0.01) return err_("A soma das partes ("+round2_(soma)+") precisa ser igual ao valor original ("+total+").");
      var novas=[];
      partes.forEach(function(p,ix){
        var row=orig.slice();
        if(ix>0) row[idc]=newId_();
        row[vc]=round2_(Number(p.Valor)||0);
        row[head.indexOf("Classe")]=p.Classe||"A classificar";
        row[head.indexOf("Categoria")]=p.Categoria||"";
        row[head.indexOf("Obs")]=p.Obs!==undefined?p.Obs:row[head.indexOf("Obs")];
        row[kc]=String(orig[kc])+(ix>0?"#"+(ix+1):"");
        if(ix===0) sh.getRange(i+1,1,1,head.length).setValues([row]); else novas.push(row);
      });
      if(novas.length) sh.getRange(sh.getLastRow()+1,1,novas.length,head.length).setValues(novas);
      return ok_({ partes:partes.length });
    }
    return err_("lançamento não encontrado");
  }catch(e){ return err_(e.message); }
}
// Exclui vários lançamentos (de baixo para cima, para não bagunçar as linhas).
function apiExtratoExcluir(ids){
  try{
    var sh=extratoSheet_(); var vals=sh.getDataRange().getValues(); var idc=vals[0].indexOf("ID");
    var set={}; (ids||[]).forEach(function(x){ set[String(x)]=1; }); var n=0;
    for(var i=vals.length-1;i>=1;i--){ if(set[String(vals[i][idc])]){ sh.deleteRow(i+1); n++; } }
    return ok_({ excluidos:n });
  }catch(e){ return err_(e.message); }
}
