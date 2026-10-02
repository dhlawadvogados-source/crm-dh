# CRM Financeiro DH LAW — versão web (GitHub Pages)

O CRM continua usando **a mesma planilha** como banco de dados. A diferença é que agora ele é um site comum (HTML + JavaScript). O navegador lê e grava na planilha direto pela API do Google, com login Google. O Apps Script deixa de ser necessário para o dia a dia.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | A tela do CRM (a mesma de antes, com o visual do site da DH) |
| `css/dh-tema.css` | Cores e fontes da DH. Para ajustar o visual, mexa aqui |
| `js/config.js` | **Única coisa que você precisa preencher** (Client ID do Google) |
| `js/codigo.js` | O seu `Código.gs`, que agora roda no navegador |
| `js/gas-shim.js` | O "tradutor" que faz o código do Apps Script funcionar no navegador. Não precisa mexer |
| `img/logo-dh.png` | Logo |
| `PagarPadrao.csv` | As contas fixas do botão "Gerar contas do mês" (ver passo 0) |

---

## Passo 0 — Criar a aba `PagarPadrao` na planilha (2 min)

A lista de contas fixas (salários, aluguel, etc.) saiu do código e foi para a planilha. Assim esses valores não ficam públicos no GitHub.

1. Abra a planilha do banco do CRM.
2. Arquivo → Importar → Fazer upload → escolha `PagarPadrao.csv`.
3. Em "Local de importação", escolha **Inserir nova(s) página(s)**. Depois renomeie a aba para exatamente `PagarPadrao`.

Daqui em diante, para mudar uma conta fixa, basta editar essa aba.

## Passo 1 — Google Cloud: liberar o login e a API (uns 15 min, uma vez só)

1. Entre em https://console.cloud.google.com com a conta da DH (ex.: adm@advogadosdh.com.br).
2. No topo, clique em **Selecionar projeto → Novo projeto**, dê o nome `CRM DH LAW` e crie.
3. Menu ☰ → **APIs e serviços → Biblioteca**. Procure **Google Sheets API** e clique em **Ativar**.
4. Menu ☰ → **APIs e serviços → Tela de consentimento OAuth** (em alguns painéis o nome é "Google Auth Platform → Branding").
   - Tipo de usuário: **Externo** (porque um dos acessos é @gmail.com).
   - Nome do app: `CRM DH LAW`. E-mail de suporte: o seu.
   - Em **Público-alvo / Usuários de teste**, adicione os 3 e-mails que usam o CRM:
     `adm@advogadosdh.com.br`, `mariana@advogadosdh.com.br`, `daphynii.work@gmail.com`.
   - Pode deixar o app em modo **Teste**. Ele funciona normalmente para esses usuários.
5. Menu ☰ → **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
   - Tipo de aplicativo: **Aplicativo da Web**.
   - Em **Origens JavaScript autorizadas**, adicione o endereço do site (passo 2), por exemplo:
     `https://SEU-USUARIO.github.io`
     Para testar no seu computador, adicione também `http://localhost:8000`.
   - Não precisa preencher "URIs de redirecionamento".
   - Clique em Criar e **copie o "ID do cliente"** (termina com `.apps.googleusercontent.com`).
6. Abra `js/config.js` e cole esse ID em `GOOGLE_CLIENT_ID`. O ID da planilha já está preenchido.

> No primeiro login, o Google mostra o aviso "O Google não verificou este app". É normal para apps internos em modo Teste. Clique em **Continuar**.

## Passo 2 — Publicar no GitHub Pages

1. Crie uma conta em https://github.com, se ainda não tiver.
2. **New repository**, com o nome `crm-dh` por exemplo.
3. **Add file → Upload files**: arraste **o conteúdo desta pasta** (index.html e as pastas css, js e img) e clique em **Commit**.
   - Não precisa subir o `PagarPadrao.csv` nem este LEIA-ME.
4. No repositório, vá em **Settings → Pages**. Em "Branch", escolha `main` e a pasta `/ (root)`, depois **Save**.
5. Em 1 ou 2 minutos aparece o endereço, algo como `https://SEU-USUARIO.github.io/crm-dh/`.
   - Confira se `https://SEU-USUARIO.github.io` está nas Origens autorizadas do passo 1.5. A origem é só o domínio, sem o `/crm-dh`.

### Sobre privacidade
- **Os dados não ficam no GitHub.** Eles continuam só na planilha, e só quem faz login com uma conta autorizada consegue ler.
- O acesso tem duas travas:
  1. o e-mail precisa estar em `ALLOWED_EMAILS`, no início de `js/codigo.js`;
  2. a conta precisa ter acesso de **edição** à planilha no Drive.
  Para tirar o acesso de alguém, basta remover o compartilhamento da planilha.
- Num repositório público, o **código** fica visível para qualquer pessoa. Por isso tirei do código os CPFs/PIX, os salários e as listas de importação antigas. Se preferir o código fechado, dá para usar repositório privado: o GitHub Pages em repositório privado exige o plano pago (GitHub Pro). Outra opção é a Cloudflare Pages, que é gratuita e lê repositórios privados.

## Como testar no seu computador (opcional)
Com o Python instalado, abra o terminal na pasta e rode `python -m http.server 8000`. Depois acesse http://localhost:8000. Abrir o `index.html` com dois cliques não funciona, porque o navegador bloqueia o login nesse modo.

---

## O que mudou em relação ao Apps Script

- **Funciona igual:** todas as telas e botões (Receber, Pagar, Comissões, Salários, Férias, Rentabilidade, Propostas, Contratos, importação de planilhas do fechamento, relatórios).
- **PDFs** (relatório mensal, anual e por cliente) agora são gerados no próprio navegador. Se algum dia falhar, o CRM baixa o relatório em HTML. É só abrir e usar Imprimir → Salvar como PDF.
- **Lembrete por e-mail da Nota Graciola:** um site não consegue mandar e-mail sozinho de madrugada. Se quiser manter esse lembrete, deixe o projeto antigo do Apps Script como está (só com o gatilho `enviarLembreteNotaGraciola`). Ele continua lendo a mesma planilha. A marcação "Marcar como gerada" feita no CRM novo para os lembretes normalmente.
- **Desativados na versão web:** os botões de importação inicial que tinham dados fixos no código ("Corrigir importação" de comissões e a importação de pontuais antigos). Esses dados já estão na planilha.
- **Mais de uma pessoa usando ao mesmo tempo:** o CRM relê a planilha antes de cada ação se os dados tiverem mais de 20 segundos (ajustável em `js/config.js`). O botão ↻ Atualizar relê na hora.
- **Datas digitadas:** "2026-08-05" e "05/08/2026" viram data na planilha. Textos como "4/4" ou "14/06" ficam como texto. No Apps Script, às vezes eles viravam data sem querer.

## Para mudar regras do CRM no futuro
Edite `js/codigo.js` do mesmo jeito que você editava o `Código.gs` e suba o arquivo de novo no GitHub (Upload files → substitui). Se fizer mudanças no Apps Script, dá para colar o `Código.gs` novo aqui. Só não traga de volta as listas com CPF/salários (veja os comentários `VERSAO WEB` no arquivo).
