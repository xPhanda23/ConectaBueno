# 🏔️ Conecta Bueno - Mapa Cultural de Bueno Brandão, MG

**Plataforma web de mapeamento cultural** para Bueno Brandão, município da Serra da Mantiqueira, Minas Gerais.

Descubra espaços culturais, cachoeiras, fazendas de café premiado e pontos turísticos da região.

---

## 🌄 Sobre Bueno Brandão

Bueno Brandão é um município no Sul de Minas Gerais, conhecido por:
- **Café Premiado**: Produção de cafés especiais reconhecidos nacionalmente
- **Cachoeiras**: Cachoeira dos Félix, do Machado, dos Luís, do Sossego
- **Ecoturismo**: Trilhas e turismo ecológico na Serra da Mantiqueira
- **Localização**: 22°26'27"S, 46°21'03"W (coordenadas exatas)
- **População**: ~11.000 habitantes

---

## 🚀 Início Rápido

### 1. Configure o Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Crie um projeto
3. Ative **Authentication** (Email/Password)
4. Crie **Firestore Database** (modo produção)
5. Copie as credenciais

### 2. Configure as Credenciais

Edite **AMBOS** os arquivos:

**`js/firebase-config.js`** (para login e mapa)
```javascript
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  // ... resto das credenciais
};
```

**`js/firebase-config-panel.js`** (para painel admin)
```javascript
const firebaseConfig = {
  // Mesmas credenciais aqui
};
```

### 3. Execute o Servidor Local

```bash
python -m http.server 8000
# Acesse: http://localhost:8000
```

### 4. Crie sua Conta

1. Vá para: `http://localhost:8000/pages/login.html`
2. Cadastre-se
3. Faça login

### 5. Configure Admin

No [Firestore Console](https://console.firebase.google.com/):
1. Collection: `users`
2. Document ID: [seu UID]
3. Adicione campos:
   ```
   role: "admin"
   isAdmin: true
   ```

### 6. Acesse o Painel

`http://localhost:8000/pages/panel.html`

---

## 📁 Estrutura do Projeto

```
ConectaBueno/
├── index.html              # Mapa público
├── pages/
│   ├── login.html          # Login/Cadastro
│   └── panel.html          # Painel administrativo
├── css/
│   ├── global.css          # Estilos globais
│   ├── map.css             # Estilos do mapa
│   ├── auth.css            # Estilos de autenticação
│   └── panel.css           # Estilos do painel
├── js/
│   ├── firebase-config.js          # Config Firebase (compat)
│   ├── firebase-config-panel.js    # Config Firebase (ES6)
│   ├── firebase-auth.js            # Funções de autenticação
│   ├── map.js                      # Lógica do mapa
│   ├── auth.js                     # UI de login
│   ├── panel-main.js               # Painel principal
│   ├── panel-auth.js               # Auth do painel
│   ├── panel-crud.js               # Sistema CRUD
│   └── panel-analytics.js          # Dashboard
└── assets/                 # Imagens e ícones
```

---

## 🎨 Funcionalidades

### Mapa Público
- 🗺️ Visualização de espaços culturais
- 📍 Marcadores interativos
- 🔍 Busca por nome ou categoria
- 📱 Responsivo

### Sistema de Login
- 📧 Cadastro com email/senha
- 🔐 Login seguro
- 🔑 Recuperação de senha
- 🌐 Login com Google (opcional)

### Painel Administrativo
- 🏛️ **CRUD de Espaços**: Museus, teatros, galerias...
- 🎨 **CRUD de Artistas**: Catálogo de talentos locais
- 🎭 **CRUD de Eventos**: Agenda cultural
- 📊 **Dashboard**: Métricas e estatísticas
- 🔒 **Acesso restrito**: Apenas administradores

---

## 🔒 Regras do Firestore

Configure no Firebase Console > Firestore > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Usuários
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Espaços, Artistas e Eventos
    // Leitura pública, escrita apenas admin
    match /espacos/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    match /artistas/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    match /eventos/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

---

## 🌐 Deploy

### Firebase Hosting

```bash
# 1. Instalar Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Inicializar
firebase init hosting

# 4. Deploy
firebase deploy
```

Seu site estará em: `https://seu-projeto.web.app`

---

## 🛠️ Tecnologias

- **HTML5** + **CSS3** + **JavaScript ES6+**
- **Firebase Authentication** - Login seguro
- **Cloud Firestore** - Banco de dados NoSQL
- **Leaflet.js** - Mapas interativos
- **Design Responsivo** - Mobile, Tablet, Desktop

---

## 🐛 Problemas Comuns

### Firebase não carrega
```javascript
// Verifique no console (F12):
console.log(firebase);
```
Se `undefined`, verifique as credenciais.

### Não consigo acessar o painel
1. Você está logado?
2. Você é admin no Firestore?
3. Console tem erros? (F12)

### Dados não aparecem
1. Cadastrou algum espaço/artista/evento?
2. Regras do Firestore estão corretas?
3. Internet funcionando?

---

## 📊 Estrutura de Dados

### Collection: `espacos`
```javascript
{
  nome: string,
  categoria: string,
  endereco: string,
  bairro: string,
  latitude: number,
  longitude: number,
  descricao: string,
  telefone: string,
  email: string,
  website: string,
  status: "Ativo" | "Inativo",
  criadoEm: Timestamp,
  atualizadoEm: Timestamp
}
```

### Collection: `artistas`
```javascript
{
  nome: string,
  arte: string,
  biografia: string,
  contato: string,
  instagram: string,
  status: "Ativo" | "Inativo"
}
```

### Collection: `eventos`
```javascript
{
  nome: string,
  tipo: string,
  descricao: string,
  dataInicio: string,
  horario: string,
  local: string,
  endereco: string,
  status: "Ativo" | "Cancelado" | "Finalizado"
}
```

---

## 📝 Como Usar

### 1. Adicionar Espaço Cultural

No painel admin:
1. Clique em "Espaços Culturais"
2. Clique em "➕ Adicionar Espaço"
3. Preencha os campos
4. Use Google Maps para obter coordenadas
5. Salve

### 2. Adicionar Artista

1. Clique em "Artistas"
2. Clique em "➕ Adicionar Artista"
3. Preencha nome, tipo de arte, biografia
4. Salve

### 3. Criar Evento

1. Clique em "Eventos"
2. Clique em "➕ Adicionar Evento"
3. Preencha nome, data, local
4. Salve

---

## 🔧 Configuração Avançada

### Habilitar Login com Google

1. Firebase Console > Authentication
2. Sign-in method > Google
3. Habilitar e configurar

### Backup Automático

Use Firebase Extensions ou configure exports programados.

---

## 📞 Suporte

Para dúvidas:
1. Verifique o console do navegador (F12)
2. Revise as credenciais Firebase
3. Confirme as regras do Firestore

---

## 📄 Licença

MIT License - Use livremente!

---

**Conecta Bueno** - *Conectando cultura, pessoas e lugares*  
🏔️ Desenvolvido para Bueno Brandão, Minas Gerais
