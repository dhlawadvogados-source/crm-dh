/*************************************************************
 * PAINEL DH — indicadores do escritório (versão web)
 * Usa só os dados que o CRM já carrega da planilha (DATA).
 * Carregado depois do script principal do index.html.
 *************************************************************/
(function () {
  'use strict';
  var MES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var MES_L = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  // Nome usado na saudação para cada e-mail (os outros usam o começo do e-mail)
  var NOMES = { 'daphynii.work@gmail.com': 'Daphyni', 'mariana@advogadosdh.com.br': 'Mariana', 'adm@advogadosdh.com.br': 'equipe DH' };

  /* ---------- menu: inclui Relatórios e mostra o nome da tela no topo ---------- */
  if (typeof TABS !== 'undefined' && !TABS.some(function (t) { return t[0] === 'financeiro'; })) TABS.splice(1, 0, ['financeiro', 'Dados financeiros']);
  if (typeof TABS !== 'undefined' && !TABS.some(function (t) { return t[0] === 'relatorio'; })) TABS.push(['relatorio', 'Relatórios']);
  if (typeof NAV_ICONS !== 'undefined') NAV_ICONS.financeiro = '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>';
  var NOMES_TELA = { painel: 'Painel', financeiro: 'Dados financeiros', listaclientes: 'Clientes', receber: 'Contas a receber', pagar: 'Contas a pagar', comissoes: 'Comissões', salarios: 'Salários', ferias: 'Férias e aniversários', rent: 'Rentabilidade', propostas: 'Propostas', clientes: 'Contratos', relatorio: 'Relatórios', config: 'Configurações', tarefas: 'Tarefas', inadimplentes: 'Inadimplentes' };
  if (typeof go === 'function') {
    var goOrig = go;
    window.go = function (id, a) { goOrig(id, a); setTela(id); window.scrollTo(0, 0); };
  }
  function setTela(id) { var t = document.getElementById('tbTela'); if (t) t.textContent = NOMES_TELA[id] || ''; }

  /* ---------- utilidades ---------- */
  function $(id) { return document.getElementById(id); }
  function hoje() { var t = TODAY || new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function ymOf(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function ymAdd(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; var d = new Date(y, m, 1); return ymOf(d); }
  function mesDe(v) { var d = parseD(v); return d ? ymOf(d) : String(v || '').slice(0, 7); }
  function sim(v) { return String(v || '').trim().toLowerCase() === 'sim'; }
  function brl0(n) { return brl(n); }
  function num(n) { return (Math.round(n * 10) / 10).toLocaleString('pt-BR'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var IC = {
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    bag: '<path d="M9 4h6l-1.5 3h-3z"/><path d="M7.5 9.5C5 12 4 15 4.5 17.5 5 20 7 21 12 21s7-1 7.5-3.5C20 15 19 12 16.5 9.5z"/><path d="M12 11v6M10.3 12.6c0-.9.8-1.4 1.7-1.4s1.7.5 1.7 1.3c0 1.8-3.4 1.2-3.4 3 0 .8.8 1.4 1.7 1.4s1.7-.5 1.7-1.4"/>',
    bars: '<path d="M5 20V12M10 20V7M15 20v-5M20 20V4"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.6-6 7.5-6s7.5 2 7.5 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    out: '<path d="M12 21V10"/><path d="m7.5 14 4.5-4.5 4.5 4.5"/><path d="M4.5 3h15"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  function ic(n, s) { return '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; }
  function lbl(t) { return '<div class="dh-lbl">' + t + '</div>'; }
  function bar(parts) { // [[valor, classe], ...] em %
    return '<div class="dh-bar">' + parts.map(function (p) { return '<span class="' + p[1] + '" style="width:' + Math.max(0, Math.min(100, p[0])).toFixed(1) + '%"></span>'; }).join('') + '</div>';
  }

  /* ---------- período escolhido em Dados financeiros ---------- */
  var MES_L2 = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var PER = null;
  function perPadrao() { return { tipo: 'mes', ym: ymOf(hoje()) }; }
  function perAtual() {
    if (PER) return PER;
    try { var s0 = JSON.parse(localStorage.getItem('crm_fin_periodo') || 'null'); if (s0 && (s0.ym || s0.ano)) PER = s0; } catch (e) {}
    return PER || (PER = perPadrao());
  }
  function perMeses(per) {
    per = per || perAtual();
    if (per.tipo === 'ano') { var o = []; for (var i = 1; i <= 12; i++) o.push(per.ano + '-' + ('0' + i).slice(-2)); return o; }
    return [per.ym];
  }
  function noPer(m, per) { per = per || perAtual(); return per.tipo === 'ano' ? String(m).slice(0, 4) === String(per.ano) : m === per.ym; }
  function fimPer(per) { var ms = perMeses(per); var u = ms[ms.length - 1]; return new Date(+u.slice(0, 4), +u.slice(5, 7), 0); }
  function perNome(per) { per = per || perAtual(); return per.tipo === 'ano' ? 'ano de ' + per.ano : MES_L2[+per.ym.slice(5, 7) - 1] + '/' + per.ym.slice(0, 4); }
  function perCurto(per) { per = per || perAtual(); return per.tipo === 'ano' ? 'em ' + per.ano : 'em ' + MES_L2[+per.ym.slice(5, 7) - 1]; }
  window.dhSetPeriodo = function (v) {
    PER = /^\d{4}$/.test(v) ? { tipo: 'ano', ano: v } : { tipo: 'mes', ym: v };
    try { localStorage.setItem('crm_fin_periodo', JSON.stringify(PER)); } catch (e) {}
    try { renderExtra(); marcarBlocos(); aplicarVisibilidade(); } catch (e) { console.error(e); }
  };
  function opcoesPeriodo() {
    var atual = ymOf(hoje()), min = atual, max = atual;
    function ver(v) { var m = mesDe(v); if (/^\d{4}-\d{2}$/.test(m)) { if (m < min) min = m; if (m > max) max = m; } }
    (DATA.receber || []).forEach(function (x) { ver(x.Vencimento); });
    (DATA.pagar || []).forEach(function (x) { ver(x.Data); });
    if (max > ymAdd(atual, 12)) max = ymAdd(atual, 12);
    if (min < ymAdd(atual, -36)) min = ymAdd(atual, -36);
    var meses = [], anos = {};
    for (var m = max; m >= min; m = ymAdd(m, -1)) { meses.push(m); anos[m.slice(0, 4)] = 1; }
    var per = perAtual(), selV = per.tipo === 'ano' ? per.ano : per.ym;
    return '<optgroup label="Mês">' + meses.map(function (m) {
      return '<option value="' + m + '"' + (m === selV ? ' selected' : '') + '>' + MES_L2[+m.slice(5, 7) - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + m.slice(0, 4) + (m === atual ? ' (atual)' : '') + '</option>';
    }).join('') + '</optgroup><optgroup label="Ano inteiro">' + Object.keys(anos).sort().reverse().map(function (y) {
      return '<option value="' + y + '"' + (y === selV ? ' selected' : '') + '>Ano de ' + y + '</option>';
    }).join('') + '</optgroup>';
  }

  /* ---------- cálculos (sempre no período escolhido) ---------- */
  function calcFinanceiro() {
    var t = hoje(), fim = fimPer();
    var venc = 0, aVencer = 0, cliVenc = {}, prev = 0, rec = 0;
    (DATA.receber || []).forEach(function (x) {
      var v = moneyN(x.Valor), d = parseD(x.Vencimento); if (!d) return;
      var dentro = noPer(mesDe(x.Vencimento));
      if (dentro) { prev += v; if (sim(x.Recebido)) rec += v; }
      if (sim(x.Recebido)) return;
      if (d < t && d <= fim) { venc += v; cliVenc[String(x.Cliente).trim().toLowerCase()] = 1; }   // atraso acumulado até o fim do período
      else if (d >= t && dentro) aVencer += v;
    });
    return { venc: venc, aVencer: aVencer, clientes: Object.keys(cliVenc).length, prev: prev, rec: rec };
  }
  function calcComissoes() {
    var ms = perMeses(), lim = ms[ms.length - 1], tot = 0, pessoas = {};
    (DATA.parcelas || []).forEach(function (p) {
      if (/pago/i.test(p.Status || '') || String(p.DataPaga || '').trim()) return;
      var m = mesDe(p.Mes); if (m && m > lim) return;
      tot += moneyN(p.ValorParcela); if (p.Advogado) pessoas[p.Advogado] = 1;
    });
    return { tot: tot, pessoas: Object.keys(pessoas).length };
  }
  function calcPropostas() {
    var a = 0, ac = 0, ng = 0, vAc = 0;
    (DATA.propostas || []).forEach(function (p) {
      var s = String(p.Status || '').toLowerCase();
      if (/an[aá]lise/.test(s)) { a++; return; }
      if (!noPer(mesDe(p.DataEnvio))) return;
      if (/aceita/.test(s)) { ac++; vAc += moneyN(p.Valor); } else if (/negada/.test(s)) ng++;
    });
    return { analise: a, aceitas: ac, negadas: ng, valorAceito: vAc, conv: (ac + ng) ? ac / (ac + ng) * 100 : 0 };
  }
  function temHoras(m) {
    return (DATA.rentabilidade || []).some(function (x) { return mesDe(x.Mes) === m && ((Number(x.HorasConsultivo) || 0) + (Number(x.HorasProcessual) || 0)) > 0; });
  }
  // Meses de horas usados: os do período; se o mês escolhido ainda não tem horas, usa o último mês anterior que tenha.
  function mesesHoras() {
    var per = perAtual();
    if (per.tipo === 'ano') return { meses: perMeses().filter(temHoras), nome: 'ano de ' + per.ano, aviso: '' };
    if (temHoras(per.ym)) return { meses: [per.ym], nome: perNome(), aviso: '' };
    var best = '';
    (DATA.rentabilidade || []).forEach(function (x) {
      var m = mesDe(x.Mes), h = (Number(x.HorasConsultivo) || 0) + (Number(x.HorasProcessual) || 0);
      if (h > 0 && m && m < per.ym && m > best) best = m;
    });
    return best ? { meses: [best], nome: perNome({ tipo: 'mes', ym: best }), aviso: 'sem horas em ' + perNome() + '; mostrando ' + perNome({ tipo: 'mes', ym: best }) } : { meses: [], nome: perNome(), aviso: '' };
  }
  function calcHorasRent(meses) {
    var out = { total: 0, dentro: 0, extra: 0, top: [], margem: 0, rentaveis: 0, n: 0 };
    if (!meses.length || typeof rentClienteStats !== 'function') return out;
    var saveH = (typeof RT_HTIPO !== 'undefined') ? RT_HTIPO : null;
    try { if (saveH !== null) RT_HTIPO = 'ambas'; } catch (e) {}
    var faixa = Number(CFG && CFG.FaixaRentavel) || 30;
    var contr = {}, mens = {};
    (DATA.clientes || []).forEach(function (c) {
      var k = rentCanon(c.Nome), tipo = String(c.Tipo || '').toLowerCase();
      var ativo = !/encerr|inativ/i.test(c.Status || ''), mensal = tipo.indexOf('pontual') < 0;
      // cliente com mais de um contrato (ex.: assessoria + DET): soma os mensais ativos
      if (!mens[k]) { mens[k] = { tipo: tipo, valor: 0 }; contr[k] = 0; }
      if (ativo && mensal) {
        if (mens[k].tipo.indexOf('pontual') >= 0) { mens[k] = { tipo: tipo, valor: 0 }; contr[k] = 0; }
        mens[k].valor += moneyN(c.ValorMensalidade); contr[k] += Number(c.HorasContratadas) || 0;
      }
    });
    var lista = [];
    rentUniverse().forEach(function (cli) {
      var info = mens[cli] || { tipo: '', valor: 0 };
      if (info.tipo.indexOf('pontual') >= 0) return;          // só contratos mensais
      var c = contr[cli] || 0, ag = { cli: cli, horas: 0, pago: 0, custo: 0, valor: info.valor };
      meses.forEach(function (m) {
        var st = rentClienteStats(cli, m); if (!(st.horas > 0) && !(st.pago > 0)) return;
        ag.horas += st.horas; ag.pago += st.pago; ag.custo += st.custo;
        if (c > 0) { out.dentro += Math.min(st.horas, c); out.extra += Math.max(0, st.horas - c); } else out.dentro += st.horas;
      });
      if (!(ag.horas > 0)) return;
      out.total += ag.horas;
      ag.margem = ag.pago > 0 ? (ag.pago - ag.custo) / ag.pago * 100 : (ag.custo > 0 ? -100 : 0);
      lista.push(ag);
    });
    try { if (saveH !== null) RT_HTIPO = saveH; } catch (e) {}
    var comPago = lista.filter(function (x) { return x.pago > 0; });
    out.n = comPago.length;
    out.margem = comPago.length ? comPago.reduce(function (s, x) { return s + x.margem; }, 0) / comPago.length : 0;
    out.rentaveis = comPago.filter(function (x) { return x.margem >= faixa; }).length;
    out.top = lista.sort(function (a, b) { return b.horas - a.horas; }).slice(0, 5);
    return out;
  }
  /* Saídas: só as categorias marcadas como "despesa real" entram no resultado.
     Retirada de lucro, investimento etc. aparecem à parte. Escolha em Configurações. */
  var NAO_DESPESA_PADRAO = /retirada|distribui|lucro|investimento|aporte|pr[oó]-?labore s[oó]cio/i;
  function catNome(c) { c = String(c || '').trim(); return c || 'Sem categoria'; }
  function categoriasSaida() {
    var set = {};
    ['Salário', 'Reembolso', 'Comissão', 'VT', 'Benefícios', 'Estrutura', 'Tributos', 'Serviços', 'Marketing', 'Outros', 'Retirada de lucro', 'Investimento']
      .forEach(function (c) { set[c] = 1; });
    (DATA.pagar || []).forEach(function (x) { set[catNome(x.Categoria)] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }
  function naoDespesaSet() {
    var raw = CFG && CFG.SaidasForaDespesa, s = {};
    if (raw == null || raw === '') {
      if (raw === '') return s; // salvo vazio = todas contam como despesa
      categoriasSaida().forEach(function (c) { if (NAO_DESPESA_PADRAO.test(c)) s[c.toLowerCase()] = 1; });
      return s;
    }
    String(raw).split('|').forEach(function (c) { c = c.trim().toLowerCase(); if (c) s[c] = 1; });
    return s;
  }
  function ehDespesa(x) { return !naoDespesaSet()[catNome(x.Categoria).toLowerCase()]; }
  function calcSaidas() {
    var nd = naoDespesaSet(), o = { prev: 0, pago: 0, fora: 0, foraPago: 0, porCat: {}, foraCat: {} };
    (DATA.pagar || []).forEach(function (x) {
      if (!noPer(mesDe(x.Data))) return;
      var v = moneyN(x.Valor), c = catNome(x.Categoria), pg = sim(x.Pago);
      if (nd[c.toLowerCase()]) { o.fora += v; if (pg) o.foraPago += v; o.foraCat[c] = (o.foraCat[c] || 0) + v; return; }
      o.prev += v; if (pg) o.pago += v; o.porCat[c] = (o.porCat[c] || 0) + v;
    });
    return o;
  }
  function calcEvolucao() {
    var per = perAtual(), meses = [];
    if (per.tipo === 'ano') meses = perMeses(per);
    else for (var i = -6; i <= 0; i++) meses.push(ymAdd(per.ym, i));
    var r = {}, a = {};
    meses.forEach(function (m) { r[m] = 0; a[m] = 0; });
    (DATA.receber || []).forEach(function (x) {
      var m = mesDe(x.Vencimento); if (!(m in r)) return;
      if (sim(x.Recebido)) r[m] += moneyN(x.Valor); else a[m] += moneyN(x.Valor);
    });
    var d = {}; meses.forEach(function (m) { d[m] = 0; });
    var comExt = {};
    (DATA.extrato || []).forEach(function (x) { var m = mesDe(x.Data); if (m in d) { comExt[m] = 1; if (x.Classe === 'Despesa') d[m] += -moneyN(x.Valor); } });
    (DATA.pagar || []).forEach(function (x) { var m = mesDe(x.Data); if (m in d && !comExt[m] && ehDespesa(x)) d[m] += moneyN(x.Valor); });
    return meses.map(function (m) { return { m: m, rec: r[m], arec: a[m], desp: d[m] }; });
  }

  /* ---------- gráfico de barras (SVG) ---------- */
  function niceMax(v) { if (v <= 0) return 1000; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; var s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10; return s * p; }
  function kfmt(v) { return v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil' : 'R$ ' + v; }
  function chart(ev) {
    var W = 560, H = 210, L = 64, B = 26, T = 8, R = 6;
    var SER = [['rec', 'b1', 'recebido'], ['arec', 'b2', 'a receber'], ['desp', 'b3', 'despesas']];
    var max = niceMax(Math.max.apply(null, ev.map(function (x) { return Math.max(x.rec, x.arec, x.desp || 0); })));
    var ih = H - B - T, iw = W - L - R, gw = iw / ev.length, bw = Math.min(14, gw / 4.4);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dh-chart" role="img" aria-label="Recebido, a receber e despesas por mês">';
    for (var g = 0; g <= 4; g++) {
      var y = T + ih - ih * g / 4;
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" class="gl"/>';
      s += '<text x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end" class="ax">' + kfmt(max * g / 4) + '</text>';
    }
    ev.forEach(function (x, i) {
      var cx = L + gw * i + gw / 2;
      SER.forEach(function (se, k) {
        var v = x[se[0]] || 0, h = ih * v / max, bx = cx + (k - 1.5) * (bw + 3);
        s += '<rect x="' + bx + '" y="' + (T + ih - h) + '" width="' + bw + '" height="' + h + '" class="' + se[1] + '"><title>' + MES_C[+x.m.slice(5) - 1] + ' · ' + se[2] + ' ' + brl(v) + '</title></rect>';
      });
      s += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' + MES_C[+x.m.slice(5) - 1] + '</text>';
    });
    return s + '</svg>';
  }

  /* ---------- Nota Graciola (cartão no novo estilo) ---------- */
  window.renderNotaGraciola = function () {
    var box = $('notaGraciola'); if (!box) return;
    var t = hoje(), alvo = ngAlvo_(t.getFullYear(), t.getMonth()), ym = ymOf_(alvo);
    var feito = ngFeitos_().indexOf(ym) >= 0, diff = Math.round((alvo - t) / 86400000);
    var chip, txt, cls = '';
    if (feito) { var nx = ngAlvo_(t.getFullYear(), t.getMonth() + 1); chip = 'Gerada'; cls = 'ok'; txt = 'Gerada este mês · próxima em ' + fmtDataBR_(nx); }
    else if (diff < 0) { chip = 'Atrasada'; cls = 'late'; txt = 'Era para ' + fmtDataBR_(alvo) + ' · gere o quanto antes'; }
    else if (diff === 0) { chip = 'É hoje'; cls = 'late'; txt = 'Gerar hoje, ' + fmtDataBR_(alvo); }
    else { chip = 'Pendente'; cls = diff <= 3 ? 'soon' : ''; txt = 'Próxima geração em ' + fmtDataBR_(alvo) + '  ·  faltam ' + diff + ' dia' + (diff > 1 ? 's' : ''); }
    var btn = feito
      ? '<button class="btn ghost" onclick="marcarNotaGraciola(\'' + ym + '\',false)">Desfazer</button>'
      : '<button class="btn" onclick="marcarNotaGraciola(\'' + ym + '\',true)">Marcar como gerada ' + ic('chev', 16) + '</button>';
    box.innerHTML = '<div class="card dh-ng ' + cls + '"><div class="dh-ng-txt">' + lbl('Obrigação fixa mensal') +
      '<div class="dh-ng-tit">Gerar nota – Graciola</div><div class="dh-sub">' + txt + '</div></div>' +
      '<span class="dh-chip ' + cls + '">' + ic('clock', 16) + chip + '</span><span class="dh-vsep"></span>' + btn + '</div>';
  };

  /* ---------- painel ---------- */
  function ensureIn(id, afterId, cls) {
    var e = $(id); if (e) return e;
    e = document.createElement('div'); e.id = id; if (cls) e.className = cls;
    var ref = $(afterId); ref.parentNode.insertBefore(e, ref.nextSibling); return e;
  }
  function ensure(id, afterId, cls) {
    var e = $(id); if (e) return e;
    e = document.createElement('div'); e.id = id; if (cls) e.className = cls;
    var ref = $(afterId); ref.parentNode.insertBefore(e, ref.nextSibling); return e;
  }
  function saudacao() {
    var h = new Date().getHours(); var s = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
    var em = String((DATA && DATA.email) || '').toLowerCase();
    var nome = NOMES[em] || (em ? em.split('@')[0].split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); }) : '');
    return s + (nome ? ', ' + nome : '') + '.';
  }
  function renderExtra() {
    if (!DATA) return;
    var t = hoje();
    // topo: mês e iniciais
    var tm = $('tbMes'); if (tm) tm.textContent = MES_L[t.getMonth()] + ' · ' + t.getFullYear();
    var ini = $('tbIni'); if (ini) { var nm = saudacao().replace(/^[^,]*,\s*/, '').replace(/\.$/, ''); ini.textContent = nm && nm.indexOf(' ') < 0 ? nm.charAt(0).toUpperCase() : 'DH'; ini.title = (DATA.email || ''); }

    var hello = $('dhHello');
    if (!hello) { hello = document.createElement('div'); hello.id = 'dhHello'; var vp = $('v-painel'); vp.insertBefore(hello, vp.firstChild); }
    hello.innerHTML = lbl('Painel') + '<h1 class="dh-hello">' + esc(saudacao()) + '</h1><div class="dh-sub dh-hello-sub">Aqui está a visão geral do escritório neste mês.</div>';

    // KPIs no estilo novo (ícone em círculo, número e legenda lado a lado)
    function kpiCard(label, v, sub, onclick) {
      return '<div class="kpi dh-kpi" onclick="' + onclick + '"><span class="dh-ico">' + ic('doc') + '</span><div class="dh-kpi-b">' + lbl(label) +
        '<div class="dh-kpi-v"><b>' + v + '</b><span>' + sub + '</span></div></div><span class="dh-chev">' + ic('chev', 18) + '</span></div>';
    }
    if (DASH) $('dashKpis').innerHTML =
      kpiCard('Contratos mensais', DASH.clientesMensais || 0, 'ativos', "goContratos('mensal')") +
      kpiCard('Contratos pontuais', DASH.clientesPontuais || 0, 'ativos', "goContratos('pontual')") +
      kpiCard('Contratos DET', DASH.clientesDET || 0, 'ativos', "goContratos('det')") +
      kpiCard('Propostas em análise', DASH.propAnalise || 0, 'em análise', "goTo('propostas')");

    var vf = $('v-financeiro');
    if (vf && !$('finRow3')) {
      vf.innerHTML = '<div id="finHead" class="fin-head"><div>' + lbl('Dados financeiros') + '<h1 class="dh-hello">Visão financeira do escritório</h1><div class="dh-sub dh-hello-sub" id="finSub"></div></div>' +
        '<label class="fin-per"><span>Período</span><select id="finPer" onchange="dhSetPeriodo(this.value)"></select></label></div>' +
        '<div id="finRow3" class="dh-grid g3"></div><div id="dhRow4" class="dh-grid g3"></div><div id="dhRow5" class="dh-grid g2"></div>';
    }
    if ($('dashBtns')) $('dashBtns').style.display = 'none';
    if ($('finPer')) $('finPer').innerHTML = opcoesPeriodo();
    if ($('finSub')) $('finSub').innerHTML = 'Mostrando <b>' + perNome() + '</b> · recebimentos, cobranças, saídas, comissões, horas e rentabilidade.';
    var f = calcFinanceiro(), cm = calcComissoes(), pr = calcPropostas();
    var pct = f.prev > 0 ? f.rec / f.prev * 100 : 0;
    $('finRow3').innerHTML =
      '<div class="card dh-card dh-alert" onclick="goToReceberInad()">' + lbl('Financeiro — requer atenção') +
        '<div class="dh-row"><span class="dh-ico warn">' + ic('bag', 24) + '</span><div>' + lbl('Clientes com pagamento atrasado' + (perAtual().tipo === 'mes' && perAtual().ym === ymOf(hoje()) ? '' : ' até ' + perNome())) +
        '<div class="dh-big"><b>' + f.clientes + '</b> cliente' + (f.clientes === 1 ? '' : 's') + '</div>' +
        '<div class="dh-money warn">' + brl0(f.venc) + ' <small>em atraso</small></div></div></div>' +
        '<div class="dh-split"><div><span>Vencidos</span><b>' + brl0(f.venc) + '</b></div><div><span>A vencer ' + (perAtual().tipo === 'ano' ? 'no ano' : 'no mês') + '</span><b>' + brl0(f.aVencer) + '</b></div>' +
        '<button class="btn soft" onclick="event.stopPropagation();goToReceberInad()">Ver cobranças ' + ic('arrow', 15) + '</button></div></div>' +
      '<div class="card dh-card" onclick="goTo(\'receber\')">' + lbl('Recebimentos · ' + perNome()) +
        '<div class="dh-row"><span class="dh-ico">' + ic('bars', 24) + '</span><div><div class="dh-money">' + brl0(f.rec) + '</div><div class="dh-sub">recebido no período</div></div></div>' +
        bar([[pct, 'b1']]) + '<div class="dh-legend"><span>Previsto: ' + brl0(f.prev) + '</span><b>' + Math.round(pct) + '%</b></div></div>' +
      '<div class="card dh-card" onclick="goTo(\'comissoes\')">' + lbl('Comissões pendentes') +
        '<div class="dh-row"><span class="dh-ico">' + ic('user', 24) + '</span><div><div class="dh-money">' + brl0(cm.tot) + '</div><div class="dh-sub">parcelas não pagas até ' + perNome() + '</div></div></div>' +
        '<div class="dh-foot"><span><b>' + cm.pessoas + '</b> pessoa' + (cm.pessoas === 1 ? '' : 's') + '</span>' + ic('chev', 18) + '</div></div>';

    var sd = calcSaidas(), pS = sd.prev > 0 ? sd.pago / sd.prev * 100 : 0;
    var resultado = f.rec - sd.pago, resPrev = f.prev - sd.prev;
    var cats = Object.keys(sd.porCat).sort(function (a, b) { return sd.porCat[b] - sd.porCat[a]; });
    var maxCat = cats.length ? sd.porCat[cats[0]] : 1;
    var foraTxt = Object.keys(sd.foraCat).map(function (c) { return esc(c) + ' ' + brl0(sd.foraCat[c]); }).join(' · ');
    var rS = ensureIn('finRowS', 'finRow3', 'dh-grid g3');
    // com extrato bancário importado no período, as saídas e o resultado vêm do que de fato saiu do banco
    var ex = typeof window.dhExtratoResumo === 'function' ? window.dhExtratoResumo(function (ym) { return noPer(ym); }) : null;
    if (ex) {
      var exCats = Object.keys(ex.catD).sort(function (a, b) { return ex.catD[b] - ex.catD[a]; }), exMax = exCats.length ? ex.catD[exCats[0]] : 1;
      rS.innerHTML =
        '<div class="card dh-card" onclick="goTo(\'extrato\')">' + lbl('Saídas · despesas · ' + perNome()) +
          '<div class="dh-row"><span class="dh-ico out">' + ic('out', 24) + '</span><div><div class="dh-money">' + brl0(ex.desp) + '</div><div class="dh-sub">despesas pagas (extrato bancário)</div></div></div>' +
          '<div class="dh-split"><div><span>Pró-labore Mariana</span><b>' + brl0(ex.pro) + '</b></div><div><span>Retiradas Mariana</span><b>' + brl0(ex.ret) + '</b></div></div>' +
          (ex.penN ? '<div class="dh-sub dh-aviso">⚠ ' + ex.penN + ' lançamento(s) do extrato a classificar</div>' : '') + '</div>' +
        '<div class="card dh-card" onclick="goTo(\'extrato\')">' + lbl('Lucro real · ' + perNome()) +
          '<div class="dh-row"><span class="dh-ico ' + (ex.lucro < 0 ? 'warn' : 'ok') + '">' + ic('bars', 24) + '</span><div><div class="dh-money ' + (ex.lucro < 0 ? 'warn' : 'pos') + '">' + brl0(ex.lucro) + '</div><div class="dh-sub">receitas − despesas − pró-labore</div></div></div>' +
          '<div class="dh-split"><div><span>Receitas no extrato</span><b>' + brl0(ex.rec) + '</b></div><div><span>Ficou na empresa</span><b>' + brl0(ex.ficou) + '</b></div></div></div>' +
        '<div class="card dh-card" onclick="goTo(\'extrato\')">' + lbl('Despesas por categoria · ' + perNome()) +
          (exCats.length ? '<div class="dh-cats">' + exCats.slice(0, 6).map(function (c) {
            return '<div class="dh-cat"><span>' + esc(c) + '</span><div class="dh-bar"><span class="b3" style="width:' + (ex.catD[c] / exMax * 100).toFixed(1) + '%"></span></div><b>' + brl0(ex.catD[c]) + '</b></div>';
          }).join('') + '</div>' + (exCats.length > 6 ? '<div class="dh-sub dh-fora">+ ' + (exCats.length - 6) + ' categorias · ver tudo no Extrato bancário</div>' : '') : '<div class="empty">Sem despesas no extrato.</div>') + '</div>';
    } else
    rS.innerHTML =
      '<div class="card dh-card" onclick="goTo(\'pagar\')">' + lbl('Saídas · despesas · ' + perNome()) +
        '<div class="dh-row"><span class="dh-ico out">' + ic('out', 24) + '</span><div><div class="dh-money">' + brl0(sd.prev) + '</div><div class="dh-sub">previsto em despesas no período</div></div></div>' +
        bar([[pS, 'b3']]) + '<div class="dh-legend"><span>Pago até agora: ' + brl0(sd.pago) + '</span><b>' + Math.round(pS) + '%</b></div></div>' +
      '<div class="card dh-card">' + lbl('Resultado · ' + perNome()) +
        '<div class="dh-row"><span class="dh-ico ' + (resultado < 0 ? 'warn' : 'ok') + '">' + ic('bars', 24) + '</span><div><div class="dh-money ' + (resultado < 0 ? 'warn' : 'pos') + '">' + brl0(resultado) + '</div><div class="dh-sub">recebido − despesas pagas</div></div></div>' +
        '<div class="dh-split"><div><span>Previsto no período</span><b>' + brl0(resPrev) + '</b></div><div><span>Fora das despesas</span><b>' + brl0(sd.fora) + '</b></div></div></div>' +
      '<div class="card dh-card" onclick="goTo(\'pagar\')">' + lbl('Despesas por categoria · ' + perNome()) +
        (cats.length ? '<div class="dh-cats">' + cats.slice(0, 6).map(function (c) {
          return '<div class="dh-cat"><span>' + esc(c) + '</span><div class="dh-bar"><span class="b3" style="width:' + (sd.porCat[c] / maxCat * 100).toFixed(1) + '%"></span></div><b>' + brl0(sd.porCat[c]) + '</b></div>';
        }).join('') + '</div>' : '<div class="empty">Sem contas a pagar no período.</div>') +
        (foraTxt ? '<div class="dh-sub dh-fora">Não contam como despesa: ' + foraTxt + '</div>' : '') + '</div>';

    var mh = mesesHoras(), hr = calcHorasRent(mh.meses);
    var mhNome = mh.nome + (mh.aviso ? ' *' : '');
    var pD = hr.total ? hr.dentro / hr.total * 100 : 0, pE = hr.total ? hr.extra / hr.total * 100 : 0;
    var pR = hr.n ? hr.rentaveis / hr.n * 100 : 0;
    var r4 = $('dhRow4');
    r4.innerHTML =
      '<div class="card dh-card" onclick="goTo(\'propostas\')"><div class="dh-row top"><span class="dh-ico">' + ic('doc', 24) + '</span><div style="flex:1">' + lbl('Propostas') +
        '<div class="dh-list"><div><b>' + pr.analise + '</b> em análise</div><div><b>' + pr.aceitas + '</b> aceitas ' + perCurto() + '</div><div><b>' + pr.negadas + '</b> negadas ' + perCurto() + '</div></div>' +
        '<div class="dh-sub">Conversão ' + perCurto() + ': <b>' + Math.round(pr.conv) + '%</b> · ' + brl0(pr.valorAceito) + ' fechados</div></div>' + '<span class="dh-chev">' + ic('chev', 18) + '</span></div></div>' +
      '<div class="card dh-card" onclick="goTo(\'rent\')"><div class="dh-row top"><span class="dh-ico">' + ic('clock', 24) + '</span><div style="flex:1">' + lbl('Horas dos mensalistas' + (mhNome ? ' · ' + mhNome : '')) +
        '<div class="dh-big"><b>' + num(hr.total) + ' h</b> utilizadas</div>' + (mh.aviso ? '<div class="dh-sub dh-aviso">* ' + mh.aviso + '</div>' : '') + bar([[pD, 'b1'], [pE, 'b2']]) +
        '<div class="dh-key"><span><i class="k1"></i>Dentro do contrato</span><b>' + Math.round(pD) + '%</b></div><div class="dh-key"><span><i class="k2"></i>Extrapoladas</span><b>' + Math.round(pE) + '%</b></div></div></div></div>' +
      '<div class="card dh-card" onclick="goTo(\'rent\')"><div class="dh-row top"><span class="dh-ico">' + ic('bars', 24) + '</span><div style="flex:1">' + lbl('Rentabilidade dos contratos' + (mhNome ? ' · ' + mhNome : '')) +
        '<div class="dh-big"><b>' + Math.round(hr.margem) + '%</b> margem média</div>' + bar([[pR, 'b1']]) +
        '<div class="dh-key"><span><i class="k1"></i>Contratos rentáveis</span><b>' + hr.rentaveis + ' de ' + hr.n + '</b></div>' +
        '<div class="dh-key"><span><i class="k2"></i>Abaixo da meta</span><b>' + (hr.n - hr.rentaveis) + '</b></div></div></div></div>';

    var ev = calcEvolucao();
    var top = hr.top.map(function (x) {
      var m = Math.max(0, Math.min(100, x.margem));
      return '<tr><td>' + esc(x.cli) + '</td><td class="r">' + num(x.horas) + ' h</td><td class="r">' + (x.valor ? brl0(x.valor) : '—') + '</td>' +
        '<td><div class="dh-mini"><span>' + Math.round(x.margem) + '%</span>' + bar([[m, x.margem < 0 ? 'bneg' : 'b1']]) + '</div></td></tr>';
    }).join('');
    var r5 = $('dhRow5');
    r5.innerHTML =
      '<div class="card dh-card"><div class="dh-head">' + lbl('Evolução financeira') + '<div class="dh-legend2"><span><i class="k1"></i>Recebido</span><span><i class="k2"></i>A receber</span><span><i class="k3"></i>Despesas</span></div></div>' + chart(ev) + '</div>' +
      '<div class="card dh-card">' + lbl('Clientes com maior consumo de horas' + (mhNome ? ' · ' + mhNome : '')) +
        (top ? '<table class="dh-tbl"><thead><tr><th>Cliente</th><th class="r">Horas</th><th class="r">Valor contrato</th><th>Rentabilidade</th></tr></thead><tbody>' + top + '</tbody></table>'
             : '<div class="empty">Sem horas lançadas ainda.</div>') + '</div>';
  }

  /* ---------- Configurações: o que aparece no painel ---------- */
  var BLOCOS = [
    ['#Painel'],
    ['ng', 'Obrigação fixa (Nota Graciola)', 'Lembrete mensal com o botão “Marcar como gerada”'],
    ['kpis', 'Contratos e propostas', 'Os 4 números do topo: mensais, pontuais, DET e propostas'],
    ['plist', 'Lista de propostas em análise', 'Cada proposta aguardando resposta'],
    ['prio', 'Prioridades', 'O que vence nos próximos 2 dias'],
    ['pagprog', 'Pagamentos a programar', 'Contas a pagar e fechamento de salários'],
    ['reaj', 'Reajustes contratuais', 'Contratos com reajuste chegando'],
    ['reajsal', 'Reajustes salariais', 'Aniversários de casa (INPC)'],
    ['#Dados financeiros'],
    ['fin', 'Financeiro — requer atenção', 'Clientes com pagamento atrasado, vencidos e a vencer'],
    ['receb', 'Recebimentos do mês', 'Quanto já entrou em relação ao previsto'],
    ['comis', 'Comissões pendentes', 'Parcelas de comissão ainda não pagas'],
    ['prop', 'Propostas (resumo)', 'Em análise, aceitas e negadas no ano, com conversão'],
    ['horas', 'Horas dos mensalistas', 'Horas usadas dentro e fora do contratado'],
    ['rent', 'Rentabilidade dos contratos', 'Margem média e contratos rentáveis'],
    ['evol', 'Evolução financeira', 'Gráfico dos últimos 7 meses: recebido x a receber'],
    ['top', 'Clientes com maior consumo de horas', 'Top 5 do mês com rentabilidade'],
    ['saidas', 'Saídas do mês — despesas', 'Despesas previstas e pagas no mês'],
    ['result', 'Resultado do mês', 'Recebido menos despesas pagas'],
    ['cats', 'Despesas por categoria', 'Onde o dinheiro está saindo no mês']
  ];
  function cfgKey() { return 'PainelOculto_' + String((DATA && DATA.email) || 'geral').toLowerCase(); }
  function ocultos() {
    var raw = (CFG && CFG[cfgKey()]) != null ? CFG[cfgKey()] : null;
    if (raw == null) { try { raw = localStorage.getItem('crm_' + cfgKey()); } catch (e) {} }
    var s = {}; String(raw || '').split(',').forEach(function (x) { x = x.trim(); if (x) s[x] = 1; }); return s;
  }
  function marcarBlocos() {
    function tag(elm, k) { if (elm) elm.setAttribute('data-blk', k); }
    function cardOf(id) { var e = $(id); while (e && !(e.classList && e.classList.contains('card'))) e = e.parentNode; return e; }
    tag($('notaGraciola'), 'ng'); tag($('dashKpis'), 'kpis');
    var b = $('finRow3') ? $('finRow3').children : []; ['fin', 'receb', 'comis'].forEach(function (k, i) { tag(b[i], k); });
    var r4 = $('dhRow4') ? $('dhRow4').children : []; ['prop', 'horas', 'rent'].forEach(function (k, i) { tag(r4[i], k); });
    var r5 = $('dhRow5') ? $('dhRow5').children : []; ['evol', 'top'].forEach(function (k, i) { tag(r5[i], k); });
    var rs = $('finRowS') ? $('finRowS').children : []; ['saidas', 'result', 'cats'].forEach(function (k, i) { tag(rs[i], k); });
    tag(cardOf('dashPropostas'), 'plist'); tag(cardOf('tasks'), 'prio'); tag(cardOf('pagarProgramar'), 'pagprog');
    tag(cardOf('reajustes'), 'reaj'); tag(cardOf('reajustesSal'), 'reajsal');
  }
  function aplicarVisibilidade() {
    var oc = ocultos();
    document.querySelectorAll('#v-painel [data-blk], #v-financeiro [data-blk]').forEach(function (e) { e.classList.toggle('dh-off', !!oc[e.getAttribute('data-blk')]); });
    // linhas sem nenhum cartão visível somem; as que sobram se reorganizam
    ['finRow3', 'finRowS', 'dhRow4', 'dhRow5'].forEach(function (id) {
      var r = $(id); if (!r) return; var vis = [].filter.call(r.children, function (c) { return !c.classList.contains('dh-off'); }).length;
      r.style.display = vis ? '' : 'none'; r.setAttribute('data-n', vis);
    });
  }
  function salvarOcultos(set) {
    var lista = Object.keys(set).sort().join(',');
    CFG[cfgKey()] = lista;
    try { localStorage.setItem('crm_' + cfgKey(), lista); } catch (e) {}
    aplicarVisibilidade();
    google.script.run.withFailureHandler(function (e) { alert('Não consegui salvar a preferência: ' + e.message); }).apiSetConfig(cfgKey(), lista);
  }
  window.dhToggleBloco = function (k, on) { var s = ocultos(); if (on) delete s[k]; else s[k] = 1; salvarOcultos(s); };
  window.dhTodosBlocos = function (on) { var s = {}; if (!on) BLOCOS.forEach(function (b) { if (b[0].charAt(0) !== '#') s[b[0]] = 1; }); salvarOcultos(s); renderConfig(); };
  function renderConfig() {
    var v = $('v-config'); if (!v || !DATA) return;
    var oc = ocultos();
    v.innerHTML = '<h2>Configurações</h2><div class="card dh-card"><div class="dh-head">' + lbl('O que aparece no Painel e em Dados financeiros') +
      '<div class="dh-cfg-acts"><button class="btn ghost" onclick="dhTodosBlocos(true)">Mostrar tudo</button><button class="btn ghost" onclick="dhTodosBlocos(false)">Ocultar tudo</button></div></div>' +
      '<div class="dh-sub" style="margin:-4px 0 14px">Ligue ou desligue cada bloco. A escolha vale para a sua conta (' + esc(DATA.email || '') + ') e fica salva na planilha.</div>' +
      BLOCOS.map(function (b) {
        if (b[0].charAt(0) === '#') return '<div class="dh-cfg-grp">' + b[0].slice(1) + '</div>';
        var on = !oc[b[0]];
        return '<label class="dh-sw-row"><span><b>' + b[1] + '</b><small>' + b[2] + '</small></span>' +
          '<span class="dh-sw"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="dhToggleBloco(\'' + b[0] + '\',this.checked)"><i></i></span></label>';
      }).join('') + '</div>' + cfgDespesas();
  }
  function cfgDespesas() {
    var nd = naoDespesaSet();
    return '<div class="card dh-card" style="cursor:default"><div class="dh-head">' + lbl('O que conta como despesa') + '</div>' +
      '<div class="dh-sub" style="margin:-2px 0 14px">Desligue as categorias de saída que <b>não</b> são despesa do escritório (ex.: retirada de lucro da sócia, investimento). ' +
      'Elas continuam no Contas a Pagar, mas ficam fora das Saídas e do Resultado em Dados financeiros. Vale para todos os usuários. ' +
      'Para separar uma conta específica, edite-a no Contas a Pagar e escolha a categoria “Retirada de lucro” ou “Investimento”.</div>' +
      categoriasSaida().map(function (c) {
        var on = !nd[c.toLowerCase()];
        return '<label class="dh-sw-row"><span><b>' + esc(c) + '</b><small>' + (on ? 'Conta como despesa' : 'Não é despesa (fica à parte)') + '</small></span>' +
          '<span class="dh-sw"><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="dhToggleDespesa(this.getAttribute(\'data-c\'),this.checked)" data-c="' + esc(c) + '"><i></i></span></label>';
      }).join('') + '</div>';
  }
  window.dhToggleDespesa = function (c, on) {
    var nd = naoDespesaSet(); if (on) delete nd[c.toLowerCase()]; else nd[c.toLowerCase()] = 1;
    var lista = categoriasSaida().filter(function (x) { return nd[x.toLowerCase()]; });
    Object.keys(nd).forEach(function (k) { if (!lista.some(function (x) { return x.toLowerCase() === k; })) lista.push(k); });
    CFG.SaidasForaDespesa = lista.join('|');
    renderConfig(); try { renderExtra(); marcarBlocos(); aplicarVisibilidade(); } catch (e) {}
    google.script.run.withFailureHandler(function (e) { alert('Não consegui salvar: ' + e.message); }).apiSetConfig('SaidasForaDespesa', CFG.SaidasForaDespesa);
  };
  if (typeof TABS !== 'undefined' && !TABS.some(function (t) { return t[0] === 'config'; })) TABS.push(['config', 'Configurações']);
  if (typeof NAV_ICONS !== 'undefined') NAV_ICONS.config = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>';
  document.addEventListener('DOMContentLoaded', function () {
    var app = $('app'); if (app && !$('v-config')) { var s = document.createElement('section'); s.className = 'view'; s.id = 'v-config'; app.appendChild(s); }
    if (app && !$('v-financeiro')) { var f = document.createElement('section'); f.className = 'view'; f.id = 'v-financeiro'; app.insertBefore(f, $('v-painel').nextSibling); }
  });
  if (typeof go === 'function') {
    var goPrev = window.go;
    window.go = function (id, a) { goPrev(id, a); if (id === 'config') renderConfig(); };
  }

  if (typeof renderDash === 'function') {
    var orig = renderDash;
    window.renderDash = function () {
      orig();
      try { renderExtra(); } catch (e) { console.error('[painel]', e); }
      try { marcarBlocos(); aplicarVisibilidade(); } catch (e) { console.error('[painel]', e); }
    };
  }
  // celular: botão ☰ abre o menu como gaveta
  function montarMenuCelular() {
    var tb = document.querySelector('.topbar'), side = document.querySelector('.side');
    if (!tb || !side || document.getElementById('tbMenu')) return;
    var b = document.createElement('button'); b.id = 'tbMenu'; b.className = 'tb-menu'; b.type = 'button'; b.setAttribute('aria-label', 'Abrir menu');
    b.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    tb.insertBefore(b, tb.firstChild);
    var fundo = document.createElement('div'); fundo.className = 'side-fundo'; document.body.appendChild(fundo);
    function abrir(on) { side.classList.toggle('aberto', on); fundo.classList.toggle('on', on); }
    b.onclick = function () { abrir(!side.classList.contains('aberto')); };
    fundo.onclick = function () { abrir(false); };
    side.addEventListener('click', function (e) { if (e.target.closest('nav a')) abrir(false); });
  }
  document.addEventListener('DOMContentLoaded', function () { setTela('painel'); montarMenuCelular(); });
})();
