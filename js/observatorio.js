/**
 * observatorio.js
 * Observatório Cultural - Análise de Dados em Tempo Real
 * REGRA ABSOLUTA: Zero Mock Data - Apenas dados reais do Firebase
 */

// ===================================
// VARIÁVEIS GLOBAIS
// ===================================
let db = null;
let chartDistribuicao = null;
let chartEntrada = null;
let chartAcessibilidade = null;
let chartCategorias = null;

// Paleta de cores alinhada ao tema natureza
const CORES = {
    verde: {
        floresta: '#2d5a3d',
        folha: '#4a9d5f',
        claro: '#66bb6a',
        suave: '#d0e8da'
    },
    grafico: [
        '#2d5a3d', // Verde floresta
        '#4a9d5f', // Verde folha
        '#66bb6a', // Verde claro
        '#8bc34a', // Verde-limão
        '#66bb6a', // Verde médio
        '#43a047', // Verde escuro
        '#00897b', // Verde-azulado
        '#558b2f', // Verde oliva
        '#689f38', // Verde grama
        '#7cb342'  // Verde primavera
    ],
    acessibilidade: {
        sim: '#4caf50',
        nao: '#ff9800',
        parcial: '#ffc107',
        naoInformado: '#9e9e9e'
    },
    entrada: {
        gratuita: '#4caf50',
        paga: '#ff9800',
        naoInformado: '#9e9e9e'
    }
};

// ===================================
// INICIALIZAÇÃO
// ===================================
console.log('╔═══════════════════════════════════════╗');
console.log('║   OBSERVATÓRIO CULTURAL - CONECTA BUENO   ║');
console.log('║         Análise de Dados Reais        ║');
console.log('╚═══════════════════════════════════════╝');

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔬 Inicializando Observatório Cultural...');
    
    // Aguardar Firebase estar disponível
    await waitForFirebase();

    // Nenhuma tela de login na entrada: garante uma sessão (anônima, se
    // preciso) apenas para satisfazer as regras do Firestore, sem nunca
    // navegar para login.html. O Observatório é 100% público. Se já
    // existir conta real logada, a função detecta isso e não mexe na sessão.
    if (window.auth && typeof garantirSessaoVisitante === 'function') {
        await garantirSessaoVisitante();
    }

    // Preenche nome/e-mail/avatar no dropdown do header quando há conta real logada
    if (window.auth) {
        window.auth.onAuthStateChanged(user => {
            if (user && !user.isAnonymous) loadUserProfile(user);
        });
    }

    // Configurar navegação
    setupNavigation();

    // Configurar event listeners
    setupEventListeners();

    // Carregar dados
    await loadObservatorioData();
});

/**
 * Aguarda o Firebase estar disponível
 */
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.db) {
            db = window.db;
            console.log('✅ Firebase conectado');
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.db) {
                    clearInterval(checkInterval);
                    db = window.db;
                    console.log('✅ Firebase conectado');
                    resolve();
                }
            }, 100);
            
            // Timeout de segurança
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!db) {
                    console.error('❌ Timeout ao conectar Firebase');
                    showToast('Erro ao conectar ao banco de dados', 'error');
                    hideLoading();
                }
            }, 10000);
        }
    });
}

/**
 * Configurar navegação entre seções
 */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetSection = item.dataset.section;

            // Atualizar nav ativo
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Atualizar seção ativa
            sections.forEach(section => section.classList.remove('active'));
            const activeSection = document.getElementById(`section-${targetSection}`);
            if (activeSection) {
                activeSection.classList.add('active');
            }

            // Atualizar título
            updateSectionTitle(targetSection);

            // No mobile a sidebar é uma gaveta sobreposta: fecha após escolher a seção
            closeSectionMenu();
        });
    });
}

/**
 * Atualizar título da seção
 */
