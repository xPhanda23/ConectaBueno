/**
 * modal-legal.js — Sistema de Modal para Termos e Políticas
 */

// Conteúdo dos modais (carregado na primeira vez)
let termosCarregados = false;
let privacidadeCarregada = false;

/**
 * Abre um modal específico
 * @param {'termos'|'privacidade'} tipo 
 */
function abrirModal(tipo) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(`modal-${tipo}`);
    
    if (!overlay || !modal) return;
    
    // Mostra overlay e modal
    overlay.classList.add('active');
    modal.classList.add('active');
    
    // Carrega conteúdo se ainda não foi carregado
    if (tipo === 'termos' && !termosCarregados) {
        carregarTermos();
    } else if (tipo === 'privacidade' && !privacidadeCarregada) {
        carregarPrivacidade();
    }
    
    // Bloqueia scroll do body
    document.body.style.overflow = 'hidden';
    
    // Fecha ao clicar no overlay
    overlay.onclick = () => fecharModal(tipo);
}

/**
 * Fecha um modal específico
 * @param {'termos'|'privacidade'} tipo 
 */
function fecharModal(tipo) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById(`modal-${tipo}`);
    
    if (!overlay || !modal) return;
    
    overlay.classList.remove('active');
    modal.classList.remove('active');
    
    // Reativa scroll do body
    document.body.style.overflow = '';
    
    overlay.onclick = null;
}

/**
 * Carrega o conteúdo dos Termos de Uso
 */
async function carregarTermos() {
    const container = document.getElementById('content-termos');
    if (!container) return;
    
    try {
        const response = await fetch('termos-de-uso.html');
        const html = await response.text();
        
        // Extrai apenas o conteúdo da seção legal-content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.querySelector('.legal-content');
        
        if (content) {
            container.innerHTML = content.innerHTML;
            termosCarregados = true;
        } else {
            container.innerHTML = '<p style="color: #e53e3e;">Erro ao carregar conteúdo.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar termos:', error);
        container.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <p style="color: #e53e3e; margin-bottom: 16px;">Não foi possível carregar os Termos de Uso.</p>
                <a href="termos-de-uso.html" target="_blank" style="color: #2a7d4f; font-weight: 600;">
                    Abrir em nova aba →
                </a>
            </div>
        `;
    }
}

/**
 * Carrega o conteúdo da Política de Privacidade
 */
async function carregarPrivacidade() {
    const container = document.getElementById('content-privacidade');
    if (!container) return;
    
    try {
        const response = await fetch('politica-de-privacidade.html');
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.querySelector('.legal-content');
        
        if (content) {
            container.innerHTML = content.innerHTML;
            privacidadeCarregada = true;
        } else {
            container.innerHTML = '<p style="color: #e53e3e;">Erro ao carregar conteúdo.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar política:', error);
        container.innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <p style="color: #e53e3e; margin-bottom: 16px;">Não foi possível carregar a Política de Privacidade.</p>
                <a href="politica-de-privacidade.html" target="_blank" style="color: #2a7d4f; font-weight: 600;">
                    Abrir em nova aba →
                </a>
            </div>
        `;
    }
}

// Inicializa os event listeners quando o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    // Links dos termos e políticas
    const linksTermos = document.querySelectorAll('.link-termos');
    
    linksTermos.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const modalType = this.getAttribute('data-modal');
            if (modalType) {
                abrirModal(modalType);
            }
        });
    });
    
    // Fecha modal ao pressionar ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            fecharModal('termos');
            fecharModal('privacidade');
        }
    });
});
