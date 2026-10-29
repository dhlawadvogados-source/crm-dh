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
function abrirModal(id) { $(id).classList.add('on'); document.body.style.overflow = 'hidden'; var f = $(id).querySelector('input:not([type=hidden]):not([type=file]),select,textarea'); if (f && id !== 'md_ver') setTimeout(function () { try { f.focus(); } catch (e) {} }, 60); }
window.fecharModal = function (id) { $(id).classList.remove('on'); if (!document.querySelector('.mbg.on')) document.body.style.overflow = ''; };
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var abertos = document.querySelectorAll('.mbg.on'); if (abertos.length) fecharModal(abertos[abertos.length - 1].id); } });
function ib(icone, titulo, onclick, cls) { return '<button class="ib' + (cls ? ' ' + cls : '') + '" title="' + titulo + '" onclick="' + onclick + '">' + icone + '</button>'; }
function acoes(ver, editar, excluir) { return (ver ? ib(ic('ver'), 'Visualizar', ver) : '') + (editar ? ib(ic('editar'), 'Editar', editar) : '') + (excluir ? ib(ic('excluir'), 'Excluir', excluir, 'red') : ''); }
function isoData(v) { var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; }

/* ---------- menu ---------- */
var ICONS = {
  painel: '<path d="M3 10.8 12 3l9 7.8"/><path d="M5 9.6V21h14V9.6"/>',
  clientes: '<rect x="5.5" y="3" width="13" height="18" rx="2.2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  processos: '<path d="M4.5 20V10.5M10 20V4M15.5 20v-7M21 20H3"/>',
  custas: '<path d="M12 3v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 21h15"/>',
  horas: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  relatorio: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8 13v4M12 10v7M16 13.5v3.5"/>',
  ferias: '<path d="M12 3v9"/><path d="M12 12c-4 0-7 2.5-7 6h14c0-3.5-3-6-7-6z"/><path d="M12 12c0-4 3-7 7-7"/>',
  usuarios: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.6 2.8-5.6 6.2-5.6s6.2 2 6.2 5.6"/><path d="M16 4.8a3.2 3.2 0 0 1 0 6.3M18.4 14.6c1.8.7 2.8 2.4 2.8 4.9"/>'
};
var TABS = [['painel', 'Painel'], ['clientes', 'Clientes'], ['processos', 'Processos'], ['custas', 'Custas e audiências'], ['horas', 'Fechamento do mês'], ['relatorio', 'Relatório Anual'], ['ferias', 'Férias']];
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
function isAtivo(c) { var s = norm(c.Status); return s.indexOf('ativo') >= 0 && s.indexOf('inativo') < 0; }
function wireClientPicker(root) {
  root.querySelectorAll('.cp').forEach(function (cp) {
    if (cp.dataset.wired) return; cp.dataset.wired = '1';
    var inp = cp.querySelector('input'), list = cp.querySelector('.cp-list');
    function render(f) {
      f = norm(f);
      var m = nomesClientes().filter(function (c) { return norm(c.Nome).indexOf(f) > -1; }).slice(0, 60);
      list.innerHTML = m.length ? m.map(function (c) { return '<div data-n="' + esc(c.Nome) + '">' + esc(c.Nome) + (isAtivo(c) ? '' : ' <span class="muted">(inativo)</span>') + '</div>'; }).join('')
        : '<div class="cp-empty">Nenhum cliente cadastrado com esse nome</div>';
      list.querySelectorAll('div[data-n]').forEach(function (it) { it.onmousedown = function (e) { e.preventDefault(); inp.value = it.dataset.n; cp.classList.remove('open'); inp.dispatchEvent(new Event('blur')); }; });
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
    if (!$('cuMes').value) $('cuMes').value = mesAtual();
    if (!$('ra_De').value) { var y = +hoje().slice(0, 4); $('ra_De').value = y + '-01'; $('ra_Ate').value = mesAtual(); }
    ['cu_Data', 'hr_Data'].forEach(function (id) { if (!$(id).value) $(id).value = hoje(); });
    $('cu_Categoria').innerHTML = D.listas.categoriasCusta.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    selAdvogados('pr_AdvogadoResponsavel', '(escolha)'); selAdvogados('hr_Responsavel', '(escolha)');
    renderTudo();
    $('loading').style.display = 'none'; $('app').style.display = 'block';
  }, function (e) { $('loading').textContent = 'Erro ao carregar: ' + e.message; throw e; });
}
function renderTudo() { renderPainel(); renderClientes(); renderProcessos(); renderCustas(); renderResumo(); renderHoras(); renderFerias(); }

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
    '<div class="stat' + (aguard ? ' warn' : '') + '"><div class="lb">Custas aguardando sincronizar</div><div class="val">' + aguard + '</div><div class="hint">vão para o Receber ao sincronizar</div></div>' +
    '<div class="stat' + (sinc.pendente || (!sinc.ultima && sinc.ultimaAlteracao) ? ' warn' : '') + '"><div class="lb">Sincronização</div><div class="val" style="font-size:17px">' + (sinc.ultima ? (sinc.pendente ? 'Pendente' : 'Em dia') : (sinc.ultimaAlteracao ? 'Pendente' : '—')) + '</div><div class="hint">' + (sinc.ultima ? 'última: ' + fmtCarimbo(sinc.ultima) : 'ainda não sincronizado') + '</div></div>';
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
window.renderClientes = function () {
  var f = norm($('clBusca').value), soAt = $('clStatus').value === 'ativos';
  var l = nomesClientes().filter(function (c) { return (!soAt || isAtivo(c)) && norm(c.Nome).indexOf(f) > -1; });
  var P = paginar('cli', l);
  $('clTabela').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Modalidade</th><th>Situação</th><th>Horas/mês</th><th>Responsável</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (c) { var id = esc(c.ID); var ct = hDec(c.HorasContratadas);
      return '<tr><td class="cliente">' + esc(c.Nome) + '</td><td>' + esc(c.Tipo || '—') + '</td><td>' + badgeStatus(isAtivo(c) ? 'Ativo' : (c.Status || '—')) + '</td><td>' + (ct ? decHm(ct) : '—') + '</td><td>' + esc(c.Responsavel || '—') +
        '</td><td class="acts">' + acoes("verCliente('" + id + "')", "editarCliente('" + id + "')", "excluirCliente('" + id + "')") + '</td></tr>'; }).join('') + '</tbody></table>' + P.pager
    : vazio('Nenhum cliente encontrado.');
};
var CL = ['Nome', 'Tipo', 'Status', 'HorasContratadas', 'ProcessosContratados', 'Responsavel', 'Subtipo', 'DataInicio', 'DataFim'];
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
  var r = RESUMO && RESUMO.clientes.filter(function (x) { return norm(x.cliente) === norm(c.Nome); })[0];
  var aguard = D.custas.filter(function (x) { return norm(x.Cliente) === norm(c.Nome) && x.Status === 'Lançado'; }).length;
  var h = '<div class="ficha">' + campoFicha('Modalidade', esc(c.Tipo)) + campoFicha('Situação', badgeStatus(isAtivo(c) ? 'Ativo' : (c.Status || '—'))) + campoFicha('Responsável', esc(c.Responsavel)) +
    campoFicha('Horas contratadas/mês', hDec(c.HorasContratadas) ? decHm(hDec(c.HorasContratadas)) : '') + campoFicha('Processos contratados', esc(c.ProcessosContratados)) + campoFicha('Subtipo', esc(c.Subtipo)) +
    campoFicha('Início do contrato', c.DataInicio ? fmtD(c.DataInicio) : '') + campoFicha('Fim do contrato', c.DataFim ? fmtD(c.DataFim) : '') + '</div>';
  if (r) h += '<div class="ficha-sec">Fechamento de ' + mesNome(RESUMO.competencia) + '</div><div class="ficha">' + campoFicha('Consultivo', hm(r.consultivo) + ' (' + r.tarefas + ' tarefas)') + campoFicha('Uso do pacote', r.percentual != null ? r.percentual + '%' : '') +
    campoFicha('Excedente', r.excedenteDec > 0 ? '<b style="color:var(--dh-laranja)">' + hm(r.excedente) + '</b>' : '') + campoFicha('Processual', r.horasProcessual ? hm(r.horasProcessual) : '') + '</div>';
  h += '<div class="ficha-sec">Processos (' + ativos.length + ' ativo(s) de ' + procs.length + ')</div>' + (procs.length ? '<table><tbody>' + procs.slice(0, 8).map(function (p) { return '<tr><td>' + esc(p.NumeroCNJ || '(sem número)') + (p.Partes ? '<br><span class="muted">' + esc(p.Partes) + '</span>' : '') + '</td><td>' + esc(p.AreaJuridica || '') + '</td><td>' + badgeStatus(p.Situacao) + '</td></tr>'; }).join('') + '</tbody></table>' + (procs.length > 8 ? '<p class="example-note">… e mais ' + (procs.length - 8) + ' na tela Processos.</p>' : '') : '<p class="muted" style="font-size:13px">Nenhum processo cadastrado.</p>');
  if (aguard) h += '<p class="example-note" style="margin-top:12px">' + aguard + ' custa(s)/audiência(s) aguardando sincronizar.</p>';
  h += '<div class="btn-row" style="margin-top:16px"><button class="btn" onclick="editarCliente(\'' + esc(c.ID) + '\')">' + ic('editar') + ' Editar cliente</button><button class="btn ghost" onclick="fecharModal(\'md_ver\')">Fechar</button></div>';
  $('verTitulo').textContent = c.Nome; $('verCorpo').innerHTML = h; abrirModal('md_ver');
};