function updateSectionTitle(sectionName) {
    const titles = {
        'visao-geral': {
            title: 'Visão Geral',
            subtitle: 'Estatísticas e indicadores culturais em tempo real'
        },
        'territorio': {
            title: 'Distribuição Territorial',
            subtitle: 'Análise geográfica dos equipamentos culturais'
        },
        'equidade': {
            title: 'Equidade e Inclusão',
            subtitle: 'Barreiras econômicas e de acessibilidade'
        },
        'consumo': {
            title: 'Perfil de Consumo',
            subtitle: 'Categorias e preferências culturais'
        },
        'metodologia': {
            title: 'Metodologia',
            subtitle: 'Fundamentação científica e fontes de dados'
        },
        'ods': {
            title: 'ODS e Impacto',
            subtitle: 'Contribuição para a Agenda 2030'
        }
    };
    
    const info = titles[sectionName] || titles['visao-geral'];
    document.getElementById('sectionTitle').textContent = info.title;
    document.getElementById('sectionSubtitle').textContent = info.subtitle;
}

/**
 * Configurar event listeners
 */
function setupEventListeners() {
    // No mobile a sidebar de seções vira uma gaveta off-canvas:
    // botão abre, clique no backdrop ou ESC fecha
    const btnToggle = document.getElementById('btnSectionMenuToggle');
    const backdrop = document.getElementById('adminSidebarBackdrop');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const isOpen = document.getElementById('adminSidebar').classList.toggle('active');
            backdrop?.classList.toggle('active', isOpen);
            btnToggle.setAttribute('aria-expanded', String(isOpen));
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', closeSectionMenu);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSectionMenu();
    });
}

/**
 * Fecha a gaveta de seções (mobile/tablet)
 */
function closeSectionMenu() {
    document.getElementById('adminSidebar')?.classList.remove('active');
    document.getElementById('adminSidebarBackdrop')?.classList.remove('active');
    document.getElementById('btnSectionMenuToggle')?.setAttribute('aria-expanded', 'false');
}

/**
 * Busca o perfil do usuário logado e preenche o dropdown do header
 * (nome, e-mail, avatar e link do Painel Admin quando aplicável)
 */
async function loadUserProfile(user) {
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        const perfil = {
            uid: user.uid,
            email: user.email,
            nome: user.displayName || user.email?.split('@')[0] || 'Usuário',
            isAdmin: false,
            ...(doc.exists ? doc.data() : {})
        };
        window.sharedComponents?.renderUserInfo(perfil);
    } catch (err) {
        console.error('❌ Perfil:', err);
        window.sharedComponents?.renderUserInfo({
            uid: user.uid,
            email: user.email,
            nome: user.displayName || user.email?.split('@')[0] || 'Usuário'
        });
    }
}

// ===================================
// CARREGAR DADOS DO FIREBASE
// ===================================

/**
 * Função principal que carrega todos os dados
 */
