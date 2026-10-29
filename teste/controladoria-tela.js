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
      if (res && res.success === false) fail(new Error(res.error || 'Erro desconhecido')); else ok(res && res.data !== undefined ? res.data : res);
    }).withFailureHandler(fail);
    r[fn].apply(r, args || []);
  });
}
function acao(fn, args, okMsg) {
  return call(fn, args).then(function (d) { if (okMsg) toast(okMsg); return carregar().then(function () { return d; }); },
    function (e) { toast(e.message, true); throw e; });
}

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
var TABS = [['painel', 'Painel'], ['clientes', 'Clientes'], ['processos', 'Processos'], ['custas', 'Custas e audiências'], ['horas', 'Consultivo e horas'], ['relatorio', 'Relatório Anual'], ['ferias', 'Férias']];
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
  return Promise.all([call('ctrlGetAll'), call('ctrlResumoHoras', [$('hrMes').value || null])]).then(function (r) {
    D = r[0]; RESUMO = r[1];
    if (!$('hrMes').value) $('hrMes').value = RESUMO.mes;
    if (!$('cuMes').value) $('cuMes').value = mesAtual();
    if (!$('ra_De').value) { var y = +hoje().slice(0, 4); $('ra_De').value = y + '-01'; $('ra_Ate').value = mesAtual(); }
    ['cu_Data', 'hr_Data'].forEach(function (id) { if (!$(id).value) $(id).value = hoje(); });
    $('cu_Categoria').innerHTML = D.listas.categoriasCusta.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    selAdvogados('pr_AdvogadoResponsavel', '(escolha)'); selAdvogados('hr_Responsavel', '(escolha)');
    renderTudo();
    $('loading').style.display = 'none'; $('app').style.display = 'block';
  }, function (e) { $('loading').textContent = 'Erro ao carregar: ' + e.message; throw e; });
}
function carregarResumo() { return call('ctrlResumoHoras', [$('hrMes').value]).then(function (r) { RESUMO = r; renderResumo(); renderHoras(); }, function (e) { toast(e.message, true); }); }
window.carregarResumo = carregarResumo;
function renderTudo() { renderPainel(); renderClientes(); renderProcessos(); renderCustas(); renderResumo(); renderHoras(); renderFerias(); }

