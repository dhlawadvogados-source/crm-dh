/*************************************************************
 * CRM DH LAW — tela da Controladoria (navegador)
 * Tudo que é lido/gravado passa pelo servidor (funções ctrl...),
 * que confere o perfil de quem está logado.
 *************************************************************/
(function () {
'use strict';
var D = null, RESUMO = null, PERFIL = null, RA = null;

/* ---------- utilitários ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function moneyN(v) { if (typeof v === 'number') return v; var s = String(v == null ? '' : v).replace(/[^0-9.,-]/g, ''); if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (s.indexOf(',') >= 0) s = s.replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? 0 : n; }
function brl(n) { return moneyN(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function fmtD(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/); if (!m) return esc(s || '—'); return m[3] + '/' + m[2] + '/' + m[1] + (m[4] && m[4] !== '00:00' ? ' · ' + m[4].replace(':', 'h') : ''); }
function fmtDCurta(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/); if (!m) return esc(s || '—'); return m[3] + '/' + m[2] + (m[4] && m[4] !== '00:00' ? ' · ' + m[4].replace(':', 'h') : ''); }
function hm(v) { var m = String(v || '').match(/^(\d+):(\d{2})/); if (!m) return v ? esc(v) : '—'; return (+m[1]) + 'h' + m[2]; }
function hDec(v) { if (typeof v === 'number') return v; var p = String(v || '').split(':'); if (p.length < 2) return 0; return (+p[0] || 0) + (+p[1] || 0) / 60 + (+p[2] || 0) / 3600; }
function decHm(d) { var t = Math.round((d || 0) * 60); return Math.floor(t / 60) + 'h' + ('0' + (t % 60)).slice(-2); }
function hoje() { return D ? D.today : new Date().toISOString().slice(0, 10); }
function mesAtual() { return hoje().slice(0, 7); }
var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function mesNome(ym) { var p = String(ym).split('-'); return MESES[(+p[1]) - 1] + '/' + p[0]; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function toast(msg, erro) { var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (erro ? ' err' : ''); clearTimeout(window._tt); window._tt = setTimeout(function () { t.className = 'toast'; }, erro ? 6000 : 3500); }
function vazio(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }
function badgeStatus(s) {
  var c = { 'Atrasado': 'late', 'Pendente': 'pend', 'Realizado': 'ok', 'Cancelado': 'cancel', 'Validado': 'ok', 'Aguardando validação': 'pend', 'Desatualizada': 'late', 'Não cobrar': 'cancel',
    'Dentro do contratado': 'incluso', 'Sincronizado': 'info', 'Lançado': 'incluso', 'Recebido': 'ok', 'Ativo': 'ok', 'Arquivado': 'cancel', 'Aberta': 'pend', 'Resolvida': 'ok' }[s] || 'incluso';
  return '<span class="badge ' + c + '">' + esc(s) + '</span>';
}

// chama o servidor; devolve Promise com res.data (ou erro com a mensagem)
function call(fn, args) {
  return new Promise(function (ok, fail) {
    var r = google.script.run.withSuccessHandler(function (res) {
      if (res && res.success === false) { var er = new Error(res.error || 'Erro desconhecido'); er.erros = res.erros; er.avisos = res.avisos; fail(er); } else ok(res && res.data !== undefined ? res.data : res);
    }).withFailureHandler(fail);
    r[fn].apply(r, args || []);
  });
}
function acao(fn, args, okMsg) {
  return call(fn, args).then(function (d) { if (okMsg) toast(okMsg); return carregar().then(function () { return d; }); },
    function (e) { toast(e.message, true); throw e; });
}

// ícones de traço no padrão do menu do CRM (sem emoji)
var ICO = {
  ver: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
  excluir: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>',
  upload: '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 15v4.5h15V15"/>',
  grafico: '<path d="M4.5 20V10.5M10 20V4M15.5 20v-7M21 20H3"/>',
  mais: '<path d="M12 5v14M5 12h14"/>'
};
function ic(n, t) { t = t || 16; return '<svg class="ico" width="' + t + '" height="' + t + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICO[n] || '') + '</svg>'; }
// ---- paginação (10 por página), janelas e botões de ação ----
window.PG = {}; var REND = {};
function paginar(k, l, n) {
  n = n || 10; var tot = Math.max(1, Math.ceil(l.length / n)), p = Math.min(Math.max(PG[k] || 1, 1), tot); PG[k] = p;
  var pager = l.length > n ? '<div class="pager"><button ' + (p <= 1 ? 'disabled' : '') + ' onclick="irPag(\'' + k + '\',' + (p - 1) + ')">‹</button><span>Página ' + p + ' de ' + tot + ' · ' + l.length + ' itens</span><button ' + (p >= tot ? 'disabled' : '') + ' onclick="irPag(\'' + k + '\',' + (p + 1) + ')">›</button></div>' : '';
  return { itens: l.slice((p - 1) * n, p * n), pager: pager };
}
window.irPag = function (k, p) { PG[k] = p; if (REND[k]) REND[k](); };
function abrirModal(id) { $(id).style.zIndex = 80 + document.querySelectorAll('.mbg.on').length + 1; $(id).classList.add('on'); document.body.style.overflow = 'hidden'; var f = $(id).querySelector('input:not([type=hidden]):not([type=file]),select,textarea'); if (f && id !== 'md_ver') setTimeout(function () { try { f.focus(); } catch (e) {} }, 60); }
window.fecharModal = function (id) { $(id).classList.remove('on'); if (!document.querySelector('.mbg.on')) document.body.style.overflow = ''; };
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var abertos = document.querySelectorAll('.mbg.on'); if (abertos.length) fecharModal(abertos[abertos.length - 1].id); } });
function ib(icone, titulo, onclick, cls) { return '<button class="ib' + (cls ? ' ' + cls : '') + '" title="' + titulo + '" onclick="' + onclick + '">' + icone + '</button>'; }
function acoes(ver, editar, excluir) { return (ver ? ib(ic('ver'), 'Visualizar', ver) : '') + (editar ? ib(ic('editar'), 'Editar', editar) : '') + (excluir ? ib(ic('excluir'), 'Excluir', excluir, 'red') : ''); }
function isoData(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; }

/* ---------- menu ---------- */
var ICONS = {
  painel: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5 9.6V21h14V9.6"/>',
  clientes: '<rect x="5.5" y="3" width="13" height="18" rx="2.2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  processos: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  custas: '<path d="M12 3v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 21h15"/>',
  consultivo: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  relatorio: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8 13v4M12 10v7M16 13.5v3.5"/>',
  ferias: '<path d="M12 3v9"/><path d="M12 12c-4 0-7 2.5-7 6h14c0-3.5-3-6-7-6z"/><path d="M12 12c0-4 3-7 7-7"/>',
  usuarios: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.6 2.8-5.6 6.2-5.6s6.2 2 6.2 5.6"/><path d="M16 4.8a3.2 3.2 0 0 1 0 6.3M18.4 14.6c1.8.7 2.8 2.4 2.8 4.9"/>'
};
var TABS = [['painel', 'Painel'], ['clientes', 'Clientes'], ['consultivo', 'Consultivo'], ['processos', 'Processual'], ['relatorio', 'Relatório Anual'], ['ferias', 'Férias']];
function montarMenu() {
  var nav = $('nav'); nav.innerHTML = '';
  var tabs = TABS.slice(); if (PERFIL && PERFIL.perfil === 'Admin') tabs.push(['usuarios', 'Usuários']);
  tabs.forEach(function (t) {
    var a = document.createElement('a'); a.href = '#' + t[0]; a.dataset.tab = t[0];
    a.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[t[0]] || '') + '</svg><span>' + t[1] + '</span>';
    a.onclick = function (e) { e.preventDefault(); goTab(t[0]); };
    nav.appendChild(a);
  });
}
function goTab(id) {
  var t = TABS.concat([['usuarios', 'Usuários']]).filter(function (x) { return x[0] === id; })[0]; if (!t) id = 'painel';
  document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + id); });
  document.querySelectorAll('#nav a').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === id); });
  $('tbTela').textContent = t ? t[1] : 'Painel';
  if (id === 'usuarios') carregarUsuarios();
  try { history.replaceState(null, '', '#' + id); } catch (e) {}
  window.scrollTo(0, 0);
}
window.goTab = goTab;

/* ---------- seletor de cliente com busca ---------- */
function nomesClientes() {
  return (D ? D.clientes : []).slice().sort(function (a, b) { var aa = isAtivo(a) ? 0 : 1, bb = isAtivo(b) ? 0 : 1; return aa - bb || String(a.Nome).localeCompare(String(b.Nome)); });
}
function decToHMSjs(d) { var t = Math.round(d * 3600); return Math.floor(t / 3600) + ':' + ('0' + Math.floor(t % 3600 / 60)).slice(-2) + ':00'; }
function isAtivo(c) { var s = norm(c.Status); return s.indexOf('ativ') >= 0 && s.indexOf('inativ') < 0; }
function rotuloContrato(c) { return tipoContrato(c) + (c.ObjetoContrato ? ' · ' + c.ObjetoContrato : ''); }
function contratoTag(c) { return '<span class="cp-tag" title="' + esc(rotuloContrato(c)) + '">' + esc(rotuloContrato(c).length > 34 ? rotuloContrato(c).slice(0, 33) + '…' : rotuloContrato(c)) + '</span>'; }
function nomeRepetido(nome) { return (D ? D.clientes : []).filter(function (c) { return norm(c.Nome) === norm(nome); }).length > 1; }
function contratoPorId(id) { var c = (D ? D.clientes : []).filter(function (x) { return String(x.ID) === String(id); })[0]; return c ? rotuloContrato(c) : ''; }
// ID do cadastro escolhido no seletor (só vale se o nome digitado ainda é o mesmo)
function cidDe(inputId) { var i = $(inputId); return i.dataset.cid && i.dataset.nome === i.value ? i.dataset.cid : ''; }
function marcarCid(inputId, nome, id) { var i = $(inputId); i.value = nome || ''; i.dataset.nome = nome || ''; i.dataset.cid = id || ''; i.dispatchEvent(new Event('cid')); }
function wireClientPicker(root) {
  root.querySelectorAll('.cp').forEach(function (cp) {
    if (cp.dataset.wired) return; cp.dataset.wired = '1';
    var inp = cp.querySelector('input'), list = cp.querySelector('.cp-list');
    var sel = document.createElement('span'); sel.className = 'cp-sel'; cp.appendChild(sel);
    inp.addEventListener('input', function () { sel.textContent = ''; });
    inp.addEventListener('cid', function () { sel.textContent = inp.dataset.cid && nomeRepetido(inp.value) ? contratoPorId(inp.dataset.cid) : ''; });
    function render(f) {
      f = norm(f);
      var m = nomesClientes().filter(function (c) { return norm(c.Nome).indexOf(f) > -1; }).slice(0, 60);
      list.innerHTML = m.length ? m.map(function (c) { return '<div data-n="' + esc(c.Nome) + '" data-id="' + esc(c.ID) + '"><span class="cp-nome">' + esc(c.Nome) + (isAtivo(c) ? '' : ' <span class="muted">(inativo)</span>') + '</span>' + contratoTag(c) + '</div>'; }).join('')
        : '<div class="cp-empty">Nenhum cliente cadastrado com esse nome</div>';
      list.querySelectorAll('div[data-n]').forEach(function (it) { it.onmousedown = function (e) { e.preventDefault(); inp.value = it.dataset.n; inp.dataset.nome = it.dataset.n; inp.dataset.cid = it.dataset.id; var tg = cp.querySelector('.cp-sel'); if (tg) tg.textContent = nomeRepetido(it.dataset.n) ? contratoPorId(it.dataset.id) : ''; cp.classList.remove('open'); inp.dispatchEvent(new Event('blur')); }; });
    }
    inp.addEventListener('focus', function () { render(inp.value); cp.classList.add('open'); });
    inp.addEventListener('input', function () { render(inp.value); cp.classList.add('open'); });
    inp.addEventListener('blur', function () { setTimeout(function () { cp.classList.remove('open'); }, 150); });
  });
}
function selAdvogados(id, vazioTxt) {
  var s = $(id), atual = s.value;
  s.innerHTML = (vazioTxt ? '<option value="">' + vazioTxt + '</option>' : '') + D.advogados.map(function (a) { return '<option>' + esc(a.Nome) + '</option>'; }).join('');
  if (atual) s.value = atual;
}
function procsDoCliente(nome) { return D.processos.filter(function (p) { return norm(p.Cliente) === norm(nome) && p.Situacao !== 'Arquivado'; }); }
function preencherSelProc(selId, cliente, atual) {
  var s = $(selId), ps = procsDoCliente(cliente);
  if (atual && !ps.some(function (p) { return p.ID === atual; })) { var x = D.processos.filter(function (p) { return p.ID === atual; })[0]; if (x) ps.push(x); }
  s.innerHTML = '<option value="">(nenhum)</option>' + ps.map(function (p) { return '<option value="' + esc(p.ID) + '">' + esc(p.NumeroCNJ || '(sem número)') + (p.Partes ? ' · ' + esc(p.Partes) : '') + '</option>'; }).join('');
  s.value = atual || '';
}
window.fillCuProc = function () { preencherSelProc('cu_ProcessoID', $('cu_Cliente').value, $('cu_ProcessoID').value); };

/* ---------- carga ---------- */
function carregar() {
  return call('ctrlGetAll').then(function (d0) {
    D = d0; if (!$('hrMes').value) $('hrMes').value = compPadrao();
    return call('ctrlResumoFechamento', [compSel()]);
  }).then(function (r1) {
    RESUMO = r1;
    if ($('prMes') && !$('prMes').value) $('prMes').value = compSel();
    if (!$('ra_De').value) { var y = +hoje().slice(0, 4); $('ra_De').value = y + '-01'; $('ra_Ate').value = mesAtual(); }
    ['cu_Data', 'hr_Data', 'tp_Data'].forEach(function (id) { if (!$(id).value) $(id).value = hoje(); });
    $('cu_Categoria').innerHTML = D.listas.categoriasCusta.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    selAdvogados('pr_AdvogadoResponsavel', '(escolha)'); selAdvogados('hr_Responsavel', '(escolha)'); selAdvogados('tp_Responsavel', '(escolha)');
    renderTudo();
    $('loading').style.display = 'none'; $('app').style.display = 'block';
  }, function (e) { $('loading').textContent = 'Erro ao carregar: ' + e.message; throw e; });
}
function renderTudo() { renderPainel(); renderClientes(); renderProcessos(); renderConsultivo(); renderFerias(); reRenderPasta(); }
// a pasta aberta (consultivo ou processual) é redesenhada depois de cada gravação
function reRenderPasta() { if (!$('md_ver').classList.contains('on')) return; var el = $('verCorpo').querySelector('[data-pasta]'); if (!el) return; if (el.dataset.pasta === 'co') renderPastaCo(); else renderPasta(); }
window.mudarComp = function (v) {
  if (!/^\d{4}-\d{2}$/.test(v || '')) return; $('hrMes').value = v; if ($('prMes')) $('prMes').value = v; PG.pc = 1; PG.pt = 1; PG.pcu = 1;
  call('ctrlResumoFechamento', [v]).then(function (r) { RESUMO = r; renderConsultivo(); renderProcessos(); renderPainel(); reRenderPasta(); }, function (e) { toast(e.message, true); });
};