async function loadObservatorioData() {
    console.log('📊 Carregando dados do Firebase...');
    
    try {
        // Buscar dados da coleção 'espacos'
        const snapshot = await db.collection('espacos')
            .where('status', '==', 'ativo')
            .get();
        
        if (snapshot.empty) {
            console.warn('⚠️ Nenhum dado encontrado no Firebase');
            showAllEmptyStates();
            hideLoading();
            return;
        }
        
        // Processar dados
        const espacos = [];
        snapshot.forEach(doc => {
            espacos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`✅ ${espacos.length} espaços carregados`);
        
        // Atualizar estatísticas
        updateStats(espacos);

        // Painéis de indicadores (dashboard) de cada seção
        updateInsightsVisaoGeral(espacos);
        updateKPITerritorio(espacos);
        updateKPIEquidade(espacos);
        updateKPIConsumo(espacos);

        // Renderizar gráficos
        await renderCharts(espacos);
        
        hideLoading();
        showToast('Dados carregados com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        showToast('Erro ao carregar dados do Firebase', 'error');
        showAllEmptyStates();
        hideLoading();
    }
}

/**
 * Atualizar estatísticas resumo
 */
function updateStats(espacos) {
    // Total de pontos
    document.getElementById('statTotal').textContent = espacos.length;
    
    // Eventos gratuitos
    const gratuitos = espacos.filter(e => e.entrada === 'gratuita').length;
    document.getElementById('statGratuitos').textContent = gratuitos;
    
    // Categorias únicas
    const categorias = new Set(espacos.map(e => e.categoria).filter(Boolean));
    document.getElementById('statCategorias').textContent = categorias.size;
    
    // Acessibilidade mapeada
    const comAcessibilidade = espacos.filter(e => e.acessibilidade && e.acessibilidade !== 'nao_informado').length;
    document.getElementById('statAcessibilidade').textContent = `${comAcessibilidade}/${espacos.length}`;
    
    console.log('📈 Estatísticas atualizadas:', {
        total: espacos.length,
        gratuitos,
        categorias: categorias.size,
        comAcessibilidade
    });
}

// ===================================
// HELPERS DE AGREGAÇÃO
// (compartilhados entre os gráficos e os painéis de indicadores,
// para que os números nunca divirjam entre si)
// ===================================

/**
 * Extrai região/bairro de cada endereço e conta ocorrências.
 * Ex: "Rua X, Centro, Bueno Brandão" → "Centro"
 */
function calcularDistribuicaoRegional(espacos) {
    const distribuicao = new Map();

    espacos.forEach(espaco => {
        if (!espaco.endereco) return;

        const partes = espaco.endereco.split(',').map(p => p.trim());
        let regiao = 'Não especificado';

        if (partes.length >= 2) {
            regiao = partes[1]; // Segunda parte geralmente é o bairro
        } else if (partes.length === 1) {
            regiao = partes[0];
        }

        regiao = regiao.replace(/^(Rua|Av|Avenida|Travessa)\s+/i, '');

        distribuicao.set(regiao, (distribuicao.get(regiao) || 0) + 1);
    });

    return distribuicao;
}

/**
 * Conta espaços por categoria cultural.
 */
function calcularContagemCategorias(espacos) {
    const contagem = new Map();

    espacos.forEach(espaco => {
        const categoria = espaco.categoria || 'Sem Categoria';
        contagem.set(categoria, (contagem.get(categoria) || 0) + 1);
    });

    return contagem;
}

// ===================================
// PAINÉIS DE INDICADORES (DASHBOARD)
// ===================================

/**
 * Visão Geral: insights automáticos em linguagem natural,
 * calculados a partir dos mesmos dados dos gráficos.
 */
function updateInsightsVisaoGeral(espacos) {
    const total = espacos.length;
    const elGratuito = document.getElementById('insightGratuito');
    const elAcessibilidade = document.getElementById('insightAcessibilidade');
    const elRegiao = document.getElementById('insightRegiao');
    const elCategoria = document.getElementById('insightCategoria');

    if (total === 0) {
        const semDados = 'Ainda não há espaços suficientes para gerar este panorama.';
        [elGratuito, elAcessibilidade, elRegiao, elCategoria].forEach(el => {
            if (el) el.textContent = semDados;
        });
        return;
    }

    const gratuitos = espacos.filter(e => e.entrada === 'gratuita').length;
    if (elGratuito) {
        const pct = ((gratuitos / total) * 100).toFixed(0);
        elGratuito.innerHTML = `<strong>${pct}%</strong> dos espaços culturais têm entrada gratuita`;
    }

    const acessiveis = espacos.filter(e => e.acessibilidade === 'sim' || e.acessibilidade === 'parcial').length;
    if (elAcessibilidade) {
        const pct = ((acessiveis / total) * 100).toFixed(0);
        elAcessibilidade.innerHTML = `<strong>${pct}%</strong> têm algum nível de acessibilidade mapeado`;
    }

    const distribuicao = calcularDistribuicaoRegional(espacos);
    if (elRegiao) {
        if (distribuicao.size > 0) {
            const [regiaoTop, qtd] = [...distribuicao.entries()].sort((a, b) => b[1] - a[1])[0];
            elRegiao.innerHTML = `<strong>${regiaoTop}</strong> concentra o maior número de pontos culturais (${qtd})`;
        } else {
            elRegiao.textContent = 'Nenhum endereço cadastrado ainda permite identificar regiões.';
        }
    }

    const categorias = calcularContagemCategorias(espacos);
    if (elCategoria && categorias.size > 0) {
        const [categoriaTop, qtd] = [...categorias.entries()].sort((a, b) => b[1] - a[1])[0];
        elCategoria.innerHTML = `<strong>${categoriaTop}</strong> é a categoria mais frequente (${qtd} espaço${qtd === 1 ? '' : 's'})`;
    }
}

/**
 * Distribuição Territorial: indicadores de concentração/vazio geográfico.
 */
function updateKPITerritorio(espacos) {
    const distribuicao = calcularDistribuicaoRegional(espacos);
    const total = espacos.length;

    const elRegioes = document.getElementById('kpiRegioes');
    const elLider = document.getElementById('kpiRegiaoLider');
    const elLiderSub = document.getElementById('kpiRegiaoLiderSub');
    const elConcentracao = document.getElementById('kpiConcentracao');
    const elMenor = document.getElementById('kpiRegiaoMenor');
    const elMenorSub = document.getElementById('kpiRegiaoMenorSub');

    if (distribuicao.size === 0 || total === 0) {
        [elRegioes, elLider, elConcentracao, elMenor].forEach(el => { if (el) el.textContent = '-'; });
        if (elLiderSub) elLiderSub.textContent = 'espaços cadastrados';
        if (elMenorSub) elMenorSub.textContent = 'região com menos pontos';
        return;
    }

    const ordenado = [...distribuicao.entries()].sort((a, b) => b[1] - a[1]);

    if (elRegioes) elRegioes.textContent = distribuicao.size;

    const [regiaoLider, qtdLider] = ordenado[0];
    if (elLider) elLider.textContent = regiaoLider;
    if (elLiderSub) elLiderSub.textContent = `${qtdLider} de ${total} espaço${total === 1 ? '' : 's'}`;

    const somaTop3 = ordenado.slice(0, 3).reduce((soma, [, qtd]) => soma + qtd, 0);
    if (elConcentracao) elConcentracao.textContent = `${((somaTop3 / total) * 100).toFixed(0)}%`;

    const [regiaoMenor, qtdMenor] = ordenado[ordenado.length - 1];
    if (elMenor) elMenor.textContent = regiaoMenor;
    if (elMenorSub) elMenorSub.textContent = `apenas ${qtdMenor} espaço${qtdMenor > 1 ? 's' : ''}`;
}

/**
 * Equidade e Inclusão: taxas de gratuidade/acessibilidade e sua interseção.
 */
function updateKPIEquidade(espacos) {
    const total = espacos.length;

    const elGratuito = document.getElementById('kpiPctGratuito');
    const elAcessivel = document.getElementById('kpiPctAcessivel');
    const elInclusivos = document.getElementById('kpiInclusivos');
    const elIndice = document.getElementById('kpiIndiceEquidade');

    if (total === 0) {
        [elGratuito, elAcessivel, elInclusivos, elIndice].forEach(el => { if (el) el.textContent = '-'; });
        return;
    }

    const gratuitos = espacos.filter(e => e.entrada === 'gratuita').length;
    const acessiveis = espacos.filter(e => e.acessibilidade === 'sim' || e.acessibilidade === 'parcial').length;
    const inclusivos = espacos.filter(e => e.entrada === 'gratuita' && e.acessibilidade === 'sim').length;

    const pctGratuito = (gratuitos / total) * 100;
    const pctAcessivel = (acessiveis / total) * 100;

    if (elGratuito) elGratuito.textContent = `${pctGratuito.toFixed(0)}%`;
    if (elAcessivel) elAcessivel.textContent = `${pctAcessivel.toFixed(0)}%`;
    if (elInclusivos) elInclusivos.textContent = inclusivos;
    if (elIndice) elIndice.textContent = `${((pctGratuito + pctAcessivel) / 2).toFixed(0)}%`;
}

/**
 * Perfil de Consumo: concentração e diversidade entre categorias culturais.
 */
function updateKPIConsumo(espacos) {
    const categorias = calcularContagemCategorias(espacos);
    const total = espacos.length;

    const elTotalCategorias = document.getElementById('kpiTotalCategorias');
    const elTop = document.getElementById('kpiCategoriaTop');
    const elTopSub = document.getElementById('kpiCategoriaTopSub');
    const elNicho = document.getElementById('kpiCategoriasNicho');
    const elMedia = document.getElementById('kpiMediaCategoria');

    if (categorias.size === 0 || total === 0) {
        [elTotalCategorias, elTop, elNicho, elMedia].forEach(el => { if (el) el.textContent = '-'; });
        if (elTopSub) elTopSub.textContent = 'espaços cadastrados';
        return;
    }

    const ordenado = [...categorias.entries()].sort((a, b) => b[1] - a[1]);

    if (elTotalCategorias) elTotalCategorias.textContent = categorias.size;

    const [categoriaTop, qtdTop] = ordenado[0];
    if (elTop) elTop.textContent = categoriaTop;
    if (elTopSub) elTopSub.textContent = `${qtdTop} espaço${qtdTop === 1 ? '' : 's'} (${((qtdTop / total) * 100).toFixed(0)}%)`;

    const nicho = ordenado.filter(([, qtd]) => qtd === 1).length;
    if (elNicho) elNicho.textContent = nicho;

    if (elMedia) elMedia.textContent = (total / categorias.size).toFixed(1);
}

// ===================================
// RENDERIZAR GRÁFICOS
// ===================================

/**
 * Renderizar todos os gráficos
 */
async function renderCharts(espacos) {
    console.log('📊 Renderizando gráficos...');
    
    try {
        // 1. Distribuição Territorial
        await renderDistribuicaoChart(espacos);
        
        // 2. Tipo de Entrada
        await renderEntradaChart(espacos);
        
        // 3. Acessibilidade
        await renderAcessibilidadeChart(espacos);
        
        // 4. Categorias Culturais
        await renderCategoriasChart(espacos);
        
        console.log('✅ Todos os gráficos renderizados');
        
    } catch (error) {
        console.error('❌ Erro ao renderizar gráficos:', error);
        showToast('Erro ao criar visualizações', 'error');
    }
}

/**
 * 1. Gráfico de Distribuição Territorial
 * Analisa a distribuição por região/bairro
 */
async function renderDistribuicaoChart(espacos) {
    const canvasId = 'chartDistribuicao';
    const emptyId = 'emptyDistribuicao';
    
    try {
        // Extrair regiões dos endereços
        const distribuicao = calcularDistribuicaoRegional(espacos);

        // Se não houver dados suficientes
        if (distribuicao.size === 0) {
            showEmptyState(canvasId, emptyId);
            return;
        }
        
        // Ordenar por quantidade (top 10)
        const sorted = Array.from(distribuicao.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        const labels = sorted.map(item => item[0]);
        const data = sorted.map(item => item[1]);
        
        // Destruir gráfico anterior se existir
        if (chartDistribuicao) {
            chartDistribuicao.destroy();
        }
        
        // Criar gráfico
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        hideEmptyState(canvasId, emptyId);
        
        chartDistribuicao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade de Pontos Culturais',
                    data: data,
                    backgroundColor: CORES.grafico.slice(0, data.length),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 90, 61, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function(context) {
                                const total = espacos.length;
                                const valor = context.parsed.x;
                                const percentual = ((valor / total) * 100).toFixed(1);
                                return `${valor} pontos (${percentual}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    y: {
                        ticks: {
                            font: {
                                size: 12,
                                weight: '500'
                            },
                            color: '#2d5a3d'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        console.log('✅ Gráfico de distribuição renderizado');
        
    } catch (error) {
        console.error('❌ Erro no gráfico de distribuição:', error);
        showEmptyState(canvasId, emptyId);
    }
}

/**
 * 2. Gráfico de Tipo de Entrada (Gratuita vs Paga)
 */
async function renderEntradaChart(espacos) {
    const canvasId = 'chartEntrada';
    const emptyId = 'emptyEntrada';
    
    try {
        // Contar tipos de entrada
        const contagem = {
            gratuita: 0,
            paga: 0,
            nao_informado: 0
        };
        
        espacos.forEach(espaco => {
            const entrada = espaco.entrada || 'nao_informado';
            if (contagem.hasOwnProperty(entrada)) {
                contagem[entrada]++;
            } else {
                contagem.nao_informado++;
            }
        });
        
        // Filtrar apenas valores > 0
        const labels = [];
        const data = [];
        const colors = [];
        
        if (contagem.gratuita > 0) {
            labels.push('Entrada Gratuita');
            data.push(contagem.gratuita);
            colors.push(CORES.entrada.gratuita);
        }
        
        if (contagem.paga > 0) {
            labels.push('Entrada Paga');
            data.push(contagem.paga);
            colors.push(CORES.entrada.paga);
        }
        
        if (contagem.nao_informado > 0) {
            labels.push('Não Informado');
            data.push(contagem.nao_informado);
            colors.push(CORES.entrada.naoInformado);
        }
        
        // Se não houver dados
        if (data.length === 0) {
            showEmptyState(canvasId, emptyId);
            return;
        }
        
        // Destruir gráfico anterior
        if (chartEntrada) {
            chartEntrada.destroy();
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        hideEmptyState(canvasId, emptyId);
        
        chartEntrada = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 16,
                            font: {
                                size: 13,
                                weight: '500'
                            },
                            color: '#2d5a3d',
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 90, 61, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const valor = context.parsed;
                                const percentual = ((valor / total) * 100).toFixed(1);
                                return `${context.label}: ${valor} (${percentual}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        console.log('✅ Gráfico de entrada renderizado');
        
    } catch (error) {
        console.error('❌ Erro no gráfico de entrada:', error);
        showEmptyState(canvasId, emptyId);
    }
}

/**
 * 3. Gráfico de Acessibilidade
 */
async function renderAcessibilidadeChart(espacos) {
    const canvasId = 'chartAcessibilidade';
    const emptyId = 'emptyAcessibilidade';
    
    try {
        // Contar níveis de acessibilidade
        const contagem = {
            sim: 0,
            nao: 0,
            parcial: 0,
            nao_informado: 0
        };
        
        espacos.forEach(espaco => {
            const acess = espaco.acessibilidade || 'nao_informado';
            if (contagem.hasOwnProperty(acess)) {
                contagem[acess]++;
            } else {
                contagem.nao_informado++;
            }
        });
        
        // Filtrar apenas valores > 0
        const labels = [];
        const data = [];
        const colors = [];
        
        if (contagem.sim > 0) {
            labels.push('Acessível');
            data.push(contagem.sim);
            colors.push(CORES.acessibilidade.sim);
        }
        
        if (contagem.parcial > 0) {
            labels.push('Parcialmente Acessível');
            data.push(contagem.parcial);
            colors.push(CORES.acessibilidade.parcial);
        }
        
        if (contagem.nao > 0) {
            labels.push('Não Acessível');
            data.push(contagem.nao);
            colors.push(CORES.acessibilidade.nao);
        }
        
        if (contagem.nao_informado > 0) {
            labels.push('Não Informado');
            data.push(contagem.nao_informado);
            colors.push(CORES.acessibilidade.naoInformado);
        }
        
        // Se não houver dados
        if (data.length === 0) {
            showEmptyState(canvasId, emptyId);
            return;
        }
        
        // Destruir gráfico anterior
        if (chartAcessibilidade) {
            chartAcessibilidade.destroy();
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        hideEmptyState(canvasId, emptyId);
        
        chartAcessibilidade = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 3,
                    borderColor: '#ffffff',
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 16,
                            font: {
                                size: 13,
                                weight: '500'
                            },
                            color: '#2d5a3d',
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 90, 61, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const valor = context.parsed;
                                const percentual = ((valor / total) * 100).toFixed(1);
                                return `${context.label}: ${valor} (${percentual}%)`;
                            }
                        }
                    }
                }
            }
        });
        
        console.log('✅ Gráfico de acessibilidade renderizado');
        
    } catch (error) {
        console.error('❌ Erro no gráfico de acessibilidade:', error);
        showEmptyState(canvasId, emptyId);
    }
}