/* ---------- painel ---------- */
function renderPainel() {
  var mes = mesAtual();
  var consMes = D.consultivo.filter(function (c) { return c.Mes === mes; });
  var cliLanc = {}; consMes.forEach(function (c) { cliLanc[norm(c.Cliente)] = 1; });
  var ativos = D.clientes.filter(isAtivo).length;
  var horas = consMes.reduce(function (s, c) { return s + hDec(c.Duracao); }, 0);
  var custasMes = D.custas.filter(function (c) { return String(c.Data).slice(0, 7) === mes && c.Status !== 'Cancelado'; }).length;
  var aguard = (RESUMO && RESUMO.mes === mes ? RESUMO.clientes : []).filter(function (c) { return c.status === 'Aguardando validação' || c.status === 'Desatualizada'; });
  var pend = D.pendencias.filter(function (p) { return p.Status === 'Aberta'; });
  $('pnStats').innerHTML =
    '<div class="stat"><div class="lb">Clientes com horas lançadas</div><div class="val">' + Object.keys(cliLanc).length + ' <span style="font-size:15px;color:var(--muted);font-weight:600">de ' + ativos + ' ativos</span></div><div class="hint">' + mesNome(mes) + '</div></div>' +
    '<div class="stat"><div class="lb">Horas de consultivo no mês</div><div class="val">' + decHm(horas) + '</div><div class="hint">' + consMes.length + ' lançamento(s)</div></div>' +
    '<div class="stat"><div class="lb">Custas/audiências no mês</div><div class="val">' + custasMes + '</div><div class="hint">já no Contas a Receber</div></div>' +
    '<div class="stat' + (aguard.length ? ' warn' : '') + '"><div class="lb">Excedentes a validar</div><div class="val">' + aguard.length + '</div><div class="hint">clientes acima do contratado</div></div>';
  $('pnExced').innerHTML = aguard.length ? '<table><thead><tr><th>Cliente</th><th>Contratadas</th><th>Consultivo</th><th>Excedente</th><th>Situação</th></tr></thead><tbody>' +
    aguard.map(function (c) { return '<tr><td class="cliente">' + esc(c.cliente) + '</td><td>' + hm(c.contratadas) + '</td><td>' + hm(c.consultivo) + '</td><td><b>' + hm(c.excedente) + '</b></td><td>' + badgeStatus(c.status) + '</td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhum cliente acima das horas contratadas neste mês.');
  $('pnPend').innerHTML = pend.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Mensagem</th><th></th></tr></thead><tbody>' +
    pend.map(function (p) { return '<tr><td>' + fmtD(p.DataDeteccao) + '</td><td class="cliente">' + esc(p.Cliente) + '</td><td>' + esc(p.Mensagem) + '</td><td class="acts"><button class="lnk" onclick="resolverPend(\'' + esc(p.ID) + '\')">Marcar resolvida</button></td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhuma pendência aberta.');
}
window.resolverPend = function (id) { acao('ctrlResolverPendencia', [id], 'Pendência resolvida.'); };

/* ---------- clientes ---------- */
window.renderClientes = function () {
  var f = norm($('clBusca').value), soAt = $('clStatus').value === 'ativos', mes = mesAtual();
  var usado = {}; D.consultivo.forEach(function (c) { if (c.Mes === mes) usado[norm(c.Cliente)] = (usado[norm(c.Cliente)] || 0) + hDec(c.Duracao); });
  var nProc = {}; D.processos.forEach(function (p) { if (p.Situacao !== 'Arquivado') nProc[norm(p.Cliente)] = (nProc[norm(p.Cliente)] || 0) + 1; });
  var l = nomesClientes().filter(function (c) { return (!soAt || isAtivo(c)) && norm(c.Nome).indexOf(f) > -1; });
  $('clTabela').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Modalidade</th><th>Situação</th><th>Horas contratadas</th><th>Consultivo no mês</th><th>Processos ativos</th><th>Responsável</th></tr></thead><tbody>' +
    l.map(function (c) { var k = norm(c.Nome), u = usado[k] || 0, ct = hDec(c.HorasContratadas);
      return '<tr><td class="cliente">' + esc(c.Nome) + '</td><td>' + esc(c.Tipo || '—') + '</td><td>' + badgeStatus(isAtivo(c) ? 'Ativo' : (c.Status || '—')) + '</td><td>' + (ct ? decHm(ct) : '—') + '</td><td>' + (u ? '<b' + (ct && u > ct ? ' style="color:var(--dh-laranja)"' : '') + '>' + decHm(u) + '</b>' : '<span class="muted">—</span>') +
        '</td><td>' + (nProc[k] || 0) + (c.ProcessosContratados ? ' <span class="muted">de ' + esc(c.ProcessosContratados) + '</span>' : '') + '</td><td>' + esc(c.Responsavel || '—') + '</td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhum cliente encontrado.');
};

/* ---------- processos ---------- */
var PR = ['Cliente', 'NumeroCNJ', 'Partes', 'Vara', 'AreaJuridica', 'AdvogadoResponsavel', 'ValorCausa', 'CondenacaoAcordo', 'ValoresRecebidos', 'Saving', 'Classificacao', 'Situacao', 'DataInicio', 'DataEncerramento', 'SituacaoAtualizada'];
window.renderProcessos = function () {
  var f = norm($('prBusca').value), st = $('prFiltro').value;
  var l = D.processos.filter(function (p) { return (!st || p.Situacao === st) && (norm(p.Cliente) + ' ' + norm(p.NumeroCNJ) + ' ' + norm(p.Partes)).indexOf(f) > -1; })
    .sort(function (a, b) { return String(a.Cliente).localeCompare(b.Cliente); });
  $('prTabela').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Nº / partes</th><th>Área</th><th>Andamento</th><th>Valor da causa</th><th>Condenação/acordo</th><th>Recebido</th><th>Saving</th><th>Classif.</th><th>Situação</th><th></th></tr></thead><tbody>' +
    l.map(function (p) {
      return '<tr><td class="cliente">' + esc(p.Cliente) + '</td><td>' + esc(p.NumeroCNJ || '—') + (p.Partes ? '<br><span class="muted">' + esc(p.Partes) + '</span>' : '') + '</td><td>' + esc(p.AreaJuridica || '—') + '</td><td>' + esc(p.SituacaoAtualizada || '—') +
        '</td><td class="money">' + (p.ValorCausa !== '' ? brl(p.ValorCausa) : '—') + '</td><td class="money">' + (p.CondenacaoAcordo !== '' ? brl(p.CondenacaoAcordo) : '—') + '</td><td class="money">' + (p.ValoresRecebidos !== '' ? brl(p.ValoresRecebidos) : '—') +
        '</td><td class="money">' + (p.Saving !== '' ? brl(p.Saving) : '—') + '</td><td><span class="badge ' + (p.Classificacao === 'Extra' ? 'extra' : 'incluso') + '">' + esc(p.Classificacao || 'Incluso') + '</span></td><td>' + badgeStatus(p.Situacao) +
        '</td><td class="acts"><button class="lnk" onclick="editarProcesso(\'' + esc(p.ID) + '\')">Editar</button><button class="lnk red" onclick="excluirProcesso(\'' + esc(p.ID) + '\')">Excluir</button></td></tr>';
    }).join('') + '</tbody></table>' : vazio('Nenhum processo ' + (st === 'Ativo' ? 'ativo ' : st === 'Arquivado' ? 'arquivado ' : '') + 'encontrado.');
};
window.editarProcesso = function (id) {
  var p = D.processos.filter(function (x) { return x.ID === id; })[0]; if (!p) return;
  $('pr_ID').value = id; PR.forEach(function (k) { var e = $('pr_' + k); if (e) e.value = p[k] == null ? '' : (/^Valor|Condenacao|Saving/.test(k) && p[k] !== '' ? moneyN(p[k]).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : p[k]); });
  $('pr_Classificacao').value = p.Classificacao === 'Extra' ? 'Extra' : 'Incluso';
  $('prTitulo').textContent = 'Editar processo'; $('prBtn').textContent = 'Salvar alterações'; $('prCancel').style.display = ''; $('prCard').classList.add('editing'); $('prCard').scrollIntoView({ behavior: 'smooth' });
};
window.limparProcesso = function () {
  $('pr_ID').value = ''; PR.forEach(function (k) { var e = $('pr_' + k); if (e && e.tagName !== 'SELECT') e.value = ''; });
  $('pr_Situacao').value = 'Ativo'; $('pr_Classificacao').value = 'Incluso'; $('pr_AdvogadoResponsavel').value = '';
  $('prTitulo').textContent = 'Novo processo'; $('prBtn').textContent = '+ Registrar processo'; $('prCancel').style.display = 'none'; $('prCard').classList.remove('editing');
};
window.salvarProcesso = function () {
  var o = {}; PR.forEach(function (k) { o[k] = $('pr_' + k).value; }); if ($('pr_ID').value) o.ID = $('pr_ID').value;
  acao('ctrlSalvarProcesso', [o], o.ID ? 'Processo atualizado.' : 'Processo registrado.').then(limparProcesso, function () {});
};
window.excluirProcesso = function (id) { if (confirm('Excluir este processo? (Se ele só terminou, prefira "Arquivado".)')) acao('ctrlExcluirProcesso', [id], 'Processo excluído.'); };

/* ---------- custas ---------- */
window.renderCustas = function () {
  var f = norm($('cuBusca').value), mes = $('cuMes').value;
  var l = D.custas.filter(function (c) { return (!mes || String(c.Data).slice(0, 7) === mes) && (norm(c.Cliente) + ' ' + norm(c.Descricao)).indexOf(f) > -1; })
    .sort(function (a, b) { return String(b.Data).localeCompare(a.Data); });
  var tot = 0; l.forEach(function (c) { if (c.Status !== 'Cancelado' && c.Cobravel === 'Sim') tot += moneyN(c.Valor); });
  $('cuTabela').innerHTML = l.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Cobrar?</th><th>Situação</th><th></th></tr></thead><tbody>' +
    l.map(function (c) {
      var st = c.Status === 'Cancelado' ? 'Cancelado' : c.Recebido ? 'Recebido' : c.Status === 'Sincronizado' ? 'Sincronizado' : 'Lançado';
      var stTxt = st === 'Sincronizado' ? badgeStatus('Sincronizado').replace('Sincronizado', 'No Contas a Receber') : badgeStatus(st);
      var podeEditar = st !== 'Cancelado' && st !== 'Recebido';
      return '<tr><td>' + fmtD(c.Data) + '</td><td class="cliente">' + esc(c.Cliente) + '</td><td>' + esc(c.Categoria) + '</td><td>' + esc(c.Descricao) + (/^https?:\/\//i.test(c.DocumentoLink || '') ? ' <a class="lnk" target="_blank" rel="noopener" href="' + esc(c.DocumentoLink) + '">comprovante</a>' : '') +
        '</td><td class="money">' + brl(c.Valor) + '</td><td>' + esc(c.Cobravel) + '</td><td>' + stTxt + '</td><td class="acts">' +
        (podeEditar ? '<button class="lnk" onclick="editarCusta(\'' + esc(c.ID) + '\')">Editar</button><button class="lnk red" onclick="cancelarCusta(\'' + esc(c.ID) + '\')">Cancelar</button>' : '') + '</td></tr>';
    }).join('') + '</tbody><tfoot><tr><td colspan="4">Total a cobrar no período</td><td class="money">' + brl(tot) + '</td><td colspan="3"></td></tr></tfoot></table>'
    : vazio('Nenhum lançamento' + (mes ? ' em ' + mesNome(mes) : '') + '.');
};
var CU = ['Cliente', 'ProcessoID', 'Categoria', 'Data', 'Valor', 'Cobravel', 'Descricao', 'DocumentoLink'];
window.editarCusta = function (id) {
  var c = D.custas.filter(function (x) { return x.ID === id; })[0]; if (!c) return;
  $('cu_ID').value = id; $('cu_Cliente').value = c.Cliente; preencherSelProc('cu_ProcessoID', c.Cliente, c.ProcessoID);
  ['Categoria', 'Data', 'Cobravel', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = c[k] || ''; });
  $('cu_Valor').value = moneyN(c.Valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  $('cuTitulo').textContent = 'Editar lançamento'; $('cuBtn').textContent = 'Salvar alterações'; $('cuCancel').style.display = ''; $('cuCard').classList.add('editing'); $('cuCard').scrollIntoView({ behavior: 'smooth' });
};
window.limparCusta = function () {
  $('cu_ID').value = ''; ['Cliente', 'Valor', 'Descricao', 'DocumentoLink'].forEach(function (k) { $('cu_' + k).value = ''; }); $('cu_Cobravel').value = 'Sim'; preencherSelProc('cu_ProcessoID', '', '');
  $('cuTitulo').textContent = 'Novo lançamento'; $('cuBtn').textContent = '+ Lançar'; $('cuCancel').style.display = 'none'; $('cuCard').classList.remove('editing');
};
window.salvarCusta = function () {
  var o = {}; CU.forEach(function (k) { o[k] = $('cu_' + k).value; }); var id = $('cu_ID').value;
  (id ? acao('ctrlEditarCusta', [id, o], 'Lançamento atualizado (Contas a Receber acompanhou).') : acao('ctrlLancarCusta', [o], o.Cobravel === 'Sim' ? 'Lançado e enviado ao Contas a Receber.' : 'Lançado (sem cobrança).'))
    .then(limparCusta, function () {});
};
window.cancelarCusta = function (id) { if (confirm('Cancelar este lançamento? Ele sai do Contas a Receber.')) acao('ctrlCancelarCusta', [id], 'Lançamento cancelado.'); };

/* ---------- horas ---------- */
function renderResumo() {
  var l = RESUMO ? RESUMO.clientes.filter(function (c) { return c.lancamentos > 0 || c.excedenteDec > 0 || hDec(c.processual) > 0; }) : [];
  window._RL = l;
  $('hrResumo').innerHTML = l.length ? '<table><thead><tr><th>Cliente</th><th>Contratadas</th><th>Consultivo</th><th>Uso</th><th>Processual</th><th>Excedente</th><th>Situação</th><th></th></tr></thead><tbody>' +
    l.map(function (c, ix) {
      var pode = c.excedenteDec > 0 && c.cadastrado;
      var acts = pode ? ('<button class="btn ok sm" onclick="validarExc(' + ix + ')">' + (c.status === 'Validado' ? 'Validar de novo' : 'Validar') + '</button> <button class="lnk" onclick="naoCobrar(' + ix + ')">Não cobrar</button>') : '';
      var info = c.validadoPor ? '<br><span class="muted" style="font-size:11px">' + esc(c.validadoPor) + ' · ' + fmtD(c.dataValidacao) + (c.obs ? ' · ' + esc(c.obs) : '') + '</span>' : '';
      return '<tr><td class="cliente">' + esc(c.cliente) + (c.cadastrado ? '' : ' <span class="badge late">fora do cadastro</span>') + '</td><td>' + hm(c.contratadas) + '</td><td>' + hm(c.consultivo) + '</td><td>' + (c.percentual != null ? c.percentual + '%' : '—') + '</td><td>' + hm(c.processual) +
        '</td><td>' + (c.excedenteDec > 0 ? '<b style="color:var(--dh-laranja)">' + hm(c.excedente) + '</b>' : '—') + '</td><td>' + badgeStatus(c.status) + info + '</td><td class="acts">' + acts + '</td></tr>';
    }).join('') + '</tbody></table>' : vazio('Nenhuma hora lançada em ' + mesNome($('hrMes').value || mesAtual()) + '.');
}
window.validarExc = function (ix) {
  var r = window._RL[ix], cli = r.cliente, mes = $('hrMes').value;
  if (!confirm('Validar ' + hm(r.excedente) + ' excedentes de ' + cli + ' em ' + mesNome(mes) + '?\nA cobrança vai para o Contas a Receber.')) return;
  var obs = prompt('Observação (opcional):', '') || '';
  call('ctrlValidarExcedente', [cli, mes, obs]).then(function (d) { toast(d.aviso || ('Validado: ' + hm(d.excedente) + ' excedentes enviados ao Contas a Receber.'), !!d.aviso); return carregar(); }, function (e) { toast(e.message, true); });
};
window.naoCobrar = function (ix) {
  var cli = window._RL[ix].cliente;
  var obs = prompt('Por que estas horas de ' + cli + ' não serão cobradas?', ''); if (!obs) return;
  acao('ctrlNaoCobrarExcedente', [cli, $('hrMes').value, obs], 'Registrado: não cobrar.');
};
window.renderHoras = function () {
  var mes = $('hrMes').value || mesAtual(), f = norm($('hrBusca').value);
  var l = D.consultivo.filter(function (c) { return c.Mes === mes && (norm(c.Cliente) + ' ' + norm(c.Tarefa)).indexOf(f) > -1; }).sort(function (a, b) { return String(b.Data).localeCompare(a.Data); });
  $('hrTabela').innerHTML = l.length ? '<table><thead><tr><th>Data</th><th>Cliente</th><th>Advogado</th><th>Tarefa</th><th>Tempo</th><th>Origem</th><th></th></tr></thead><tbody>' +
    l.map(function (c) { return '<tr><td>' + fmtD(c.Data) + '</td><td class="cliente">' + esc(c.Cliente) + '</td><td>' + esc(c.Responsavel || '—') + '</td><td>' + esc(c.Tarefa) + '</td><td>' + hm(c.Duracao) + '</td><td><span class="muted">' + esc(c.Origem) + '</span></td><td class="acts">' +
      (c.Editavel ? '<button class="lnk" onclick="editarHoras(\'' + esc(c.ID) + '\')">Editar</button><button class="lnk red" onclick="excluirHoras(\'' + esc(c.ID) + '\')">Excluir</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhum lançamento em ' + mesNome(mes) + '.');
};
window.editarHoras = function (id) {
  var c = D.consultivo.filter(function (x) { return x.ID === id; })[0]; if (!c) return;
  $('hr_ID').value = id; $('hr_Cliente').value = c.Cliente; $('hr_Data').value = String(c.Data).slice(0, 10); $('hr_Responsavel').value = c.Responsavel || ''; $('hr_Tarefa').value = c.Tarefa; $('hr_Duracao').value = String(c.Duracao).replace(/:00$/, '');
  $('hrTitulo').textContent = 'Editar atividade'; $('hrBtn').textContent = 'Salvar alterações'; $('hrCancel').style.display = ''; $('hrCard').classList.add('editing'); $('hrCard').scrollIntoView({ behavior: 'smooth' });
};
window.limparHoras = function () {
  $('hr_ID').value = ''; $('hr_Tarefa').value = ''; $('hr_Duracao').value = '';
  $('hrTitulo').textContent = 'Registrar atividade'; $('hrBtn').textContent = '+ Registrar'; $('hrCancel').style.display = 'none'; $('hrCard').classList.remove('editing');
};
window.salvarHoras = function () {
  var o = { Cliente: $('hr_Cliente').value, Data: $('hr_Data').value, Responsavel: $('hr_Responsavel').value, Tarefa: $('hr_Tarefa').value, Duracao: $('hr_Duracao').value }, id = $('hr_ID').value;
  (id ? acao('ctrlEditarHoras', [id, o], 'Atividade atualizada.') : acao('ctrlLancarHoras', [o], 'Atividade registrada.')).then(limparHoras, function () {});
};
window.excluirHoras = function (id) { if (confirm('Excluir este lançamento de horas?')) acao('ctrlExcluirHoras', [id], 'Lançamento excluído.'); };

/* ---------- férias ---------- */
function renderFerias() {
  var l = D.ferias.slice().sort(function (a, b) { return String(a.Inicio || '9').localeCompare(b.Inicio || '9'); });
  $('feTabela').innerHTML = l.length ? '<table><thead><tr><th>Nome</th><th>Início</th><th>Fim</th><th>Dias</th><th>Situação</th></tr></thead><tbody>' +
    l.map(function (f) { var fora = f.Inicio && f.Fim && f.Inicio <= hoje() && f.Fim >= hoje(); return '<tr><td class="cliente">' + esc(f.Nome) + (fora ? ' <span class="badge pend">de férias agora</span>' : '') + '</td><td>' + fmtD(f.Inicio) + '</td><td>' + fmtD(f.Fim) + '</td><td>' + esc(f.Dias || '—') + '</td><td>' + esc(f.Status || '—') + '</td></tr>'; }).join('') + '</tbody></table>'
    : vazio('Nenhuma férias registrada.');
}

/* ---------- usuários (Admin) ---------- */
function carregarUsuarios() {
  call('ctrlListarUsuarios').then(function (l) {
    $('usTabela').innerHTML = '<table><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Ativo</th><th>Cadastrado por</th></tr></thead><tbody>' +
      l.map(function (u) { return '<tr><td class="cliente">' + esc(u.Email) + '</td><td>' + esc(u.Nome) + '</td><td>' + esc(u.Perfil) + '</td><td>' + esc(u.Ativo) + '</td><td class="muted">' + esc(u.CriadoPor) + (u.DataCriacao ? ' · ' + fmtD(u.DataCriacao) : '') + '</td></tr>'; }).join('') + '</tbody></table>';
  }, function (e) { toast(e.message, true); });
}
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
  var h = '<div class="card"><div class="ra-head"><h2 style="margin:0"><span class="t">Pré-visualização: ' + ed('titulo', d.cliente + ' · ' + mesNome(d.de) + ' a ' + mesNome(d.ate)) + '</span></h2><span class="edit-badge">✏️ Editável</span></div>' +
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
  h += '<div class="btn-row"><button class="btn" onclick="exportarPptx()">📊 Exportar PowerPoint</button><button class="btn ghost" onclick="gerarRelatorio()">Recarregar dados (desfaz edições)</button></div></div>';
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
montarMenu(); wireClientPicker(document);
if (!(window.CRM_SHIM && window.CRM_SHIM.modoCliente)) {
  $('loading').innerHTML = '<b>A Controladoria só funciona com o servidor ligado.</b><br><span style="font-size:13px">Falta preencher BACKEND_API em config.js (veja o LEIA-ME-CONTROLADORIA).</span>';
} else {
  carregar().catch(function () {});
}
})();
