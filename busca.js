/*************************************************************
 * BUSCA DE CLIENTE (caixa no topo) + FICHA DO CLIENTE
 * Digite parte do nome: aparecem os clientes de Contratos,
 * Contas a Receber e Propostas. Ao escolher, abre a ficha com
 * tudo daquele cliente.
 *************************************************************/
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sim(v) { return norm(v) === 'sim'; }
  function hoje() { var t = TODAY || new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  var MES_C = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function mesLbl(ym) { return ym && ym.length >= 7 ? MES_C[+ym.slice(5, 7) - 1] + '/' + ym.slice(2, 4) : ym; }

  /* ---------- índice de clientes ---------- */
  function indice() {
    var map = {};
    function add(nome, origem) {
      nome = String(nome || '').trim(); if (!nome) return;
      var k = norm(nome); if (!map[k]) map[k] = { nome: nome, k: k, contratos: 0, receber: 0, propostas: 0 };
      map[k][origem]++;
    }
    (DATA.clientes || []).forEach(function (c) { add(c.Nome, 'contratos'); });
    (DATA.receber || []).forEach(function (r) { add(r.Cliente, 'receber'); });
    (DATA.propostas || []).forEach(function (p) { add(p.Cliente, 'propostas'); });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function buscar(q) {
    q = norm(q); if (q.length < 2) return [];
    var palavras = q.split(' ');
    return indice().filter(function (c) { return palavras.every(function (w) { return c.k.indexOf(w) >= 0; }); })
      .sort(function (a, b) {
        var sa = (a.k.indexOf(q) === 0 ? 0 : 1), sb = (b.k.indexOf(q) === 0 ? 0 : 1);
        return sa - sb || (b.contratos - a.contratos) || a.nome.localeCompare(b.nome, 'pt-BR');
      }).slice(0, 8);
  }

  /* ---------- caixa de busca ---------- */
  var sel = -1, itens = [];
  function montarCaixa() {
    var tb = document.querySelector('.topbar'); if (!tb || $('tbBusca')) return;
    var box = document.createElement('div'); box.className = 'tb-busca';
    box.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="tbBusca" type="search" autocomplete="off" placeholder="Buscar cliente: contratos, cobranças, propostas..." aria-label="Buscar cliente">' +
      '<kbd>Ctrl K</kbd><div class="tb-res" id="tbRes" role="listbox"></div>';
    var tela = $('tbTela'); tb.insertBefore(box, tela ? tela.nextSibling : tb.firstChild);
    var inp = $('tbBusca'), res = $('tbRes');
    inp.addEventListener('input', function () { mostrar(inp.value); });
    inp.addEventListener('focus', function () { if (inp.value) mostrar(inp.value); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(itens.length - 1, sel + 1); marcar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); marcar(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (itens[sel >= 0 ? sel : 0]) window.abrirFichaCliente(itens[sel >= 0 ? sel : 0].nome); }
      else if (e.key === 'Escape') { fechar(); inp.blur(); }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) fechar(); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); inp.focus(); inp.select(); }
    });
    res.addEventListener('mousedown', function (e) {
      var it = e.target.closest('[data-i]'); if (!it) return; e.preventDefault(); window.abrirFichaCliente(itens[+it.getAttribute('data-i')].nome);
    });
  }
  function mostrar(q) {
    var res = $('tbRes'); if (!DATA) return;
    itens = buscar(q); sel = itens.length ? 0 : -1;
    if (!norm(q) || norm(q).length < 2) { fechar(); return; }
    res.innerHTML = itens.length ? itens.map(function (c, i) {
      var tags = [];
      if (c.contratos) tags.push(c.contratos + ' contrato' + (c.contratos > 1 ? 's' : ''));
      if (c.receber) tags.push(c.receber + ' cobrança' + (c.receber > 1 ? 's' : ''));
      if (c.propostas) tags.push(c.propostas + ' proposta' + (c.propostas > 1 ? 's' : ''));
      return '<div class="tb-it" data-i="' + i + '" role="option"><b>' + esc(c.nome) + '</b><span>' + tags.join(' · ') + '</span></div>';
    }).join('') : '<div class="tb-vazio">Nenhum cliente encontrado.</div>';
    res.classList.add('on'); marcar();
  }
  function marcar() { [].forEach.call(document.querySelectorAll('#tbRes .tb-it'), function (e, i) { e.classList.toggle('sel', i === sel); }); }
  function fechar() { var r = $('tbRes'); if (r) r.classList.remove('on'); }

  /* ---------- ficha do cliente ---------- */
  var abrir = function (nome) {
    fechar(); var inp = $('tbBusca'); if (inp) { inp.value = ''; inp.blur(); }
    var v = $('v-cliente');
    if (!v) { v = document.createElement('section'); v.className = 'view'; v.id = 'v-cliente'; $('app').appendChild(v); }
    v.innerHTML = ficha(nome);
    document.querySelectorAll('.view').forEach(function (x) { x.classList.toggle('on', x === v); });
    document.querySelectorAll('#nav a').forEach(function (x) { x.classList.remove('active'); });
    var t = $('tbTela'); if (t) t.textContent = 'Ficha do cliente';
    window.scrollTo(0, 0);
  }
  window.abrirFichaCliente = abrir;

  function ficha(nome) {
    window.__fcNome = nome;
    var k = norm(nome), t = hoje(), lbl = function (x) { return '<div class="dh-lbl">' + x + '</div>'; };
    var mesmo = function (n) { return norm(n) === k; };
    var contratos = (DATA.clientes || []).filter(function (c) { return mesmo(c.Nome); });
    var rec = (DATA.receber || []).filter(function (r) { return mesmo(r.Cliente); })
      .sort(function (a, b) { return (parseD(b.Vencimento) || 0) - (parseD(a.Vencimento) || 0); });
    var props = (DATA.propostas || []).filter(function (p) { return mesmo(p.Cliente); });

    var aberto = 0, venc = 0, recebidoAno = 0, ano = t.getFullYear();
    rec.forEach(function (r) {
      var v = moneyN(r.Valor), d = parseD(r.Vencimento);
      if (sim(r.Recebido)) { if (d && d.getFullYear() === ano) recebidoAno += v; }
      else { aberto += v; if (d && d < t) venc += v; }
    });
    var mensal = contratos.filter(function (c) { return !/encerr|inativ/i.test(c.Status || '') && !/pontual/i.test(c.Tipo || ''); })
      .reduce(function (s, c) { return s + moneyN(c.ValorMensalidade); }, 0);

    // rentabilidade (usa a mesma conta da aba Rentabilidade)
    var rent = null;
    try {
      if (typeof rentClienteStats === 'function') {
        var canon = rentCanon(nome), keep = RT_HTIPO; RT_HTIPO = 'ambas';
        rent = rentClienteStats(canon, ''); RT_HTIPO = keep;
        if (!rent || !(rent.horas > 0 || rent.pago > 0)) rent = null;
      }
    } catch (e) { rent = null; }

    var h = '<div id="finHead">' + lbl('Ficha do cliente') + '<h1 class="dh-hello">' + esc(nome) + '</h1>' +
      '<div class="dh-sub dh-hello-sub">' + (contratos.length ? contratos.map(function (c) { return esc(c.Tipo || 'Contrato') + ' · ' + esc(c.Status || ''); }).join('  |  ') : 'Sem contrato cadastrado') + '</div>' +
      '<div class="fc-acts">' + (typeof gerarRelatorioCliente === 'function' ? '<button class="btn" onclick="gerarRelatorioCliente(window.__fcNome)">Relatório do mês (PDF)</button>' : '') +
      (typeof emailCobrancaNome === 'function' ? '<button class="btn ghost" onclick="emailCobrancaNome(window.__fcNome)">E-mail de cobrança</button>' : '') + '</div></div>';

    // números
    h += '<div class="dh-grid g4 fc-kpis">' +
      kpi('Mensalidade ativa', mensal ? brl(mensal) : '—') +
      kpi('Em aberto', brl(aberto), aberto ? '' : 'mut') +
      kpi('Em atraso', brl(venc), venc ? 'warn' : 'mut') +
      kpi('Recebido em ' + ano, brl(recebidoAno), 'pos') + '</div>';

    // contratos
    h += '<div class="card dh-card fc-card">' + lbl('Contratos (' + contratos.length + ')') +
      (contratos.length ? '<table class="dh-tbl"><thead><tr><th>Tipo</th><th>Status</th><th>Responsável</th><th>Início</th><th>Reajuste</th><th class="r">Mensalidade</th><th class="r">Horas contr.</th><th></th></tr></thead><tbody>' +
        contratos.map(function (c) {
          return '<tr><td>' + esc(c.Tipo) + '</td><td>' + esc(c.Status) + '</td><td>' + esc(c.Responsavel || '—') + '</td><td>' + fmtD(c.DataInicio) + '</td><td>' + (c.DataReajuste ? fmtD(c.DataReajuste) + (c.IndiceReajuste ? ' · ' + esc(c.IndiceReajuste) : '') : '—') + '</td>' +
            '<td class="r">' + (moneyN(c.ValorMensalidade) ? brl(c.ValorMensalidade) : '—') + '</td><td class="r">' + (c.HorasContratadas || '—') + '</td>' +
            '<td class="r">' + (typeof openContratoModal === 'function' ? '<button class="btn ghost fc-mini" onclick="openContratoModal(\'' + esc(c.ID) + '\')">Abrir</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhum contrato cadastrado para este nome.</div>') + '</div>';

    // cobranças
    var abertos = rec.filter(function (r) { return !sim(r.Recebido); });
    var ultimos = rec.slice(0, 12);
    h += '<div class="dh-grid g2">';
    h += '<div class="card dh-card fc-card">' + lbl('Cobranças em aberto (' + abertos.length + ')') +
      (abertos.length ? '<table class="dh-tbl"><thead><tr><th>Vencimento</th><th>Tipo</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
        abertos.map(function (r) {
          var d = parseD(r.Vencimento), atr = d && d < t;
          return '<tr><td>' + fmtD(r.Vencimento) + '</td><td>' + esc(r.Tipo || '—') + '</td><td class="r">' + brl(r.Valor) + '</td><td>' +
            (atr ? '<span class="fc-st late">Em atraso</span>' : (sim(r.Cobrado) ? '<span class="fc-st wait">Cobrado</span>' : '<span class="fc-st">A cobrar</span>')) + '</td>' + btnDel(r) + '</tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nada em aberto. 👍</div>') + '</div>';
    // resumo mês a mês (últimos 12 meses com lançamento)
    var porMes = {};
    rec.forEach(function (r) {
      var d = parseD(r.Vencimento); if (!d) return;
      var m = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2), v = moneyN(r.Valor);
      var o = porMes[m] || (porMes[m] = { fat: 0, rec: 0, ab: 0 });
      o.fat += v; if (sim(r.Recebido)) o.rec += v; else o.ab += v;
    });
    var mesesR = Object.keys(porMes).sort().reverse().slice(0, 12);
    h += '<div class="card dh-card fc-card">' + lbl('Resumo mês a mês') +
      (mesesR.length ? '<table class="dh-tbl"><thead><tr><th>Mês</th><th class="r">Cobrado</th><th class="r">Recebido</th><th class="r">Em aberto</th></tr></thead><tbody>' +
        mesesR.map(function (m) { var o = porMes[m]; return '<tr><td>' + mesLbl(m) + '</td><td class="r">' + brl(o.fat) + '</td><td class="r">' + (o.rec ? brl(o.rec) : '—') + '</td><td class="r">' + (o.ab ? '<span class="lc-late">' + brl(o.ab) + '</span>' : '—') + '</td></tr>'; }).join('') +
        '</tbody></table>' : '<div class="empty">Sem lançamentos no Contas a Receber.</div>') + '</div>';
    h += '</div>';

    // histórico financeiro completo, por ano
    var anos = {};
    rec.forEach(function (r) { var d = parseD(r.Vencimento); var y = d ? String(d.getFullYear()) : 'Sem data'; (anos[y] = anos[y] || []).push(r); });
    var listaAnos = Object.keys(anos).sort().reverse();
    window.__fcAno = listaAnos[0] || '';
    h += '<div class="card dh-card fc-card" id="fcHist"><div class="dh-head">' + lbl('Histórico financeiro completo (' + rec.length + ' lançamentos)') +
      '<div class="lc-f">' + listaAnos.map(function (y, i) { return '<button class="segbtn' + (i === 0 ? ' on' : '') + '" data-y="' + y + '" onclick="fcAno(this)">' + y + '</button>'; }).join('') +
      (listaAnos.length > 1 ? '<button class="segbtn" data-y="*" onclick="fcAno(this)">Todos</button>' : '') + '</div></div>' +
      listaAnos.map(function (y, i) {
        var rows = anos[y], fat = 0, rc = 0, ab = 0;
        rows.forEach(function (r) { var v = moneyN(r.Valor); fat += v; if (sim(r.Recebido)) rc += v; else ab += v; });
        return '<div class="fc-ano" data-y="' + y + '"' + (i === 0 ? '' : ' style="display:none"') + '>' +
          '<div class="fc-ano-tot"><span>' + y + '</span><span>Cobrado <b>' + brl(fat) + '</b></span><span>Recebido <b class="pos">' + brl(rc) + '</b></span><span>Em aberto <b class="' + (ab ? 'warn' : '') + '">' + brl(ab) + '</b></span></div>' +
          '<table class="dh-tbl"><thead><tr><th>Vencimento</th><th>Tipo</th><th>Identificação</th><th class="r">Valor</th><th>Cobrado</th><th>Recebido</th><th>Obs.</th><th></th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + fmtD(r.Vencimento) + '</td><td>' + esc(r.Tipo || '—') + '</td><td>' + esc(r.IdentificarValor || '') + '</td><td class="r">' + brl(r.Valor) + '</td>' +
              '<td>' + (sim(r.Cobrado) ? 'Sim' : 'Não') + '</td>' +
              '<td>' + (sim(r.Recebido) ? '<span class="fc-st ok">Sim' + (r.DataRecebimento ? ' · ' + fmtD(r.DataRecebimento) : '') + '</span>' : (function () { var d = parseD(r.Vencimento); return d && d < t ? '<span class="fc-st late">Em atraso</span>' : '<span class="fc-st">Não</span>'; })()) + '</td>' +
              '<td class="fc-obs-c">' + esc(r.Obs || '') + '</td>' + btnDel(r) + '</tr>';
          }).join('') + '</tbody></table></div>';
      }).join('') + (rec.length ? '' : '<div class="empty">Sem lançamentos no Contas a Receber.</div>') + '</div>';
    h += '<div class="dh-grid g2">';

    // rentabilidade + propostas
    h += '<div class="dh-grid g2">';
    if (rent) {
      var meses = rent.meses.slice(-6);
      h += '<div class="card dh-card fc-card">' + lbl('Rentabilidade (período inteiro)') +
        '<div class="fc-rent"><div><span>Horas</span><b>' + (Math.round(rent.horas * 10) / 10).toLocaleString('pt-BR') + ' h</b></div><div><span>Pago</span><b>' + brl(rent.pago) + '</b></div><div><span>Custo das horas</span><b>' + brl(rent.custo) + '</b></div><div><span>Margem</span><b class="' + (rent.margem < 0 ? 'warn' : 'pos') + '">' + Math.round(rent.margem) + '%</b></div></div>' +
        '<table class="dh-tbl"><thead><tr><th>Mês</th><th class="r">Horas</th><th class="r">Pago</th><th class="r">Custo</th></tr></thead><tbody>' +
        meses.map(function (m) { return '<tr><td>' + mesLbl(m) + '</td><td class="r">' + (Math.round((rent.horasMes[m] || 0) * 10) / 10).toLocaleString('pt-BR') + ' h</td><td class="r">' + brl(rent.pagoMes[m] || 0) + '</td><td class="r">' + brl(rent.custoMes[m] || 0) + '</td></tr>'; }).join('') +
        '</tbody></table>' + (rent.advs.length ? '<div class="dh-sub" style="margin-top:10px">Advogados: ' + rent.advs.map(esc).join(', ') + '</div>' : '') + '</div>';
    } else {
      h += '<div class="card dh-card fc-card">' + lbl('Rentabilidade') + '<div class="empty">Sem horas lançadas para este cliente.</div></div>';
    }
    h += '<div class="card dh-card fc-card">' + lbl('Propostas (' + props.length + ')') +
      (props.length ? '<table class="dh-tbl"><thead><tr><th>Envio</th><th>Advogado</th><th>Status</th><th class="r">Valor</th></tr></thead><tbody>' +
        props.map(function (p) {
          var st = norm(p.Status), c = /aceita/.test(st) ? 'ok' : (/negada/.test(st) ? 'late' : 'wait');
          return '<tr><td>' + fmtD(p.DataEnvio) + '</td><td>' + esc(p.Advogado || '—') + '</td><td><span class="fc-st ' + c + '">' + esc(p.Status) + '</span></td><td class="r">' + brl(p.Valor) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">Nenhuma proposta para este nome.</div>') + '</div>';
    h += '</div>';
    var obs = contratos.map(function (c) { return c.Obs; }).filter(Boolean);
    if (obs.length) h += '<div class="card dh-card fc-card">' + lbl('Observações') + obs.map(function (o) { return '<p class="fc-obs">' + esc(o) + '</p>'; }).join('') + '</div>';
    return h;
  }
  function btnDel(r) {
    if (!r.ID) return '<td></td>';
    return '<td class="r"><button class="fc-del" title="Excluir este lançamento" onclick="fcExcluirReceber(\'' + esc(String(r.ID)).replace(/'/g, '') + '\')">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></td>';
  }
  // Exclui um lançamento do Contas a Receber direto da ficha do cliente.
  window.fcExcluirReceber = function (id) {
    var r = (DATA.receber || []).filter(function (x) { return String(x.ID) === String(id); })[0];
    if (!r) return;
    var txt = 'Excluir este lançamento do Contas a Receber?\n\n' + (r.Cliente || '') + '\nVencimento: ' + fmtD(r.Vencimento) + '\nTipo: ' + (r.Tipo || '—') + '\nValor: ' + brl(r.Valor) + '\n\nIsso apaga a linha da planilha e não dá para desfazer.';
    if (!confirm(txt)) return;
    var nome = window.__fcNome, y = (document.querySelector('#fcHist .segbtn.on') || {}).getAttribute ? document.querySelector('#fcHist .segbtn.on').getAttribute('data-y') : null;
    DATA.receber = DATA.receber.filter(function (x) { return String(x.ID) !== String(id); });
    abrir(nome);
    if (y) { var b = document.querySelector('#fcHist .segbtn[data-y="' + y + '"]'); if (b) fcAno(b); }
    google.script.run
      .withSuccessHandler(function (res) {
        if (res && res.success === false) { alert('Não consegui excluir: ' + (res.error || '')); }
        if (typeof loadData === 'function') loadData(false);
      })
      .withFailureHandler(function (e) { alert('Não consegui excluir: ' + e.message); if (typeof loadData === 'function') loadData(false); })
      .apiDelete('Receber', id);
  };
  function kpi(l, v, cls) { return '<div class="card dh-card fc-kpi"><div class="dh-lbl">' + l + '</div><div class="dh-money ' + (cls || '') + '">' + v + '</div></div>'; }

  /* ---------- aba CLIENTES ---------- */
  if (typeof TABS !== 'undefined' && !TABS.some(function (t) { return t[0] === 'listaclientes'; })) {
    var pos = -1; TABS.forEach(function (t, i) { if (t[0] === 'clientes') pos = i; });
    TABS.splice(pos >= 0 ? pos + 1 : TABS.length, 0, ['listaclientes', 'Clientes']);
  }
  if (typeof NAV_ICONS !== 'undefined') NAV_ICONS.listaclientes = '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-5.5 6-5.5s6 1.9 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.6c3 .2 5.5 1.9 5.5 5.4"/>';
  var LC = { q: '', f: '', ord: 'nome' };
  function statsClientes() {
    var t = hoje(), map = {};
    function get(nome) { var k = norm(nome); if (!k) return null; if (!map[k]) map[k] = { nome: String(nome).trim(), k: k, tipos: {}, ativo: false, mensal: 0, aberto: 0, atraso: 0, ultRec: null, props: 0, resp: {} }; return map[k]; }
    (DATA.clientes || []).forEach(function (c) {
      var o = get(c.Nome); if (!o) return;
      var at = !/encerr|inativ|suspens/i.test(c.Status || '');
      o.tipos[(c.Tipo || 'Contrato') + (at ? '' : ' (' + (c.Status || 'inativo').toLowerCase() + ')')] = 1;
      if (at) { o.ativo = true; if (!/pontual/i.test(c.Tipo || '')) o.mensal += moneyN(c.ValorMensalidade); }
      if (/suspens/i.test(c.Status || '')) o.suspenso = true;
      if (c.Responsavel) o.resp[c.Responsavel] = 1;
    });
    (DATA.receber || []).forEach(function (r) {
      var o = get(r.Cliente); if (!o) return; var d = parseD(r.Vencimento), v = moneyN(r.Valor);
      if (sim(r.Recebido)) { if (d && (!o.ultRec || d > o.ultRec)) o.ultRec = d; }
      else { o.aberto += v; if (d && d < t) o.atraso += v; }
    });
    (DATA.propostas || []).forEach(function (p) { var o = get(p.Cliente); if (o) o.props++; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function renderListaClientes() {
    var v = $('v-listaclientes'); if (!v || !DATA) return;
    if (!$('lcTbl')) {
      v.innerHTML = '<div id="finHead"><div class="dh-lbl">Clientes</div><h1 class="dh-hello">Todos os clientes</h1><div class="dh-sub dh-hello-sub">Clique em um cliente para abrir a ficha completa.</div></div>' +
        '<div class="dh-grid g4" id="lcKpis"></div>' +
        '<div class="card dh-card fc-card"><div class="lc-bar"><input id="lcBusca" type="search" placeholder="Filtrar por nome..." autocomplete="off">' +
        '<div class="lc-f" id="lcF"></div><select id="lcOrd" class="mini"><option value="nome">Ordem: nome</option><option value="atraso">Ordem: maior atraso</option><option value="mensal">Ordem: maior mensalidade</option><option value="aberto">Ordem: maior em aberto</option></select></div>' +
        '<div id="lcTbl"></div></div>';
      $('lcBusca').addEventListener('input', function () { LC.q = this.value; desenhar(); });
      $('lcOrd').addEventListener('change', function () { LC.ord = this.value; desenhar(); });
    }
    desenhar();
  }
  function desenhar() {
    var todos = statsClientes();
    var F = [['', 'Todos'], ['ativo', 'Com contrato ativo'], ['atraso', 'Em atraso'], ['susp', 'Suspensos'], ['sem', 'Sem contrato ativo'], ['prosp', 'Só propostas']];
    function prosp(o) { return !Object.keys(o.tipos).length && !o.aberto && !o.ultRec; }
    function passa(o, f) { if (f === 'prosp') return prosp(o); if (prosp(o)) return false; return !f || (f === 'ativo' && o.ativo) || (f === 'atraso' && o.atraso > 0) || (f === 'susp' && o.suspenso) || (f === 'sem' && !o.ativo); }
    $('lcF').innerHTML = F.map(function (x) { var n = todos.filter(function (o) { return passa(o, x[0]); }).length; return '<button class="segbtn' + (LC.f === x[0] ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + ' (' + n + ')</button>'; }).join('');
    [].forEach.call($('lcF').querySelectorAll('button'), function (b) { b.onclick = function () { LC.f = b.getAttribute('data-f'); desenhar(); }; });
    var ativos = todos.filter(function (o) { return o.ativo; });
    $('lcKpis').innerHTML =
      kpi('Clientes com contrato ativo', String(ativos.length)) +
      kpi('Receita mensal recorrente', brl(ativos.reduce(function (s, o) { return s + o.mensal; }, 0))) +
      kpi('Em aberto', brl(todos.reduce(function (s, o) { return s + o.aberto; }, 0)), 'mut') +
      kpi('Em atraso', brl(todos.reduce(function (s, o) { return s + o.atraso; }, 0)), 'warn');
    var q = norm(LC.q).split(' ').filter(Boolean);
    var lista = todos.filter(function (o) { return passa(o, LC.f) && q.every(function (w) { return o.k.indexOf(w) >= 0; }); });
    lista.sort(function (a, b) {
      if (LC.ord === 'atraso') return b.atraso - a.atraso || a.nome.localeCompare(b.nome, 'pt-BR');
      if (LC.ord === 'mensal') return b.mensal - a.mensal || a.nome.localeCompare(b.nome, 'pt-BR');
      if (LC.ord === 'aberto') return b.aberto - a.aberto || a.nome.localeCompare(b.nome, 'pt-BR');
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    window.__lcLista = lista;
    $('lcTbl').innerHTML = lista.length ? '<table class="dh-tbl lc-tbl"><thead><tr><th>Cliente</th><th>Contratos</th><th>Responsável</th><th class="r">Mensalidade</th><th class="r">Em aberto</th><th class="r">Em atraso</th><th>Último recebimento</th><th></th></tr></thead><tbody>' +
      lista.map(function (o, i) {
        return '<tr onclick="abrirFichaCliente(window.__lcLista[' + i + '].nome)"><td><b>' + esc(o.nome) + '</b>' + (o.props ? '<small>' + o.props + ' proposta' + (o.props > 1 ? 's' : '') + '</small>' : '') + '</td>' +
          '<td>' + (Object.keys(o.tipos).length ? Object.keys(o.tipos).map(function (t) { return '<span class="fc-st' + (/\(/.test(t) ? '' : ' ok') + '">' + esc(t) + '</span>'; }).join(' ') : '<span class="dh-sub">—</span>') + '</td>' +
          '<td>' + (Object.keys(o.resp).map(esc).join(', ') || '—') + '</td>' +
          '<td class="r">' + (o.mensal ? brl(o.mensal) : '—') + '</td>' +
          '<td class="r">' + (o.aberto ? brl(o.aberto) : '—') + '</td>' +
          '<td class="r">' + (o.atraso ? '<span class="lc-late">' + brl(o.atraso) + '</span>' : '—') + '</td>' +
          '<td>' + (o.ultRec ? fmtD(o.ultRec.getFullYear() + '-' + ('0' + (o.ultRec.getMonth() + 1)).slice(-2) + '-' + ('0' + o.ultRec.getDate()).slice(-2)) : '—') + '</td>' +
          '<td class="r"><button class="btn fc-mini" onclick="event.stopPropagation();abrirFichaCliente(window.__lcLista[' + i + '].nome)">Ver histórico ›</button></td></tr>';
      }).join('') + '</tbody></table><div class="dh-sub" style="margin-top:10px">' + lista.length + ' cliente(s)</div>' : '<div class="empty">Nenhum cliente com esse filtro.</div>';
  }
  if (typeof window.go === 'function') {
    var goAnt = window.go;
    window.go = function (id, a) { goAnt(id, a); if (id === 'listaclientes') renderListaClientes(); };
  }
  document.addEventListener('DOMContentLoaded', function () {
    var app = $('app'); if (app && !$('v-listaclientes')) { var s = document.createElement('section'); s.className = 'view'; s.id = 'v-listaclientes'; app.appendChild(s); }
  });
  // ficha aberta a partir da busca ou da lista: botão de voltar para Clientes
  var abrirOrig = abrir;
  abrir = function (nome) {
    abrirOrig(nome);
    var head = document.querySelector('#v-cliente #finHead');
    if (head && !head.querySelector('.fc-voltar')) {
      var b = document.createElement('a'); b.href = '#'; b.className = 'fc-voltar'; b.textContent = '← Todos os clientes';
      b.onclick = function (e) { e.preventDefault(); if (typeof goTo === 'function') goTo('listaclientes'); };
      head.insertBefore(b, head.firstChild);
    }
    [].forEach.call(document.querySelectorAll('#nav a'), function (x) { if (/^clientes$/i.test(x.textContent.trim())) x.classList.add('active'); });
  };
  window.abrirFichaCliente = abrir;
  window.fcAno = function (btn) {
    var y = btn.getAttribute('data-y');
    [].forEach.call(document.querySelectorAll('#fcHist .segbtn'), function (b) { b.classList.toggle('on', b === btn); });
    [].forEach.call(document.querySelectorAll('#fcHist .fc-ano'), function (d) { d.style.display = (y === '*' || d.getAttribute('data-y') === y) ? '' : 'none'; });
  };

  document.addEventListener('DOMContentLoaded', montarCaixa);
})();
