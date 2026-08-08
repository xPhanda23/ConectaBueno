# 📊 Observatório Cultural e de Impacto - Conecta Bueno

## Visão Geral

O **Observatório Cultural** é um painel analítico desenvolvido para responder à **Pergunta-Chave 2 do Desafio dos Dados: Ampliação do Acesso à Cultura**. Baseado em metodologias de bancos de dados oficiais (IBGE-SIIC, Mapa da Cultura, TIC Cultura, Observatório Itaú Cultural e DataViva), o sistema analisa dados em tempo real do Firebase Firestore para identificar desigualdades territoriais e promover equidade no acesso cultural.

---

## 🎯 Objetivos de Desenvolvimento Sustentável (ODS)

O Observatório alinha-se aos seguintes ODS da ONU:

- **ODS 4** - Educação de Qualidade: Amplia o acesso a informações culturais e educacionais
- **ODS 10** - Redução das Desigualdades: Identifica e combate lacunas no acesso à cultura
- **ODS 11** - Cidades e Comunidades Sustentáveis: Promove territórios culturalmente vibrantes e inclusivos

---

## 📈 Áreas de Análise

### 1. **Distribuição de Equipamentos Culturais (Território e Poder)**

**Objetivo:** Mapear a distribuição geográfica dos pontos culturais para identificar zonas com/sem oferta cultural.

**Tipo de Gráfico:** Barras Horizontais

**Dados Analisados:**
- Regiões/bairros com maior concentração de equipamentos
- Zonas com déficit cultural (ausência de pontos)
- Distribuição percentual por território

**Fonte de Dados:** `espacos.endereco` (Firebase Firestore)

**Insight Gerado:** Permite ao poder público e à sociedade civil identificar áreas prioritárias para investimento cultural.

---

### 2. **Marcadores Sociais e Acessibilidade (Equidade e Inclusão)**

**Objetivo:** Cruzar dados sobre tipo de entrada (gratuita/paga) e níveis de acessibilidade física/cognitiva.

**Tipo de Gráfico:** 2 Gráficos de Rosca (Doughnut)

**Dados Analisados:**
- **Entrada:** Gratuita vs. Paga vs. Não Informado
- **Acessibilidade:** Acessível, Parcialmente Acessível, Não Acessível, Não Informado

**Fonte de Dados:** 
- `espacos.entrada` (gratuita | paga | nao_informado)
- `espacos.acessibilidade` (sim | nao | parcial | nao_informado)

**Insight Gerado:** Revela barreiras econômicas e físicas ao acesso cultural, orientando políticas de inclusão.

---

### 3. **Perfil e Hábitos de Consumo Cultural**

**Objetivo:** Identificar as categorias culturais mais cadastradas/acessadas pela comunidade.

**Tipo de Gráfico:** Colunas

**Dados Analisados:**
- Quantidade de pontos por categoria (Música, Teatro, Gastronomia, Cachoeiras, etc.)
- Ranking das categorias mais populares
- Diversidade cultural do território

**Fonte de Dados:** `espacos.categoria` (Firebase Firestore)

**Insight Gerado:** Orienta gestores culturais sobre as demandas e preferências da população.

---

## 🔬 Metodologia Científica

Os eixos analíticos foram estruturados seguindo parâmetros de:

| Fonte Oficial | Contribuição ao Observatório |
|---------------|------------------------------|
| **IBGE - SIIC** | Estatísticas de equipamentos culturais e indicadores sociais |
| **Mapa da Cultura (MinC)** | Georreferenciamento de agentes, espaços e eventos |
| **TIC Cultura (CETIC.br)** | Uso de tecnologias no setor cultural |
| **Observatório Itaú Cultural** | Economia criativa e impacto social da cultura |
| **DataViva** | Dados socioeconômicos e análise territorial |

---

## 💻 Arquitetura Técnica

### Stack Tecnológico

