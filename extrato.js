/*************************************************************
 * EXTRATO BANCÁRIO + LUCRO REAL
 * - Importa extratos do Banco do Brasil e da Caixa (OFX, CSV ou Excel)
 * - Classifica cada lançamento (regras automáticas + ajuste manual)
 * - Mostra o lucro real: receitas − despesas − pró-labore, e as
 *   retiradas da Mariana separadas.
 *************************************************************/
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ymOf(v) { var d = parseD(v); return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) : ''; }
  var MES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var MES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function num(v) { return Number(moneyN(v)) || 0; }

  /* ---------- classes ---------- */
  var CL = {
    REC: 'Receita', DESP: 'Despesa', PRO: 'Pró-labore Mariana', RET: 'Retirada Mariana', APO: 'Aporte Mariana',
    APL: 'Aplicação ou resgate', TRF: 'Transferência entre contas', OUT: 'Outros (fora do lucro)', PEN: 'A classificar',
    GRA: 'Graciola (à parte)', FORA: 'Fora da conta'
  };
  var CLASSES = [CL.REC, CL.DESP, CL.PRO, CL.RET, CL.GRA, CL.APO, CL.APL, CL.TRF, CL.OUT, CL.FORA, CL.PEN];
  var CLASSE_INFO = {};
  CLASSE_INFO[CL.REC] = 'Entrada do escritório (honorários etc.). Entra no lucro.';
  CLASSE_INFO[CL.DESP] = 'Gasto do escritório. Reduz o lucro.';
  CLASSE_INFO[CL.PRO] = 'Pró-labore/salário fixo da Mariana. Aparece separado.';
  CLASSE_INFO[CL.RET] = 'Dinheiro que a Mariana tirou (PIX para ela, gastos pessoais no cartão). Não é despesa.';
  CLASSE_INFO[CL.APO] = 'Dinheiro que a Mariana colocou na empresa. Não é receita.';
  CLASSE_INFO[CL.APL] = 'Aplicação ou resgate de investimento. Fica fora do lucro.';
  CLASSE_INFO[CL.TRF] = 'Transferência entre as contas da DH e da Consultoria. Fica fora do lucro.';
  CLASSE_INFO[CL.OUT] = 'Movimento que não é receita nem despesa (empréstimo, estorno...).';
  CLASSE_INFO[CL.PEN] = 'Ainda não foi classificado.';
  CLASSE_INFO[CL.FORA] = 'Tirado da conta por você (não entra em entradas, saídas nem lucro). Dá para recolocar.';
  CLASSE_INFO[CL.GRA] = 'Notas da Graciola e o DAS pago sobre elas. Controle à parte: não entra no lucro real.';
  var CAT_DESP = ['Salário', 'Comissão', 'Benefícios', 'Estrutura', 'Aluguel e condomínio', 'Tributos', 'Serviços', 'Marketing', 'Reembolso', 'Tarifas bancárias', 'Cartão de crédito', 'Outros'];
  var CAT_REC = ['Honorários', 'Reembolso de custas', 'Rendimentos', 'Outros'];
  function catsDe(classe) { return classe === CL.DESP ? CAT_DESP : (classe === CL.REC ? CAT_REC : []); }
  function classeCss(c) { return { 'Receita': 'rec', 'Despesa': 'desp', 'Pró-labore Mariana': 'pro', 'Retirada Mariana': 'ret', 'Aporte Mariana': 'apo', 'A classificar': 'pen', 'Graciola (à parte)': 'gra' }[c] || 'fora'; }

  /* ---------- salário fixo da Mariana (o que conta como custo dela no lucro real) ---------- */
  function salarioMariana() { var v = moneyN(CFG && CFG.ProLaboreMariana); return v > 0 ? v : 22738; }
  window.dhExSalario = function () {
    var atual = salarioMariana();
    var v = prompt('Salário mensal da Mariana que entra como custo no lucro real (R$):', String(atual).replace('.', ','));
    if (v === null) return; var n = moneyN(v); if (!(n > 0)) { alert('Valor inválido.'); return; }
    CFG.ProLaboreMariana = n; render();
    google.script.run.withFailureHandler(function (e) { alert('Não consegui salvar: ' + e.message); }).apiSetConfig('ProLaboreMariana', n);
  };

  /* ---------- regras ---------- */
  var SUGESTOES = [
    ['GRACIOLA', CL.GRA, ''],
    ['PRO LABORE', CL.PRO, ''], ['PRO-LABORE', CL.PRO, ''], ['PROLABORE', CL.PRO, ''],
    ['MARIANA', CL.RET, ''],
    ['DOMINGUES CONS', CL.TRF, ''], ['DOMINGUES E HEROLD', CL.TRF, ''], ['DOMINGUES & HEROLD', CL.TRF, ''],
    ['TARIFA', CL.DESP, 'Tarifas bancárias'], ['TAR PACOTE', CL.DESP, 'Tarifas bancárias'], ['CESTA DE SERVICOS', CL.DESP, 'Tarifas bancárias'],
    ['SIMPLES NACIONAL', CL.DESP, 'Tributos'], ['DARF', CL.DESP, 'Tributos'], ['FGTS', CL.DESP, 'Tributos'], ['GPS', CL.DESP, 'Tributos'], ['INSS', CL.DESP, 'Tributos'],
    ['BB RENDE FACIL', CL.APL, ''], ['RENDE FACIL', CL.APL, ''], ['APLICACAO', CL.APL, ''], ['RESGATE', CL.APL, ''], ['CDB', CL.APL, ''],
    ['FATURA', CL.RET, ''], ['CARTAO', CL.RET, '']
  ];
  function regras() {
    var minhas = (DATA.extratoRegras || []).filter(function (r) { return String(r.Contem || '').trim(); });
    // enquanto não houver nenhuma regra salva, usa as sugeridas
    if (!minhas.length) return SUGESTOES.map(function (s, i) { return { Contem: s[0], Classe: s[1], Categoria: s[2], Conta: '', Ordem: i, sugerida: true }; });
    return minhas.filter(function (r) { return String(r.Contem || '').trim(); })
      .slice().sort(function (a, b) { return (Number(a.Ordem) || 0) - (Number(b.Ordem) || 0); });
  }
  function classificar(desc, valor, conta) {
    var d = norm(desc), rs = regras();
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.Conta && norm(r.Conta) !== norm(conta)) continue;
      if (d.indexOf(norm(r.Contem)) >= 0) return { Classe: r.Classe || CL.PEN, Categoria: r.Categoria || '', regra: r };
    }
    // sem regra: entrada vira Receita (quase sempre é cliente pagando); saída fica para classificar
    return valor > 0 ? { Classe: CL.REC, Categoria: 'Honorários' } : { Classe: CL.PEN, Categoria: '' };
  }

  /* ---------- leitura dos arquivos ---------- */
  function lerValor(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim(); if (!s || s === '-') return NaN;
    var neg = /^\(.*\)$/.test(s) || /-/.test(s) || /\bD$/i.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) { if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    var n = parseFloat(s); if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  }
  function lerData(v) {
    if (v instanceof Date && !isNaN(v)) return iso(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) { var u = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return u.getUTCFullYear() + '-' + pad(u.getUTCMonth() + 1) + '-' + pad(u.getUTCDate()); }
    var s = String(v == null ? '' : v).trim(), m;
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/))) return '20' + m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }
  function decodificar(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function lerOFX(txt) {
    var conta = { banco: '', acct: '' }, out = [];
    var mb = txt.match(/<BANKID>\s*([^<\r\n]+)/i); if (mb) conta.banco = mb[1].trim();
    var ma = txt.match(/<ACCTID>\s*([^<\r\n]+)/i); if (ma) conta.acct = ma[1].trim();
    var blocos = txt.split(/<STMTTRN>/i).slice(1);
    blocos.forEach(function (b) {
      b = b.split(/<\/STMTTRN>/i)[0];
      function tag(t) { var m = b.match(new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; }
      var data = lerData(tag('DTPOSTED')), valor = lerValor(tag('TRNAMT'));
      var nome = tag('NAME'), memo = tag('MEMO');
      var desc = nome && memo && norm(memo).indexOf(norm(nome)) < 0 ? nome + ' · ' + memo : (memo || nome || tag('TRNTYPE'));
      if (!data || isNaN(valor) || !valor) return;
      out.push({ Data: data, Descricao: desc, Valor: valor, fitid: tag('FITID') });
    });
    return { linhas: out, conta: conta };
  }
  function acharCol(head, padroes, evitar) {
    for (var i = 0; i < head.length; i++) {
      var h = norm(head[i]); if (!h) continue;
      if (evitar && evitar.test(h)) continue;
      for (var k = 0; k < padroes.length; k++) if (padroes[k].test(h)) return i;
    }
    return -1;
  }
  function lerTabela(aoa) {
    var hi = -1, head = null;
    for (var i = 0; i < Math.min(aoa.length, 25); i++) {
      var h = (aoa[i] || []).map(norm);
      var temData = h.some(function (x) { return /^DATA|^DT|DATA[ _]MOV|DATA DO LANC/.test(x); });
      var temValor = h.some(function (x) { return /VALOR|CREDITO|DEBITO|MONTANTE/.test(x); });
      if (temData && temValor) { hi = i; head = aoa[i]; break; }
    }
    if (hi < 0) throw new Error('Não encontrei a linha de cabeçalho com "Data" e "Valor".');
    var iData = acharCol(head, [/^DATA$/, /^DATA[ _]MOV/, /^DATA/, /^DT/], /BALANCETE/);
    var iValor = acharCol(head, [/^VALOR$/, /^VALOR/, /MONTANTE/], /SALDO/);
    var iCred = acharCol(head, [/^CREDITO/, /^ENTRADA/]), iDeb = acharCol(head, [/^DEBITO/, /^SAIDA/]);
    var iDC = acharCol(head, [/DEB.?CRED/, /^D\/?C$/, /NATUREZA/, /TIPO LANC/, /^TIPO$/]);
    var iDescs = [];
    head.forEach(function (x, ix) { var h = norm(x); if (/LANCAMENTO|HISTORICO|DESCRI|DETALHE|MEMO|COMPLEMENTO|ESTABELEC|FAVORECIDO/.test(h) && !/TIPO LANC/.test(h)) iDescs.push(ix); });
    if (iData < 0) throw new Error('Não encontrei a coluna de data.');
    if (iValor < 0 && (iCred < 0 || iDeb < 0)) throw new Error('Não encontrei a coluna de valor.');
    var out = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r] || []; var data = lerData(row[iData]); if (!data) continue;
      var desc = iDescs.map(function (ix) { return String(row[ix] == null ? '' : row[ix]).trim(); }).filter(Boolean).join(' · ');
      if (/^S ?A ?L ?D ?O|SALDO (ANTERIOR|DO DIA|FINAL|ATUAL)|^SALDO$/.test(norm(desc))) continue;
      var valor;
      if (iValor >= 0) {
        valor = lerValor(row[iValor]);
        if (iDC >= 0) { var dc = norm(row[iDC]); if (/^D|SAIDA|DEBITO/.test(dc)) valor = -Math.abs(valor); else if (/^C|ENTRADA|CREDITO/.test(dc)) valor = Math.abs(valor); }
      } else {
        var c = lerValor(row[iCred]), dd = lerValor(row[iDeb]);
        valor = (isNaN(c) ? 0 : Math.abs(c)) - (isNaN(dd) ? 0 : Math.abs(dd));
      }
      if (isNaN(valor) || !valor) continue;
      out.push({ Data: data, Descricao: desc || '(sem descrição)', Valor: Math.round(valor * 100) / 100 });
    }
    return { linhas: out, conta: { banco: '', acct: '' } };
  }
  function lerCSV(txt) {
    var linhas = txt.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var amostra = linhas.slice(0, 10).join('\n');
    var sep = (amostra.split(';').length >= amostra.split(',').length) ? ';' : ',';
    if ((amostra.match(/\t/g) || []).length > (amostra.match(new RegExp(sep, 'g')) || []).length) sep = '\t';
    function partir(l) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var ch = l[i];
        if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur); return out.map(function (x) { return x.trim(); });
    }
    return lerTabela(linhas.map(partir));
  }
  function nomeConta(info, arquivo) {
    var b = String(info.banco || '').replace(/^0+/, ''), a = String(info.acct || '').replace(/\s/g, '');
    var banco = b === '1' ? 'Banco do Brasil' : (b === '104' ? 'Caixa' : '');
    if (!banco) { var f = norm(arquivo); banco = /CAIXA|CEF/.test(f) ? 'Caixa' : (/BB|BRASIL/.test(f) ? 'Banco do Brasil' : ''); }
    return (banco || 'Conta') + (a ? ' ' + a.slice(-6) : '');
  }

  /* ---------- importação ---------- */
  var PREV = null;
  function importar(inp) {
    var f = inp.files && inp.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onerror = function () { alert('Falha ao ler o arquivo.'); inp.value = ''; };
    rd.onload = function (ev) {
      inp.value = '';
      try {
        var buf = new Uint8Array(ev.target.result), res, nome = f.name, ext = (nome.split('.').pop() || '').toLowerCase();
        var txt = (ext === 'xlsx' || ext === 'xls') ? '' : decodificar(buf);
        if (/OFXHEADER|<OFX>/i.test(txt) || ext === 'ofx') res = lerOFX(txt);
        else if (ext === 'xlsx' || ext === 'xls') {
          if (typeof XLSX === 'undefined') throw new Error('A biblioteca de planilhas não carregou. Recarregue a página.');
          var wb = XLSX.read(buf, { type: 'array', cellDates: true });
          var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
          if (ehContaAzul(aoa)) { var ca = lerContaAzul(aoa); if (!ca.linhas.length) throw new Error('Não encontrei lançamentos realizados no arquivo do Conta Azul.'); PREV = { arquivo: nome, ca: true, linhas: ca.linhas, ignorados: ca.ignorados }; previaCA(); return; }
          res = lerTabela(aoa);
        } else res = lerCSV(txt);
        if (!res.linhas.length) throw new Error('Não encontrei lançamentos no arquivo.');
        PREV = { arquivo: nome, linhas: res.linhas, contaSug: nomeConta(res.conta, nome) };
        previa();
      } catch (e) { alert('Não consegui ler o extrato: ' + e.message + '\n\nFormatos aceitos: OFX (recomendado), CSV ou Excel exportados do banco.'); }
    };
    rd.readAsArrayBuffer(f);
  }
  /* ---------- Conta Azul (Finanças › Extrato › Exportar) ---------- */
  function cabecalhoCA(aoa) {
    for (var i = 0; i < Math.min(aoa.length, 8); i++) {
      var h = (aoa[i] || []).map(norm);
      if (h.indexOf('DATA MOVIMENTO') >= 0 && h.some(function (x) { return /^CATEGORIA 1$/.test(x); })) return i;
    }
    return -1;
  }
  function ehContaAzul(aoa) { return cabecalhoCA(aoa) >= 0; }
  function lerContaAzul(aoa) {
    var hi = cabecalhoCA(aoa), head = aoa[hi].map(norm), out = [], ign = 0;
    function col(n) { return head.indexOf(n); }
    var iD = col('DATA MOVIMENTO'), iNome = col('NOME DO FORNECEDOR/CLIENTE'), iDesc = col('DESCRICAO'), iTipo = col('TIPO'),
      iConta = col('CONTA BANCARIA'), iVal = col('VALOR (R$)'), iSit = col('SITUACAO'), iObs = col('OBSERVACOES');
    var cats = [];
    head.forEach(function (h, ix) { var m = h.match(/^CATEGORIA (\d+)$/); if (m) cats.push({ i: ix, v: col('VALOR NA CATEGORIA ' + m[1]) }); });
    if (iD < 0 || iVal < 0) throw new Error('Arquivo do Conta Azul sem as colunas "Data movimento" e "Valor (R$)".');
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r] || [], data = lerData(row[iD]); if (!data) continue;
      var valor = lerValor(row[iVal]); if (isNaN(valor) || !valor) continue;
      var sit = norm(row[iSit]);
      // só o que de fato passou no banco: "Atrasado", "Em aberto", "Agendado"... ficam de fora
      if (sit && !/CONCILIAD|QUITAD|PAGO|RECEBID|LIQUIDAD|BAIXAD/.test(sit)) { ign++; continue; }
      var nome = String(row[iNome] || '').trim(), desc = String(row[iDesc] || '').trim();
      var texto = nome && desc && norm(desc).indexOf(norm(nome)) < 0 ? nome + ' · ' + desc : (nome || desc || '(sem descrição)');
      var base = { Data: data, Descricao: texto, contaCA: String(row[iConta] || 'Conta Azul').trim(), tipo: norm(row[iTipo]), Obs: String(row[iObs] || '').trim() };
      // rateio em várias categorias vira um lançamento por categoria
      var partes = cats.map(function (c) { return { cat: String(row[c.i] || '').trim(), v: c.v >= 0 ? lerValor(row[c.v]) : NaN }; }).filter(function (p) { return p.cat; });
      var soma = partes.reduce(function (a, p) { return a + (isNaN(p.v) ? 0 : p.v); }, 0);
      if (partes.length > 1 && Math.abs(Math.abs(soma) - Math.abs(valor)) < 0.02) {
        partes.forEach(function (p, k) { out.push(Object.assign({}, base, { Valor: Math.round((valor < 0 ? -1 : 1) * Math.abs(p.v) * 100) / 100, catCA: p.cat, parte: k + 1 })); });
      } else out.push(Object.assign({}, base, { Valor: Math.round(valor * 100) / 100, catCA: partes[0] ? partes[0].cat : '(sem categoria)' }));
    }
    return { linhas: out, ignorados: ign };
  }
  function chaveCA(l) { return l.catCA + ' @ ' + l.contaCA; }
  function mapaCA() { try { return JSON.parse((CFG && CFG.ContaAzulMapa) || '{}') || {}; } catch (e) { return {}; } }
  function classeSugeridaCA(cat, valor, conta) {
    var c = norm(cat), ct = norm(conta);
    if (/GRACIOLA/.test(c)) return CL.GRA;
    // DAS pago na conta da Domingues & Herold (CEF) é o imposto das notas da Graciola
    if (/SIMPLES|\bDAS\b/.test(c) && /CEF|CAIXA|HEROLD/.test(ct)) return CL.GRA;
    // cartão debitado na Consultoria é de uso só da Mariana
    if (/CART(AO|OES)/.test(c) && /CONSULTORIA/.test(ct)) return CL.RET;
    if (/APLICA|RESGATE|INVESTIMENTO/.test(c)) return CL.APL;
    if (/REPASSE|TRANSFER/.test(c)) return CL.TRF;
    if (/DISTRIBUI|LUCRO|RETIRADA/.test(c)) return CL.RET;
    if (/PRO.?LABORE|SALARIOS? (DOS )?SOCIO/.test(c)) return CL.PRO;
    if (/APORTE/.test(c)) return CL.APO;
    if (/EMPRESTIMO/.test(c)) return CL.OUT;
    return valor > 0 ? CL.REC : CL.DESP;
  }
  function contaPadraoCA(n) { var c = norm(n); return c === 'CEF' || /CAIXA/.test(c) ? 'Caixa' : n; }
  function previaCA() {
    var m = mapaCA(); m.cats = m.cats || {}; m.contas = m.contas || {};
    var cats = {}, contas = {};
    PREV.linhas.forEach(function (l) {
      var k = chaveCA(l); var o = cats[k] = cats[k] || { n: 0, v: 0, cat: l.catCA, conta: l.contaCA }; o.n++; o.v += l.Valor;
      contas[l.contaCA] = (contas[l.contaCA] || 0) + 1;
    });
    PREV.mapa = { cats: {}, contas: {} };
    Object.keys(cats).forEach(function (k) { PREV.mapa.cats[k] = m.cats[k] || classeSugeridaCA(cats[k].cat, cats[k].v, cats[k].conta); });
    Object.keys(contas).forEach(function (k) { PREV.mapa.contas[k] = m.contas[k] || contaPadraoCA(k); });
    PREV.catsInfo = cats;
    var datas = PREV.linhas.map(function (l) { return l.Data; }).sort();
    var ordem = Object.keys(cats).sort(function (a, b) { return (cats[a].v > 0) - (cats[b].v > 0) || Math.abs(cats[b].v) - Math.abs(cats[a].v); });
    var h = '<div class="mhead"><button class="mclose" onclick="closeModal()">✕</button><h2>Importar do Conta Azul</h2><div class="mtags"><span class="tag b">' + esc(PREV.arquivo) + '</span><span class="tag">' + fmtD(datas[0]) + ' a ' + fmtD(datas[datas.length - 1]) + '</span></div></div><div class="mbody">' +
      '<div class="miuda" style="margin-bottom:10px">' + PREV.linhas.length + ' lançamento(s) realizados' + (PREV.ignorados ? ' · ' + PREV.ignorados + ' ignorado(s) por não estarem conciliados (ex.: "Atrasado")' : '') +
      '. A categoria do Conta Azul é mantida; escolha abaixo em que <b>classe</b> do lucro real cada uma entra. Fica salvo para os próximos meses.</div>' +
      '<div class="msec">Contas</div><div class="form fc-form">' + Object.keys(contas).map(function (k, i) {
        return '<div><label>' + esc(k) + ' (' + contas[k] + ') no CRM se chama</label><input class="ex-ca-conta" data-k="' + esc(k) + '" list="exContasDL3" value="' + esc(PREV.mapa.contas[k]) + '" onchange="dhExCaAtualiza()"></div>';
      }).join('') + '<datalist id="exContasDL3">' + contasConhecidas().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div class="msec">Categorias do Conta Azul → classe no CRM</div>' +
      '<div class="scroll"><table class="dh-tbl ex-ca-tbl"><thead><tr><th>Categoria no Conta Azul · conta</th><th class="r">Lanç.</th><th class="r">Total</th><th>Classe no CRM</th></tr></thead><tbody>' +
      ordem.map(function (k) {
        var c = cats[k], cl = PREV.mapa.cats[k];
        return '<tr><td>' + esc(c.cat) + ' <span class="ex-ca-ct">' + esc(c.conta) + '</span>' + (m.cats[k] ? '' : ' <span class="ex-novo">nova</span>') + '</td><td class="r">' + c.n + '</td><td class="r ' + (c.v < 0 ? 'neg' : 'pos') + '">' + brl(c.v) + '</td><td>' +
          selClasse('', cl, 'data-k="' + esc(k) + '" onchange="this.className=\'ex-sel ex-ca-cl ex-c-\'+dhExCss(this.value);dhExCaAtualiza()"').replace('class="ex-sel', 'class="ex-sel ex-ca-cl') + '</td></tr>';
      }).join('') + '</tbody></table></div><div id="exCaResumo"></div></div>' +
      '<div class="mfoot"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn" id="exBtnImp" onclick="dhExConfirmarCA()">Importar</button></div>';
    el('modalCard').innerHTML = h; el('modalBg').classList.add('on');
    dhExCaAtualiza();
  }
  window.dhExCss = classeCss;
  function linhasCA() {
    var seq = {};
    return PREV.linhas.map(function (l) {
      var base = l.Data + '|' + l.Valor + '|' + norm(l.Descricao).slice(0, 60) + (l.parte ? '|p' + l.parte : '');
      var k0 = norm(l.contaCA) + ':' + base; seq[k0] = (seq[k0] || 0) + 1;
      var classe = PREV.mapa.cats[chaveCA(l)] || CL.PEN;
      return { Data: l.Data, Descricao: l.Descricao, Valor: l.Valor, Conta: PREV.mapa.contas[l.contaCA] || l.contaCA, Classe: classe,
        Categoria: l.catCA, Chave: 'CA:' + k0 + (seq[k0] > 1 ? '|' + seq[k0] : ''), Obs: l.Obs || '' };
    });
  }
  window.dhExCaAtualiza = function () {
    [].forEach.call(document.querySelectorAll('.ex-ca-cl'), function (s) { PREV.mapa.cats[s.getAttribute('data-k')] = s.value; });
    [].forEach.call(document.querySelectorAll('.ex-ca-conta'), function (i) { PREV.mapa.contas[i.getAttribute('data-k')] = i.value.trim() || i.getAttribute('data-k'); });
    var linhas = linhasCA(), ja = {}; (DATA.extrato || []).forEach(function (x) { ja[String(x.Chave)] = 1; });
    var novos = linhas.filter(function (l) { return !ja[l.Chave]; }); PREV.novos = novos;
    var r = resumo(novos);
    var b = $('exBtnImp'); if (b) { b.style.display = novos.length ? '' : 'none'; b.textContent = 'Importar ' + novos.length + ' lançamento(s)'; }
    $('exCaResumo').innerHTML = '<div class="ex-prev-n"><div><span>Novos</span><b>' + novos.length + '</b></div><div><span>Já importados</span><b>' + (linhas.length - novos.length) + '</b></div>' +
      '<div><span>Receitas</span><b class="pos">' + brl(r.rec) + '</b></div><div><span>Despesas</span><b class="warn">' + brl(-r.desp) + '</b></div><div><span>Lucro real</span><b>' + brl(r.lucro) + '</b></div></div>' +
      avisoSobreposicao(novos);
  };
  window.dhExConfirmarCA = function () {
    dhExCaAtualiza();
    var mapa = mapaCA(); mapa.cats = Object.assign(mapa.cats || {}, PREV.mapa.cats); mapa.contas = Object.assign(mapa.contas || {}, PREV.mapa.contas);
    var json = JSON.stringify(mapa); if (CFG) CFG.ContaAzulMapa = json;
    google.script.run.withFailureHandler(function () {}).apiSetConfig('ContaAzulMapa', json);
    dhExConfirmar();
  };
  // avisa se o mesmo mês/conta já veio de outra fonte (banco x Conta Azul) — evita contar em dobro
  function avisoSobreposicao(novos) {
    var fonte = function (ch) { return /^CA:/.test(String(ch)) ? 'Conta Azul' : 'extrato do banco'; };
    var existentes = {};
    (DATA.extrato || []).forEach(function (x) { existentes[norm(x.Conta) + '|' + ymOf(x.Data) + '|' + fonte(x.Chave)] = 1; });
    var conflito = {};
    novos.forEach(function (l) {
      var f = fonte(l.Chave), outra = f === 'Conta Azul' ? 'extrato do banco' : 'Conta Azul', ym = ymOf(l.Data);
      if (existentes[norm(l.Conta) + '|' + ym + '|' + outra]) conflito[l.Conta + ' · ' + MES_C[+ym.slice(5) - 1] + '/' + ym.slice(2, 4) + ' (já veio do ' + outra + ')'] = 1;
    });
    var k = Object.keys(conflito);
    return k.length ? '<div class="ex-pend" style="cursor:default">⚠ <b>Atenção, pode duplicar:</b> ' + esc(k.join('; ')) + '. Importe cada mês de uma fonte só.</div>' : '';
  }

  function montarLinhas(conta) {
    var seq = {};
    return PREV.linhas.map(function (l) {
      var base = l.fitid ? 'F' + l.fitid + '|' + l.Data + '|' + l.Valor : l.Data + '|' + l.Valor + '|' + norm(l.Descricao).slice(0, 60);
      seq[base] = (seq[base] || 0) + 1;
      var chave = 'X:' + norm(conta) + ':' + base + (seq[base] > 1 ? '|' + seq[base] : '');
      var c = classificar(l.Descricao, l.Valor, conta);
      return { Data: l.Data, Descricao: l.Descricao, Valor: l.Valor, Conta: conta, Classe: c.Classe, Categoria: c.Categoria, Chave: chave, Obs: '' };
    });
  }
  function contasConhecidas() {
    var s = {}; (DATA.extrato || []).forEach(function (x) { if (x.Conta) s[x.Conta] = 1; });
    ['Banco do Brasil', 'Caixa'].forEach(function (c) { s[c] = 1; }); return Object.keys(s);
  }
  function previa(mudouConta) {
    var conta = (mudouConta === true && $('exConta') && $('exConta').value.trim()) || PREV.conta || PREV.contaSug;
    PREV.conta = conta;
    var linhas = montarLinhas(conta);
    var ja = {}; (DATA.extrato || []).forEach(function (x) { ja[String(x.Chave)] = 1; });
    var novos = linhas.filter(function (l) { return !ja[l.Chave]; });
    var ent = 0, sai = 0, pen = 0, datas = linhas.map(function (l) { return l.Data; }).sort();
    novos.forEach(function (l) { if (l.Valor > 0) ent += l.Valor; else sai += l.Valor; if (l.Classe === CL.PEN) pen++; });
    PREV.novos = novos;
    var porClasse = {}; novos.forEach(function (l) { porClasse[l.Classe] = (porClasse[l.Classe] || 0) + 1; });
    var h = '<div class="mhead"><button class="mclose" onclick="closeModal()">✕</button><h2>Importar extrato</h2><div class="mtags"><span class="tag b">' + esc(PREV.arquivo) + '</span></div></div><div class="mbody">' +
      '<div class="form fc-form"><div style="grid-column:span 2"><label>Conta bancária</label><input id="exConta" list="exContasDL" value="' + esc(conta) + '" onchange="dhExPrevia(true)"><datalist id="exContasDL">' +
      contasConhecidas().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div>' +
      '<div style="grid-column:span 2"><label>Período do arquivo</label><div class="ex-pv">' + fmtD(datas[0]) + ' a ' + fmtD(datas[datas.length - 1]) + '</div></div></div>' +
      '<div class="ex-prev-n"><div><span>Lançamentos no arquivo</span><b>' + linhas.length + '</b></div><div><span>Novos</span><b>' + novos.length + '</b></div><div><span>Já importados</span><b>' + (linhas.length - novos.length) + '</b></div>' +
      '<div><span>Entradas novas</span><b class="pos">' + brl(ent) + '</b></div><div><span>Saídas novas</span><b class="warn">' + brl(sai) + '</b></div></div>' +
      (novos.length ? '<div class="miuda" style="margin-top:10px">Classificação automática: ' + Object.keys(porClasse).map(function (k) { return esc(k) + ' (' + porClasse[k] + ')'; }).join(' · ') +
        (pen ? '. <b>' + pen + ' ficam "A classificar"</b> para você ajustar depois.' : '.') + '</div>' + avisoSobreposicao(novos) : '<div class="miuda" style="margin-top:10px">Tudo deste arquivo já tinha sido importado.</div>') +
      '</div><div class="mfoot"><button class="btn ghost" onclick="closeModal()">Cancelar</button>' +
      (novos.length ? '<button class="btn" id="exBtnImp" onclick="dhExConfirmar()">Importar ' + novos.length + ' lançamento(s)</button>' : '') + '</div>';
    el('modalCard').innerHTML = h; el('modalBg').classList.add('on');
  }
  window.dhExPrevia = previa;
  window.dhExConfirmar = function () {
    var b = $('exBtnImp'); if (b) { b.disabled = true; b.textContent = 'Importando...'; }
    var linhas = PREV.novos;
    google.script.run.withSuccessHandler(function (res) {
      closeModal();
      if (!res || !res.success) { alert('Não consegui importar: ' + ((res && res.error) || 'falha')); return; }
      alert('Extrato importado: ' + res.data.novos + ' lançamento(s) novo(s)' + (res.data.repetidos ? ', ' + res.data.repetidos + ' já existiam' : '') + '.');
      ESTADO.per = null; recarregar();
    }).withFailureHandler(function (e) { closeModal(); alert('Não consegui importar: ' + e.message); }).apiExtratoImportar(linhas);
  };
  function recarregar() { if (typeof loadData === 'function') loadData(false); }

  /* ---------- estado da tela ---------- */
  var ESTADO = { per: null, conta: '', classe: '', busca: '', sel: {}, limite: 200 };
  function periodos() {
    var ms = {}; (DATA.extrato || []).forEach(function (x) { var m = ymOf(x.Data); if (m) ms[m] = 1; });
    return Object.keys(ms).sort().reverse();
  }
  function perAtual() {
    if (ESTADO.per) return ESTADO.per;
    var p = null; try { p = localStorage.getItem('crm_ext_periodo'); } catch (e) {}
    var ms = periodos();
    if (!p || (p !== '*' && !ms.some(function (m) { return m === p || m.slice(0, 4) === p; }))) p = ms[0] ? ms[0].slice(0, 4) : String(new Date().getFullYear());
    return (ESTADO.per = p);
  }
  function noPer(x, p) { var m = ymOf(x.Data); return p === '*' || m === p || m.slice(0, 4) === p; }
  function perNome(p) { return p === '*' ? 'todo o período' : (p.length === 4 ? 'ano de ' + p : MES_L[+p.slice(5, 7) - 1] + '/' + p.slice(0, 4)); }
  window.dhExSet = function (k, v) {
    ESTADO[k] = v; if (k === 'per') { try { localStorage.setItem('crm_ext_periodo', v); } catch (e) {} }
    if (k !== 'sel') ESTADO.sel = {}; ESTADO.limite = 200; render();
  };

  /* ---------- cálculo do resumo ---------- */
  function resumo(lista) {
    var r = { rec: 0, desp: 0, proPago: 0, ret: 0, apo: 0, apl: 0, trf: 0, out: 0, pen: 0, penN: 0, graRec: 0, graDesp: 0, catD: {}, catR: {} }, meses = {};
    lista.forEach(function (x) {
      var v = num(x.Valor), c = x.Classe || CL.PEN; meses[ymOf(x.Data)] = 1;
      if (c === CL.REC) { r.rec += v; var k = x.Categoria || 'Outros'; r.catR[k] = (r.catR[k] || 0) + v; }
      else if (c === CL.DESP) { r.desp += -v; var k2 = x.Categoria || 'Outros'; r.catD[k2] = (r.catD[k2] || 0) + (-v); }
      else if (c === CL.PRO) r.proPago += -v;
      else if (c === CL.GRA) { if (v > 0) r.graRec += v; else r.graDesp += -v; }
      else if (c === CL.RET) r.ret += -v;
      else if (c === CL.APO) r.apo += v;
      else if (c === CL.APL) r.apl += v;
      else if (c === CL.TRF) r.trf += v;
      else if (c === CL.OUT) r.out += v;
      else if (c === CL.FORA) { r.fora = (r.fora || 0) + v; r.foraN = (r.foraN || 0) + 1; }
      else { r.pen += v; r.penN++; }
    });
    r.meses = Object.keys(meses).filter(Boolean).length;
    r.salario = salarioMariana(); r.pro = r.salario * r.meses;        // salário fixo × meses do período
    r.oper = r.rec - r.desp; r.lucro = r.oper - r.pro;
    r.marTot = r.proPago + r.ret;                                      // o que a Mariana tirou de fato
    r.acima = r.marTot - r.pro;                                        // retirada além do salário (= lucro retirado)
    r.ficou = r.oper - r.marTot;
    r.gra = r.graRec - r.graDesp;
    return r;
  }
  window.dhExtratoResumo = function (filtroMes) { // usado por Dados financeiros
    var lista = (DATA.extrato || []).filter(function (x) { return filtroMes(ymOf(x.Data)); });
    return lista.length ? resumo(lista) : null;
  };

  /* ---------- tela ---------- */
  function lbl(t) { return '<div class="dh-lbl">' + t + '</div>'; }
  function selClasse(id, val, extra) {
    return '<select class="ex-sel ex-c-' + classeCss(val) + '" ' + extra + '>' + CLASSES.map(function (c) { return '<option' + (c === val ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>';
  }
  function selCat(val, classe, extra) {
    var cs = catsDe(classe); if (!cs.length) return '<span class="dh-sub">—</span>';
    if (val && cs.indexOf(val) < 0) cs = [val].concat(cs);
    return '<select class="ex-sel ex-cat" ' + extra + '><option value="">—</option>' + cs.map(function (c) { return '<option' + (c === val ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>';
  }
  function render() {
    var v = $('v-extrato'); if (!v || !DATA) return;
    var todos = DATA.extrato || [], p = perAtual();
    var contas = {}; todos.forEach(function (x) { if (x.Conta) contas[x.Conta] = 1; });
    var doPer = todos.filter(function (x) { return noPer(x, p) && (!ESTADO.conta || x.Conta === ESTADO.conta); });
    var r = resumo(doPer);
    var ms = periodos(), anos = {}; ms.forEach(function (m) { anos[m.slice(0, 4)] = 1; });
    var optPer = '<option value="*"' + (p === '*' ? ' selected' : '') + '>Todo o período</option>' +
      Object.keys(anos).sort().reverse().map(function (y) { return '<option value="' + y + '"' + (p === y ? ' selected' : '') + '>Ano de ' + y + '</option>'; }).join('') +
      '<optgroup label="Mês">' + ms.map(function (m) { return '<option value="' + m + '"' + (p === m ? ' selected' : '') + '>' + MES_C[+m.slice(5) - 1] + ' ' + m.slice(0, 4) + '</option>'; }).join('') + '</optgroup>';
    var h = '<div id="finHead" class="fin-head"><div><div class="dh-lbl">Extrato bancário</div><h1 class="dh-hello">Lucro real pelo extrato</h1>' +
      '<div class="dh-sub dh-hello-sub">Mostrando <b>' + perNome(p) + '</b>' + (ESTADO.conta ? ' · ' + esc(ESTADO.conta) : ' · todas as contas') + ' · ' + doPer.length + ' lançamento(s)</div></div>' +
      '<div class="ex-filtros"><label class="fin-per"><span>Período</span><select onchange="dhExSet(\'per\',this.value)">' + optPer + '</select></label>' +
      '<label class="fin-per"><span>Conta</span><select onchange="dhExSet(\'conta\',this.value)"><option value="">Todas as contas</option>' + Object.keys(contas).sort().map(function (c) { return '<option' + (c === ESTADO.conta ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label></div></div>' +
      '<div class="ex-acoes"><button class="btn" onclick="document.getElementById(\'exArq\').click()">⬆ Importar extrato</button><input type="file" id="exArq" accept=".ofx,.OFX,.csv,.txt,.xlsx,.xls" style="display:none" onchange="dhExImportar(this)">' +
      '<button class="btn ghost dh-modelo" onclick="dhExModelo()">Modelo</button>' +
      '<button class="btn ghost" onclick="dhExRegras()">Regras de classificação (' + regras().length + ')</button>' +
      '<button class="btn ghost" onclick="dhExAplicarRegras()">Aplicar regras nos "A classificar"</button>' +
      '<span class="miuda">Aceita o Excel do <b>Conta Azul</b> (Finanças › Extrato › Exportar) e o extrato do BB/Caixa em <b>OFX</b>, CSV ou Excel.</span></div>';

    if (!todos.length) {
      h += '<div class="card dh-card fc-card ex-vazio">' + lbl('Comece importando um extrato') +
        '<p>1. No internet banking do <b>Banco do Brasil</b> ou da <b>Caixa</b>, abra o extrato da conta, escolha o período (pode ser o ano todo de 2026) e salve em <b>OFX</b> (às vezes aparece como "Money", "Quicken" ou "OFX"). Se não tiver OFX, salve em CSV ou Excel.</p>' +
        '<p>2. Clique em <b>⬆ Importar extrato</b> e escolha o arquivo. Confira a conta e confirme. Repita para cada conta (DH e Consultoria).</p>' +
        '<p>3. Crie as <b>regras de classificação</b> (há sugestões prontas, como "MARIANA → Retirada Mariana") e ajuste o que ficar "A classificar".</p></div>';
      v.innerHTML = h; return;
    }

    // DRE simples
    function linhaDre(t, val, cls, sub) { return '<tr class="' + (cls || '') + '"><td>' + t + (sub ? '<small>' + sub + '</small>' : '') + '</td><td class="r">' + brl(val) + '</td></tr>'; }
    var catsD = Object.keys(r.catD).sort(function (a, b) { return r.catD[b] - r.catD[a]; });
    h += '<div class="dh-grid g2 ex-top"><div class="card dh-card fc-card">' + lbl('Resultado · ' + perNome(p)) +
      '<table class="dh-tbl ex-dre"><tbody>' +
      linhaDre('Entradas do escritório (sem Graciola)', r.rec, 'pos') +
      linhaDre('(−) Despesas do escritório', -r.desp, 'neg', catsD.slice(0, 4).map(function (c) { return esc(c) + ' ' + brl(r.catD[c]); }).join(' · ')) +
      linhaDre('= Resultado operacional', r.oper, 'tot') +
      linhaDre('(−) Salário da Mariana', -r.pro, 'neg', brl(r.salario) + ' × ' + r.meses + ' mês(es) · <a href="#" onclick="event.preventDefault();dhExSalario()">alterar valor</a>') +
      linhaDre('= Lucro real', r.lucro, 'tot big') +
      '</tbody></table>' +
      '<div class="ex-box"><div class="ex-box-t">Mariana no período</div>' +
        '<div class="ex-box-l"><span>Tirou de fato (PIX para ela, cartão, salário pago)</span><b>' + brl(r.marTot) + '</b></div>' +
        '<div class="ex-box-l"><span>Salário previsto</span><b>' + brl(r.pro) + '</b></div>' +
        '<div class="ex-box-l tot"><span>' + (r.acima >= 0 ? 'Retirou de lucro (além do salário)' : 'Retirou a menos que o salário') + '</span><b>' + brl(Math.abs(r.acima)) + '</b></div>' +
        '<div class="ex-box-l"><span>Ficou na empresa (resultado − o que ela tirou)</span><b class="' + (r.ficou < 0 ? 'neg' : 'pos') + '">' + brl(r.ficou) + '</b></div></div>' +
      (r.graRec || r.graDesp ? '<div class="ex-box ex-gra"><div class="ex-box-t">Graciola · controle à parte</div>' +
        '<div class="ex-box-l"><span>Notas recebidas</span><b>' + brl(r.graRec) + '</b></div>' +
        '<div class="ex-box-l"><span>(−) DAS sobre as notas</span><b>' + brl(-r.graDesp) + '</b></div>' +
        '<div class="ex-box-l tot"><span>Líquido Graciola</span><b>' + brl(r.gra) + '</b></div></div>' : '') +
      '<div class="ex-fora"><span>Fora do lucro:</span> Aportes da Mariana ' + brl(r.apo) + ' · Aplicações/resgates ' + brl(r.apl) + ' · Transferências entre contas ' + brl(r.trf) + ' · Outros ' + brl(r.out) + '</div>' +
      (r.penN ? '<div class="ex-pend" onclick="dhExSet(\'classe\',\'' + CL.PEN + '\')">⚠ <b>' + r.penN + ' lançamento(s) a classificar</b> (' + brl(r.pen) + '): não entram no resultado até você classificar. Clique para ver.</div>' : '') +
      '</div>';

    // Saídas da Mariana mês a mês (ano do período)
    var ano = p === '*' ? (ms[0] || '').slice(0, 4) : p.slice(0, 4);
    var pm = {}; for (var i = 1; i <= 12; i++) pm[ano + '-' + pad(i)] = { pro: 0, ret: 0 };
    todos.forEach(function (x) {
      if (ESTADO.conta && x.Conta !== ESTADO.conta) return;
      var m = ymOf(x.Data); if (!pm[m]) return;
      if (x.Classe === CL.PRO) pm[m].pro += -num(x.Valor); else if (x.Classe === CL.RET) pm[m].ret += -num(x.Valor);
    });
    var tp = 0, tr = 0, ta = 0, sal = salarioMariana();
    h += '<div class="card dh-card fc-card">' + lbl('Saídas da Mariana · ' + ano) +
      '<table class="dh-tbl ex-mar"><thead><tr><th>Mês</th><th class="r">Salário pago</th><th class="r">Retiradas e cartão</th><th class="r">Total</th><th class="r">Além do salário</th></tr></thead><tbody>' +
      Object.keys(pm).map(function (m) {
        var o = pm[m]; if (!o.pro && !o.ret) return '';
        var t = o.pro + o.ret, a = t - sal; tp += o.pro; tr += o.ret; ta += a;
        return '<tr onclick="dhExSet(\'per\',\'' + m + '\')" style="cursor:pointer"><td>' + MES_C[+m.slice(5) - 1] + '/' + m.slice(2, 4) + '</td><td class="r">' + brl(o.pro) + '</td><td class="r">' + brl(o.ret) + '</td><td class="r"><b>' + brl(t) + '</b></td><td class="r ' + (a > 0 ? 'neg' : '') + '">' + brl(a) + '</td></tr>';
      }).join('') +
      '<tr class="ex-mar-tot"><td>Total ' + ano + '</td><td class="r">' + brl(tp) + '</td><td class="r">' + brl(tr) + '</td><td class="r">' + brl(tp + tr) + '</td><td class="r">' + brl(ta) + '</td></tr></tbody></table>' +
      '<div class="miuda" style="margin-top:8px">"Além do salário" = total que ela tirou no mês − salário de ' + brl(sal) + '.</div>' +
      (tp + tr ? '' : '<div class="empty">Nenhuma saída da Mariana classificada ainda. Crie a regra "MARIANA → Retirada Mariana" ou classifique os lançamentos.</div>') + '</div></div>';

    // lista de lançamentos
    var cont = {}; doPer.forEach(function (x) { var c = x.Classe || CL.PEN; cont[c] = (cont[c] || 0) + 1; });
    var q = norm(ESTADO.busca);
    var lista = doPer.filter(function (x) { return (!ESTADO.classe || (x.Classe || CL.PEN) === ESTADO.classe) && (!q || norm(x.Descricao).indexOf(q) >= 0 || norm(x.Obs).indexOf(q) >= 0 || norm(x.Categoria).indexOf(q) >= 0); })
      .sort(function (a, b) { return String(b.Data).localeCompare(String(a.Data)) || (num(a.Valor) - num(b.Valor)); });
    var nSel = Object.keys(ESTADO.sel).length;
    h += '<div class="card dh-card fc-card" id="exLista"><div class="dh-head">' + lbl('Lançamentos (' + lista.length + ')') +
      '<input type="search" class="ex-busca" placeholder="Buscar na descrição ou categoria..." value="' + esc(ESTADO.busca) + '" oninput="dhExBusca(this.value)"></div>' +
      '<div class="lc-f ex-chips"><button class="segbtn' + (!ESTADO.classe ? ' on' : '') + '" onclick="dhExSet(\'classe\',\'\')">Todas (' + doPer.length + ')</button>' +
      CLASSES.filter(function (c) { return cont[c]; }).map(function (c) { return '<button class="segbtn ex-chip-' + classeCss(c) + (ESTADO.classe === c ? ' on' : '') + '" onclick="dhExSet(\'classe\',\'' + c + '\')">' + c + ' (' + cont[c] + ')</button>'; }).join('') + '</div>' +
      (nSel ? '<div class="ex-lote"><b>' + nSel + ' selecionado(s)</b> · classificar como ' + selClasse('', CL.DESP, 'id="exLoteC" onchange="dhExLoteCat()"') + ' <span id="exLoteCatBox">' + selCat('', CL.DESP, 'id="exLoteCat"') + '</span>' +
        ' <button class="btn fc-mini" onclick="dhExLote()">Aplicar</button> <button class="btn ghost fc-mini" onclick="dhExExcluirSel()">Excluir</button> <button class="btn ghost fc-mini" onclick="dhExSet(\'sel\',{})">Limpar seleção</button></div>' : '') +
      '<div class="scroll"><table class="dh-tbl ex-tbl"><thead><tr><th><input type="checkbox" onclick="dhExSelTodos(this.checked)"></th><th>Data</th><th>Descrição</th><th>Conta</th><th class="r">Valor</th><th>Classe</th><th>Categoria</th><th></th></tr></thead><tbody>' +
      lista.slice(0, ESTADO.limite).map(function (x) {
        var id = esc(String(x.ID)), val = num(x.Valor), c = x.Classe || CL.PEN;
        return '<tr class="' + (c === CL.PEN ? 'ex-pen-row' : '') + '"><td><input type="checkbox" ' + (ESTADO.sel[x.ID] ? 'checked' : '') + ' onclick="dhExSel(\'' + id + '\',this.checked)"></td>' +
          '<td class="ex-dt">' + fmtD(x.Data) + '</td><td class="ex-desc">' + esc(x.Descricao) + (x.Obs ? '<small>' + esc(x.Obs) + '</small>' : '') + '</td><td class="ex-conta">' + esc(x.Conta) + '</td>' +
          '<td class="r ex-v ' + (val < 0 ? 'neg' : 'pos') + '">' + brl(val) + '</td>' +
          '<td>' + selClasse('', c, 'onchange="dhExMudar(\'' + id + '\',this.value,null)"') + '</td>' +
          '<td>' + selCat(x.Categoria || '', c, 'onchange="dhExMudar(\'' + id + '\',null,this.value)"') + '</td>' +
          '<td class="r fc-acoes"><button class="fc-edit" title="Dividir (ex.: fatura do cartão com gastos da Mariana)" onclick="dhExDividir(\'' + id + '\')">✂</button>' +
          '<button class="fc-edit" title="Criar regra a partir deste lançamento" onclick="dhExNovaRegra(\'' + id + '\')">★</button>' +
          '<button class="fc-del" title="Excluir" onclick="dhExExcluir(\'' + id + '\')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (lista.length > ESTADO.limite ? '<div style="text-align:center;margin-top:12px"><button class="btn ghost" onclick="dhExMais()">Mostrar mais (' + (lista.length - ESTADO.limite) + ')</button></div>' : '') +
      (lista.length ? '' : '<div class="empty">Nenhum lançamento com esse filtro.</div>') + '</div>';
    v.innerHTML = h;
  }
  var tBusca = null;
  window.dhExBusca = function (q) { ESTADO.busca = q; clearTimeout(tBusca); tBusca = setTimeout(function () { var pos = document.activeElement && document.activeElement.selectionStart; render(); var i = document.querySelector('.ex-busca'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} } }, 250); };
  window.dhExMais = function () { ESTADO.limite += 300; render(); };
  window.dhExImportar = importar;

  /* ---------- edição ---------- */
  function achar(id) { return (DATA.extrato || []).filter(function (x) { return String(x.ID) === String(id); })[0]; }
  function salvar(ids, obj, depois) {
    ids.forEach(function (id) { var x = achar(id); if (x) for (var k in obj) x[k] = obj[k]; });
    render();
    google.script.run.withSuccessHandler(function (res) { if (res && res.success === false) alert('Não consegui salvar: ' + res.error); if (depois) depois(); })
      .withFailureHandler(function (e) { alert('Não consegui salvar: ' + e.message); recarregar(); }).apiExtratoAtualizar(ids, obj);
  }
  window.dhExMudar = function (id, classe, cat) {
    var x = achar(id); if (!x) return; var obj = {};
    if (classe !== null) { obj.Classe = classe; var cs = catsDe(classe); obj.Categoria = cs.length ? (cs.indexOf(x.Categoria) >= 0 ? x.Categoria : (classe === CL.REC ? 'Honorários' : '')) : ''; }
    if (cat !== null) obj.Categoria = cat;
    salvar([id], obj);
  };
  window.dhExSel = function (id, on) { if (on) ESTADO.sel[id] = 1; else delete ESTADO.sel[id]; render(); };
  window.dhExSelTodos = function (on) {
    ESTADO.sel = {};
    if (on) { var p = perAtual(), q = norm(ESTADO.busca); (DATA.extrato || []).forEach(function (x) { if (noPer(x, p) && (!ESTADO.conta || x.Conta === ESTADO.conta) && (!ESTADO.classe || (x.Classe || CL.PEN) === ESTADO.classe) && (!q || norm(x.Descricao).indexOf(q) >= 0 || norm(x.Obs).indexOf(q) >= 0 || norm(x.Categoria).indexOf(q) >= 0)) ESTADO.sel[x.ID] = 1; }); }
    render();
  };
  window.dhExLoteCat = function () { var c = $('exLoteC').value; $('exLoteCatBox').innerHTML = selCat('', c, 'id="exLoteCat"'); };
  window.dhExLote = function () {
    var ids = Object.keys(ESTADO.sel); if (!ids.length) return;
    var c = $('exLoteC').value, cat = $('exLoteCat') ? $('exLoteCat').value : '';
    ESTADO.sel = {}; salvar(ids, { Classe: c, Categoria: cat });
  };
  window.dhExExcluir = function (id) {
    var x = achar(id); if (!x) return;
    if (!confirm('Excluir este lançamento do extrato?\n\n' + fmtD(x.Data) + ' · ' + x.Descricao + ' · ' + brl(x.Valor) + '\n\n(Se importar o mesmo arquivo de novo, ele volta.)')) return;
    DATA.extrato = DATA.extrato.filter(function (y) { return String(y.ID) !== String(id); }); render();
    google.script.run.withSuccessHandler(function () {}).withFailureHandler(function (e) { alert('Não consegui excluir: ' + e.message); recarregar(); }).apiExtratoExcluir([id]);
  };
  window.dhExExcluirSel = function () {
    var ids = Object.keys(ESTADO.sel); if (!ids.length) return;
    if (!confirm('Excluir ' + ids.length + ' lançamento(s) do extrato?')) return;
    var set = {}; ids.forEach(function (i) { set[i] = 1; });
    DATA.extrato = DATA.extrato.filter(function (y) { return !set[String(y.ID)]; }); ESTADO.sel = {}; render();
    google.script.run.withSuccessHandler(function () {}).withFailureHandler(function (e) { alert('Não consegui excluir: ' + e.message); recarregar(); }).apiExtratoExcluir(ids);
  };

  /* ---------- dividir lançamento ---------- */
  window.dhExDividir = function (id) {
    var x = achar(id); if (!x) return; var total = Math.abs(num(x.Valor));
    function linhaParte(i, val, classe, cat) {
      return '<div class="ex-parte" data-i="' + i + '"><input type="number" step="0.01" class="ex-pv-val" value="' + (val || '') + '" oninput="dhExSomaPartes()" placeholder="Valor">' +
        selClasse('', classe, 'class="ex-pv-cl" onchange="dhExParteCat(this)"').replace('class="ex-sel', 'class="ex-pv-cl ex-sel') +
        '<span class="ex-pv-catbox">' + selCat(cat || '', classe, 'class="ex-pv-cat"').replace('class="ex-sel ex-cat"', 'class="ex-sel ex-cat ex-pv-cat"') + '</span>' +
        '<input class="ex-pv-obs" placeholder="Observação (opcional)"></div>';
    }
    var h = '<div class="mhead"><button class="mclose" onclick="closeModal()">✕</button><h2>Dividir lançamento</h2><div class="mtags"><span class="tag b">' + fmtD(x.Data) + ' · ' + brl(x.Valor) + '</span></div></div><div class="mbody">' +
      '<div class="miuda" style="margin-bottom:10px">' + esc(x.Descricao) + '<br>Ex.: fatura do cartão de ' + brl(total) + ' = parte do escritório (Despesa) + gastos pessoais da Mariana (Retirada Mariana). A soma tem que fechar ' + brl(total) + '.</div>' +
      '<div id="exPartes">' + linhaParte(0, total, x.Classe || CL.DESP, x.Categoria) + linhaParte(1, '', CL.RET, '') + '</div>' +
      '<button class="btn ghost fc-mini" onclick="dhExMaisParte()">+ Outra parte</button> <span id="exSoma" class="ex-soma"></span></div>' +
      '<div class="mfoot"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn" onclick="dhExSalvarDiv(\'' + esc(String(id)) + '\')">Salvar divisão</button></div>';
    el('modalCard').innerHTML = h; el('modalBg').classList.add('on');
    window.__exDivTotal = total; window.__exLinhaParte = linhaParte; dhExSomaPartes();
  };
  window.dhExMaisParte = function () { var b = $('exPartes'); var n = b.children.length; b.insertAdjacentHTML('beforeend', window.__exLinhaParte(n, '', CL.DESP, '')); dhExSomaPartes(); };
  window.dhExParteCat = function (s) { var box = s.parentNode.querySelector('.ex-pv-catbox'); box.innerHTML = selCat('', s.value, 'class="ex-pv-cat"').replace('class="ex-sel ex-cat"', 'class="ex-sel ex-cat ex-pv-cat"'); };
  window.dhExSomaPartes = function () {
    var s = 0; [].forEach.call(document.querySelectorAll('#exPartes .ex-pv-val'), function (i) { s += parseFloat(i.value) || 0; });
    var falta = Math.round((window.__exDivTotal - s) * 100) / 100, e = $('exSoma');
    e.textContent = Math.abs(falta) < 0.01 ? '✓ Soma fecha ' + brl(window.__exDivTotal) : (falta > 0 ? 'Faltam ' + brl(falta) : 'Passou ' + brl(-falta));
    e.className = 'ex-soma ' + (Math.abs(falta) < 0.01 ? 'ok' : 'erro');
  };
  window.dhExSalvarDiv = function (id) {
    var x = achar(id); if (!x) return; var sinal = num(x.Valor) < 0 ? -1 : 1, partes = [];
    [].forEach.call(document.querySelectorAll('#exPartes .ex-parte'), function (d) {
      var v = parseFloat(d.querySelector('.ex-pv-val').value) || 0; if (!v) return;
      var cat = d.querySelector('.ex-pv-cat');
      partes.push({ Valor: Math.round(sinal * Math.abs(v) * 100) / 100, Classe: d.querySelector('.ex-pv-cl').value, Categoria: cat ? cat.value : '', Obs: d.querySelector('.ex-pv-obs').value });
    });
    var soma = partes.reduce(function (s, p) { return s + Math.abs(p.Valor); }, 0);
    if (partes.length < 2) { alert('Preencha pelo menos duas partes.'); return; }
    if (Math.abs(soma - window.__exDivTotal) > 0.01) { alert('A soma das partes precisa ser ' + brl(window.__exDivTotal) + '.'); return; }
    closeModal();
    google.script.run.withSuccessHandler(function (res) { if (res && res.success === false) alert('Não consegui dividir: ' + res.error); recarregar(); })
      .withFailureHandler(function (e) { alert('Não consegui dividir: ' + e.message); }).apiExtratoDividir(id, partes);
  };

  /* ---------- regras ---------- */
  window.dhExRegras = function () {
    var rs = regras(), usandoSug = rs.length && rs[0].sugerida;
    var h = '<div class="mhead"><button class="mclose" onclick="closeModal()">✕</button><h2>Regras de classificação</h2></div><div class="mbody">' +
      (usandoSug ? '<div class="ex-pend" style="cursor:default;margin:0 0 12px">Você ainda não salvou regras, então o CRM está usando as <b>regras sugeridas</b> abaixo. Clique em "Salvar as sugeridas" para poder editar ou apagar cada uma.</div>' : '') +
      '<div class="miuda" style="margin-bottom:12px">Na importação, cada lançamento é comparado com as regras, de cima para baixo: a primeira cuja palavra aparece na descrição define a classe. Entradas sem regra viram "Receita"; saídas sem regra ficam "A classificar".</div>' +
      (rs.length ? '<table class="dh-tbl"><thead><tr><th>Se a descrição contém</th><th>Classe</th><th>Categoria</th><th>Conta</th><th></th></tr></thead><tbody>' +
        rs.map(function (r) { return '<tr><td><b>' + esc(r.Contem) + '</b></td><td>' + esc(r.Classe) + '</td><td>' + esc(r.Categoria || '—') + '</td><td>' + esc(r.Conta || 'todas') + '</td><td class="r"><button class="fc-del" onclick="dhExDelRegra(\'' + esc(String(r.ID)) + '\')">✕</button></td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="empty">Nenhuma regra ainda.</div>') +
      '<div class="msec">Nova regra</div><div class="form fc-form"><div><label>Descrição contém</label><input id="exRgTxt" placeholder="ex: MARIANA"></div>' +
      '<div><label>Classe</label>' + selClasse('', CL.RET, 'id="exRgCl" onchange="document.getElementById(\'exRgCatBox\').innerHTML=dhExSelCat(this.value)"') + '</div>' +
      '<div><label>Categoria</label><span id="exRgCatBox">' + selCat('', CL.RET, 'id="exRgCat"') + '</span></div>' +
      '<div><label>Só na conta (opcional)</label><input id="exRgConta" list="exContasDL2"><datalist id="exContasDL2">' + contasConhecidas().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div></div>' +
      '<button class="btn" onclick="dhExAddRegra()">Adicionar regra</button>' +
      (usandoSug ? ' <button class="btn ghost" onclick="dhExSugestoes()">Salvar as sugeridas</button>' : ' <button class="btn ghost" onclick="dhExSugestoes()">Adicionar as sugeridas que faltam</button>') +
      '</div><div class="mfoot"><button class="btn ghost" onclick="closeModal()">Fechar</button></div>';
    el('modalCard').innerHTML = h; el('modalBg').classList.add('on');
  };
  window.dhExSelCat = function (c) { return selCat('', c, 'id="exRgCat"'); };
  // novaNoTopo: a primeira regra da lista passa na frente das existentes (regra mais específica criada pela usuária)
  function addRegras(lista, depois, novaNoTopo) {
    var salvas = (DATA.extratoRegras || []).filter(function (r) { return String(r.Contem || '').trim(); });
    var ords = salvas.map(function (r) { return Number(r.Ordem) || 0; });
    var max = ords.length ? Math.max.apply(null, ords) : 0, min = ords.length ? Math.min.apply(null, ords) : 0;
    var pend = lista.length;
    lista.forEach(function (r, i) {
      var ordem = (novaNoTopo && i === 0 && salvas.length) ? min - 10 : max + (i + 1) * 10;
      var obj = { Contem: r[0], Classe: r[1], Categoria: r[2] || '', Conta: r[3] || '', Ordem: ordem };
      DATA.extratoRegras = (DATA.extratoRegras || []).concat([obj]);
      google.script.run.withSuccessHandler(function (res) { if (res && res.data && res.data.id) obj.ID = res.data.id; if (--pend === 0 && depois) depois(); })
        .withFailureHandler(function (e) { alert('Não consegui salvar a regra: ' + e.message); }).apiAdd('ExtratoRegras', obj);
    });
  }
  window.dhExAddRegra = function () {
    var t = $('exRgTxt').value.trim(); if (!t) { alert('Digite a palavra que aparece na descrição.'); return; }
    var nova = [t, $('exRgCl').value, $('exRgCat') ? $('exRgCat').value : '', $('exRgConta').value.trim()];
    var semNenhuma = !(DATA.extratoRegras || []).some(function (r) { return String(r.Contem || '').trim(); });
    // a regra nova vem primeiro; se ainda não havia regras salvas, as sugeridas são salvas junto (senão deixariam de valer)
    addRegras(semNenhuma ? [nova].concat(SUGESTOES) : [nova], function () { dhExRegras(); }, true);
    dhExRegras();
  };
  window.dhExSugestoes = function () {
    var ja = {}; (DATA.extratoRegras || []).forEach(function (r) { ja[norm(r.Contem)] = 1; });
    var novas = SUGESTOES.filter(function (s) { return !ja[norm(s[0])]; });
    if (!novas.length) return; addRegras(novas, function () { dhExRegras(); }); dhExRegras();
  };
  window.dhExDelRegra = function (id) {
    DATA.extratoRegras = (DATA.extratoRegras || []).filter(function (r) { return String(r.ID) !== String(id); }); dhExRegras();
    google.script.run.withFailureHandler(function (e) { alert('Não consegui excluir: ' + e.message); }).apiDelete('ExtratoRegras', id);
  };
  window.dhExNovaRegra = function (id) {
    var x = achar(id); if (!x) return;
    dhExRegras();
    var palavra = norm(x.Descricao).replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, '').replace(/[0-9]{3,}/g, '').replace(/[·*\-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
    $('exRgTxt').value = palavra; $('exRgCl').value = x.Classe && x.Classe !== CL.PEN ? x.Classe : CL.DESP;
    $('exRgCatBox').innerHTML = selCat(x.Categoria || '', $('exRgCl').value, 'id="exRgCat"');
    $('exRgTxt').focus(); $('exRgTxt').select();
  };
  window.dhExAplicarRegras = function () {
    var p = perAtual(), grupos = {}, n = 0;
    (DATA.extrato || []).forEach(function (x) {
      if ((x.Classe || CL.PEN) !== CL.PEN) return;
      var c = classificar(x.Descricao, num(x.Valor), x.Conta); if (c.Classe === CL.PEN) return;
      var k = c.Classe + '|' + c.Categoria; (grupos[k] = grupos[k] || { obj: { Classe: c.Classe, Categoria: c.Categoria }, ids: [] }).ids.push(x.ID); n++;
    });
    if (!n) { alert('Nenhum lançamento "A classificar" bate com as regras atuais.'); return; }
    if (!confirm(n + ' lançamento(s) "A classificar" serão classificados pelas regras. Continuar?')) return;
    Object.keys(grupos).forEach(function (k) { salvar(grupos[k].ids, grupos[k].obj); });
  };

  /* ---------- modelo para baixar ---------- */
  window.dhExModelo = function () {
    if (typeof XLSX === 'undefined') { alert('A biblioteca de planilhas não carregou. Recarregue a página.'); return; }
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet([
      ['Data', 'Descrição', 'Valor'],
      ['05/01/2026', 'PIX RECEBIDO - CLIENTE EXEMPLO LTDA', 4200],
      ['07/01/2026', 'PIX ENVIADO - MARIANA DOMINGUES', -5000],
      ['10/01/2026', 'PAGTO FATURA CARTAO', -3250.4],
      ['15/01/2026', 'TARIFA PACOTE DE SERVICOS', -89.9]
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 14 }];
    var how = XLSX.utils.aoa_to_sheet([['MODELO DE EXTRATO (use só se o banco não exportar OFX)'], [''],
      ['Colunas: Data (dd/mm/aaaa), Descrição, Valor (negativo para saídas).'],
      ['Também funciona com as colunas Crédito e Débito separadas, ou com uma coluna D/C.'],
      ['O CSV/Excel do próprio Banco do Brasil ou da Caixa pode ser importado direto, sem mudar nada.'],
      ['Linhas de saldo ("Saldo anterior", "Saldo do dia") são ignoradas.'],
      ['No CRM: Extrato bancário > Importar extrato.']]);
    how['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato'); XLSX.utils.book_append_sheet(wb, how, 'COMO USAR');
    XLSX.writeFile(wb, 'Modelo_Extrato_Bancario.xlsx');
  };

  /* ---------- aba no menu ---------- */
  if (typeof TABS !== 'undefined' && !TABS.some(function (t) { return t[0] === 'extrato'; })) {
    var pos = -1; TABS.forEach(function (t, i) { if (t[0] === 'financeiro') pos = i; });
    TABS.splice(pos >= 0 ? pos + 1 : TABS.length, 0, ['extrato', 'Extrato bancário']);
  }
  if (typeof NAV_ICONS !== 'undefined') NAV_ICONS.extrato = '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9.5h17M7 14h4M14.5 14h2.5"/>';
  if (typeof window.go === 'function') { var goAnt = window.go; window.go = function (id, a) { goAnt(id, a); if (id === 'extrato') render(); var t = $('tbTela'); if (id === 'extrato' && t) t.textContent = 'Extrato bancário'; }; }
  if (typeof window.renderDash === 'function') { var rdAnt = window.renderDash; window.renderDash = function () { rdAnt(); var v = $('v-extrato'); if (v && v.classList.contains('on')) render(); }; }
  document.addEventListener('DOMContentLoaded', function () {
    var app = $('app'); if (app && !$('v-extrato')) { var s = document.createElement('section'); s.className = 'view'; s.id = 'v-extrato'; var ref = $('v-financeiro') || $('v-painel'); app.insertBefore(s, ref ? ref.nextSibling : null); }
  });
  /* ---------- detalhe: o que está entrando na conta (abre a partir de Dados financeiros) ---------- */
  var DET = null;
  function noFiltro(x) { var f = window.__dhFiltroPer; return f ? f(ymOf(x.Data)) : true; }
  window.dhExDetalhe = function (tipo, cat) { DET = { tipo: tipo, cat: cat || '', q: '' }; detalhe(); };
  function detalhe() {
    if (!DET) return;
    var t = DET.tipo, doPer = (DATA.extrato || []).filter(noFiltro), r = resumo(doPer);
    function entra(x) {
      var c = x.Classe || CL.PEN;
      if (t === 'ent') return c === CL.REC;
      if (t === 'sai') return c === CL.DESP && (!DET.cat || (x.Categoria || 'Outros') === DET.cat);
      return c === CL.REC || c === CL.DESP;
    }
    var q = norm(DET.q);
    var lista = doPer.filter(entra).filter(function (x) { return !q || norm(x.Descricao + ' ' + x.Categoria + ' ' + x.Conta).indexOf(q) >= 0; })
      .sort(function (a, b) { return Math.abs(num(b.Valor)) - Math.abs(num(a.Valor)); });
    var fora = doPer.filter(function (x) {
      if (x.Classe !== CL.FORA) return false; var v = num(x.Valor);
      if (t === 'ent') return v > 0; if (t === 'sai') return v < 0 && (!DET.cat || (x.Categoria || 'Outros') === DET.cat); return true;
    });
    var titulo = t === 'ent' ? 'Entradas consideradas' : (t === 'sai' ? (DET.cat ? 'Despesas · ' + DET.cat : 'Saídas consideradas') : 'O que entra no lucro real');
    var tot = lista.reduce(function (a, x) { return a + num(x.Valor); }, 0);
    function linha(x, foraDaConta) {
      var id = esc(String(x.ID)), v = num(x.Valor);
      return '<tr' + (foraDaConta ? ' class="ex-det-fora"' : '') + '><td class="ex-dt">' + fmtD(x.Data) + '</td><td class="ex-desc">' + esc(x.Descricao) + '<small>' + esc(x.Categoria || '—') + ' · ' + esc(x.Conta || '') + '</small></td>' +
        '<td class="r ex-v ' + (v < 0 ? 'neg' : 'pos') + '">' + brl(v) + '</td><td class="r">' +
        (foraDaConta ? '<button class="btn ghost fc-mini" onclick="dhExRecolocar(\'' + id + '\')">Recolocar</button>'
                     : '<button class="btn ghost fc-mini ex-tirar" onclick="dhExTirar(\'' + id + '\')">Tirar da conta</button>') + '</td></tr>';
    }
    var h = '<div class="mhead"><button class="mclose" onclick="dhExFecharDet()">✕</button><h2>' + esc(titulo) + '</h2><div class="mtags"><span class="tag b">' + lista.length + ' lançamento(s)</span>' + (t === 'luc' ? '' : '<span class="tag">' + brl(tot) + '</span>') + '</div></div><div class="mbody">' +
      (t !== 'ent' ? '<div class="ex-box" style="margin:0 0 12px">' +
        (t === 'luc' ? '<div class="ex-box-l"><span>Entradas</span><b>' + brl(r.rec) + '</b></div><div class="ex-box-l"><span>(−) Despesas</span><b>' + brl(-r.desp) + '</b></div>' : '') +
        (t === 'luc' || (t === 'sai' && !DET.cat) ? '<div class="ex-box-l"><span>(−) Salário da Mariana · ' + brl(r.salario) + ' × ' + r.meses + ' mês(es) · <a href="#" onclick="event.preventDefault();dhExSalario()">alterar</a></span><b>' + brl(-r.pro) + '</b></div>' : '') +
        (t === 'luc' ? '<div class="ex-box-l tot"><span>= Lucro real</span><b>' + brl(r.lucro) + '</b></div>' : '') + '</div>' : '') +
      '<div class="miuda" style="margin-bottom:8px">"Tirar da conta" não apaga o lançamento: ele vai para "Fora da conta" e pode ser recolocado quando quiser. Para mudar a classe (ex.: virar Retirada Mariana), use a aba Extrato bancário.</div>' +
      '<input type="search" class="ex-busca" style="width:100%;margin-bottom:8px" placeholder="Buscar..." value="' + esc(DET.q) + '" oninput="dhExDetBusca(this.value)">' +
      '<div class="scroll ex-det"><table class="dh-tbl ex-tbl"><tbody>' + lista.map(function (x) { return linha(x, false); }).join('') + '</tbody></table>' +
      (lista.length ? '' : '<div class="empty">Nada aqui.</div>') + '</div>' +
      (fora.length ? '<div class="msec">Fora da conta (' + fora.length + ')</div><div class="scroll"><table class="dh-tbl ex-tbl"><tbody>' + fora.map(function (x) { return linha(x, true); }).join('') + '</tbody></table></div>' : '') +
      '</div><div class="mfoot"><button class="btn ghost" onclick="dhExFecharDet();goTo(\'extrato\')">Abrir Extrato bancário</button><button class="btn" onclick="dhExFecharDet()">Fechar</button></div>';
    el('modalCard').innerHTML = h; el('modalBg').classList.add('on');
  }
  var tDet = null;
  window.dhExDetBusca = function (v) { DET.q = v; clearTimeout(tDet); tDet = setTimeout(function () { detalhe(); var i = document.querySelector('.mbody .ex-busca'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 250); };
  function atualizarTelas() { detalhe(); if (typeof window.renderDash === 'function') window.renderDash(); }
  window.dhExTirar = function (id) { salvar([id], { Classe: CL.FORA }); atualizarTelas(); };
  window.dhExRecolocar = function (id) { var x = achar(id); if (!x) return; salvar([id], { Classe: num(x.Valor) > 0 ? CL.REC : CL.DESP }); atualizarTelas(); };
  window.dhExFecharDet = function () { DET = null; closeModal(); };

  window.dhExRender = render;
})();