/* ---------- processos ---------- */
var PR = ['Cliente', 'NumeroCNJ', 'Partes', 'Vara', 'AreaJuridica', 'AdvogadoResponsavel', 'ValorCausa', 'CondenacaoAcordo', 'ValoresRecebidos', 'Saving', 'Classificacao', 'Situacao', 'DataInicio', 'DataEncerramento', 'SituacaoAtualizada'];
REND.pr = function () { renderProcessos(); };
window.renderProcessos = function () {
  var f = norm($('prBusca').value), st = $('prFiltro').value;
  var l = D.processos.filter(function (p) { return (!st || p.Situacao === st) && (norm(p.Cliente) + ' ' + norm(p.NumeroCNJ) + ' ' + norm(p.Partes)).indexOf(f) > -1; })
    .sort(function (a, b) { return String(a.Cliente).localeCompare(b.Cliente); });
  var P = paginar('pr', l);
  $('prTabela').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Nº / partes</th><th>Área</th><th>Valor da causa</th><th>Situação</th><th></th></tr></thead><tbody>' +
    P.itens.map(function (p) { var id = esc(p.ID);
      return '<tr><td class="cliente">' + esc(p.Cliente) + '</td><td>' + esc(p.NumeroCNJ || '—') + (p.Partes ? '<br><span class="muted">' + esc(p.Partes) + '</span>' : '') + '</td><td>' + esc(p.AreaJuridica || '—') +
        '</td><td class="money">' + (p.ValorCausa !== '' ? brl(p.ValorCausa) : '—') + '</td><td>' + badgeStatus(p.Situacao) + (p.Classificacao === 'Extra' ? ' <span class="badge extra">extra</span>' : '') +
        '</td><td class="acts">' + acoes("verProcesso('" + id + "')", "editarProcesso('" + id + "')", "excluirProcesso('" + id + "')") + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager : vazio('Nenhum processo ' + (st === 'Ativo' ? 'ativo ' : st === 'Arquivado' ? 'arquivado ' : '') + 'encontrado.');
};
window.verProcesso = function (id) {
  var p = D.processos.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!p) return;
  function v(x) { return x !== '' && x != null ? brl(x) : ''; }
  var h = '<div class="ficha">' + campoFicha('Cliente', esc(p.Cliente)) + campoFicha('Nº do processo', esc(p.NumeroCNJ)) + campoFicha('Partes', esc(p.Partes)) + campoFicha('Vara', esc(p.Vara)) +
    campoFicha('Área jurídica', esc(p.AreaJuridica)) + campoFicha('Advogado responsável', esc(p.AdvogadoResponsavel)) + campoFicha('Situação', badgeStatus(p.Situacao)) + campoFicha('Classificação', esc(p.Classificacao || 'Incluso')) +
    campoFicha('Início', p.DataInicio ? fmtD(p.DataInicio) : '') + campoFicha('Encerramento', p.DataEncerramento ? fmtD(p.DataEncerramento) : '') + '</div>' +
    '<div class="ficha-sec">Valores</div><div class="ficha">' + campoFicha('Valor da causa', v(p.ValorCausa)) + campoFicha('Condenação / acordo', v(p.CondenacaoAcordo)) + campoFicha('Valores recebidos', v(p.ValoresRecebidos)) + campoFicha('Saving', v(p.Saving)) + '</div>' +
    '<div class="ficha-sec">Andamento</div><p style="font-size:13px;margin:0">' + esc(p.SituacaoAtualizada || '—') + '</p>' +
    '<div class="btn-row" style="margin-top:16px"><button class="btn" onclick="editarProcesso(\'' + esc(p.ID) + '\')">' + ic('editar') + ' Editar processo</button><button class="btn ghost" onclick="fecharModal(\'md_ver\')">Fechar</button></div>';
  $('verTitulo').textContent = 'Processo ' + (p.NumeroCNJ || ''); $('verCorpo').innerHTML = h; abrirModal('md_ver');
};
window.novoProcesso = function () { limparProcesso(); abrirModal('md_pr'); };
window.editarProcesso = function (id) {
  var p = D.processos.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!p) return;
  fecharModal('md_ver');
  $('pr_ID').value = id; PR.forEach(function (k) { var e = $('pr_' + k); if (!e) return; var x = p[k] == null ? '' : p[k]; if (/^Data/.test(k)) x = isoData(x); else if (/^Valor|Condenacao|Saving/.test(k) && x !== '') x = moneyN(x).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); e.value = x; });
  $('pr_Classificacao').value = p.Classificacao === 'Extra' ? 'Extra' : 'Incluso';
  $('prTitulo').textContent = 'Editar processo'; $('prBtn').textContent = 'Salvar alterações'; $('prCancel').style.display = 'none'; abrirModal('md_pr');
};
window.limparProcesso = function () {
  $('pr_ID').value = ''; PR.forEach(function (k) { var e = $('pr_' + k); if (e && e.tagName !== 'SELECT') e.value = ''; });
  $('pr_Situacao').value = 'Ativo'; $('pr_Classificacao').value = 'Incluso'; $('pr_AdvogadoResponsavel').value = '';
  $('prTitulo').textContent = 'Novo processo'; $('prBtn').textContent = 'Registrar processo'; $('prCancel').style.display = 'none';
};
window.salvarProcesso = function () {
  var o = {}; PR.forEach(function (k) { o[k] = $('pr_' + k).value; }); if ($('pr_ID').value) o.ID = $('pr_ID').value;
  acao('ctrlSalvarProcesso', [o], o.ID ? 'Processo atualizado.' : 'Processo registrado.').then(function () { fecharModal('md_pr'); limparProcesso(); }, function () {});
};
window.excluirProcesso = function (id) { if (confirm('Excluir este processo? (Se ele só terminou, prefira mudar a situação para "Arquivado".)')) acao('ctrlExcluirProcesso', [id], 'Processo excluído.'); };