- **Frontend:** HTML5 Semântico, CSS3 Modular, JavaScript ES6+
- **Banco de Dados:** Firebase Cloud Firestore (Tempo Real)
- **Visualização:** Chart.js 3.9.1
- **Identidade Visual:** Paleta verde-natureza (#2d5a3d, #4a9d5f, #66bb6a)

### Estrutura de Arquivos

```
d:\ConectaBueno\
├── pages/
│   └── observatorio.html       # Página HTML principal
├── css/
│   └── observatorio.css        # Estilos modulares
├── js/
│   └── observatorio.js         # Lógica de dados e gráficos
└── OBSERVATORIO-CULTURAL.md    # Documentação (este arquivo)
```

---

## 🚫 Regra Absoluta: Zero Mock Data

**É ESTRITAMENTE PROIBIDO** o uso de:
- Dados falsos ou estáticos
- Arrays de placeholder
- Números hardcoded em gráficos

**Implementação de Empty States:**
- Quando `db.collection('espacos').get()` retorna vazio, os gráficos **não renderizam**
- Em vez disso, uma `<div class="empty-state">` é exibida com a mensagem:  
  *"Coletando dados da comunidade... Aguarde enquanto mapeamos os pontos culturais"*

---

## 🔥 Conexão com Firebase

### Coleção Utilizada

**Nome:** `espacos` (ou `pontos_culturais`)

**Campos Relevantes:**
```javascript
{
  id: String,
  nome: String,
  categoria: String,
  endereco: String,
  entrada: "gratuita" | "paga" | "nao_informado",
  acessibilidade: "sim" | "nao" | "parcial" | "nao_informado",
  status: "ativo" | "inativo",
  lat: Number,
  lng: Number,
  // ... outros campos
}
```

### Query Principal

```javascript
const snapshot = await db.collection('espacos')
    .where('status', '==', 'ativo')
    .get();
```

---

## 📊 Estatísticas Resumo (Cards Superiores)

1. **Total de Pontos Culturais:** Conta todos os documentos ativos
2. **Eventos Gratuitos:** Filtra por `entrada === 'gratuita'`
3. **Categorias Ativas:** Contagem única de `categoria`
4. **Acessibilidade Mapeada:** Razão de pontos com `acessibilidade != 'nao_informado'`

---

## 🎨 Design UI/UX (Identidade Natureza)

### Paleta de Cores

```css
--verde-floresta: #2d5a3d;  /* Textos principais */
--verde-folha: #4a9d5f;     /* Botões/destaques */
--verde-claro: #66bb6a;     /* Hover/secundário */
--verde-suave: #d0e8da;     /* Backgrounds */
--off-white: #fafaf8;       /* Fundo geral */
--creme: #f5f3ed;           /* Cards */
```

### Tipografia

- **Fonte Principal:** Inter, Roboto (fallback para system fonts)
- **Peso:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Tamanhos:** 13px-28px (escala modular)

### Bordas e Respiro

- **Border Radius:** 12px (cards), 16px (seções), 8px (botões)
- **Espaçamento:** Grid de 4px (múltiplos: 8px, 16px, 24px, 32px, 48px)
- **Box Shadow:** `0 2px 8px rgba(0, 0, 0, 0.08)` (padrão)

---

## 📱 Responsividade (Mobile-First)

### Breakpoints

```css
/* Mobile: < 768px (padrão) */
/* Tablet: 768px - 1024px */
/* Desktop: > 1024px */
```

### Adaptações

- **Mobile:** Grid de 1 coluna, gráficos verticais
- **Tablet:** Grid de 2 colunas, navegação adaptada
- **Desktop:** Layout completo com sidebar opcional

---

## 🔐 Segurança e Performance

### Tratamento de Erros

```javascript
try {
    const snapshot = await db.collection('espacos')
        .where('status', '==', 'ativo')
        .get();
    
    if (snapshot.empty) {
        showAllEmptyStates();
        return;
    }
    
    // Processar dados...
    
} catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
    showToast('Erro ao carregar dados do Firebase', 'error');
    showAllEmptyStates();
}
```

### Otimizações

- Lazy loading de gráficos (renderiza apenas quando visível)
- Cache de queries do Firestore (configuração do Firebase)
- Debounce em filtros interativos (se implementado no futuro)

---

## 🚀 Como Usar

### 1. Acessar o Observatório

**No Mapa Principal (index.html):**
- Clique no avatar do usuário (canto superior direito)
- Selecione "Observatório Cultural" no dropdown

**No Painel Admin (panel.html):**
- Clique em "Observatório Cultural" no menu lateral

### 2. Interpretar os Gráficos

- **Distribuição Territorial:** Identifique regiões carentes de equipamentos
- **Entrada e Acessibilidade:** Avalie barreiras econômicas e físicas
- **Categorias:** Conheça o perfil cultural da comunidade

### 3. Exportar Dados (Futuro)

*Funcionalidade planejada: Exportar relatórios em PDF/CSV*

---

## 📌 Limitações e Próximos Passos

### Limitações Atuais

- Dados dependem do cadastro manual no painel admin
- Análise territorial limitada à estrutura do campo `endereco`
- Sem integração com APIs governamentais (IBGE, MinC)

### Roadmap

1. **v2.0:** Integração com API Mapa da Cultura (MinC)
2. **v2.1:** Filtros interativos por período temporal
3. **v2.2:** Exportação de relatórios (PDF/CSV)
4. **v3.0:** Machine Learning para predição de demanda cultural
5. **v3.1:** Comparação com outros municípios da Serra da Mantiqueira

---

## 🤝 Contribuição

Este observatório foi desenvolvido seguindo princípios de **Ciência de Dados aberta** e **Dados Governamentais Abertos (Open Data)**. Contribuições são bem-vindas para:

- Melhorar algoritmos de análise territorial
- Integrar novas fontes de dados oficiais
- Aprimorar visualizações e acessibilidade

---

## 📄 Licença

Este projeto é parte do sistema **Conecta Bueno** e segue a mesma licença da plataforma principal.

---

## 📧 Contato

Para questões técnicas ou metodológicas sobre o Observatório Cultural:

- **Email:** contato@conectabueno.com.br
- **Repositório:** [Link do GitHub]

---

**Desenvolvido com 💚 para Bueno Brandão, MG - Serra da Mantiqueira**
