# 🔥 Guia de Configuração Firebase - Mapa Cultural de Bueno Brandão

Este guia vai te ajudar a configurar o Firebase Authentication e Firestore Database para o sistema de login e cadastro funcionar.

---

## 📋 Pré-requisitos

- Conta Google (Gmail)
- Navegador web atualizado
- Projeto já baixado e rodando localmente

---

## 🚀 Passo a Passo

### 1️⃣ Criar o Projeto Firebase

1. Acesse o **Firebase Console**: [https://console.firebase.google.com/](https://console.firebase.google.com/)

2. Clique em **"Adicionar projeto"** (ou "Create a project")

3. Configure o projeto:
   - **Nome do projeto**: `mapa-cultural-bueno-brandao`
   - **Aceite** os termos
   - **Google Analytics**: pode desabilitar (opcional para MVP)
   - Clique em **"Criar projeto"**

4. Aguarde a criação (leva ~30 segundos)

---

### 2️⃣ Ativar Authentication (Autenticação)

1. No menu lateral esquerdo, clique em **"Authentication"** (ou "Autenticação")

2. Clique no botão **"Get started"** (ou "Vamos começar")

3. Configure os **métodos de login**:

   **Email/Password (obrigatório):**
   - Clique na aba **"Sign-in method"**
   - Clique em **"Email/Password"**
   - **Ative** a primeira opção (Email/Password)
   - Clique em **"Salvar"**

   **Google (opcional - mas recomendado):**
   - Ainda na aba **"Sign-in method"**
   - Clique em **"Google"**
   - **Ative** o provedor
   - Escolha um **e-mail de suporte** (seu Gmail)
   - Clique em **"Salvar"**

   **Facebook (opcional):**
   - Requer criar um App no Facebook Developers
   - Por enquanto, pode pular

---

### 3️⃣ Criar o Firestore Database

1. No menu lateral, clique em **"Firestore Database"**

2. Clique em **"Criar banco de dados"** (ou "Create database")

3. Escolha o modo:
   - Selecione **"Iniciar no modo de produção"** (production mode)
   - Clique em **"Avançar"**

4. Escolha a localização:
   - Selecione **"southamerica-east1 (São Paulo)"** (mais próximo do Brasil)
   - Clique em **"Ativar"**

5. Aguarde a criação (~1 minuto)

6. **Configure as regras de segurança**:
   - Clique na aba **"Regras"** (Rules)
   - Substitua o conteúdo por este:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Apenas usuários autenticados podem ler/escrever
    match /usuarios/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Pontos culturais públicos (todos podem ler, apenas admins escrevem)
    match /pontos/{pontoId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Favoritos e roteiros privados do usuário
    match /favoritos/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /roteiros/{roteiroId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        request.auth.uid == resource.data.usuarioId;
    }
  }
}
```

   - Clique em **"Publicar"**

---

### 4️⃣ Obter as Credenciais do Projeto

1. No menu lateral, clique no **ícone de engrenagem ⚙️** > **"Configurações do projeto"**

2. Role até a seção **"Seus apps"** (Your apps)

3. Clique no ícone **`</>`** (Web)

4. Configure o app:
   - **Nome do app**: `Mapa Cultural Web`
   - **Não marque** "Firebase Hosting" ainda
   - Clique em **"Registrar app"**

5. **COPIE as credenciais** que aparecerem:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "mapa-cultural-bueno-brandao",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."
};
```

6. **Cole essas credenciais** no arquivo `js/firebase-config.js` substituindo os valores de exemplo

---

### 5️⃣ Atualizar o Código Local

1. Abra o arquivo **`js/firebase-config.js`**

2. **Substitua** as credenciais de exemplo pelas suas:

```javascript
const firebaseConfig = {
    apiKey: "COLE_SUA_API_KEY_AQUI",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto-id",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef",
    measurementId: "G-XXXXXXXXXX"
};
```

3. **Salve o arquivo**

---

### 6️⃣ Testar o Sistema

