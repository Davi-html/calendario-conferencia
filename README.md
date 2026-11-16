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

Os dados do calendário são armazenados localmente no computador, no perfil do aplicativo.

No Windows, o armazenamento fica em:

```text
%APPDATA%\calendario\
```

Os dados permanecem disponíveis ao fechar e abrir o aplicativo novamente.

**Atenção:** apagar essa pasta remove os dados salvos localmente. A cópia do executável para outro computador não transfere os dados automaticamente.

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

O arquivo executável será gerado na pasta:

```text
release/
```

O projeto utiliza o Electron Builder para empacotar a aplicação em um executável portátil para Windows x64.

---

## 📦 Distribuição

As versões compiladas do aplicativo são disponibilizadas na seção [Releases](../../releases) do GitHub.

O código-fonte permanece neste repositório, enquanto os executáveis são publicados separadamente para facilitar o download.

---

## 📄 Licença

Consulte as informações de licença deste repositório.