/* ---------- painel ---------- */
REND.pend = function () { renderPainel(); };
function renderPainel() {
  if (!RESUMO) return;
  var comp = RESUMO.competencia, l = RESUMO.clientes, sinc = RESUMO.sincronizacao || {};
  var comTarefa = l.filter(function (c) { return c.tarefas > 0; });
  var horas = l.reduce(function (s, c) { return s + hDec(c.consultivo); }, 0), tarefas = l.reduce(function (s, c) { return s + c.tarefas; }, 0);
  var exc = l.filter(function (c) { return c.excedenteDec > 0; });
  var aguard = D.custas.filter(function (c) { return c.Status === 'Lançado'; }).length;
  var pend = D.pendencias.filter(function (p) { return p.Status === 'Aberta'; });
  $('pnStats').innerHTML =
    '<div class="stat"><div class="lb">Clientes com horas em ' + mesNome(comp) + '</div><div class="val">' + comTarefa.length + ' <span style="font-size:15px;color:var(--muted);font-weight:600">de ' + l.length + '</span></div><div class="hint">contratos mensais no fechamento</div></div>' +
    '<div class="stat"><div class="lb">Horas de consultivo</div><div class="val">' + decHm(horas) + '</div><div class="hint">' + tarefas + ' tarefa(s)</div></div>' +
    '<div class="stat' + (exc.length ? ' warn' : '') + '"><div class="lb">Acima do contratado</div><div class="val">' + exc.length + '</div><div class="hint">cobrança em ' + mesNome(RESUMO.cobrancaEm) + '</div></div>' +
    '<div class="stat"><div class="lb">Horas processuais</div><div class="val">' + decHm(l.reduce(function (a, c) { return a + hDec(c.horasProcessual); }, 0)) + '</div><div class="hint">' + l.filter(function (c) { return hDec(c.horasProcessual) > 0; }).length + ' cliente(s)</div></div>' +
    '<div class="stat"><div class="lb">Processos acima do contrato</div><div class="val">' + l.filter(function (c) { return c.excessoProcessos > 0; }).length + '</div><div class="hint">cliente(s) · cobrança em ' + mesNome(RESUMO.cobrancaEm) + '</div></div>';
  $('pnExced').innerHTML = exc.length ? '<table><thead><tr><th>Cliente</th><th>Contratadas</th><th>Consultivo</th><th>Excedente</th></tr></thead><tbody>' +
    exc.map(function (c) { return '<tr><td class="cliente">' + esc(c.cliente) + (c.travado ? ' <span class="badge ok">cobrado · travado</span>' : '') + '</td><td>' + hm(c.contratadas) + '</td><td>' + hm(c.consultivo) + '</td><td><b>' + hm(c.excedente) + '</b></td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhum cliente acima das horas contratadas em ' + mesNome(comp) + '.');
  var PP = paginar('pend', pend);
  $('pnPend').innerHTML = pend.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Mensagem</th><th></th></tr></thead><tbody>' +
    PP.itens.map(function (p) { return '<tr><td>' + fmtD(p.DataDeteccao) + '</td><td class="cliente">' + esc(p.Cliente) + '</td><td>' + esc(p.Mensagem) + '</td><td class="acts"><button class="lnk" onclick="resolverPend(\'' + esc(p.ID) + '\')">Marcar resolvida</button></td></tr>'; }).join('') + '</tbody></table>' + PP.pager
    : vazio('Nenhuma pendência aberta.');
}
window.resolverPend = function (id) { acao('ctrlResolverPendencia', [id], 'Pendência resolvida.'); };

/* ---------- clientes ---------- */
function opcoesDistintas(lista, campo, extra) { var o = {}; (extra || []).forEach(function (x) { if (x) o[x] = 1; }); lista.forEach(function (x) { if (x[campo]) o[x[campo]] = 1; }); return Object.keys(o).sort().map(function (x) { return '<option value="' + esc(x) + '">'; }).join(''); }
REND.cli = function () { renderClientes(); };
// Assessoria mensal / DET / Pontual (o cadastro antigo pode ter só "Assessoria")
function tipoContrato(c) { var t = norm(c.Tipo); if (/det/.test(t)) return 'DET'; if (/pontual/.test(t)) return 'Pontual'; if (/assess|mensal/.test(t)) return 'Assessoria mensal'; return 'Outros'; }
window.renderClientes = function () {
  var f = norm($('clBusca').value), soAt = $('clStatus').value === 'ativos', tp = $('clTipo').value;
  var l = nomesClientes().filter(function (c) { return (!soAt || isAtivo(c)) && (!tp || tipoContrato(c) === tp) && norm(c.Nome).indexOf(f) > -1; });
  var P = paginar('cli', l);
  $('clTabela').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Modalidade</th><th>Situação</th><th>Horas/mês</th><th>Responsável</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) { var id = esc(c.ID); var ct = hDec(c.HorasContratadas);
      return '<tr><td class="cliente">' + esc(c.Nome) + '</td><td>' + esc(c.Tipo || '—') + (c.ObjetoContrato ? '<br><span class="muted">' + esc(c.ObjetoContrato) + '</span>' : '') + '</td><td>' + badgeStatus(isAtivo(c) ? 'Ativo' : (c.Status || '—')) + '</td><td>' + (ct ? decHm(ct) : '—') + '</td><td>' + esc(c.Responsavel || '—') +
        '</td><td class="acts">' + acoes("verCliente('" + id + "')", "editarCliente('" + id + "')", "excluirCliente('" + id + "')") + '</td></tr>'; }).join('') + '</tbody></table>' + P.pager
    : vazio('Nenhum cliente encontrado.');
};
var CL = ['Nome', 'Tipo', 'Status', 'HorasContratadas', 'ProcessosContratados', 'Responsavel', 'Subtipo', 'DataInicio', 'DataFim', 'ObjetoContrato'];
function prepararFormCliente() {
  $('dlTipos').innerHTML = opcoesDistintas(D.clientes, 'Tipo', ['Assessoria mensal', 'Pontual', 'DET']);
  $('dlStatus').innerHTML = opcoesDistintas(D.clientes, 'Status', ['Ativo', 'Inativo', 'Encerrado']);
  $('dlResp').innerHTML = opcoesDistintas(D.clientes, 'Responsavel', D.advogados.map(function (a) { return a.Nome; }));
}
window.novoCliente = function () {
  prepararFormCliente(); $('cl_ID').value = ''; CL.forEach(function (k) { $('cl_' + k).value = ''; }); $('cl_Status').value = 'Ativo';
  $('clTitulo').textContent = 'Novo cliente'; $('clBtn').textContent = 'Cadastrar cliente'; abrirModal('md_cl');
};
window.editarCliente = function (id) {
  var c = D.clientes.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!c) return;
  fecharModal('md_ver'); prepararFormCliente(); $('cl_ID').value = id;
  CL.forEach(function (k) { var v = c[k] == null ? '' : c[k]; if (/^Data/.test(k)) v = isoData(v); if (k === 'HorasContratadas' && v !== '') v = decHm(hDec(v)).replace('h', ':'); $('cl_' + k).value = v; });
  $('clTitulo').textContent = 'Editar cliente'; $('clBtn').textContent = 'Salvar alterações'; abrirModal('md_cl');
};
window.salvarCliente = function () {
  var o = {}; CL.forEach(function (k) { o[k] = $('cl_' + k).value; }); if ($('cl_ID').value) o.ID = $('cl_ID').value;
  acao('ctrlSalvarCliente', [o], o.ID ? 'Cliente atualizado (o Financeiro já vê a alteração).' : 'Cliente cadastrado. O Financeiro foi avisado para preencher os valores.').then(function () { fecharModal('md_cl'); }, function () {});
};
window.excluirCliente = function (id) {
  var c = D.clientes.filter(function (x) { return String(x.ID) === String(id); })[0];
  if (c && confirm('Excluir o cliente "' + c.Nome + '"?\n\nSó é possível se ele não tiver nenhum lançamento. Se tiver, mude a situação para Inativo.')) acao('ctrlExcluirCliente', [id], 'Cliente excluído.');
};
function campoFicha(rot, v) { return '<div><span>' + rot + '</span>' + (v === '' || v == null ? '—' : v) + '</div>'; }
window.verCliente = function (id) {
  var c = D.clientes.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!c) return;
  var procs = D.processos.filter(function (p) { return norm(p.Cliente) === norm(c.Nome); });
  var ativos = procs.filter(function (p) { return p.Situacao !== 'Arquivado'; });
  var h = '<div class="ficha">' + campoFicha('Modalidade', esc(c.Tipo)) + campoFicha('Situação', badgeStatus(isAtivo(c) ? 'Ativo' : (c.Status || '—'))) + campoFicha('Responsável', esc(c.Responsavel)) +
    campoFicha('Horas contratadas/mês', hDec(c.HorasContratadas) ? decHm(hDec(c.HorasContratadas)) : '') + campoFicha('Processos contratados', esc(c.ProcessosContratados)) + campoFicha('O que é este contrato', esc(c.ObjetoContrato)) + campoFicha('Subtipo', esc(c.Subtipo)) +
    campoFicha('Início do contrato', c.DataInicio ? fmtD(c.DataInicio) : '') + campoFicha('Fim do contrato', c.DataFim ? fmtD(c.DataFim) : '') + '</div>';
  // a ficha fica curta: o mês a mês fica dentro das pastas (com seletor de mês), nunca empilhado aqui
  var nq = jsq(c.Nome);
  h += '<div class="ficha-sec">Pastas do cliente</div><div class="btn-row">' +
    '<button class="btn ghost sm" onclick="abrirPastaCo(\'' + nq + '\')">' + IC_PASTA + ' Consultivo</button>' +
    '<button class="btn ghost sm" onclick="abrirPasta(\'' + nq + '\')">' + IC_PASTA + ' Processual · ' + ativos.length + ' processo(s) ativo(s)</button></div>' +
    '<p class="pasta-nota" style="margin-top:8px">Horas, processos, custas e audiências de cada mês ficam dentro das pastas, com o seletor de mês.</p>';
  h += '<div class="btn-row" style="margin-top:16px"><button class="btn" onclick="editarCliente(\'' + esc(c.ID) + '\')">' + ic('editar') + ' Editar cliente</button><button class="btn ghost" onclick="fecharModal(\'md_ver\')">Fechar</button></div>';
  $('verTitulo').textContent = c.Nome; $('verCorpo').innerHTML = h; abrirModal('md_ver');
};

