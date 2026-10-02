/*************************************************************
 * MODELOS DE PLANILHA PARA BAIXAR
 * Ao lado de cada botão "Importar ..." aparece "Baixar modelo",
 * com a planilha no formato exato que o CRM sabe ler.
 *************************************************************/
(function () {
  'use strict';
  var ANO = String(new Date().getFullYear());
  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function folha(linhas, larguras) {
    var ws = XLSX.utils.aoa_to_sheet(linhas);
    if (larguras) ws['!cols'] = larguras.map(function (w) { return { wch: w }; });
    return ws;
  }
  function baixar(nomeArquivo, abas) {
    if (typeof XLSX === 'undefined') { alert('A biblioteca de planilhas ainda não carregou. Recarregue a página e tente de novo.'); return; }
    var wb = XLSX.utils.book_new();
    abas.forEach(function (a) { XLSX.utils.book_append_sheet(wb, a[1], a[0]); });
    XLSX.writeFile(wb, nomeArquivo);
  }
  function instrucoes(texto) { return folha(texto.map(function (t) { return [t]; }), [110]); }

  var MODELOS = {
    // Receber › "Importar planilha do fechamento"
    fechamento: function () {
      baixar('Modelo_Fechamento_Juridico.xlsx', [
        ['CONSULTIVO', folha([
          ['Cliente', 'Tarefa', 'Data', 'Duração', 'Responsável'],
          ['Nome do cliente (igual ao do contrato)', 'Descrição da tarefa', '05/09/2026', '01:30:00', 'Nome do advogado'],
          ['Frigorífico Bizinelli Ltda', 'Parecer sobre férias', '12/09/2026', '00:45:00', 'Cíntia']
        ], [42, 50, 12, 10, 22])],
        ['PROCESSUAL E EXTRAS', folha([
          ['Cliente', 'Horas processual', 'Audiências', 'Excesso de processos', 'Custas / Reembolso', 'Descrição das custas', 'Descrição audiências'],
          ['Nome do cliente (igual ao do contrato)', '02:30:00', '1', '0', '43,85', 'Ex.: guia de custas', 'Ex.: 15/09/2026 audiência de conciliação'],
          ['Ak Group (Aktrion)', '01:00:00', '2', '1', '0', '', '10/09/2026 instrução e 18/09/2026 conciliação']
        ], [42, 16, 12, 20, 18, 30, 44])],
        ['COMO USAR', instrucoes([
          'MODELO DO FECHAMENTO MENSAL DO JURÍDICO',
          '',
          'Aba CONSULTIVO: uma linha por tarefa de consultivo (Cliente, Tarefa, Data, Duração em hh:mm:ss, Responsável).',
          'Aba PROCESSUAL E EXTRAS: uma linha por cliente com horas de processo, nº de audiências, processos excedentes e custas.',
          'Os nomes das abas precisam conter "CONSULTIVO" e "PROCESSUAL" (ou "EXTRAS").',
          'Apague as linhas de exemplo antes de importar.',
          'No CRM: Contas a Receber > escolha o Mês > "Importar planilha do fechamento".'
        ])]
      ]);
    },
    // Rentabilidade › "Importar processo"
    horasProcesso: function () {
      var cab = ['Advogado', 'Cliente'].concat(MESES).concat(['Total']);
      var ex1 = ['Amanda', 'Frigorífico Bizinelli Ltda', 12.5, 10, 8.25, 9, 11, 7.5, 13, 12.9, '', '', '', '', ''];
      var ex2 = ['Igor', 'ABBA Indústria e Comércio de Produtos Químicos Ltda', 2, '1:30', 3, '', '', '', '', '', '', '', '', '', ''];
      baixar('Modelo_Horas_Processo_' + ANO + '.xlsx', [
        ['Por Cliente', folha([cab, ex1, ex2], [16, 42].concat(MESES.map(function () { return 8; })).concat([9]))],
        ['COMO USAR', instrucoes([
          'MODELO DE HORAS DE PROCESSO (planilha anual)',
          '',
          'Aba "Por Cliente": colunas Advogado, Cliente e uma coluna por mês (Jan, Fev, ... Dez).',
          'Horas em número (12,5) ou no formato hh:mm (1:30). A coluna Total é ignorada.',
          'O ano usado é o do filtro de mês da tela Rentabilidade (ou o ano atual).',
          'Apague as linhas de exemplo antes de importar.',
          'No CRM: Rentabilidade > "Importar processo". Substitui as horas de processo já importadas.'
        ])]
      ]);
    },
    // Rentabilidade › "Importar consultivo" (formato do Monday: Advogado › Cliente)
    horasConsultivo: function () {
      var cab = ['Name', 'Subitems', 'Tempo total', 'Horas'].concat(MESES);
      function linha(cli, horas) { return [cli, '', '', ''].concat(horas); }
      var vazio = MESES.map(function () { return ''; });
      baixar('Modelo_Horas_Consultivo_' + ANO + '.xlsx', [
        ['Consultivo', folha([
          ['HORAS ' + ANO],
          ['Amanda'],
          cab,
          linha('Frigorífico Bizinelli Ltda', [2, 1.5, 3, 2.25, 1, 0.75, 2, 1.5].concat(['', '', '', ''])),
          linha('Grupo Schultz', [0.5, '', 1, '', '', 2, '', 1].concat(['', '', '', ''])),
          [''],
          ['Cíntia'],
          cab,
          linha('Febracis Paraná', [1, 1, '', 0.5, '', '', 1.25, ''].concat(['', '', '', ''])),
          linha('Ak Group (Aktrion)', vazio.slice(0, 8).concat([0.5, '', '', '']))
        ], [42, 10, 12, 8].concat(MESES.map(function () { return 7; })))],
        ['COMO USAR', instrucoes([
          'MODELO DE HORAS DE CONSULTIVO (mesmo formato da exportação do Monday)',
          '',
          'Para cada advogado: uma linha só com o NOME do advogado, depois a linha de cabeçalho',
          '"Name | Subitems | Tempo total | Horas | Jan | Fev ... Dez" e, embaixo, uma linha por cliente com as horas de cada mês.',
          'Horas em número decimal (1,5 = 1h30). Linhas de subitens são ignoradas.',
          'Apague os exemplos antes de importar.',
          'No CRM: Rentabilidade > "Importar consultivo". Substitui o consultivo dos meses presentes na planilha.'
        ])]
      ]);
    }
  };
  window.dhBaixarModelo = function (k) { try { MODELOS[k](); } catch (e) { alert('Não consegui gerar o modelo: ' + e.message); } };
  window.DH_MODELOS = MODELOS;

  // coloca o botão "Baixar modelo" ao lado de cada importação
  var ALVOS = [['arqFechamento', 'fechamento'], ['arqHoras', 'horasProcesso'], ['arqConsult', 'horasConsultivo']];
  function montar() {
    ALVOS.forEach(function (a) {
      var inp = document.getElementById(a[0]); if (!inp || document.getElementById('mdl_' + a[0])) return;
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'mdl_' + a[0]; b.className = 'btn ghost dh-modelo';
      b.title = 'Baixar a planilha modelo para esta importação';
      b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Modelo';
      b.onclick = function () { dhBaixarModelo(a[1]); };
      inp.parentNode.insertBefore(b, inp.nextSibling);
    });
  }
  window.dhMontarModelos = montar;
  document.addEventListener('DOMContentLoaded', montar);
})();
