// ============================================
// LEGAL.JS — abre Termos de Uso / Política de
// Privacidade num card, sem sair da página.
//
// Busca o conteúdo direto de pages/termos-de-uso.html
// e pages/politica-de-privacidade.html (a fonte
// única do texto legal) e injeta no card — assim
// o card nunca fica com uma cópia desatualizada
// em relação à página completa.
// ============================================

function openLegalModal(event, url, title) {
    if (event) event.preventDefault();

    const modal = document.getElementById('legalModal');
    const titleEl = document.getElementById('legalModalTitle');
    const body = document.getElementById('legalModalBody');
    if (!modal || !body) return;

    if (titleEl) titleEl.textContent = title || '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (body.dataset.loadedUrl === url) return;

    body.innerHTML = '<p class="legal-modal__loading">Carregando…</p>';

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        })
        .then(html => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const content = doc.querySelector('.legal-content');
            if (!content) throw new Error('Conteúdo não encontrado');
            const updateDate = doc.querySelector('.update-date');
            body.innerHTML = (updateDate ? `<p class="update-date">${updateDate.textContent}</p>` : '') + content.innerHTML;
            body.dataset.loadedUrl = url;
        })
        .catch(() => {
            body.innerHTML = `<p class="legal-modal__error">Não foi possível carregar o conteúdo agora.</p><p><a href="${url}" target="_blank" rel="noopener">Abrir em uma nova aba</a></p>`;
            delete body.dataset.loadedUrl;
        });
}

function closeLegalModal() {
    const modal = document.getElementById('legalModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('click', e => {
    if (e.target.id === 'legalModal') closeLegalModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLegalModal();
});