/* ---------- processual: uma pasta por cliente, por mês (processos, horas processuais, custas e audiências) ---------- */
var PR = ['Cliente', 'NumeroCNJ', 'Partes', 'Vara', 'AreaJuridica', 'AdvogadoResponsavel', 'ValorCausa', 'CondenacaoAcordo', 'ValoresRecebidos', 'Saving', 'Situacao', 'DataInicio', 'DataEncerramento', 'SituacaoAtualizada'];
var PASTA = null, PASTA_ABA = 'Ativo', PASTA_CONTR = '';
// mesmas regras do servidor: conta no mês se esteve ativo em algum dia; processo de contrato Pontual/DET é cobrado à parte
function procNoMes(p, comp) { var ini = isoData(p.DataInicio) || String(p.DataCriacao || '').slice(0, 10), fim = isoData(p.DataEncerramento); if (ini && ini > comp + '-31') return false; if (fim) return fim >= comp + '-01'; return p.Situacao !== 'Arquivado'; }
function contratoDoProc(p) { return D.clientes.filter(function (c) { return String(c.ID) === String(p.ClienteID); })[0]; }
function procAParte(p) { if (p.Classificacao === 'Extra') return true; var c = contratoDoProc(p); if (!c) return false; var t = tipoContrato(c); return t === 'Pontual' || t === 'DET'; }
function ordemProc(p) { return (isoData(p.DataInicio) || String(p.DataCriacao || '').slice(0, 10) || '9999') + '|' + String(p.ID); }
function pastaMesCalc(f, comp) {
  var us = f.procs.filter(function (p) { return procNoMes(p, comp) && !procAParte(p); }).sort(function (a, b) { return ordemProc(a) < ordemProc(b) ? -1 : 1; });
  var exc = f.contratados > 0 ? Math.max(0, us.length - f.contratados) : 0;
  return { usados: us.length, excedente: exc, extras: exc ? us.slice(f.contratados).map(function (p) { return String(p.ID); }) : [] };
}
function pastas() {
  var por = {}, comp = compSel();
  // todo cliente ativo tem pasta (mesmo nome com vários contratos = uma pasta só; vale o contrato com processos contratados)
  D.clientes.forEach(function (c) { if (!isAtivo(c)) return; var k = norm(c.Nome);
    if (!por[k] || Number(c.ProcessosContratados || 0) > Number(por[k].cli.ProcessosContratados || 0)) por[k] = { nome: c.Nome, cli: c, procs: [] }; });
  D.processos.forEach(function (p) { var k = norm(p.Cliente); if (!k) return; if (!por[k]) { var c = D.clientes.filter(function (x) { return norm(x.Nome) === k; }).sort(function (a, b) { return (isAtivo(b) ? 1 : 0) - (isAtivo(a) ? 1 : 0); })[0]; por[k] = { nome: c ? c.Nome : p.Cliente, cli: c, procs: [] }; } por[k].procs.push(p); });
  return Object.keys(por).map(function (k) {
    var f = por[k]; f.contratados = f.cli ? (Number(f.cli.ProcessosContratados) || 0) : 0;
    f.ativos = f.procs.filter(function (p) { return p.Situacao !== 'Arquivado'; }).length; f.arquivados = f.procs.length - f.ativos;
    f.aParte = f.procs.filter(function (p) { return p.Situacao !== 'Arquivado' && procAParte(p); }).length;
    var m = pastaMesCalc(f, comp); f.usados = m.usados; f.excedente = m.excedente; f.extras = m.extras; return f;
  });
}
function badgePasta(f) {
  if (!f.contratados) return '<span class="badge cancel" title="O cadastro do cliente não tem quantidade de processos contratados">sem limite no cadastro</span>';
  if (f.excedente > 0) return '<span class="badge extra">+' + f.excedente + ' acima do contrato</span>';
  return '<span class="badge ok">dentro do contrato</span>';
}
var IC_PASTA = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';
function jsq(s) { return esc(s).replace(/'/g, "\\'"); }
REND.pr = function () { renderProcessos(); };
window.renderProcessos = function () {
  if (!D) return;
  var f = norm($('prBusca').value), filtro = $('prFiltro').value, comp = compSel();
  if ($('prMes')) $('prMes').value = comp;
  var l = pastas().filter(function (p) {
    if (filtro === 'exc' && !(p.excedente > 0)) return false;
    if (filtro === 'com' && !p.procs.length) return false;
    if (filtro === 'parte' && !p.aParte) return false;
    return !f || norm(p.nome).indexOf(f) > -1 || p.procs.some(function (x) { return (norm(x.NumeroCNJ) + ' ' + norm(x.Partes)).indexOf(f) > -1; });
  }).sort(function (a, b) { return (b.excedente - a.excedente) || String(a.nome).localeCompare(b.nome); });
  var P = paginar('pr', l);
  $('prTabela').innerHTML = l.length ? '<table><thead><tr><th>Pasta do cliente</th><th>Contratados</th><th>Em uso em ' + esc(mesNome(comp)) + '</th><th>Situação</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (p) { var a = "abrirPasta('" + jsq(p.nome) + "')";
      return '<tr class="pasta-row" onclick="' + a + '"><td><div class="pasta-nome"><span class="pasta-ic">' + IC_PASTA + '</span><span><b>' + esc(p.nome) + '</b><small>' + p.ativos + ' ativo(s)' + (p.aParte ? ' · ' + p.aParte + ' à parte' : '') + (p.arquivados ? ' · ' + p.arquivados + ' arquivado(s)' : '') + '</small></span></div></td>' +
        '<td>' + (p.contratados || '—') + '</td><td><b>' + p.usados + '</b></td><td>' + badgePasta(p) + '</td>' +
        '<td class="acts" onclick="event.stopPropagation()">' + ib(ic('ver'), 'Abrir pasta', a) + ib(ic('mais'), 'Novo processo nesta pasta', "novoProcesso('" + jsq(p.nome) + "')") + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager : vazio(filtro === 'exc' ? 'Nenhum cliente acima do contrato neste mês.' : 'Nenhuma pasta encontrada.');
};
window.abrirPasta = function (nome, aba) { PASTA = nome; PASTA_ABA = aba || 'Ativo'; PASTA_CONTR = ''; PG.pp = 1; PG.pt = 1; PG.pcu = 1; renderPasta(); abrirModal('md_ver'); };
window.abaPasta = function (a) { PASTA_ABA = a; PG.pp = 1; renderPasta(); };
window.filtroContrPasta = function (v) { PASTA_CONTR = v; PG.pp = 1; renderPasta(); };
REND.pp = function () { renderPasta(); }; REND.pt = REND.pp; REND.pcu = REND.pp;
function rotuloCobranca(p) { if (!procAParte(p)) return ''; var c = contratoDoProc(p), t = c ? tipoContrato(c) : ''; return '<span class="badge aparte" title="Cobrado à parte: não conta no limite do contrato">extra · à parte' + (t === 'Pontual' || t === 'DET' ? ' (' + esc(rotuloContrato(c)) + ')' : '') + '</span>'; }
function seletorMes(id) { return '<label class="mes-lbl">Mês <input type="month" value="' + compSel() + '" onchange="mudarComp(this.value)"></label>'; }
function travadoNoMes(nome) { var r = RESUMO && RESUMO.competencia === compSel() ? RESUMO.clientes.filter(function (c) { return norm(c.cliente) === norm(nome); })[0] : null; return !!(r && r.travado); }
function notaIntegracao(nome) {
  var comp = compSel();
  return travadoNoMes(nome) ? '<p class="pasta-nota"><b>' + esc(mesNome(comp)) + ' já foi cobrado/recebido pelo Financeiro:</b> este mês está travado e não dá para alterar.</p>'
    : '<p class="pasta-nota">Tudo o que for lançado aqui entra sozinho no Contas a Receber de <b>' + esc(mesNome(proxMes(comp))) + '</b> (sem duplicar). O valor de horas e processos é calculado pelo Financeiro conforme o contrato.</p>';
}
function renderPasta() {
  var comp = compSel();
  var f = pastas().filter(function (x) { return x.nome === PASTA; })[0] || { nome: PASTA, procs: [], contratados: 0, usados: 0, excedente: 0, extras: [], ativos: 0, arquivados: 0, aParte: 0 };
  var nq = jsq(f.nome), trav = travadoNoMes(f.nome);
  var tps = (D.tarefasProcessual || []).filter(function (t) { return t.Competencia === comp && norm(t.Cliente) === norm(f.nome); });
  var hp = tps.reduce(function (a, t) { return a + hDec(t.Duracao); }, 0);
  var cus = D.custas.filter(function (c) { return c.Status !== 'Cancelado' && String(c.Data).slice(0, 7) === comp && norm(c.Cliente) === norm(f.nome); });
  var contratos = D.clientes.filter(function (c) { return norm(c.Nome) === norm(f.nome); });
  var h = '<div class="pasta" data-pasta="pr"><div class="pasta-top"><div class="seg">' +
    '<button class="' + (PASTA_ABA === 'Ativo' ? 'on' : '') + '" onclick="abaPasta(\'Ativo\')">Processos (' + f.ativos + ')</button>' +
    '<button class="' + (PASTA_ABA === 'Arquivado' ? 'on' : '') + '" onclick="abaPasta(\'Arquivado\')">Arquivados (' + f.arquivados + ')</button>' +
    '<button class="' + (PASTA_ABA === 'horas' ? 'on' : '') + '" onclick="abaPasta(\'horas\')">Horas processuais (' + decHm(hp) + ')</button>' +
    '<button class="' + (PASTA_ABA === 'custas' ? 'on' : '') + '" onclick="abaPasta(\'custas\')">Custas e audiências (' + cus.length + ')</button></div>' + seletorMes() + '</div>';
  if (PASTA_ABA === 'horas') {
    h += notaIntegracao(f.nome) + blocoImport('pr|' + f.nome + '|' + comp) +
      '<div class="btn-row pasta-bar">' + (trav ? '' : '<button class="btn sm" onclick="escolherArquivo(\'pr\')">' + ic('upload') + ' Importar planilha</button><button class="btn sm ghost" onclick="baixarModelo(\'pr\')">Baixar modelo</button><button class="btn sm ghost" onclick="novaTarefaProc()">' + ic('mais') + ' Nova tarefa</button>') + '</div>' +
      tabelaTarefas(tps, 'pt', 'Proc', trav, 'Nenhuma hora processual em ' + mesNome(comp) + '.');
  } else if (PASTA_ABA === 'custas') {
    var Pc = paginar('pcu', cus.slice().sort(function (a, b) { return String(b.Data).localeCompare(a.Data); }));
    h += notaIntegracao(f.nome) + '<div class="btn-row pasta-bar">' + (trav ? '' : '<button class="btn sm" onclick="novaCustaPasta()">' + ic('mais') + ' Nova custa / audiência</button>') + '</div>' +
      (cus.length ? '<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th></th></tr></thead><tbody>' +
        Pc.itens.map(function (c) { var id = esc(c.ID);
          return '<tr><td>' + fmtD(c.Data) + '</td><td>' + esc(c.Descricao) + (contratos.length > 1 && contratoPorId(c.ClienteID) ? '<br><span class="cp-tag">' + esc(contratoPorId(c.ClienteID)) + '</span>' : '') + '</td><td>' + esc(c.Categoria) + (c.Cobravel !== 'Sim' ? '<br><span class="muted">não cobrar</span>' : '') + '</td><td class="money">' + (moneyN(c.Valor) ? brl(c.Valor) : '—') + '</td><td class="acts">' +
            (c.Recebido || trav ? '<span class="muted" style="font-size:11px">cobrado</span>' : acoes(null, "editarCusta('" + id + "')", "excluirCusta('" + id + "')")) + '</td></tr>'; }).join('') + '</tbody></table></div>' + Pc.pager
        : vazio('Nenhuma custa ou audiência em ' + mesNome(comp) + '.'));
  } else {
    var l = f.procs.filter(function (p) { return PASTA_ABA === 'Arquivado' ? p.Situacao === 'Arquivado' : p.Situacao !== 'Arquivado'; })
      .filter(function (p) { return !PASTA_CONTR || (PASTA_CONTR === 'parte' ? procAParte(p) : !procAParte(p)); })
      .sort(function (a, b) { return ordemProc(a) < ordemProc(b) ? -1 : 1; });
    var P = paginar('pp', l);
    h += '<div class="pasta-kpis">' +
      '<div><span>Contratados</span><b>' + (f.contratados || '—') + '</b></div>' +
      '<div><span>Em uso em ' + esc(mesNome(comp)) + '</span><b>' + f.usados + '</b></div>' +
      '<div class="' + (f.excedente > 0 ? 'warn' : '') + '"><span>Acima do contrato</span><b>' + (f.contratados ? f.excedente : '—') + '</b></div></div>' +
      '<p class="pasta-nota">' + (f.contratados ? (f.excedente > 0 ? 'Os <b>' + f.excedente + ' processo(s) mais recentes</b> passam do contrato e entram sozinhos como processo extra no Contas a Receber de <b>' + esc(mesNome(proxMes(comp))) + '</b>.' : 'Dentro do contrato: nenhuma cobrança de processo extra em ' + esc(mesNome(comp)) + '.') : 'O cadastro deste cliente não tem quantidade de processos contratados, então não há cobrança automática de processo extra.') +
      (f.aParte ? ' Processos <b>à parte</b> (contrato Pontual/DET) não contam no limite: o Financeiro cobra conforme aquele contrato.' : '') + '</p>' +
      '<div class="btn-row pasta-bar">' + (f.aParte || contratos.length > 1 ? '<select class="inl" onchange="filtroContrPasta(this.value)"><option value="">Todos os processos</option><option value="dentro"' + (PASTA_CONTR === 'dentro' ? ' selected' : '') + '>Dentro da assessoria</option><option value="parte"' + (PASTA_CONTR === 'parte' ? ' selected' : '') + '>Cobrados à parte</option></select>' : '') +
      '<button class="btn sm" style="margin-left:auto" onclick="novoProcesso(\'' + nq + '\')">' + ic('mais') + ' Novo processo</button></div>' +
      (l.length ? '<div class="tbl-wrap"><table><thead><tr><th>Nº / partes</th><th>Área</th><th>Início</th><th>Situação</th><th></th></tr></thead><tbody>' +
        P.itens.map(function (p) { var id = esc(p.ID), extra = (f.extras || []).indexOf(String(p.ID)) > -1;
          return '<tr><td>' + esc(p.NumeroCNJ || '—') + (p.Partes ? '<br><span class="muted">' + esc(p.Partes) + '</span>' : '') + '</td><td>' + esc(p.AreaJuridica || '—') + '</td><td>' + (p.DataInicio ? fmtD(p.DataInicio) : '—') +
            '</td><td>' + badgeStatus(p.Situacao) + (extra ? ' <span class="badge extra" title="Passa do contrato neste mês">extra</span>' : '') + ' ' + rotuloCobranca(p) + '</td><td class="acts">' + acoes("verProcesso('" + id + "')", "editarProcesso('" + id + "')", "excluirProcesso('" + id + "')") + '</td></tr>';
        }).join('') + '</tbody></table></div>' + P.pager : vazio(PASTA_ABA === 'Arquivado' ? 'Nenhum processo arquivado.' : 'Nenhum processo nesta pasta.'));
  }
  h += '</div>';
  $('verTitulo').innerHTML = IC_PASTA + ' ' + esc(f.nome) + ' · Processual'; $('verCorpo').innerHTML = h;
}
window.novaCustaPasta = function () {
  limparCusta(); var f = pastas().filter(function (x) { return x.nome === PASTA; })[0];
  var ct = D.clientes.filter(function (c) { return norm(c.Nome) === norm(PASTA); });
  marcarCid('cu_Cliente', PASTA, ct.length === 1 ? ct[0].ID : (f && f.cli ? f.cli.ID : ''));
  var comp = compSel(); $('cu_Data').value = hoje().slice(0, 7) === comp ? hoje() : comp + '-01';
  fillCuProc(); abrirModal('md_cu');
};

/* ---------- consultivo: uma pasta por cliente, por mês ---------- */
var PASTA_CO = null;
REND.co = function () { renderConsultivo(); };
window.renderConsultivo = function () {
  if (!RESUMO || !$('coTabela')) return;
  var comp = RESUMO.competencia, f = norm($('coBusca').value), fil = $('coFiltro').value;
  var vistos = {}, base = RESUMO.clientes.filter(function (c) { return c.cadastrado !== false; });
  base.forEach(function (c) { vistos[norm(c.cliente)] = 1; });
  D.clientes.forEach(function (c) { var k = norm(c.Nome); if (!isAtivo(c) || vistos[k]) return; vistos[k] = 1;
    var hs = D.clientes.filter(function (x) { return norm(x.Nome) === k; }).reduce(function (a, x) { return Math.max(a, hDec(x.HorasContratadas)); }, 0);
    base.push({ cliente: c.Nome, cadastrado: true, travado: false, contratadas: hs ? decToHMSjs(hs) : '', consultivo: '0:00', tarefas: 0, excedente: '0:00', excedenteDec: 0 }); });
  var l = base
    .filter(function (c) { return !f || norm(c.cliente).indexOf(f) > -1; })
    .filter(function (c) { return fil === 'exc' ? c.excedenteDec > 0 : fil === 'sem' ? !c.tarefas : true; })
    .sort(function (a, b) { return (b.excedenteDec - a.excedenteDec) || String(a.cliente).localeCompare(b.cliente); });
  var P = paginar('co', l);
  $('coTabela').innerHTML = l.length ? '<table><thead><tr><th>Pasta do cliente</th><th>Contratadas</th><th>Trabalhadas em ' + esc(mesNome(comp)) + '</th><th>Excedente</th><th>Situação</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) { var a = "abrirPastaCo('" + jsq(c.cliente) + "')";
      var sit = c.travado ? '<span class="badge ok">cobrado · travado</span>' : c.excedenteDec > 0 ? '<span class="badge extra">acima do contrato</span>' : c.tarefas ? '<span class="badge ok">dentro do contrato</span>' : '<span class="badge cancel">sem lançamento</span>';
      return '<tr class="pasta-row" onclick="' + a + '"><td><div class="pasta-nome"><span class="pasta-ic">' + IC_PASTA + '</span><span><b>' + esc(c.cliente) + '</b><small>' + c.tarefas + ' tarefa(s)</small></span></div></td>' +
        '<td>' + (hDec(c.contratadas) ? hm(c.contratadas) : '—') + '</td><td><b>' + hm(c.consultivo) + '</b></td><td>' + (c.excedenteDec > 0 ? '<b style="color:var(--warn)">' + hm(c.excedente) + '</b>' : '—') + '</td><td>' + sit + '</td>' +
        '<td class="acts" onclick="event.stopPropagation()">' + ib(ic('ver'), 'Abrir pasta', a) + (c.travado ? '' : ib(ic('upload'), 'Importar planilha', "abrirPastaCo('" + jsq(c.cliente) + "');escolherArquivo('co')")) + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager : vazio(fil === 'exc' ? 'Nenhum cliente acima do contrato em ' + mesNome(comp) + '.' : 'Nenhuma pasta encontrada.');
};
window.abrirPastaCo = function (nome) { PASTA_CO = nome; PG.pc = 1; renderPastaCo(); abrirModal('md_ver'); };
REND.pc = function () { renderPastaCo(); };
function tabelaTarefas(l, chave, tipo, trav, msgVazio) {
  l = l.slice().sort(function (a, b) { return String(a.Data).localeCompare(b.Data); });
  var P = paginar(chave, l), porAdv = {};
  l.forEach(function (t) { var k = t.Responsavel || '(sem advogado)'; porAdv[k] = (porAdv[k] || 0) + hDec(t.Duracao); });
  if (!l.length) return vazio(msgVazio);
  return '<p class="pasta-nota" style="margin-top:-4px">Por advogado: ' + Object.keys(porAdv).sort().map(function (k) { return esc(k) + ' <b>' + decHm(porAdv[k]) + '</b>'; }).join(' · ') + '</p>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Tarefa</th><th>Advogado</th><th>Tempo</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (t) { var id = esc(t.ID), pode = !trav && (tipo === 'Proc' || t.Editavel);
      return '<tr><td>' + fmtD(t.Data) + '</td><td>' + esc(t.Tarefa) + (t.Origem === 'Controladoria' ? ' <span class="muted" style="font-size:11px">(à mão)</span>' : '') + '</td><td>' + esc(t.Responsavel || '—') + '</td><td>' + hm(t.Duracao) + '</td><td class="acts">' +
        (pode ? acoes(null, (tipo === 'Proc' ? 'editarTarefaProc' : 'editarHoras') + "('" + id + "')", (tipo === 'Proc' ? 'excluirTarefaProc' : 'excluirHoras') + "('" + id + "')") : (trav ? '' : '<span class="muted" style="font-size:11px" title="Importada pelo Financeiro antes da Controladoria">importada</span>')) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' + P.pager;
}
function renderPastaCo() {
  var comp = compSel(), mes = proxMes(comp);
  var r = (RESUMO && RESUMO.clientes.filter(function (c) { return norm(c.cliente) === norm(PASTA_CO); })[0]) || { contratadas: '', consultivo: '0:00', excedente: '0:00', excedenteDec: 0, tarefas: 0 };
  var l = D.consultivo.filter(function (c) { return c.Mes === mes && norm(c.Cliente) === norm(PASTA_CO); });
  var trav = travadoNoMes(PASTA_CO);
  var h = '<div class="pasta" data-pasta="co"><div class="pasta-top">' + (trav ? '' : '<button class="btn sm" onclick="escolherArquivo(\'co\')">' + ic('upload') + ' Importar planilha</button><button class="btn sm ghost" onclick="baixarModelo(\'co\')">Baixar modelo</button><button class="btn sm ghost" onclick="novaTarefaCo()">' + ic('mais') + ' Nova tarefa</button>') + seletorMes() + '</div>' +
    '<div class="pasta-kpis"><div><span>Contratadas no mês</span><b>' + (hDec(r.contratadas) ? hm(r.contratadas) : '—') + '</b></div>' +
    '<div><span>Trabalhadas em ' + esc(mesNome(comp)) + '</span><b>' + hm(r.consultivo) + '</b></div>' +
    '<div class="' + (r.excedenteDec > 0 ? 'warn' : '') + '"><span>Excedente</span><b>' + (r.excedenteDec > 0 ? hm(r.excedente) : '0h00') + '</b></div></div>' +
    notaIntegracao(PASTA_CO) + blocoImport('co|' + PASTA_CO + '|' + comp) +
    tabelaTarefas(l, 'pc', 'Co', trav, 'Nenhuma tarefa de consultivo em ' + mesNome(comp) + '. Importe a planilha do cliente ou inclua à mão.') + '</div>';
  $('verTitulo').innerHTML = IC_PASTA + ' ' + esc(PASTA_CO) + ' · Consultivo'; $('verCorpo').innerHTML = h;
}
window.novaTarefaCo = function () { limparHoras(); $('hr_Cliente').value = PASTA_CO; var c = compSel(); $('hr_Data').value = hoje().slice(0, 7) === c ? hoje() : c + '-01'; abrirModal('md_hr'); };

/* ---------- importar planilha de tarefas (Tarefa | Data | Tempo | Advogado) ---------- */
var IMP_TIPO = null, IMP_RES = {};
window.escolherArquivo = function (tipo) { IMP_TIPO = tipo; $('arqTarefas').value = ''; $('arqTarefas').click(); };
function nomeArq(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, ''); }
window.baixarModelo = function (tipo) {
  if (typeof XLSX === 'undefined') { toast('O leitor de planilhas ainda não carregou. Recarregue a página.', true); return; }
  var ws = XLSX.utils.aoa_to_sheet([['Tarefa', 'Data', 'Tempo', 'Advogado']]); ws['!cols'] = [{ wch: 55 }, { wch: 12 }, { wch: 10 }, { wch: 28 }];
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, tipo === 'co' ? 'Consultivo' : 'Processual');
  XLSX.writeFile(wb, 'Modelo_' + (tipo === 'co' ? 'Consultivo' : 'Processual') + '_' + nomeArq(tipo === 'co' ? PASTA_CO : PASTA) + '_' + compSel() + '.xlsx');
};
window.importarTarefas = function (inp) {
  var f = inp.files[0]; if (!f) return;
  var tipo = IMP_TIPO, nome = tipo === 'co' ? PASTA_CO : PASTA, comp = compSel(), key = tipo + '|' + nome + '|' + comp;
  if (typeof XLSX === 'undefined') { toast('O leitor de planilhas ainda não carregou. Recarregue a página.', true); return; }
  if (tipo === 'pr') PASTA_ABA = 'horas';
  var rd = new FileReader();
  rd.onload = function (ev) {
    var cab, linhas = [];
    try {
      var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      cab = (rows[0] || []).map(function (x) { return String(x == null ? '' : x).trim(); });
      for (var i = 1; i < rows.length; i++) { var r = rows[i] || []; linhas.push({ _linha: i + 1, Tarefa: String(r[0] == null ? '' : r[0]).trim(), Data: dataStr(r[1]), Tempo: durStr(r[2]), Advogado: String(r[3] == null ? '' : r[3]).trim() }); }
    } catch (e) { toast('Não consegui ler o arquivo: ' + e.message, true); return; }
    IMP_RES[key] = { carregando: true, arquivo: f.name }; reRenderPasta();
    call('ctrlImportarTarefas', [tipo === 'co' ? 'consultivo' : 'processual', comp, nome, linhas, cab]).then(function (d) {
      IMP_RES[key] = { ok: true, arquivo: f.name, d: d }; toast('Planilha importada.');
      return carregar();
    }, function (e) { IMP_RES[key] = { ok: false, arquivo: f.name, erro: e.message, erros: e.erros || [] }; toast('Planilha recusada: veja o que corrigir.', true); reRenderPasta(); });
  };
  rd.readAsArrayBuffer(f);
};
function textoIntegracao(x) { if (!x) return ''; if (x.erro) return '<br><b>Atenção:</b> o Contas a Receber não foi atualizado (' + esc(x.erro) + '). Ficou registrado nas pendências.'; if (x.travado) return '<br>Este mês já foi cobrado pelo Financeiro: o Receber não foi alterado.'; return '<br>Contas a Receber atualizado.'; }
function blocoImport(key) {
  var r = IMP_RES[key]; if (!r) return '';
  if (r.carregando) return '<div class="pasta-res">Importando "' + esc(r.arquivo) + '"…</div>';
  if (r.ok) return '<div class="pasta-res"><b>"' + esc(r.arquivo) + '" importada:</b> ' + r.d.tarefas + ' tarefa(s), ' + hm(r.d.horas) + '.' + (r.d.substituidas ? ' Substituiu ' + r.d.substituidas + ' tarefa(s) da planilha anterior.' : '') + textoIntegracao(r.d.integracao) +
    (r.d.avisos && r.d.avisos.length ? '<ul>' + r.d.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
  return '<div class="pasta-res warn"><b>"' + esc(r.arquivo) + '" recusada: nada foi importado.</b> ' + (r.erros.length ? 'Corrija e importe de novo:' : esc(r.erro)) +
    (r.erros.length ? '<ul>' + r.erros.slice(0, 20).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (r.erros.length > 20 ? '… e mais ' + (r.erros.length - 20) + ' problema(s).' : '') : '') + '</div>';
}

/* ---------- tarefa processual à mão ---------- */
window.novaTarefaProc = function () { limparTarefaProc(); $('tp_Cliente').value = PASTA; var c = compSel(); $('tp_Data').value = hoje().slice(0, 7) === c ? hoje() : c + '-01'; abrirModal('md_tp'); };
window.limparTarefaProc = function () { $('tp_ID').value = ''; $('tp_Tarefa').value = ''; $('tp_Duracao').value = ''; $('tpTitulo').textContent = 'Incluir hora processual'; $('tpBtn').textContent = 'Incluir tarefa'; };
window.editarTarefaProc = function (id) {
  var t = (D.tarefasProcessual || []).filter(function (x) { return String(x.ID) === String(id); })[0]; if (!t) return;
  $('tp_ID').value = id; $('tp_Cliente').value = t.Cliente; $('tp_Data').value = isoData(t.Data); $('tp_Tarefa').value = t.Tarefa; $('tp_Duracao').value = String(t.Duracao).replace(/:00$/, '');
  $('tp_Responsavel').value = t.Responsavel || ''; if ($('tp_Responsavel').value !== (t.Responsavel || '')) { var o = document.createElement('option'); o.textContent = t.Responsavel; $('tp_Responsavel').appendChild(o); $('tp_Responsavel').value = t.Responsavel; }
  $('tpTitulo').textContent = 'Editar hora processual'; $('tpBtn').textContent = 'Salvar alterações'; abrirModal('md_tp');
};
window.salvarTarefaProc = function () {
  var o = { Cliente: $('tp_Cliente').value, Data: $('tp_Data').value, Responsavel: $('tp_Responsavel').value, Tarefa: $('tp_Tarefa').value, Duracao: $('tp_Duracao').value };
  if ($('tp_ID').value) o.ID = $('tp_ID').value;
  acao('ctrlSalvarTarefaProcessual', [o], o.ID ? 'Tarefa atualizada.' : 'Tarefa incluída.').then(function () { fecharModal('md_tp'); limparTarefaProc(); }, function () {});
};
window.excluirTarefaProc = function (id) { if (confirm('Excluir esta hora processual?')) acao('ctrlExcluirTarefaProcessual', [id], 'Tarefa excluída.'); };

/* ---------- classificação do processo: contratual (conta no limite) ou extra (cobrado à parte) ---------- */
// valor do select = "C|<ID do contrato>" ou "E|<ID do contrato>"
window.fillPrContrato = function (atualId, atualClass) {
  var nome = $('pr_Cliente').value, s = $('pr_Contrato'), l = D.clientes.filter(function (c) { return norm(c.Nome) === norm(nome); });
  var ant = String(s.value || '').split('|');
  var selId = atualId || cidDe('pr_Cliente') || ant[1] || '', selC = atualClass || ant[0] || 'C';
  var base = l.filter(function (c) { return tipoContrato(c) === 'Assessoria mensal' && isAtivo(c); })[0] || l.filter(function (c) { var t = tipoContrato(c); return t !== 'Pontual' && t !== 'DET'; })[0] || l[0];
  var op = [];
  if (base && tipoContrato(base) !== 'Pontual' && tipoContrato(base) !== 'DET') {
    op.push(['C|' + base.ID, 'Contratual (dentro da assessoria)']);
    op.push(['E|' + base.ID, 'Extra (cobrado à parte)']);
  }
  l.forEach(function (c) { var t = tipoContrato(c); if (t === 'Pontual' || t === 'DET') op.push(['E|' + c.ID, 'Extra · contrato ' + rotuloContrato(c) + (isAtivo(c) ? '' : ' (inativo)')]); });
  s.innerHTML = op.length ? op.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('') : '<option value="">(escolha o cliente)</option>';
  var want = selC + '|' + selId;
  if (op.some(function (o) { return o[0] === want; })) s.value = want;
  else { var porId = op.filter(function (o) { return o[0].split('|')[1] === String(selId); })[0]; if (porId) s.value = porId[0]; }
  infoPrContrato();
};
function infoPrContrato() {
  var v = String($('pr_Contrato').value || '');
  $('prContratoInfo').textContent = /^E\|/.test(v) ? 'Não conta no limite da assessoria. O Financeiro recebe um aviso para cobrar este processo à parte.' : (v ? 'Conta no limite de processos do contrato.' : '');
}
document.addEventListener('change', function (e) { if (e.target && e.target.id === 'pr_Contrato') infoPrContrato(); });
window.verProcesso = function (id) {
  var p = D.processos.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!p) return;
  function v(x) { return x !== '' && x != null ? brl(x) : ''; }
  var h = '<div class="ficha">' + campoFicha('Cliente', esc(p.Cliente)) + campoFicha('Nº do processo', esc(p.NumeroCNJ)) + campoFicha('Partes', esc(p.Partes)) + campoFicha('Vara', esc(p.Vara)) +
    campoFicha('Área jurídica', esc(p.AreaJuridica)) + campoFicha('Advogado responsável', esc(p.AdvogadoResponsavel)) + campoFicha('Situação', badgeStatus(p.Situacao)) + campoFicha('Classificação', procAParte(p) ? 'Extra (cobrado à parte)' : 'Contratual') +
    campoFicha('Início', p.DataInicio ? fmtD(p.DataInicio) : '') + campoFicha('Encerramento', p.DataEncerramento ? fmtD(p.DataEncerramento) : '') + '</div>' +
    '<div class="ficha-sec">Valores</div><div class="ficha">' + campoFicha('Valor da causa', v(p.ValorCausa)) + campoFicha('Condenação / acordo', v(p.CondenacaoAcordo)) + campoFicha('Valores recebidos', v(p.ValoresRecebidos)) + campoFicha('Saving', v(p.Saving)) + '</div>' +
    '<div class="ficha-sec">Andamento</div><p style="font-size:13px;margin:0">' + esc(p.SituacaoAtualizada || '—') + '</p>' +
    '<div class="btn-row" style="margin-top:16px"><button class="btn" onclick="editarProcesso(\'' + esc(p.ID) + '\')">' + ic('editar') + ' Editar processo</button><button class="btn ghost" onclick="fecharModal(\'md_ver\')">Fechar</button></div>';
  $('verTitulo').textContent = 'Processo ' + (p.NumeroCNJ || ''); $('verCorpo').innerHTML = h; abrirModal('md_ver');
};
window.novoProcesso = function (cliente) { limparProcesso(); if (typeof cliente === 'string') { var f = pastas().filter(function (x) { return x.nome === cliente; })[0]; marcarCid('pr_Cliente', cliente, f && f.cli ? f.cli.ID : ''); } $('pr_Contrato').innerHTML = ''; fillPrContrato(); abrirModal('md_pr'); };
window.editarProcesso = function (id) {
  var p = D.processos.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!p) return;
  fecharModal('md_ver');
  $('pr_ID').value = id; marcarCid('pr_Cliente', p.Cliente, p.ClienteID); $('pr_Contrato').innerHTML = ''; fillPrContrato(p.ClienteID, p.Classificacao === 'Extra' ? 'E' : 'C'); PR.forEach(function (k) { if (k === 'Cliente') return; var e = $('pr_' + k); if (!e) return; var x = p[k] == null ? '' : p[k]; if (/^Data/.test(k)) x = isoData(x); else if (/^Valor|Condenacao|Saving/.test(k) && x !== '') x = moneyN(x).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); e.value = x; });
  $('prTitulo').textContent = 'Editar processo'; $('prBtn').textContent = 'Salvar alterações'; $('prCancel').style.display = 'none'; abrirModal('md_pr');
};
window.limparProcesso = function () {
  $('pr_ID').value = ''; PR.forEach(function (k) { var e = $('pr_' + k); if (e && e.tagName !== 'SELECT') e.value = ''; }); marcarCid('pr_Cliente', '', '');
  $('pr_Situacao').value = 'Ativo'; $('pr_AdvogadoResponsavel').value = '';
  $('prTitulo').textContent = 'Novo processo'; $('prBtn').textContent = 'Registrar processo'; $('prCancel').style.display = 'none';
};
window.salvarProcesso = function () {
  var o = {}; PR.forEach(function (k) { o[k] = $('pr_' + k).value; }); if ($('pr_ID').value) o.ID = $('pr_ID').value;
  var cv = String($('pr_Contrato').value || '').split('|'); o.ClienteID = cv[1] || cidDe('pr_Cliente'); o.Classificacao = cv[0] === 'E' ? 'Extra' : 'Contratual';
  acao('ctrlSalvarProcesso', [o], o.ID ? 'Processo atualizado.' : 'Processo registrado.').then(function () { fecharModal('md_pr'); limparProcesso(); }, function () {});
};
window.excluirProcesso = function (id) { if (confirm('Excluir este processo? (Se ele só terminou, prefira mudar a situação para "Arquivado".)')) acao('ctrlExcluirProcesso', [id], 'Processo excluído.'); };