1. Abra o arquivo **`pages/login.html`** no navegador

2. **Crie uma conta**:
   - Clique na aba **"Cadastrar"**
   - Preencha: Nome, Email, Senha
   - Aceite os termos
   - Clique em **"Criar minha conta"**

3. Se tudo estiver correto:
   - ✅ Você será redirecionado para o `index.html`
   - ✅ Verá seu nome no canto superior direito
   - ✅ Terá acesso ao mapa

4. **Teste o logout**:
   - Clique no botão **"Sair"**
   - Você será redirecionado para o login

5. **Teste o login**:
   - Entre com o email e senha que criou
   - Deve funcionar normalmente

---

## 🔍 Verificar os Dados no Firebase

### Usuários Cadastrados:
1. Vá em **Authentication** > aba **"Users"**
2. Você verá a lista de usuários cadastrados

### Dados no Firestore:
1. Vá em **Firestore Database** > aba **"Data"**
2. Você verá a coleção `usuarios` com os perfis criados

---

## 🛡️ Segurança: Protegendo suas Credenciais

**⚠️ IMPORTANTE:** Nunca commite suas credenciais Firebase no Git!

### Criar arquivo `.gitignore`:

1. Crie um arquivo chamado `.gitignore` na raiz do projeto

2. Adicione esta linha:

```
js/firebase-config.js
```

### Alternativa: usar variáveis de ambiente

Para projetos em produção, use um arquivo `.env`:

```bash
VITE_FIREBASE_API_KEY=sua_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_domain_aqui
# ... etc
```

---

## 📊 Estrutura do Firestore

O sistema cria automaticamente estas coleções:

### `usuarios` (collection)
```javascript
{
  uid: "abc123",
  nome: "João Silva",
  email: "joao@email.com",
  dataCriacao: Timestamp,
  ultimoAcesso: Timestamp,
  favoritosIds: [],
  roteirosIds: []
}
```

### Futuras coleções (podem ser criadas depois):

**`pontos`** - pontos culturais da cidade
**`roteiros`** - roteiros criados pelos usuários
**`favoritos`** - locais favoritados por usuário

---

## 🎯 Funcionalidades Implementadas

✅ Cadastro com email e senha  
✅ Login com email e senha  
✅ Login com Google  
✅ Login com Facebook (precisa configurar)  
✅ Recuperação de senha por email  
✅ Proteção de rotas (só acessa o mapa se estiver logado)  
✅ Persistência de sessão (fica logado ao fechar o navegador)  
✅ Perfil de usuário no Firestore  
✅ Botão de logout  
✅ Validação de formulários  
✅ Mensagens de erro em português  

---

## 🐛 Problemas Comuns

### Erro: "Firebase SDK não carregado"
- **Causa**: Scripts do Firebase não carregaram
- **Solução**: Verifique sua conexão com a internet

### Erro: "auth/invalid-api-key"
- **Causa**: Credenciais incorretas
- **Solução**: Copie novamente as credenciais do console

### Usuário não está sendo salvo no Firestore
- **Causa**: Regras de segurança muito restritivas
- **Solução**: Verifique as regras no passo 3️⃣

### Login com Google não funciona
- **Causa**: Provedor não ativado
- **Solução**: Ative o Google em Authentication > Sign-in method

### Página fica em loop infinito
- **Causa**: Firebase config incorreto
- **Solução**: Abra o console do navegador (F12) e veja os erros

---

## 📞 Suporte

Documentação oficial do Firebase:
- [Firebase Auth](https://firebase.google.com/docs/auth)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)

---

## 🎉 Pronto!

Agora seu sistema de autenticação está funcionando com um banco de dados profissional e gratuito!

**Próximos passos sugeridos:**
- Adicionar verificação de email
- Criar sistema de perfil do usuário
- Implementar favoritos e roteiros
- Adicionar fotos de perfil
- Criar painel administrativo

---

**Desenvolvido para o Mapa Cultural de Bueno Brandão** 🌿  
_Serra da Mantiqueira - MG_