/* ---------- custas ---------- */
REND.cu = function () { renderCustas(); };
window.renderCustas = function () {
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
      return '<tr><td>' + fmtD(c.Data) + '</td><td class="cliente">' + esc(c.Cliente) + '</td><td>' + esc(c.Descricao) + '<br><span class="muted">' + esc(c.Categoria) + (c.Cobravel !== 'Sim' ? ' · não cobrar' : '') + '</span>' + (/^https?:\/\//i.test(c.DocumentoLink || '') ? ' <a class="lnk" target="_blank" rel="noopener" href="' + esc(c.DocumentoLink) + '">comprovante</a>' : '') +
        '</td><td class="money">' + (moneyN(c.Valor) ? brl(c.Valor) : '<span class="muted">valor do contrato</span>') + '</td><td>' + stTxt + '</td><td class="acts">' +
        (st !== 'Recebido' ? acoes(null, "editarCusta('" + id + "')", "excluirCusta('" + id + "')") : '') + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager + '<div class="pager" style="justify-content:space-between"><b style="color:var(--ink)">Total a cobrar' + (mes ? ' em ' + mesNome(mes) : '') + '</b><b style="color:var(--ink)">' + brl(tot) + '</b></div>'
    : vazio('Nenhum lançamento' + (mes ? ' em ' + mesNome(mes) : '') + '.');
};
var CU = ['Cliente', 'ProcessoID', 'Categoria', 'Data', 'Valor', 'Cobravel', 'Descricao', 'DocumentoLink'];
window.novaCusta = function () { limparCusta(); abrirModal('md_cu'); };
window.editarCusta = function (id) {
  var c = D.custas.filter(function (x) { return String(x.ID) === String(id); })[0]; if (!c) return;
  $('cu_ID').value = id; $('cu_Cliente').value = c.Cliente; preencherSelProc('cu_ProcessoID', c.Cliente, c.ProcessoID);
  ['Categoria', 'Data', 'Cobravel', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = c[k] || ''; });
  $('cu_Data').value = isoData(c.Data); $('cu_Valor').value = moneyN(c.Valor) ? moneyN(c.Valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  $('cuTitulo').textContent = 'Editar lançamento'; $('cuBtn').textContent = 'Salvar alterações'; $('cuCancel').style.display = 'none'; abrirModal('md_cu');
};
window.limparCusta = function () {
  $('cu_ID').value = ''; ['Cliente', 'Valor', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = ''; }); $('cu_Cobravel').value = 'Sim'; $('cu_Data').value = hoje(); preencherSelProc('cu_ProcessoID', '', '');
  $('cuTitulo').textContent = 'Nova custa / audiência'; $('cuBtn').textContent = 'Lançar'; $('cuCancel').style.display = 'none';
};
window.salvarCusta = function () {
  var o = {}; CU.forEach(function (k) { o[k] = $('cu_' + k).value; }); var id = $('cu_ID').value;
  (id ? acao('ctrlEditarCusta', [id, o], 'Lançamento atualizado. Lembre de sincronizar.') : acao('ctrlLancarCusta', [o], o.Cobravel === 'Sim' ? 'Lançado. Vai para o Receber do mês seguinte quando você sincronizar.' : 'Lançado (sem cobrança).'))
    .then(function () { fecharModal('md_cu'); limparCusta(); }, function () {});
};
window.excluirCusta = function (id) { if (confirm('Excluir este lançamento?\n\nSe ele já foi sincronizado, sai do Receber na próxima sincronização.')) acao('ctrlExcluirCusta', [id], 'Lançamento excluído. Lembre de sincronizar.'); };
window.cancelarCusta = window.excluirCusta;