/* ---------- custas ---------- */
REND.cu = function () { renderCustas(); };
window.renderCustas = function () {
  if (!$('cuTabela')) return;
  var f = norm($('cuBusca').value), mes = $('cuMes').value;
  var l = D.custas.filter(function (c) { return c.Status !== 'Cancelado' && (!mes || String(c.Data).slice(0, 7) === mes) && (norm(c.Cliente) + ' ' + norm(c.Descricao)).indexOf(f) > -1; })
    .sort(function (a, b) { return String(b.Data).localeCompare(a.Data); });
  var tot = 0; l.forEach(function (c) { if (c.Cobravel === 'Sim') tot += moneyN(c.Valor); });
  var P = paginar('cu', l);
  $('cuTabela').innerHTML = l.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) {
      var st = c.Recebido ? 'Recebido' : c.Status === 'Sincronizado' ? 'Sincronizado' : 'Lançado';
      var stTxt = st === 'Lançado' ? '<span class="badge pend">aguardando sincronizar</span>' : st === 'Sincronizado' ? '<span class="badge info">no Receber de ' + mesNome(c.CobrancaEm) + '</span>' : '<span class="badge ok">cobrado · travado</span>';
      var id = esc(c.ID);
      return '<tr><td>' + fmtD(c.Data) + '</td><td class="cliente">' + esc(c.Cliente) + (nomeRepetido(c.Cliente) && contratoPorId(c.ClienteID) ? '<br><span class="cp-tag">' + esc(contratoPorId(c.ClienteID)) + '</span>' : '') + '</td><td>' + esc(c.Descricao) + '<br><span class="muted">' + esc(c.Categoria) + (c.Cobravel !== 'Sim' ? ' · não cobrar' : '') + '</span>' + (/^https?:\/\//i.test(c.DocumentoLink || '') ? ' <a class="lnk" target="_blank" rel="noopener" href="' + esc(c.DocumentoLink) + '">comprovante</a>' : '') +
        '</td><td class="money">' + (moneyN(c.Valor) ? brl(c.Valor) : '<span class="muted">valor do contrato</span>') + '</td><td>' + stTxt + '</td><td class="acts">' +
        (st !== 'Recebido' ? acoes(null, "editarCusta('" + id + "')", "excluirCusta('" + id + "')") : '') + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager + '<div class="pager" style="justify-content:space-between"><b style="color:var(--ink)">Total a cobrar' + (mes ? ' em ' + mesNome(mes) : '') + '</b><b style="color:var(--ink)">' + brl(tot) + '</b></div>'
    : vazio('Nenhum lançamento' + (mes ? ' em ' + mesNome(mes) : '') + '.');
};
var CU = ['Cliente', 'ProcessoID', 'Categoria', 'Data', 'Valor', 'Cobravel', 'Descricao', 'DocumentoLink'];
window.novaCusta = function () { limparCusta(); abrirModal('md_cu'); };
window.editarCusta = function (id) {
  var c = D.custas.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!c) return;
  $('cu_ID').value = id; marcarCid('cu_Cliente', c.Cliente, c.ClienteID); preencherSelProc('cu_ProcessoID', c.Cliente, c.ProcessoID);
  ['Categoria', 'Data', 'Cobravel', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = c[k] || ''; });
  $('cu_Data').value = isoData(c.Data); $('cu_Valor').value = moneyN(c.Valor) ? moneyN(c.Valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  $('cuTitulo').textContent = 'Editar lançamento'; $('cuBtn').textContent = 'Salvar alterações'; $('cuCancel').style.display = 'none'; abrirModal('md_cu');
};
window.limparCusta = function () {
  $('cu_ID').value = ''; ['Cliente', 'Valor', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = ''; }); $('cu_Cobravel').value = 'Sim'; $('cu_Data').value = hoje(); preencherSelProc('cu_ProcessoID', '', ''); marcarCid('cu_Cliente', '', '');
  $('cuTitulo').textContent = 'Nova custa / audiência'; $('cuBtn').textContent = 'Lançar'; $('cuCancel').style.display = 'none';
};
window.salvarCusta = function () {
  var o = {}; CU.forEach(function (k) { o[k] = $('cu_' + k).value; }); o.ClienteID = cidDe('cu_Cliente'); var id = $('cu_ID').value;
  (id ? acao('ctrlEditarCusta', [id, o], 'Lançamento atualizado.') : acao('ctrlLancarCusta', [o], o.Cobravel === 'Sim' ? 'Lançado. Já está no Contas a Receber do mês seguinte.' : 'Lançado (sem cobrança).'))
    .then(function () { fecharModal('md_cu'); limparCusta(); }, function () {});
};
window.excluirCusta = function (id) { if (confirm('Excluir este lançamento?\n\nEle sai também do Contas a Receber.')) acao('ctrlExcluirCusta', [id], 'Lançamento excluído.'); };
window.cancelarCusta = window.excluirCusta;

