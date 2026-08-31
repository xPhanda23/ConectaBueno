/**
 * legal.js — Conecta Bueno
 * Comportamento compartilhado das páginas de Termos de Uso e Política
 * de Privacidade: sumário com destaque da seção ativa, alternância do
 * sumário no mobile, barra de progresso de leitura e botão "voltar ao topo".
 */

'use strict';

function setupLegalToc() {
    const toc = document.getElementById('lgToc');
    const toggle = document.getElementById('lgTocToggle');
    const links = Array.from(document.querySelectorAll('.lg-toc-list a'));
    const sections = links
        .map(link => document.getElementById(link.getAttribute('href').slice(1)))
        .filter(Boolean);

    if (toggle && toc) {
        toggle.addEventListener('click', () => {
            const isOpen = toc.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
    }

    // No mobile, escolher uma seção fecha o sumário (evita ficar
    // sobrepondo o conteúdo depois do scroll).
    links.forEach(link => {
        link.addEventListener('click', () => {
            if (toc && window.innerWidth <= 960) {
                toc.classList.remove('is-open');
                toggle?.setAttribute('aria-expanded', 'false');
            }
        });
    });

    if (!sections.length || !('IntersectionObserver' in window)) return;

    const setActive = (id) => {
        links.forEach(link => link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`));
    };

    const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
    }, {
        rootMargin: '-96px 0px -65% 0px',
        threshold: 0
    });

    sections.forEach(section => observer.observe(section));
}

function setupLegalProgress() {
    const bar = document.getElementById('lgProgress');
    if (!bar) return;

    const update = () => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
        bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
}

function setupBackToTop() {
    const btn = document.getElementById('lgTopBtn');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('is-visible', window.scrollY > 480);
    }, { passive: true });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setupPrintButton() {
    document.getElementById('lgPrintBtn')?.addEventListener('click', () => window.print());
}

function initLegalPage() {
    setupLegalToc();
    setupLegalProgress();
    setupBackToTop();
    setupPrintButton();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLegalPage);
} else {
    initLegalPage();
}