/* ---------- fechamento do mês ---------- */
function compSel() { return $('hrMes').value || compPadrao(); }
// até o dia 7 a Controladoria normalmente ainda está fechando o mês anterior
function compPadrao() { var d = hoje(), ym = d.slice(0, 7); if (+d.slice(8, 10) <= 7) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1; if (m < 1) { m = 12; y--; } ym = y + '-' + ('0' + m).slice(-2); } return ym; }
function proxMes(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + '-' + ('0' + m).slice(-2); }
function fmtCarimbo(s) { if (!s) return ''; var d = new Date(s); if (isNaN(d)) return esc(s); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' às ' + ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2); }
function renderResumo() {
  if (!RESUMO) return;
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
        '</td><td>' + (aud || '—') + '</td><td>' + (c.excessoProcessos || '—') + (c.processosContratados ? ' <span class="muted" title="processos contratados no contrato">(contr. ' + c.processosContratados + ')</span>' : '') +
        '</td><td class="money">' + (custas ? brl(custas) : '—') + '</td><td class="acts">' + (c.travado || !c.cadastrado ? '' : acoes(null, 'editarExtras(' + ix + ')', (c.horasProcessual || c.audienciasPlanilha || c.excessoProcessos || c.custasPlanilha) ? 'excluirExtras(' + ix + ')' : null)) + '</td></tr>';
    }).join('') + '</tbody></table>' + P.pager : vazio('Nada lançado em ' + mesNome(comp) + ' ainda. Suba a planilha ou inclua tarefas abaixo.')) +
    (semNada ? '<p class="example-note" style="margin:10px 0 0">' + semNada + ' cliente(s) com contrato mensal ainda sem nada lançado neste mês.</p>' : '');
}
REND.fc = function () { renderResumo(); }; REND.hr = function () { renderHoras(); };
function carregarResumo() { return call('ctrlResumoFechamento', [compSel()]).then(function (r) { RESUMO = r; renderResumo(); renderHoras(); renderPainel(); }, function (e) { toast(e.message, true); }); }
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
  $('ex_DescricaoAudiencias').value = c.descricaoAudiencias || ''; $('ex_ExcessoProcessos').value = c.excessoProcessos || '';
  $('ex_Custas').value = c.custasPlanilha ? moneyN(c.custasPlanilha).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''; $('ex_DescricaoCustas').value = c.descricaoCustas || '';
  $('exTitulo').textContent = 'Extras de ' + c.cliente + ' em ' + mesNome(compSel()); abrirModal('md_ex');
};
window.novoExtras = function () { limparExtras(); $('exTitulo').textContent = 'Extras de um cliente em ' + mesNome(compSel()); abrirModal('md_ex'); };
window.excluirExtras = function (ix) { var c = window._RL[ix]; if (!c || !confirm('Apagar os extras (horas processuais, audiências, processos e custas da planilha) de ' + c.cliente + ' em ' + mesNome(compSel()) + '?\n\nAs custas lançadas na tela de Custas continuam.')) return; acao('ctrlExcluirExtras', [compSel(), c.cliente], 'Extras apagados. Lembre de sincronizar.'); };
window.limparExtras = function () { $('ex_Cliente').value = ''; EX.forEach(function (k) { $('ex_' + k).value = ''; }); $('exTitulo').textContent = 'Extras do cliente no mês'; $('exCard').classList.remove('editing'); };
window.salvarExtras = function () {
  var o = {}; EX.forEach(function (k) { o[k] = $('ex_' + k).value; });
  acao('ctrlSalvarExtras', [compSel(), $('ex_Cliente').value, o], 'Extras salvos. Lembre de sincronizar.').then(function () { fecharModal('md_ex'); limparExtras(); }, function () {});
};
window.renderHoras = function () {
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
  (id ? acao('ctrlEditarHoras', [id, o], 'Tarefa atualizada. Lembre de sincronizar.') : acao('ctrlLancarHoras', [o], 'Tarefa incluída. Lembre de sincronizar.')).then(function () { fecharModal('md_hr'); limparHoras(); }, function () {});
};
window.excluirHoras = function (id) { if (confirm('Excluir esta tarefa?')) acao('ctrlExcluirHoras', [id], 'Tarefa excluída. Lembre de sincronizar.'); };

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
window.gerarRelatorio = function () {
  var cli = $('ra_Cliente').value; if (!cli) { toast('Escolha o cliente.', true); return; }
  $('raPrev').innerHTML = '<div class="card">Gerando…</div>';
  call('ctrlRelatorioAnualDados', [cli, $('ra_De').value, $('ra_Ate').value]).then(function (d) { RA = d; renderRelatorio(d); }, function (e) { $('raPrev').innerHTML = ''; toast(e.message, true); });
};
function renderRelatorio(d) {
  var areas = Object.keys(d.processos.porArea), vals = areas.map(function (a) { return d.processos.porArea[a]; });
  var e = d.economia, gasto = Math.max(0, e.valorCausa - e.saving);
  var h = '<div class="card"><div class="ra-head"><h2 style="margin:0"><span class="t">Pré-visualização: ' + ed('titulo', d.cliente + ' · ' + mesNome(d.de) + ' a ' + mesNome(d.ate)) + '</span></h2><span class="edit-badge">' + ic('editar', 13) + ' Editável</span></div>' +
    '<p class="example-note" style="margin-top:-6px">Clique em qualquer texto ou número para ajustar. O PowerPoint sai exatamente com o que estiver aqui.</p>';
  h += '<div class="ra-sec"><h3>Quantidade e situação de processos</h3><div class="ra-kpis">' +
    '<div class="stat"><div class="lb">Processos ativos</div>' + ed('pAtivos', d.processos.ativos, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Arquivados no período</div>' + ed('pArq', d.processos.arquivadosNoPeriodo, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Novos no período</div>' + ed('pNovos', d.processos.novosNoPeriodo, 'div', ' class="val"') + '</div>' +
    '<div class="stat"><div class="lb">Audiências realizadas</div>' + ed('pAud', d.audiencias, 'div', ' class="val"') + '</div></div>';
  if (areas.length) h += '<div class="donut-wrap"><div class="donut" style="background:' + conic(vals) + '"><b>' + d.processos.total + '<small>processos</small></b></div><div class="leg">' +
    areas.map(function (a, i) { return '<div data-area="' + i + '"><i style="background:' + CORES[i % CORES.length] + '"></i>' + ed('area' + i, a) + ': <b contenteditable="true" data-k="areaN' + i + '">' + vals[i] + '</b> (' + pct(vals[i], d.processos.total) + '%)</div>'; }).join('') + '</div></div>';
  h += '</div>';
  h += '<div class="ra-sec"><h3>Economia obtida (saving)</h3><div class="ra-kpis">' +
    '<div class="stat"><div class="lb">Valor das causas</div>' + ed('eCausa', brl(e.valorCausa), 'div', ' class="val" style="font-size:19px"') + '</div>' +
    '<div class="stat"><div class="lb">Valores dispendidos</div>' + ed('eGasto', brl(gasto), 'div', ' class="val" style="font-size:19px"') + '</div>' +
    '<div class="stat"><div class="lb">Saving</div>' + ed('eSaving', brl(e.saving), 'div', ' class="val" style="font-size:19px;color:var(--ok)"') + '</div></div>' +
    '<div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--warn) 0 ' + (100 - e.percentual) + '%, var(--ok) ' + (100 - e.percentual) + '% 100%)"><b>' + ed('ePct', String(e.percentual).replace('.', ',') + '%') + '<small>saving</small></b></div>' +
    '<div class="leg"><div><i style="background:var(--ok)"></i>Economia sobre o valor das causas</div><div><i style="background:var(--warn)"></i>Dispendido sobre as causas</div></div></div></div>';
  h += '<div class="ra-sec"><h3>Horas trabalhadas</h3><div class="tbl-wrap"><table id="raHoras"><thead><tr><th>Mês</th><th>Consultivo</th><th>Processual</th><th>Total</th></tr></thead><tbody>' +
    d.horas.meses.map(function (m, i) { return '<tr><td>' + mesNome(m.mes) + '</td><td>' + ed('hc' + i, decHm(m.consultivo)) + '</td><td>' + ed('hp' + i, decHm(m.processual)) + '</td><td>' + decHm(m.consultivo + m.processual) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td>Total no período</td><td>' + ed('hcT', decHm(d.horas.totalConsultivo)) + '</td><td>' + ed('hpT', decHm(d.horas.totalProcessual)) + '</td><td>' + decHm(d.horas.totalConsultivo + d.horas.totalProcessual) + '</td></tr>' +
    '<tr><td class="muted">Média mensal</td><td>' + ed('hcM', decHm(d.horas.mediaConsultivo)) + '</td><td>' + ed('hpM', decHm(d.horas.mediaProcessual)) + '</td><td>' + decHm(d.horas.mediaConsultivo + d.horas.mediaProcessual) + '</td></tr></tfoot></table></div>' +
    '<p class="example-note" style="margin-top:8px">Horas contratadas por mês: ' + hm(d.contratadasMes) + '</p></div>';
  var sug = d.consultoriasSugestao.length ? 'Ao longo do período, prestamos consultoria em: ' + d.consultoriasSugestao.slice(0, 8).join('; ') + '.' : 'Descreva aqui as consultorias realizadas no período.';
  h += '<div class="ra-sec"><h3>Consultorias realizadas no período</h3>' + ed('consult', sug, 'div', ' class="ra-narr"') + '<p class="ra-src">Sugestão montada a partir das tarefas lançadas. Ajuste à vontade.</p></div>';
  h += '<div class="ra-sec"><h3>Conclusão</h3>' + ed('conclusao', 'O período foi marcado por ' + d.processos.ativos + ' processo(s) ativo(s) e economia de ' + brl(e.saving) + ' frente ao valor das causas em discussão, reforçando a estratégia de atuação preventiva adotada junto ao cliente.', 'div', ' class="ra-narr"') + '</div>';
  h += '<div class="btn-row"><button class="btn" onclick="exportarPptx()">' + ic('grafico') + ' Exportar PowerPoint</button><button class="btn ghost" onclick="gerarRelatorio()">Recarregar dados (desfaz edições)</button></div></div>';
  $('raPrev').innerHTML = h;
}
function val(k) { var e = document.querySelector('#raPrev [data-k="' + k + '"]'); return e ? e.innerText.trim() : ''; }
function horasNum(s) { var m = String(s).match(/(\d+)\s*h\s*(\d+)?/); if (m) return (+m[1]) + (+(m[2] || 0)) / 60; return hDec(s) || parseFloat(String(s).replace(',', '.')) || 0; }
var PPTX_LIB = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
window.exportarPptx = function () {
  if (!window.PptxGenJS) {
    toast('Preparando o PowerPoint…');
    var sc = document.createElement('script'); sc.src = PPTX_LIB;
    sc.onload = function () { window.exportarPptx(); };
    sc.onerror = function () { toast('Não consegui carregar a biblioteca do PowerPoint (sem internet?). Tente de novo.', true); };
    document.head.appendChild(sc); return;
  }
  var d = RA, AZUL = '364B9B', MAR = '141D3F', CIANO = '23B9D6', CINZA = '7A8297';
  var p = new PptxGenJS(); p.layout = 'LAYOUT_WIDE'; p.title = val('titulo');
  function base(t) {
    var s = p.addSlide(); s.background = { color: 'FFFFFF' };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: MAR } });
    s.addText(t, { x: 0.5, y: 0.15, w: 10, h: 0.6, fontFace: 'Montserrat', fontSize: 22, bold: true, color: 'FFFFFF' });
    s.addImage({ path: 'logo-dh.png', x: 11.6, y: 0.12, w: 1.3, h: 0.66, sizing: { type: 'contain', w: 1.3, h: 0.66 } });
    s.addShape(p.ShapeType.rect, { x: 0, y: 0.9, w: 13.33, h: 0.06, fill: { color: CIANO } });
    return s;
  }
  function kpi(s, x, y, lb, v, cor) {
    s.addShape(p.ShapeType.rect, { x: x, y: y, w: 2.9, h: 1.3, fill: { color: 'F3F5F9' }, line: { color: CIANO, width: 0 } });
    s.addShape(p.ShapeType.rect, { x: x, y: y, w: 2.9, h: 0.06, fill: { color: CIANO } });
    s.addText(lb.toUpperCase(), { x: x + 0.15, y: y + 0.15, w: 2.6, h: 0.3, fontFace: 'Montserrat', fontSize: 10, bold: true, color: CINZA });
    s.addText(v, { x: x + 0.15, y: y + 0.5, w: 2.7, h: 0.65, fontFace: 'Montserrat', fontSize: 24, bold: true, color: cor || AZUL });
  }
  // capa
  var c = p.addSlide(); c.background = { color: MAR };
  c.addImage({ path: 'logo-dh.png', x: 0.8, y: 0.8, w: 2.2, h: 1.1, sizing: { type: 'contain', w: 2.2, h: 1.1 } });
  c.addText('RELATÓRIO ANUAL', { x: 0.8, y: 2.6, w: 11, h: 0.6, fontFace: 'Montserrat', fontSize: 16, bold: true, color: CIANO, charSpacing: 4 });
  c.addText(val('titulo'), { x: 0.8, y: 3.2, w: 11.5, h: 1.4, fontFace: 'Montserrat', fontSize: 34, bold: true, color: 'FFFFFF' });
  c.addText('Domingues & Herold Advogados', { x: 0.8, y: 6.4, w: 8, h: 0.4, fontFace: 'Montserrat', fontSize: 12, color: 'A9E3EF' });
  // processos
  var s1 = base('Quantidade e situação de processos');
  kpi(s1, 0.5, 1.3, 'Processos ativos', val('pAtivos')); kpi(s1, 3.6, 1.3, 'Arquivados no período', val('pArq')); kpi(s1, 6.7, 1.3, 'Novos no período', val('pNovos')); kpi(s1, 9.8, 1.3, 'Audiências realizadas', val('pAud'));
  var areas = [], nums = [], i = 0;
  while (document.querySelector('#raPrev [data-k="area' + i + '"]')) { areas.push(val('area' + i)); nums.push(parseFloat(val('areaN' + i)) || 0); i++; }
  if (areas.length) s1.addChart(p.ChartType.doughnut, [{ name: 'Processos por área', labels: areas, values: nums }], { x: 0.5, y: 2.9, w: 6.5, h: 4.2, holeSize: 58, showLegend: true, legendPos: 'r', legendFontSize: 13, showPercent: true, dataLabelColor: 'FFFFFF', chartColors: CORES.map(function (x) { return x.slice(1); }) });
  // economia
  var s2 = base('Economia obtida (saving)');
  kpi(s2, 0.5, 1.3, 'Valor das causas', val('eCausa')); kpi(s2, 3.6, 1.3, 'Valores dispendidos', val('eGasto')); kpi(s2, 6.7, 1.3, 'Saving', val('eSaving'), '2F8F5B'); kpi(s2, 9.8, 1.3, '% de economia', val('ePct'), '2F8F5B');
  var ps = parseFloat(val('ePct').replace(',', '.')) || 0;
  s2.addChart(p.ChartType.doughnut, [{ name: 'Saving', labels: ['Economia (saving)', 'Dispendido'], values: [ps, Math.max(0, 100 - ps)] }], { x: 0.5, y: 2.9, w: 6.5, h: 4.2, holeSize: 58, showLegend: true, legendPos: 'r', legendFontSize: 13, showPercent: true, dataLabelColor: 'FFFFFF', chartColors: ['2F8F5B', 'B3792A'] });
  // horas
  var s3 = base('Horas trabalhadas');
  var labs = d.horas.meses.map(function (m) { return mesNome(m.mes); });
  var hc = d.horas.meses.map(function (m, j) { return Math.round(horasNum(val('hc' + j)) * 100) / 100; }), hp = d.horas.meses.map(function (m, j) { return Math.round(horasNum(val('hp' + j)) * 100) / 100; });
  s3.addChart(p.ChartType.bar, [{ name: 'Consultivo', labels: labs, values: hc }, { name: 'Processual', labels: labs, values: hp }], { x: 0.4, y: 1.2, w: 8.2, h: 5.8, barGrouping: 'stacked', chartColors: [AZUL, CIANO], showLegend: true, legendPos: 'b', catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, valAxisTitle: 'horas', showValAxisTitle: true });
  var rows = [[{ text: '', options: { fill: { color: 'FFFFFF' } } }, { text: 'Consultivo', options: { bold: true, color: 'FFFFFF', fill: { color: AZUL } } }, { text: 'Processual', options: { bold: true, color: 'FFFFFF', fill: { color: AZUL } } }],
    [{ text: 'Total', options: { bold: true } }, val('hcT'), val('hpT')], [{ text: 'Média mensal', options: { bold: true } }, val('hcM'), val('hpM')]];
  s3.addTable(rows, { x: 8.9, y: 1.6, w: 4.1, colW: [1.5, 1.3, 1.3], fontFace: 'Montserrat', fontSize: 12, border: { type: 'solid', color: 'E5E8EF', pt: 1 }, rowH: 0.5 });
  // consultorias e conclusão
  [['Consultorias realizadas no período', val('consult')], ['Conclusão', val('conclusao')]].forEach(function (x) {
    var s = base(x[0]); s.addText(x[1], { x: 0.8, y: 1.4, w: 11.7, h: 5.4, fontFace: 'Montserrat', fontSize: 18, color: '16203A', valign: 'top', paraSpaceAfter: 8 });
  });
  var nome = 'Relatorio_Anual_' + d.cliente.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_') + '_' + d.de + '_a_' + d.ate + '.pptx';
  p.writeFile({ fileName: nome }).then(function () { toast('PowerPoint gerado: ' + nome); }, function (e) { toast('Falha ao gerar o PowerPoint: ' + e.message, true); });
};

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
  carregar().catch(function () {});
}
})();