/* ---------- fechamento do mês ---------- */
function compSel() { return $('hrMes').value || compPadrao(); }
// até o dia 7 a Controladoria normalmente ainda está fechando o mês anterior
function compPadrao() { var d = hoje(), ym = d.slice(0, 7); if (+d.slice(8, 10) <= 7) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } ym = y + '-' + ('0' + m).slice(-2); } return ym; }
function proxMes(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + '-' + ('0' + m).slice(-2); }
function fmtCarimbo(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d)) return esc(s); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' às ' + ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2); }
function renderResumo() {
  if (!RESUMO || !$('fcStatus')) return;
  var comp = RESUMO.competencia, cob = RESUMO.cobrancaEm, s = RESUMO.sincronizacao || {};
  $('fcStatus').innerHTML = '<span class="big">Atividades de ' + mesNome(comp) + ' → cobradas em ' + mesNome(cob) + '</span>' +
    (s.ultima ? '<span class="badge ' + (s.pendente ? 'pend' : 'ok') + '">' + (s.pendente ? 'Há alterações não sincronizadas' : 'Sincronizado') + '</span><span class="muted">última sincronização ' + fmtCarimbo(s.ultima) + ' · ' + esc(s.por) + '</span>'
      : (s.ultimaAlteracao ? '<span class="badge pend">Ainda não sincronizado</span>' : '<span class="muted">Nada lançado ainda nesta competência.</span>'));
  $('fcTituloTabela').textContent = 'Clientes em ' + mesNome(comp);
  var todos = RESUMO.clientes.filter(function (c) { return c.tarefas > 0 || c.horasProcessual || c.audienciasPlanilha || c.audienciasLancadas || c.excessoProcessos || c.custasPlanilha || c.custasLancadas; });
  var semNada = RESUMO.clientes.length - todos.length, fb = norm(($('fcBusca') || {}).value);
  var l = todos.filter(function (c) { return norm(c.cliente).indexOf(fb) > -1; });
  window._RL = RESUMO.clientes;
  var P = paginar('fc', l);
  $('hrResumo').innerHTML = (l.length ? '<table><thead><tr><th>Cliente</th><th>Contratadas</th><th>Consultivo</th><th>Uso</th><th>Excedente</th><th>Processual</th><th>Audiências</th><th>Proc. extras</th><th>Custas</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) {
      var ix = RESUMO.clientes.indexOf(c);
      var aud = (+c.audienciasPlanilha || 0) + c.audienciasLancadas, custas = moneyN(c.custasPlanilha) + c.custasLancadasValor;
      return '<tr><td class="cliente">' + esc(c.cliente) + (c.cadastrado ? '' : ' <span class="badge late">fora do cadastro</span>') + (c.travado ? ' <span class="badge ok" title="O Financeiro já cobrou/recebeu esta cobrança">cobrado · travado</span>' : '') +
        '</td><td>' + hm(c.contratadas) + '</td><td>' + hm(c.consultivo) + ' <span class="muted">(' + c.tarefas + ')</span></td><td>' + (c.percentual != null ? c.percentual + '%' : '—') +
        '</td><td>' + (c.excedenteDec > 0 ? '<b style="color:var(--dh-laranja)">' + hm(c.excedente) + '</b>' : '—') + '</td><td>' + (c.horasProcessual ? hm(c.horasProcessual) : '—') +
        '</td><td>' + (aud || '—') + '</td><td>' + (c.excessoProcessos || '—') + (c.excessoAutomatico ? ' <span class="muted" title="automático pela pasta de processos">(' + c.processosUsados + ' em uso / ' + c.processosContratados + ' contr.)</span>' : (c.processosContratados ? ' <span class="muted" title="processos contratados no contrato">(contr. ' + c.processosContratados + ')</span>' : '')) +
        (c.semValorProcessoExtra ? '<br><span class="badge pend" title="O Financeiro precisa preencher o valor do processo extra no cadastro do cliente">sem valor no cadastro</span>' : '') +
        '</td><td class="money">' + (custas ? brl(custas) : '—') + '</td><td class="acts">' + (c.travado || !c.cadastrado ? '' : acoes(null, 'editarExtras(' + ix + ')', (c.horasProcessual || c.audienciasPlanilha || c.excessoProcessos || c.custasPlanilha) ? 'excluirExtras(' + ix + ')' : null)) + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager : vazio('Nada lançado em ' + mesNome(comp) + ' ainda. Suba a planilha ou inclua tarefas abaixo.')) +
    (semNada ? '<p class="example-note" style="margin:10px 0 0">' + semNada + ' cliente(s) com contrato mensal ainda sem nada lançado neste mês.</p>' : '');
}
REND.fc = function () { renderResumo(); }; REND.hr = function () { renderHoras(); };
function carregarResumo() { return call('ctrlResumoFechamento', [compSel()]).then(function (r) { RESUMO = r; renderConsultivo(); renderPainel(); reRenderPasta(); }, function (e) { toast(e.message, true); }); }
window.carregarResumo = carregarResumo;
window.sincronizar = function () {
  var comp = compSel();
  if (!confirm('Sincronizar ' + mesNome(comp) + ' com o Financeiro?\n\nAs cobranças de extras (horas excedentes, audiências, processos extras e custas) vão para o Contas a Receber de ' + mesNome(proxMes(comp)) + '.\nPode sincronizar de novo depois: o sistema refaz, sem duplicar.')) return;
  $('fcSync').disabled = true; $('fcSync').textContent = 'Sincronizando…';
  call('ctrlSincronizar', [comp]).then(function (d) {
    var av = [];
    if (d.travados.length) av.push('Não mexi em ' + d.travados.join(', ') + ': a cobrança já foi cobrada/recebida pelo Financeiro.');
    if (d.semCadastro.length) av.push('Fora do cadastro (não sincronizados): ' + d.semCadastro.join(', ') + '.');
    if (d.erros.length) av.push('Erros: ' + d.erros.join(' | '));
    $('fcResultado').innerHTML = '<div class="fc-res' + (av.length ? ' warn' : '') + '"><b>Sincronizado.</b> ' + d.clientes + ' cliente(s); ' + d.lancamentos + ' cobrança(s) de extras no Contas a Receber de ' + mesNome(d.cobrancaEm) + '. Rentabilidade de ' + mesNome(d.competencia) + ' atualizada.' + (av.length ? '<br>' + av.map(esc).join('<br>') : '') + '</div>';
    toast('Sincronizado com o Financeiro.');
    return carregar();
  }, function (e) { toast(e.message, true); }).then(function () { $('fcSync').disabled = false; $('fcSync').innerHTML = ic('sync') + ' Sincronizar com o Financeiro'; });
};
// leitura da planilha (mesmo modelo de fechamento que o Financeiro importa hoje)
function nh(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function durStr(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') { var t = Math.round(v * 86400); return Math.floor(t / 3600) + ':' + ('0' + Math.floor(t % 3600 / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2); }
  var s = String(v).trim(); if (!s || s === '-') return '';
  var dm = s.match(/(\d+)\s*day[s]?,?\s*(\d+):(\d{2})(?::(\d{2}))?/i); if (dm) return (+dm[1] * 24 + +dm[2]) + ':' + dm[3] + ':' + (dm[4] || '00');
  return s;
}
function dataStr(v) {
  if (v instanceof Date && !isNaN(v)) return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
  if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 86400000)); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear(); }
  return String(v || '').trim();
}
function mostrarErrosPlanilha(nome, erros) {
  $('fcResultado').innerHTML = '<div class="fc-res warn" style="background:#FBE7E7"><b>Planilha recusada: "' + esc(nome) + '" não está no modelo certo. Nada foi importado.</b><br>Corrija e suba de novo:<ul style="margin:6px 0 0;padding-left:18px">' +
    erros.slice(0, 25).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' + (erros.length > 25 ? '… e mais ' + (erros.length - 25) + ' problema(s).' : '') + '</div>';
  toast('Planilha recusada: veja a lista do que corrigir.', true);
  $('fcResultado').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.subirPlanilha = function (inp) {
  var f = inp.files && inp.files[0]; if (!f) return;
  if (typeof XLSX === 'undefined') { toast('A leitura de planilhas não carregou. Recarregue a página.', true); inp.value = ''; return; }
  var rd = new FileReader();
  rd.onload = function (ev) {
    try {
      var wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }); // números puros: data = serial, duração = fração do dia
      var nC = null, nE = null;
      wb.SheetNames.forEach(function (n) { var x = nh(n); if (x === 'consultivo') nC = n; if (x === 'processual e extras') nE = n; });
      if (!nC || !nE) { mostrarErrosPlanilha(f.name, ['O arquivo precisa ter as abas "CONSULTIVO" e "PROCESSUAL E EXTRAS" (abas encontradas: ' + wb.SheetNames.join(', ') + ').']); inp.value = ''; return; }
      var cons = [], ext = [], meses = {}, repetidos = [], modelo = { abas: wb.SheetNames.slice(), cabecalhoConsultivo: [], cabecalhoExtras: [], cabecalhosRepetidos: repetidos };
      function vazia(r) { return !r || !r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; }); }
      if (nC) {
        var a = XLSX.utils.sheet_to_json(wb.Sheets[nC], { header: 1, raw: true, defval: '' });
        modelo.cabecalhoConsultivo = (a[0] || []).map(String);
        for (var i = 1; i < a.length; i++) { var r = a[i] || []; if (vazia(r)) continue;
          if (nh(r[0]) === 'cliente') { repetidos.push({ aba: 'CONSULTIVO', linha: i + 1 }); continue; }
          var dt = dataStr(r[2]); var m = dt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) { var k = m[3] + '-' + ('0' + m[2]).slice(-2); meses[k] = (meses[k] || 0) + 1; }
          cons.push({ _linha: i + 1, Cliente: String(r[0] || '').trim(), Tarefa: String(r[1] || '').trim(), Data: dt, Duracao: durStr(r[3]), Responsavel: String(r[4] || '').trim() }); }
      }
      if (nE) {
        var b = XLSX.utils.sheet_to_json(wb.Sheets[nE], { header: 1, raw: true, defval: '' });
        modelo.cabecalhoExtras = (b[0] || []).map(String);
        for (var j = 1; j < b.length; j++) { var e = b[j] || []; if (vazia(e)) continue;
          if (nh(e[0]) === 'cliente') { repetidos.push({ aba: 'PROCESSUAL E EXTRAS', linha: j + 1 }); continue; }
          ext.push({ _linha: j + 1, Cliente: String(e[0] || '').trim(), HorasProcessual: durStr(e[2]), Audiencias: String(e[3] == null ? '' : e[3]).trim(), ExcessoProcessos: String(e[4] == null ? '' : e[4]).trim(),
            Custas: String(e[5] == null ? '' : e[5]).trim(), DescricaoCustas: String(e[6] || '').trim(), DescricaoAudiencias: String(e[7] || '').trim() }); }
      }
      var compArq = Object.keys(meses).sort(function (x, y) { return meses[y] - meses[x]; })[0] || compSel();
      if (!confirm('Arquivo "' + f.name + '":\n• ' + cons.length + ' tarefa(s) de consultivo\n• ' + ext.length + ' cliente(s) na aba de extras\n\nCompetência: ' + mesNome(compArq) + ' (cobrança em ' + mesNome(proxMes(compArq)) + ').\n\nAs tarefas desse período substituem as que já estavam lançadas nesse período. Continuar?')) { inp.value = ''; return; }
      toast('Importando…');
      call('ctrlImportarFechamento', [compArq, cons, ext, modelo]).then(function (d) {
        inp.value = '';
        var av = [];
        if (d.semCadastro.length) av.push('Clientes com nome diferente do cadastro (não entraram): ' + d.semCadastro.join(', '));
        if (d.foraDaCompetencia) av.push(d.foraDaCompetencia + ' tarefa(s) de outro mês ficaram de fora (suba-as na competência delas).');
        if (d.invalidas) av.push(d.invalidas + ' linha(s) com data ou duração inválida.');
        if (d.travados.length) av.push('Não mexi em ' + d.travados.join(', ') + ': cobrança já cobrada/recebida pelo Financeiro.');
        (d.avisos || []).slice(0, 10).forEach(function (x) { av.push(x); });
        $('fcResultado').innerHTML = '<div class="fc-res' + (av.length ? ' warn' : '') + '"><b>Planilha importada.</b> ' + d.tarefas + ' tarefa(s)' + (d.periodo ? ' de ' + fmtD(d.periodo[0]) + ' a ' + fmtD(d.periodo[1]) : '') +
          (d.substituidas ? ' (substituindo ' + d.substituidas + ' que já estavam nesse período)' : '') + '; extras de ' + d.extras + ' cliente(s). <b>Lembre de sincronizar.</b>' + (av.length ? '<br>' + av.map(esc).join('<br>') : '') + '</div>';
        $('hrMes').value = compArq;
        toast('Planilha importada. Confira e sincronize.');
        return carregar();
      }, function (e) { inp.value = ''; if (e.erros && e.erros.length) mostrarErrosPlanilha(f.name, e.erros); else toast(e.message, true); });
    } catch (err) { inp.value = ''; toast('Não consegui ler a planilha: ' + err.message, true); }
  };
  rd.readAsArrayBuffer(f);
};
var EX = ['HorasProcessual', 'Audiencias', 'DescricaoAudiencias', 'ExcessoProcessos', 'Custas', 'DescricaoCustas'];
window.editarExtras = function (ix) {
  var c = window._RL[ix]; if (!c) return;
  $('ex_Cliente').value = c.cliente; $('ex_HorasProcessual').value = c.horasProcessual ? String(c.horasProcessual).replace(/:00$/, '') : ''; $('ex_Audiencias').value = c.audienciasPlanilha || '';
  $('ex_DescricaoAudiencias').value = c.descricaoAudiencias || ''; $('ex_ExcessoProcessos').value = c.excessoPlanilha || '';
  $('exProcAuto').style.display = c.excessoAutomatico ? 'block' : 'none';
  $('ex_Custas').value = c.custasPlanilha ? moneyN(c.custasPlanilha).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''; $('ex_DescricaoCustas').value = c.descricaoCustas || '';
  $('exTitulo').textContent = 'Extras de ' + c.cliente + ' em ' + mesNome(compSel()); abrirModal('md_ex');
};
window.novoExtras = function () { limparExtras(); $('exTitulo').textContent = 'Extras de um cliente em ' + mesNome(compSel()); abrirModal('md_ex'); };
window.excluirExtras = function (ix) { var c = window._RL[ix]; if (!c || !confirm('Apagar os extras (horas processuais, audiências, processos e custas da planilha) de ' + c.cliente + ' em ' + mesNome(compSel()) + '?\n\nAs custas lançadas na tela de Custas continuam.')) return; acao('ctrlExcluirExtras', [compSel(), c.cliente], 'Extras apagados.'); };
window.limparExtras = function () { $('exProcAuto').style.display = 'none'; $('ex_Cliente').value = ''; EX.forEach(function (k) { $('ex_' + k).value = ''; }); $('exTitulo').textContent = 'Extras do cliente no mês'; $('exCard').classList.remove('editing'); };
window.salvarExtras = function () {
  var o = {}; EX.forEach(function (k) { o[k] = $('ex_' + k).value; });
  acao('ctrlSalvarExtras', [compSel(), $('ex_Cliente').value, o], 'Extras salvos.').then(function () { fecharModal('md_ex'); limparExtras(); }, function () {});
};
window.renderHoras = function () {
  if (!$('hrTabela')) return;
  var comp = compSel(), mes = proxMes(comp), f = norm($('hrBusca').value);
  var l = D.consultivo.filter(function (c) { return c.Mes === mes && (norm(c.Cliente) + ' ' + norm(c.Tarefa) + ' ' + norm(c.Responsavel)).indexOf(f) > -1; }).sort(function (a, b) { return String(b.Data).localeCompare(a.Data) || String(a.Cliente).localeCompare(b.Cliente); });
  var P = paginar('hr', l);
  $('hrTabela').innerHTML = l.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Advogado</th><th>Tarefa</th><th>Tempo</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) { var id = esc(c.ID); return '<tr><td>' + fmtD(c.Data) + '</td><td class="cliente">' + esc(c.Cliente) + '</td><td>' + esc(c.Responsavel || '—') + '</td><td>' + esc(c.Tarefa) + '</td><td>' + hm(c.Duracao) + '</td><td class="acts">' +
      (c.Editavel ? acoes(null, "editarHoras('" + id + "')", "excluirHoras('" + id + "')") : '<span class="muted" style="font-size:11px" title="Importada pelo Financeiro antes da Controladoria">importada</span>') + '</td></tr>'; }).join('') + '</tbody></table>' + P.pager
    : vazio('Nenhuma tarefa em ' + mesNome(comp) + '.');
};
window.editarHoras = function (id) {
  var c = D.consultivo.filter(function (x) { return x.ID === id; })[0]; if (!c) return;
  $('hr_ID').value = id; $('hr_Cliente').value = c.Cliente; $('hr_Data').value = String(c.Data).slice(0, 10); $('hr_Responsavel').value = c.Responsavel || ''; $('hr_Tarefa').value = c.Tarefa; $('hr_Duracao').value = String(c.Duracao).replace(/:00$/, '');
  if ($('hr_Responsavel').value !== (c.Responsavel || '')) { var o = document.createElement('option'); o.textContent = c.Responsavel; $('hr_Responsavel').appendChild(o); $('hr_Responsavel').value = c.Responsavel; }
  $('hrTitulo').textContent = 'Editar tarefa'; $('hrBtn').textContent = 'Salvar alterações'; $('hrCancel').style.display = 'none'; abrirModal('md_hr');
};
window.limparHoras = function () {
  $('hr_ID').value = ''; $('hr_Tarefa').value = ''; $('hr_Duracao').value = '';
  $('hrTitulo').textContent = 'Incluir tarefa'; $('hrBtn').textContent = 'Incluir tarefa'; $('hrCancel').style.display = 'none';
};
window.novaTarefa = function () { limparHoras(); var c = compSel(); if ((hoje().slice(0, 7)) !== c) $('hr_Data').value = c + '-01'; abrirModal('md_hr'); };
window.salvarHoras = function () {
  var o = { Cliente: $('hr_Cliente').value, Data: $('hr_Data').value, Responsavel: $('hr_Responsavel').value, Tarefa: $('hr_Tarefa').value, Duracao: $('hr_Duracao').value }, id = $('hr_ID').value;
  (id ? acao('ctrlEditarHoras', [id, o], 'Tarefa atualizada.') : acao('ctrlLancarHoras', [o], 'Tarefa incluída.')).then(function () { fecharModal('md_hr'); limparHoras(); }, function () {});
};
window.excluirHoras = function (id) { if (confirm('Excluir esta tarefa?')) acao('ctrlExcluirHoras', [id], 'Tarefa excluída.'); };