/**
 * 4. Gráfico de Categorias Culturais
 */
async function renderCategoriasChart(espacos) {
    const canvasId = 'chartCategorias';
    const emptyId = 'emptyCategorias';
    
    try {
        // Contar por categoria
        const contagem = calcularContagemCategorias(espacos);

        // Se não houver dados
        if (contagem.size === 0) {
            showEmptyState(canvasId, emptyId);
            return;
        }
        
        // Ordenar por quantidade
        const sorted = Array.from(contagem.entries())
            .sort((a, b) => b[1] - a[1]);
        
        const labels = sorted.map(item => item[0]);
        const data = sorted.map(item => item[1]);
        
        // Destruir gráfico anterior
        if (chartCategorias) {
            chartCategorias.destroy();
        }
        
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        hideEmptyState(canvasId, emptyId);
        
        chartCategorias = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Quantidade de Pontos',
                    data: data,
                    backgroundColor: CORES.grafico.slice(0, data.length),
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(45, 90, 61, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            size: 14,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 13
                        },
                        callbacks: {
                            label: function(context) {
                                const total = espacos.length;
                                const valor = context.parsed.y;
                                const percentual = ((valor / total) * 100).toFixed(1);
                                return `${valor} pontos (${percentual}%)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                size: 12
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 12,
                                weight: '500'
                            },
                            color: '#2d5a3d'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
        
        console.log('✅ Gráfico de categorias renderizado');
        
    } catch (error) {
        console.error('❌ Erro no gráfico de categorias:', error);
        showEmptyState(canvasId, emptyId);
    }
}

// ===================================
// EMPTY STATES
// ===================================

/**
 * Mostrar estado vazio para um gráfico específico
 */
function showEmptyState(canvasId, emptyId) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);
    
    if (canvas) canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
}

/**
 * Esconder estado vazio
 */
function hideEmptyState(canvasId, emptyId) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);
    
    if (canvas) canvas.style.display = 'block';
    if (empty) empty.style.display = 'none';
}

/**
 * Mostrar todos os estados vazios
 */
function showAllEmptyStates() {
    showEmptyState('chartDistribuicao', 'emptyDistribuicao');
    showEmptyState('chartEntrada', 'emptyEntrada');
    showEmptyState('chartAcessibilidade', 'emptyAcessibilidade');
    showEmptyState('chartCategorias', 'emptyCategorias');
    
    // Zerar estatísticas
    document.getElementById('statTotal').textContent = '0';
    document.getElementById('statGratuitos').textContent = '0';
    document.getElementById('statCategorias').textContent = '0';
    document.getElementById('statAcessibilidade').textContent = '0/0';

    // Zerar painéis de indicadores das demais seções
    updateInsightsVisaoGeral([]);
    updateKPITerritorio([]);
    updateKPIEquidade([]);
    updateKPIConsumo([]);
}

// ===================================
// UI HELPERS
// ===================================

/**
 * Esconder overlay de loading
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

/**
 * Toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.2s reverse';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

// ===================================
// CONSOLE LOG FINAL
// ===================================
console.log('✅ Observatório Cultural inicializado');
console.log('📊 Conectando com Firebase Firestore em tempo real');
console.log('🚫 Zero Mock Data - Apenas dados reais');
