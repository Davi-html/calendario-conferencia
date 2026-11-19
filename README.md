# 📅 Calendário

Aplicação desktop para gerenciamento de calendário e organização de atividades, desenvolvida com React, TypeScript, Vite e Electron.

## 💻 Download

Não é necessário instalar Node.js, React ou qualquer outra dependência para utilizar o aplicativo.

### Como baixar e instalar

1. Acesse a página de [Releases](../../releases) deste repositório.
2. Abra a versão mais recente disponível.
3. Na seção **Assets**, localize o arquivo `.exe`.
4. Clique no executável para baixá-lo.
5. Após o download, abra o arquivo para iniciar o Calendário.

**Importante:** o aplicativo é portátil. Não precisa de instalador ou configuração adicional.

### Armazenamento dos dados

Com o Firebase Firestore configurado, o quadro e as regras ficam em um banco compartilhado pela internet. As alterações aparecem nos outros computadores em tempo real, inclusive no aplicativo Electron. Sem essa configuração, o app continua salvando localmente no computador e indica isso na tela.

Para ativar o compartilhamento:

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2. Adicione um app Web ao projeto e copie a API key, o Project ID e o App ID.
3. Crie um banco **Cloud Firestore** no modo de produção.
4. Na aba **Rules** do Firestore, substitua as regras pelo conteúdo de [`firestore.rules`](./firestore.rules) e clique em **Publish**. Confirme que está no mesmo projeto cujo Project ID foi copiado.
5. Crie `.env` na raiz do projeto copiando `.env.example` e preencha `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` e `VITE_FIREBASE_APP_ID`.
6. Execute novamente o app (`npm run dev`) ou gere o Electron (`npm run dist`). Para distribuir uma versão conectada, faça o build depois de preencher essas variáveis.
7. Na primeira conexão, os dados locais do primeiro computador inicializam o banco. Nos próximos computadores, os dados compartilhados substituem a cópia local.

**Atenção:** este modo deixa os dados públicos para leitura e alteração por qualquer pessoa que tenha acesso ao app, sem login. As configurações do Firebase usadas no app são públicas; as regras do Firestore limitam o acesso aos dois documentos do calendário, mas qualquer pessoa pode alterá-los. Não use este modo para dados confidenciais. O Firestore é o armazenamento compartilhado; a cópia local do navegador não é sincronizada quando o app está sem conexão. Se duas pessoas alterarem o mesmo quadro ao mesmo tempo, a última gravação pode substituir a outra.

O Firebase Firestore não pausa o banco por falta de uso. No plano sem custo, há limites diários de 50 mil leituras, 20 mil gravações e 1 GiB de armazenamento; se o uso ultrapassar as cotas, algumas operações podem ficar indisponíveis até o limite ser renovado. Confira as [cotas atuais do Firestore](https://firebase.google.com/docs/firestore/quotas).

Se o Firebase não estiver configurado, os dados permanecem apenas no perfil local do aplicativo. No Windows, esse armazenamento fica em `%APPDATA%\calendario\`.

---

## 🛠️ Tecnologias utilizadas

- React
- TypeScript
- Vite
- Electron
- XLSX / xlsx-js-style

## 🚀 Desenvolvimento

### Pré-requisitos

- Node.js
- npm

### Clonar o repositório

```bash
git clone URL_DO_REPOSITORIO
cd calendario
```

### Instalar dependências

```bash
npm install
```

### Executar em desenvolvimento

```bash
npm run dev
```

### Gerar o executável Windows

```bash
npm run dist
```

Esse comando gera um instalador Windows x64 na pasta:

```text
release/
```

Instale uma vez e abra pelo atalho do Calendário: essa versão evita extrair o aplicativo inteiro a cada abertura. Para gerar também o executável portátil de arquivo único, que pode demorar mais para iniciar, use:

```bash
npm run dist:portable
```

O projeto utiliza o Electron Builder para empacotar a aplicação para Windows x64.

---

## 📦 Distribuição

As versões compiladas do aplicativo são disponibilizadas na seção [Releases](../../releases) do GitHub.

O código-fonte permanece neste repositório, enquanto os executáveis são publicados separadamente para facilitar o download.

---

## 📄 Licença

Consulte as informações de licença deste repositório.