/*************************************************************
 * CONFIGURAÇÃO DO CRM DH LAW (versão web)
 * Só estes dois valores precisam ser preenchidos.
 *************************************************************/
window.CRM_CONFIG = {
  // ID do cliente OAuth criado no Google Cloud Console
  // (termina com .apps.googleusercontent.com). Veja o LEIA-ME, passo 1.
  GOOGLE_CLIENT_ID: "60869851265-nopq6thdoklt99p99dnpfnprg67qst28.apps.googleusercontent.com",

  // ID da planilha-banco (o trecho da URL entre /d/ e /edit)
  SPREADSHEET_ID: "1HooYBCmjCsP6NiSp5VH4w0rcjJ1D1Y_OxtVc2XCWsL8",

  // Se os dados na tela tiverem mais de X segundos, o CRM relê a
  // planilha antes da próxima ação (para pegar o que outra pessoa mudou).
  RECARREGAR_APOS_SEGUNDOS: 20,

  // CONTROLADORIA — endereço do servidor (Cloud Function "crm"). ENQUANTO ESTIVER VAZIO, o CRM
  // funciona exatamente como antes (navegador falando direto com a planilha).
  // Quando preencher, TODO acesso passa pelo servidor, que confere o perfil (aba Usuarios).
  BACKEND_API: "https://southamerica-east1-crm-dh-law.cloudfunctions.net/crm",
  PAGINA_CONTROLADORIA: "controladoria.html"
};

// Quem pode entrar continua definido em js/codigo.js (ALLOWED_EMAILS).
// Além disso, a pessoa precisa ter acesso de edição à planilha no Google Drive.