/* ---------- férias (mesmas abas do CRM Financeiro) ---------- */
function ultimoPeriodo(nome) { var best = null; (D.feriasHistorico || []).forEach(function (h) { if (norm(h.Nome) !== norm(nome)) return; var f = isoData(h.Fim) || isoData(h.Inicio); if (f && (!best || f > best.f)) best = { f: f, t: fmtD(h.Inicio) + ' a ' + fmtD(h.Fim) }; }); return best ? best.t : '—'; }
function deFeriasAgora(nome) { var h0 = hoje(); return (D.feriasHistorico || []).some(function (h) { return norm(h.Nome) === norm(nome) && isoData(h.Inicio) <= h0 && isoData(h.Fim) >= h0; }); }
function badgeFerias(s) { var x = norm(s); var c = /goz|conclu/.test(x) ? 'ok' : /andamento|agend/.test(x) ? 'info' : /20\d\d/.test(x) ? 'incluso' : 'pend'; return '<span class="badge ' + c + '">' + esc(s || '—') + '</span>'; }
REND.fe = function () { renderFerias(); }; REND.fh = REND.fe;
function renderFerias() {
  var nomes = {}; (D.colaboradores || []).forEach(function (n) { nomes[n] = 1; }); D.ferias.forEach(function (f) { if (f.Nome) nomes[f.Nome] = 1; }); (D.feriasHistorico || []).forEach(function (f) { if (f.Nome) nomes[f.Nome] = 1; });
  $('dlColab').innerHTML = Object.keys(nomes).sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  var st = $('fe_Status'); if (!st.options.length) st.innerHTML = (D.listas.statusFerias || ['Pendente']).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
  var fb = norm(($('feBusca') || {}).value);
  var l = D.ferias.filter(function (f) { return norm(f.Nome).indexOf(fb) > -1; }).sort(function (a, b) { return (isoData(a.Vencimento) || '9999') .localeCompare(isoData(b.Vencimento) || '9999'); });
  var P = paginar('fe', l);
  $('feTabela').innerHTML = l.length ? '<table><thead><tr><th>Colaborador</th><th>Vencimento</th><th>Saldo</th><th>Último período tirado</th><th>Situação</th><th>Observações</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (f) { var sd = f.Saldo !== '' && f.Saldo != null && !isNaN(Number(f.Saldo)) ? Number(f.Saldo) + ' dia' + (Number(f.Saldo) === 1 ? '' : 's') : (f.Saldo || '—');
      return '<tr><td class="cliente">' + esc(f.Nome) + (deFeriasAgora(f.Nome) ? ' <span class="badge pend">de férias agora</span>' : '') + '</td><td>' + (f.Vencimento ? fmtD(f.Vencimento) : '—') + '</td><td>' + esc(sd) + '</td><td class="muted">' + ultimoPeriodo(f.Nome) + '</td><td>' + badgeFerias(f.Status) + '</td><td class="muted">' + esc(f.Obs || '') +
        '</td><td class="acts">' + acoes(null, "editarFerias('" + esc(f.ID) + "')", "excluirFerias('" + esc(f.ID) + "')") + '</td></tr>'; }).join('') + '</tbody></table>' + P.pager
    : vazio('Nenhuma férias programada.');
  var h = (D.feriasHistorico || []).filter(function (f) { return norm(f.Nome).indexOf(fb) > -1; }).sort(function (a, b) { return (isoData(b.Inicio) || '').localeCompare(isoData(a.Inicio) || ''); });
  $('fhTabela').innerHTML = '<div style="padding:16px 22px 4px"><b style="font-size:14px">Histórico de férias tiradas</b></div>' + (h.length ? (function () { var Q = paginar('fh', h); return '<table><thead><tr><th>Pessoa</th><th>Início</th><th>Fim</th><th>Dias</th><th>Observações</th><th></th></tr></thead><tbody>' +
    Q.itens.map(function (f) { return '<tr><td class="cliente">' + esc(f.Nome) + '</td><td>' + fmtD(f.Inicio) + '</td><td>' + fmtD(f.Fim) + '</td><td>' + esc(f.Dias || '—') + '</td><td class="muted">' + esc(f.Obs || '') +
      '</td><td class="acts">' + acoes(null, "editarHistorico('" + esc(f.ID) + "')", "excluirHistorico('" + esc(f.ID) + "')") + '</td></tr>'; }).join('') + '</tbody></table>' + Q.pager; })()
    : vazio('Nenhuma férias tirada registrada.'));
}
window.editarFerias = function (id) {
  var f = D.ferias.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!f) return;
  $('fe_ID').value = id; $('fe_Nome').value = f.Nome || ''; $('fe_Vencimento').value = isoData(f.Vencimento); $('fe_Saldo').value = f.Saldo === '' || f.Saldo == null ? '' : f.Saldo;
  if (f.Status && ![].some.call($('fe_Status').options, function (o) { return o.value === f.Status; })) { var o = document.createElement('option'); o.textContent = f.Status; $('fe_Status').appendChild(o); }
  $('fe_Status').value = f.Status || 'Pendente'; $('fe_Obs').value = f.Obs || '';
  $('feTitulo').textContent = 'Editar férias de ' + f.Nome; $('feBtn').textContent = 'Salvar alterações'; $('feCancel').style.display = 'none'; abrirModal('md_fe');
};
window.limparFerias = function () { ['ID', 'Nome', 'Vencimento', 'Saldo', 'Obs'].forEach(function (k) { $('fe_' + k).value = ''; }); $('fe_Status').value = 'Pendente'; $('feTitulo').textContent = 'Programar férias'; $('feBtn').textContent = 'Adicionar'; $('feCancel').style.display = 'none'; };
window.novaFerias = function () { limparFerias(); abrirModal('md_fe'); };
window.salvarFerias = function () {
  var o = { ID: $('fe_ID').value, Nome: $('fe_Nome').value, Vencimento: $('fe_Vencimento').value, Saldo: $('fe_Saldo').value, Status: $('fe_Status').value, Obs: $('fe_Obs').value };
  acao('ctrlSalvarFerias', [o], o.ID ? 'Férias atualizadas.' : 'Férias adicionadas.').then(function () { fecharModal('md_fe'); limparFerias(); }, function () {});
};
window.excluirFerias = function (id) { if (confirm('Excluir esta programação de férias?')) acao('ctrlExcluirFerias', [id], 'Excluído.'); };
window.editarHistorico = function (id) {
  var f = (D.feriasHistorico || []).filter(function (x) { return String(x.ID) === String(id); })[0]; if (!f) return;
  $('fh_ID').value = id; $('fh_Nome').value = f.Nome || ''; $('fh_Inicio').value = isoData(f.Inicio); $('fh_Fim').value = isoData(f.Fim); $('fh_Obs').value = f.Obs || '';
  $('fhTitulo').textContent = 'Editar férias tiradas'; $('fhBtn').textContent = 'Salvar alterações'; $('fhCancel').style.display = 'none'; abrirModal('md_fh');
};
window.limparHistorico = function () { ['ID', 'Nome', 'Inicio', 'Fim', 'Obs'].forEach(function (k) { $('fh_' + k).value = ''; }); $('fhTitulo').textContent = 'Registrar férias tiradas'; $('fhBtn').textContent = 'Adicionar ao histórico'; $('fhCancel').style.display = 'none'; };
window.novoHistorico = function () { limparHistorico(); abrirModal('md_fh'); };
window.salvarHistorico = function () {
  var o = { ID: $('fh_ID').value, Nome: $('fh_Nome').value, Inicio: $('fh_Inicio').value, Fim: $('fh_Fim').value, Obs: $('fh_Obs').value };
  acao('ctrlSalvarFeriasHistorico', [o], o.ID ? 'Histórico atualizado.' : 'Adicionado ao histórico.').then(function () { fecharModal('md_fh'); limparHistorico(); }, function () {});
};
window.excluirHistorico = function (id) { if (confirm('Excluir este registro do histórico?')) acao('ctrlExcluirFeriasHistorico', [id], 'Excluído.'); };

/* ---------- usuários (Admin) ---------- */
var USUARIOS = [];
REND.us = function () { renderUsuarios(); };
function renderUsuarios() {
  var P = paginar('us', USUARIOS);
  $('usTabela').innerHTML = '<table><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Ativo</th><th>Cadastrado por</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (u, i) { var fixo = /fixo/.test(u.CriadoPor || ''); var ix = USUARIOS.indexOf(u);
      return '<tr><td class="cliente">' + esc(u.Email) + '</td><td>' + esc(u.Nome) + '</td><td>' + esc(u.Perfil || (fixo ? 'Admin' : '')) + '</td><td>' + esc(u.Ativo) + '</td><td class="muted">' + esc(u.CriadoPor) + (u.DataCriacao ? ' · ' + fmtD(u.DataCriacao) : '') +
        '</td><td class="acts">' + (fixo ? '<span class="muted" style="font-size:11px">Admin fixo</span>' : acoes(null, 'editarUsuario(' + ix + ')', 'excluirUsuario(' + ix + ')')) + '</td></tr>'; }).join('') + '</tbody></table>' + P.pager;
}
function carregarUsuarios() { call('ctrlListarUsuarios').then(function (l) { USUARIOS = l; renderUsuarios(); }, function (e) { toast(e.message, true); }); }
window.editarUsuario = function (ix) { var u = USUARIOS[ix]; if (!u) return; $('us_Email').value = u.Email; $('us_Nome').value = u.Nome || ''; $('us_Perfil').value = u.Perfil || 'Controladoria'; $('us_Ativo').value = u.Ativo === 'Não' ? 'Não' : 'Sim'; window.scrollTo(0, 0); };
window.excluirUsuario = function (ix) { var u = USUARIOS[ix]; if (!u || !confirm('Excluir o acesso de ' + u.Email + '?')) return; call('ctrlExcluirUsuario', [u.Email]).then(function () { toast('Acesso excluído.'); carregarUsuarios(); }, function (e) { toast(e.message, true); }); };
window.salvarUsuario = function () {
  call('ctrlSalvarUsuario', [{ Email: $('us_Email').value, Nome: $('us_Nome').value, Perfil: $('us_Perfil').value, Ativo: $('us_Ativo').value }])
    .then(function () { toast('Acesso salvo.'); $('us_Email').value = ''; $('us_Nome').value = ''; carregarUsuarios(); }, function (e) { toast(e.message, true); });
};

/* ---------- relatório anual (pré-visualização editável + PowerPoint) ---------- */
function ed(k, v, tag, attrs) { tag = tag || 'span'; return '<' + tag + ' contenteditable="true" data-k="' + k + '"' + (attrs || '') + '>' + esc(v) + '</' + tag + '>'; }
function pct(a, t) { return t > 0 ? Math.round(a / t * 100) : 0; }
var CORES = ['#364B9B', '#23B9D6', '#141D3F', '#A9E3EF', '#F26A2E', '#2F8F5B', '#B3792A', '#7A8297'];
function conic(vals) { var t = vals.reduce(function (s, v) { return s + v; }, 0) || 1, acc = 0; return 'conic-gradient(' + vals.map(function (v, i) { var a = acc; acc += v / t * 100; return CORES[i % CORES.length] + ' ' + a + '% ' + acc + '%'; }).join(',') + ')'; }
// contratos do cliente escolhido: "Todos" ou um só (Assessoria mensal, DET, Pontual)
function preencherContratosRA() {
  var i = $('ra_Cliente'), s = $('ra_Contrato'), l = D.clientes.filter(function (c) { return norm(c.Nome) === norm(i.value); });
  s.innerHTML = '<option value="">' + (l.length > 1 ? 'Todos os contratos (' + l.length + ')' : 'Todos os contratos') + '</option>' +
    l.map(function (c) { return '<option value="' + esc(c.ID) + '">' + esc(rotuloContrato(c)) + (isAtivo(c) ? '' : ' (inativo)') + '</option>'; }).join('');
  s.disabled = l.length < 2;
}
(function () { var i = $('ra_Cliente'); if (!i) return; ['input', 'blur', 'cid'].forEach(function (ev) { i.addEventListener(ev, function () { setTimeout(preencherContratosRA, ev === 'blur' ? 160 : 0); }); }); })();
window.gerarRelatorio = function () {
  var cli = $('ra_Cliente').value; if (!cli) { toast('Escolha o cliente.', true); return; }
  $('raPrev').innerHTML = '<div class="card">Gerando…</div>';
  call('ctrlRelatorioAnualDados', [cli, $('ra_De').value, $('ra_Ate').value, $('ra_Contrato').value]).then(function (d) { RA = d; renderRelatorio(d); }, function (e) { $('raPrev').innerHTML = ''; toast(e.message, true); });
};
// Relatório de Gestão Jurídica: 8 partes, tudo editável na pré-visualização; o PowerPoint sai com o que estiver na tela.
function ph(k, v, txtPh, tag, attrs) { tag = tag || 'span'; return '<' + tag + ' contenteditable="true" data-k="' + k + '" data-ph="' + esc(txtPh || 'Clique para escrever…') + '"' + (attrs || '') + '>' + esc(v || '') + '</' + tag + '>'; }
var RA_CONS = 6, RA_PRI = 4;
// [sobrelinha, manchete, parte em destaque] de cada parte (mesmo texto na tela e no PowerPoint)
function raTitulos(ano) { return {
  2: ['O ano em números', 'O ano jurídico', 'em números.'],
  3: ['Proteção patrimonial', 'Exposição jurídica e', 'economia obtida.'],
  4: ['Perfil dos riscos', 'Onde estão os', 'riscos jurídicos.'],
  5: ['Atuação consultiva', 'Prevenção que apoia', 'decisões concretas.'],
  6: ['Dedicação', 'Acompanhamento jurídico', 'mês a mês.'],
  7: ['Prioridades ' + (+ano + 1), 'Do histórico ao', 'plano de ação.'],
  8: ['Próximo ciclo', 'Parceria e visão de', 'longo prazo.'] }; }
function raSec(n, T) { var t = T[n]; return '<div class="ra-sec"><div class="ra-eyebrow"><span>' + ('0' + n).slice(-2) + '</span>' + esc(t[0]) + '</div><h3 class="ra-h">' + esc(t[1]) + ' <em>' + esc(t[2]) + '</em></h3>'; }
function sugestoesPrioridades(d, areaTop, pctTop) {
  var l = [];
  if (/trabalh/i.test(areaTop) && pctTop >= 40) l.push(['Reduzir o passivo trabalhista', 'Revisar rotinas de RH: contratos, controle de jornada, pagamentos e desligamentos', 'RH do cliente com a DH LAW', 'Novas reclamatórias por trimestre']);
  else if (areaTop) l.push(['Reduzir as demandas da área ' + areaTop.toLowerCase(), 'Mapear a origem das ações e corrigir os procedimentos internos', 'Gestão do cliente com a DH LAW', 'Novas ações por trimestre']);
  l.push(['Acompanhar de perto os processos ativos', 'Reunião trimestral de andamento, riscos e provisões', 'DH LAW', 'Processos com decisão favorável (%)']);
  l.push(['Fortalecer a prevenção consultiva', 'Validar com o jurídico contratos e decisões relevantes antes de assinar', 'Diretoria com a DH LAW', 'Consultas preventivas por mês']);
  while (l.length < RA_PRI) l.push(['', '', '', '']);
  return l.slice(0, RA_PRI);
}
function renderRelatorio(d) {
  var areas = Object.keys(d.processos.porArea).sort(function (a, b) { return d.processos.porArea[b] - d.processos.porArea[a]; }), vals = areas.map(function (a) { return d.processos.porArea[a]; });
  var tot = d.processos.total || 0, e = d.economia, ano = String(d.ate).slice(0, 4);
  var horasTot = (d.horas.totalConsultivo || 0) + (d.horas.totalProcessual || 0);
  var areaTop = areas[0] || '', pctTop = pct(vals[0] || 0, tot), T = raTitulos(ano);
  var h = '<div class="card ra"><div class="ra-head"><h2 style="margin:0"><span class="t">Pré-visualização do relatório</span></h2><span class="edit-badge">' + ic('editar', 13) + ' Editável</span></div>' +
    '<p class="example-note" style="margin-top:-6px">Clique em qualquer texto ou número para ajustar. Os campos em cinza são para você completar. O PowerPoint sai exatamente com o que estiver aqui.</p>';
  // 1. capa
  h += '<div class="ra-capa"><img src="dh-logo.svg" alt="DH LAW"><div><div class="ra-kicker">Relatório de Gestão Jurídica</div>' +
    ed('titulo', 'Relatório de Gestão Jurídica ' + ano + ' — ' + d.cliente + (d.contrato && d.contrato !== 'Todos os contratos' ? ' (' + d.contrato + ')' : ''), 'div', ' class="ra-cap-t"') +
    ed('periodo', 'Período: ' + mesNome(d.de) + ' a ' + mesNome(d.ate), 'div', ' class="ra-cap-p"') + '<div class="ra-cap-f">Domingues &amp; Herold Advogados</div></div></div>';
  // 2. ano em números
  h += raSec(2, T) + '<div class="ra-kpis">' +
    '<div class="stat"><div class="lb">Processos ativos</div>' + ed('nAtivos', d.processos.ativos, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Novos no período</div>' + ed('nNovos', d.processos.novosNoPeriodo, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Arquivados no período</div>' + ed('nArq', d.processos.arquivadosNoPeriodo, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Audiências realizadas</div>' + ed('nAud', d.audiencias, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Trabalho jurídico registrado</div>' + ed('nHoras', decHm(horasTot), 'div', ' class="val"') + '</div></div></div>';
  // 3. proteção patrimonial
  h += raSec(3, T) + '<div class="ra-kpis">' +
    '<div class="stat"><div class="lb">Valor das causas</div>' + ed('eCausa', brl(e.valorCausa), 'div', ' class="val ra-money" style="font-size:17px"') + '</div>' +
    '<div class="stat"><div class="lb">Valores pagos (condenações e acordos)</div>' + ed('ePago', brl(e.pago), 'div', ' class="val ra-money" style="font-size:17px;color:var(--warn)"') + '</div>' +
    '<div class="stat"><div class="lb">Valores recebidos</div>' + ed('eRec', brl(e.recebido || 0), 'div', ' class="val ra-money" style="font-size:17px;color:var(--ok)"') + '</div>' +
    '<div class="stat"><div class="lb">Saving</div>' + ed('eSaving', brl(e.saving), 'div', ' class="val ra-money" style="font-size:17px;color:var(--ok)"') + '</div></div>' +
    '<p class="ra-narr" style="margin:-6px 0 0">Economia de ' + ed('ePct', String(e.percentual).replace('.', ',') + '%') + ' sobre o valor das causas dos processos com resultado.</p>' +
    '<div class="ra-lbl">O que isso significa</div>' + ed('eTexto', 'Os processos somam ' + brl(e.valorCausa) + ' em valor de causa, que é a exposição informada nas ações. Nos processos já resolvidos, o cliente pagou ' + brl(e.pago) + ' e recebeu ' + brl(e.recebido || 0) + ', o que representa uma economia de ' + brl(e.saving) + '.', 'div', ' class="ra-narr"') +
    '</div>';
  // 4. perfil dos riscos
  h += raSec(4, T) + '';
  if (areas.length) h += '<div class="donut-wrap"><div class="donut" style="background:' + conic(vals) + '"><b>' + tot + '<small>processos</small></b></div><div class="leg">' +
    areas.map(function (a, i) { return '<div><i style="background:' + CORES[i % CORES.length] + '"></i>' + ed('area' + i, a) + ': <b contenteditable="true" data-k="areaN' + i + '">' + vals[i] + '</b> (' + pct(vals[i], tot) + '%)</div>'; }).join('') + '</div></div>';
  h += ed('riscoTxt', areaTop ? 'A área ' + areaTop.toLowerCase() + ' concentra ' + pctTop + '% dos processos (' + (vals[0] || 0) + ' de ' + tot + '), sendo hoje a principal fonte de risco jurídico da empresa.' : 'Nenhum processo no período.', 'div', ' class="ra-narr"') +
    '<div class="ra-lbl">Fatores que originam as demandas</div>' + ph('riscoAnalise', '', 'Ex.: desligamentos sem documentação, horas extras, terceirizados, contratos com fornecedores…', 'div', ' class="ra-narr ra-edit"') + '</div>';
  // 5. atuação consultiva
  var temas = (d.consultoriasSugestao || []).slice(0, RA_CONS);
  h += raSec(5, T) + '<div class="tbl-wrap"><table class="ra-tab"><thead><tr><th>Tema</th><th>Problema enfrentado</th><th>Orientação prestada</th><th>Próximo cuidado recomendado</th></tr></thead><tbody>';
  for (var i = 0; i < RA_CONS; i++) h += '<tr><td>' + ph('ct' + i + 'a', temas[i] || '', 'Tema') + '</td><td>' + ph('ct' + i + 'b', '', 'Problema') + '</td><td>' + ph('ct' + i + 'c', '', 'Orientação') + '</td><td>' + ph('ct' + i + 'd', '', 'Próximo cuidado') + '</td></tr>';
  h += '</tbody></table></div><p class="ra-src">Os temas vieram das tarefas de consultivo lançadas no período. Linhas vazias não vão para o PowerPoint.</p></div>';
  // 6. dedicação
  var pico = d.horas.meses.slice().sort(function (a, b) { return (b.consultivo + b.processual) - (a.consultivo + a.processual); })[0];
  h += raSec(6, T) + '<div class="ra-kpis">' +
    '<div class="stat"><div class="lb">Consultivo</div>' + ed('hcT', decHm(d.horas.totalConsultivo), 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Processual</div>' + ed('hpT', decHm(d.horas.totalProcessual), 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Média mensal</div>' + ed('hMed', decHm((d.horas.mediaConsultivo || 0) + (d.horas.mediaProcessual || 0)), 'div', ' class="val"') + '</div></div>' +
    '<div class="tbl-wrap"><table id="raHoras"><thead><tr><th>Mês</th><th>Consultivo</th><th>Processual</th><th>Total</th></tr></thead><tbody>' +
    d.horas.meses.map(function (m, j) { return '<tr><td>' + mesNome(m.mes) + '</td><td>' + ed('hc' + j, decHm(m.consultivo)) + '</td><td>' + ed('hp' + j, decHm(m.processual)) + '</td><td>' + decHm(m.consultivo + m.processual) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="ra-lbl">Picos de atividade</div>' + ed('picoTxt', pico && (pico.consultivo + pico.processual) > 0 ? 'O maior volume de trabalho foi em ' + mesNome(pico.mes) + ', com ' + decHm(pico.consultivo + pico.processual) + ' registradas. ' : '', 'div', ' class="ra-narr"') +
    ph('picoMotivo', '', 'Explique o que motivou o pico (ex.: auditoria, reestruturação, audiências concentradas…)', 'div', ' class="ra-narr ra-edit"') +
    '<div class="ra-lbl">Principais entregas do período</div>' + ed('entregas', [].concat(d.consultoriasSugestao || []).slice(0, 5).concat((d.processualSugestao || []).slice(0, 3)).map(function (x) { return '• ' + x; }).join('\n') || '', 'div', ' class="ra-narr" style="white-space:pre-line"') + '</div>';
  // 7. prioridades
  var pr = sugestoesPrioridades(d, areaTop, pctTop);
  h += raSec(7, T) + '<div class="tbl-wrap"><table class="ra-tab"><thead><tr><th>Prioridade</th><th>Medida recomendada</th><th>Responsável</th><th>Indicador</th></tr></thead><tbody>' +
    pr.map(function (r, j) { return '<tr><td>' + ph('pr' + j + 'a', r[0], 'Prioridade') + '</td><td>' + ph('pr' + j + 'b', r[1], 'Medida') + '</td><td>' + ph('pr' + j + 'c', r[2], 'Responsável') + '</td><td>' + ph('pr' + j + 'd', r[3], 'Indicador') + '</td></tr>'; }).join('') +
    '</tbody></table></div><p class="ra-src">Sugestões a partir dos dados do período. Ajuste ou apague o que não fizer sentido.</p></div>';
  // 8. encerramento
  h += raSec(8, T) + '' + ed('encerra', 'Agradecemos a confiança da ' + d.cliente + ' ao longo de ' + ano + '. Seguimos comprometidos em proteger o patrimônio da empresa, antecipar riscos e apoiar cada decisão com segurança jurídica. No próximo ciclo, manteremos o acompanhamento próximo dos processos, a atuação preventiva no consultivo e a apresentação periódica dos resultados.', 'div', ' class="ra-narr"') +
    '<div class="ra-lbl">Próximo ciclo de acompanhamento</div>' + ph('proxCiclo', 'Reunião de alinhamento das prioridades de ' + (+ano + 1) + ' e relatórios trimestrais de acompanhamento.', 'Ex.: reunião em fevereiro e relatórios trimestrais', 'div', ' class="ra-narr ra-edit"') + '</div>';
  h += '<div class="btn-row"><button class="btn" onclick="exportarPptx()">' + ic('grafico') + ' Exportar PowerPoint</button><button class="btn ghost" onclick="gerarRelatorio()">Recarregar dados (desfaz ajustes)</button></div></div>';
  $('raPrev').innerHTML = h;
}
function val(k) { var e = document.querySelector('#raPrev [data-k="' + k + '"]'); return e ? e.innerText.trim() : ''; }
function horasNum(s) { var m = String(s).match(/(\d+)\s*h\s*(\d+)?/); if (m) return (+m[1]) + (+(m[2] || 0)) / 60; return hDec(s) || parseFloat(String(s).replace(',', '.')) || 0; }
var PPTX_LIB = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
function logoPng(cb) {
  // a logo em PNG de alta resolução, a partir do SVG oficial (o PowerPoint não lê SVG em todas as versões)
  var img = new Image(); img.onload = function () { try { var c = document.createElement('canvas'); c.width = 1018; c.height = 541; c.getContext('2d').drawImage(img, 0, 0, 1018, 541); cb(c.toDataURL("image/png").replace(/^data:/, "")); } catch (e) { cb(null); } };
  img.onerror = function () { cb(null); }; img.src = 'dh-logo.svg';
}
window.exportarPptx = function () {
  if (!window.PptxGenJS) {
    toast('Preparando o PowerPoint…');
    var sc = document.createElement('script'); sc.src = PPTX_LIB;
    sc.onload = function () { window.exportarPptx(); };
    sc.onerror = function () { toast('Não consegui carregar a biblioteca do PowerPoint (sem internet?). Tente de novo.', true); };
    document.head.appendChild(sc); return;
  }
  logoPng(function (LOGO) { montarPptx(LOGO); });
};
function fundoPng(claro) {
  // fundo escuro com brilho ciano, como as seções do site (o PowerPoint não tem gradiente radial)
  try {
    var c = document.createElement('canvas'); c.width = 1600; c.height = 900; var g = c.getContext('2d');
    g.fillStyle = claro ? '#F3F6F7' : '#05080B'; g.fillRect(0, 0, 1600, 900);
    if (!claro) {
      var r = g.createRadialGradient(1250, 120, 10, 1250, 120, 760); r.addColorStop(0, 'rgba(35,185,214,0.20)'); r.addColorStop(1, 'rgba(35,185,214,0)');
      g.fillStyle = r; g.fillRect(0, 0, 1600, 900);
      var r2 = g.createRadialGradient(200, 820, 10, 200, 820, 600); r2.addColorStop(0, 'rgba(35,185,214,0.08)'); r2.addColorStop(1, 'rgba(35,185,214,0)');
      g.fillStyle = r2; g.fillRect(0, 0, 1600, 900);
    }
    return c.toDataURL('image/png').replace(/^data:/, '');
  } catch (e) { return null; }
}
function montarPptx(LOGO) {
  var d = RA, ano = String(d.ate).slice(0, 4), T = raTitulos(ano);
  var NEG = '05080B', CIANO = '23B9D6', BR = 'F5F7F8', TX = 'C7D0D4', MUT = '93A0A6', CARD = '0C1D24', VERDE = '3DCB8B', LAR = 'F59A5B', F = 'Montserrat';
  var BG = fundoPng(false), BGC = fundoPng(true);
  var p = new PptxGenJS(); p.layout = 'LAYOUT_WIDE'; p.title = val('titulo');
  var nSlide = 1;
  function logo(s, x, y, w) { if (LOGO) s.addImage({ data: LOGO, x: x, y: y, w: w, h: w * 541 / 1018 }); else s.addImage({ path: 'logo-dh.png', x: x, y: y, w: w, h: w * 0.5, sizing: { type: 'contain', w: w, h: w * 0.5 } }); }
  function fundo(s, claro) { var b = claro ? BGC : BG; if (b) s.background = { data: b }; else s.background = { color: claro ? 'F3F6F7' : NEG }; }
  function base(num) {
    var s = p.addSlide(); fundo(s); nSlide++;
    var t = T[num];
    s.addShape(p.ShapeType.line, { x: 0.6, y: 0.62, w: 0.4, h: 0, line: { color: CIANO, width: 2 } });
    s.addText((('0' + num).slice(-2) + '  ·  ' + t[0]).toUpperCase(), { x: 1.1, y: 0.45, w: 8, h: 0.34, fontFace: F, fontSize: 10, bold: true, color: CIANO, charSpacing: 2 });
    s.addText([{ text: t[1] + ' ', options: { color: BR } }, { text: t[2], options: { color: CIANO } }], { x: 0.6, y: 0.85, w: 10.6, h: 0.85, fontFace: F, fontSize: 30, bold: true, fit: 'shrink' });
    logo(s, 11.8, 0.4, 1.1);
    s.addText(val('titulo'), { x: 0.6, y: 7.05, w: 10, h: 0.3, fontFace: F, fontSize: 8.5, color: '5F6D74' });
    s.addText(String(nSlide), { x: 12.2, y: 7.05, w: 0.6, h: 0.3, fontFace: F, fontSize: 8.5, color: '5F6D74', align: 'right' });
    return s;
  }
  function card(s, x, y, w, h) { s.addShape(p.ShapeType.roundRect, { x: x, y: y, w: w, h: h, rectRadius: 0.18, fill: { color: CARD }, line: { color: '1E5C6B', width: 1 } }); }
  function kpi(s, x, y, w, lb, v, cor, sz) {
    card(s, x, y, w, 1.45);
    s.addText(lb.toUpperCase(), { x: x + 0.2, y: y + 0.18, w: w - 0.4, h: 0.36, fontFace: F, fontSize: 8.5, bold: true, color: MUT, charSpacing: 1, valign: 'top' });
    s.addText(v, { x: x + 0.2, y: y + 0.6, w: w - 0.4, h: 0.65, fontFace: F, fontSize: sz || (v.length > 12 ? 18 : 26), bold: true, color: cor || BR, fit: 'shrink' });
  }
  function texto(s, t, x, y, w, hh, sz, extra) { if (!t) return; s.addText(t, Object.assign({ x: x, y: y, w: w, h: hh, fontFace: F, fontSize: sz || 14, color: TX, valign: 'top', paraSpaceAfter: 6 }, extra || {})); }
  function rotulo(s, t, x, y, w) { s.addText(t.toUpperCase(), { x: x, y: y, w: w || 6, h: 0.3, fontFace: F, fontSize: 9.5, bold: true, color: CIANO, charSpacing: 1.5 }); }
  function tabela(s, cab, linhas, y) {
    var rows = [cab.map(function (c) { return { text: c.toUpperCase(), options: { bold: true, color: CIANO, fill: { color: '0A1820' }, fontSize: 10 } }; })]
      .concat(linhas.map(function (l, i) { return l.map(function (c, j) { return { text: c || '', options: { color: j === 0 ? BR : TX, bold: j === 0, fill: { color: i % 2 ? '08141A' : '0C1D24' } } }; }); }));
    s.addTable(rows, { x: 0.6, y: y, w: 12.13, fontFace: F, fontSize: 12.5, rowH: 0.55, border: { type: 'solid', color: '1E3A44', pt: 0.75 }, valign: 'middle', margin: 0.08 });
  }
  var eixo = { catAxisLabelColor: MUT, valAxisLabelColor: MUT, valGridLine: { color: '1E3A44', size: 0.5 }, catAxisLineShow: false, valAxisLineShow: false, legendColor: TX, legendFontFace: F, catAxisLabelFontFace: F, valAxisLabelFontFace: F };
  // 1. capa (como a abertura do site)
  var c = p.addSlide(); fundo(c);
  logo(c, 0.7, 0.6, 1.9);
  c.addShape(p.ShapeType.line, { x: 0.7, y: 2.62, w: 0.45, h: 0, line: { color: CIANO, width: 2 } });
  c.addText('RELATÓRIO DE GESTÃO JURÍDICA  ·  ' + ano, { x: 1.25, y: 2.45, w: 10, h: 0.36, fontFace: F, fontSize: 11, bold: true, color: CIANO, charSpacing: 3 });
  c.addText(val('titulo'), { x: 0.7, y: 2.95, w: 11.8, h: 2.1, fontFace: F, fontSize: 40, bold: true, color: BR, valign: 'top', fit: 'shrink' });
  c.addShape(p.ShapeType.roundRect, { x: 0.7, y: 5.35, w: 4.6, h: 0.5, rectRadius: 0.25, fill: { color: NEG, transparency: 100 }, line: { color: CIANO, width: 1 } });
  c.addText(val('periodo'), { x: 0.7, y: 5.35, w: 4.6, h: 0.5, fontFace: F, fontSize: 12, color: 'DCE5E8', align: 'center', valign: 'middle' });
  c.addText('Domingues & Herold Advogados  ·  dhlaw.com.br', { x: 0.7, y: 6.75, w: 8, h: 0.35, fontFace: F, fontSize: 10, color: MUT });
  // 2. números
  var s2 = base(2);
  [['Processos ativos', 'nAtivos'], ['Novos no período', 'nNovos'], ['Arquivados no período', 'nArq'], ['Audiências realizadas', 'nAud'], ['Trabalho jurídico registrado', 'nHoras']].forEach(function (k, j) { kpi(s2, 0.6 + j * 2.45, 2.2, 2.3, k[0], val(k[1]), j === 4 ? CIANO : BR); });
  texto(s2, 'Um resumo executivo do período: volume de processos, movimentação no ano, audiências e dedicação da equipe ao cliente.', 0.6, 4.1, 12, 0.8, 14, { color: MUT });
  // 3. proteção patrimonial (seção clara, como no site)
  var s3 = p.addSlide(); fundo(s3, true); nSlide++;
  s3.addShape(p.ShapeType.line, { x: 0.6, y: 0.62, w: 0.4, h: 0, line: { color: CIANO, width: 2 } });
  s3.addText(('03  ·  ' + T[3][0]).toUpperCase(), { x: 1.1, y: 0.45, w: 8, h: 0.34, fontFace: F, fontSize: 10, bold: true, color: '1595AE', charSpacing: 2 });
  s3.addText([{ text: T[3][1] + ' ', options: { color: '0B1A20' } }, { text: T[3][2], options: { color: '1595AE' } }], { x: 0.6, y: 0.85, w: 10.6, h: 0.85, fontFace: F, fontSize: 30, bold: true });
  if (LOGO) { s3.addShape(p.ShapeType.roundRect, { x: 11.7, y: 0.32, w: 1.3, h: 0.82, rectRadius: 0.12, fill: { color: NEG } }); logo(s3, 11.8, 0.38, 1.1); }
  [['Valor das causas', 'eCausa', '0B1A20'], ['Valores pagos (condenações e acordos)', 'ePago', 'C2541C'], ['Valores recebidos', 'eRec', '1E8A5A'], ['Saving', 'eSaving', '1E8A5A']].forEach(function (k, j) {
    var x = 0.6 + j * 3.07; s3.addShape(p.ShapeType.roundRect, { x: x, y: 2.1, w: 2.92, h: 1.5, rectRadius: 0.18, fill: { color: 'FFFFFF' }, line: { color: 'D4DCDF', width: 1 } });
    s3.addText(k[0].toUpperCase(), { x: x + 0.2, y: 2.25, w: 2.55, h: 0.4, fontFace: F, fontSize: 8.5, bold: true, color: '5F6D74', valign: 'top' });
    s3.addText(val(k[1]), { x: x + 0.2, y: 2.75, w: 2.55, h: 0.65, fontFace: F, fontSize: 20, bold: true, color: k[2], fit: 'shrink' });
  });
  s3.addText('Economia de ' + val('ePct') + ' sobre o valor das causas dos processos com resultado', { x: 0.6, y: 3.8, w: 12, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: '1E8A5A' });
  s3.addText('O QUE ISSO SIGNIFICA', { x: 0.6, y: 4.45, w: 6, h: 0.3, fontFace: F, fontSize: 9.5, bold: true, color: '1595AE', charSpacing: 1.5 });
  texto(s3, val('eTexto'), 0.6, 4.8, 12.1, 1.9, 16, { color: '1F2D33' });
  s3.addText(val('titulo'), { x: 0.6, y: 7.05, w: 10, h: 0.3, fontFace: F, fontSize: 8.5, color: '93A0A6' });
  s3.addText(String(nSlide), { x: 12.2, y: 7.05, w: 0.6, h: 0.3, fontFace: F, fontSize: 8.5, color: '93A0A6', align: 'right' });
  // 4. riscos
  var s4 = base(4);
  var areas = [], nums = [], i = 0;
  while (document.querySelector('#raPrev [data-k="area' + i + '"]')) { areas.push(val('area' + i)); nums.push(parseFloat(val('areaN' + i)) || 0); i++; }
  if (areas.length) s4.addChart(p.ChartType.doughnut, [{ name: 'Processos por área', labels: areas, values: nums }], Object.assign({ x: 0.5, y: 1.9, w: 6.0, h: 4.9, holeSize: 62, showLegend: true, legendPos: 'b', legendFontSize: 12, showPercent: true, dataLabelColor: 'FFFFFF', chartColors: [CIANO, '364B9B', '1E5C6B', 'A9E3EF', 'F59A5B', '3DCB8B', '7A8297'] }, eixo));
  card(s4, 6.9, 1.95, 5.85, 4.85);
  texto(s4, val('riscoTxt'), 7.15, 2.15, 5.35, 1.6, 17, { bold: true, color: BR });
  rotulo(s4, 'Fatores que originam as demandas', 7.15, 3.85, 5.3); texto(s4, val('riscoAnalise') || '—', 7.15, 4.2, 5.35, 2.4, 13);
  // 5. consultivo
  var linC = []; for (i = 0; i < RA_CONS; i++) { var r = [val('ct' + i + 'a'), val('ct' + i + 'b'), val('ct' + i + 'c'), val('ct' + i + 'd')]; if (r.some(Boolean)) linC.push(r); }
  var s5 = base(5);
  if (linC.length) tabela(s5, ['Tema', 'Problema enfrentado', 'Orientação prestada', 'Próximo cuidado recomendado'], linC, 2.0); else texto(s5, 'Sem consultorias registradas no período.', 0.6, 2.1, 12, 1, 14);
  // 6. dedicação
  var s6 = base(6);
  var labs = d.horas.meses.map(function (m) { return mesNome(m.mes); });
  var hc = d.horas.meses.map(function (m, j) { return Math.round(horasNum(val('hc' + j)) * 100) / 100; }), hp = d.horas.meses.map(function (m, j) { return Math.round(horasNum(val('hp' + j)) * 100) / 100; });
  s6.addChart(p.ChartType.bar, [{ name: 'Consultivo', labels: labs, values: hc }, { name: 'Processual', labels: labs, values: hp }], Object.assign({ x: 0.4, y: 1.9, w: 7.4, h: 5.0, barGrouping: 'stacked', barGapWidthPct: 60, chartColors: [CIANO, '364B9B'], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 9, valAxisLabelFontSize: 9 }, eixo));
  kpi(s6, 8.1, 1.95, 1.5, 'Consultivo', val('hcT'), null, 19); kpi(s6, 9.67, 1.95, 1.5, 'Processual', val('hpT'), null, 19); kpi(s6, 11.24, 1.95, 1.5, 'Média/mês', val('hMed'), CIANO, 19);
  rotulo(s6, 'Picos de atividade', 8.1, 3.6, 4.6); texto(s6, [val('picoTxt'), val('picoMotivo')].filter(Boolean).join(' '), 8.1, 3.95, 4.65, 1.2, 12);
  rotulo(s6, 'Principais entregas', 8.1, 5.15, 4.6); texto(s6, val('entregas'), 8.1, 5.5, 4.65, 1.5, 11);
  // 7. prioridades
  var linP = []; for (i = 0; i < RA_PRI; i++) { var q = [val('pr' + i + 'a'), val('pr' + i + 'b'), val('pr' + i + 'c'), val('pr' + i + 'd')]; if (q.some(Boolean)) linP.push(q); }
  var s7 = base(7);
  if (linP.length) tabela(s7, ['Prioridade', 'Medida recomendada', 'Responsável', 'Indicador de acompanhamento'], linP, 2.0);
  // 8. encerramento (como o "próximo passo" do site)
  var s8 = p.addSlide(); fundo(s8); nSlide++;
  logo(s8, 5.9, 0.7, 1.55);
  s8.addText(('08  ·  ' + T[8][0]).toUpperCase(), { x: 0.6, y: 1.75, w: 12.1, h: 0.34, fontFace: F, fontSize: 10, bold: true, color: CIANO, charSpacing: 2, align: 'center' });
  s8.addText([{ text: T[8][1] + ' ', options: { color: BR } }, { text: T[8][2], options: { color: CIANO } }], { x: 0.6, y: 2.1, w: 12.1, h: 0.9, fontFace: F, fontSize: 32, bold: true, align: 'center' });
  s8.addText(val('encerra'), { x: 1.4, y: 3.15, w: 10.5, h: 2.1, fontFace: F, fontSize: 15, color: TX, align: 'center', valign: 'top', fit: 'shrink' });
  if (val('proxCiclo')) { s8.addShape(p.ShapeType.roundRect, { x: 2.6, y: 5.5, w: 8.1, h: 0.75, rectRadius: 0.37, fill: { color: CIANO } }); s8.addText(val('proxCiclo'), { x: 2.7, y: 5.5, w: 7.9, h: 0.75, fontFace: F, fontSize: 12.5, bold: true, color: '031014', align: 'center', valign: 'middle', fit: 'shrink' }); }
  s8.addText('Domingues & Herold Advogados  ·  dhlaw.com.br', { x: 0.6, y: 6.85, w: 12.1, h: 0.3, fontFace: F, fontSize: 9.5, color: MUT, align: 'center' });
  var nome = 'Relatorio_Gestao_Juridica_' + d.cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_') + '_' + d.de + '_a_' + d.ate + '.pptx';
  p.writeFile({ fileName: nome }).then(function () { toast('PowerPoint gerado: ' + nome); }, function (e) { toast('Falha ao gerar o PowerPoint: ' + e.message, true); });
}

/* ---------- início ---------- */
document.addEventListener('crm:perfil', function (ev) {
  PERFIL = ev.detail || {};
  $('whoPerfil').textContent = ' · perfil ' + PERFIL.perfil;
  if (PERFIL.perfil !== 'Controladoria') $('sideBack').style.display = 'block';
  montarMenu(); wireClientPicker(document);
  goTab((location.hash || '#painel').slice(1));
});
document.querySelectorAll('[data-ico]').forEach(function (b) { b.insertAdjacentHTML('afterbegin', ic(b.getAttribute('data-ico')) + ' '); });
montarMenu(); wireClientPicker(document);
if (!(window.CRM_SHIM && window.CRM_SHIM.modoCliente)) {
  $('loading').innerHTML = '<b>A Controladoria só funciona com o servidor ligado.</b><br><span style="font-size:13px">Falta preencher BACKEND_API em config.js (veja o LEIA-ME-CONTROLADORIA).</span>';
} else {
  carregar().catch(function (e) { if (window.console) console.error(e); if ($('loading').textContent === 'Carregando...') $('loading').textContent = 'Erro ao abrir: ' + (e && e.message || e); });
}
})();
