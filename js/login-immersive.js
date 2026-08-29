/* Efeitos visuais e controles de acessibilidade da entrada. */
'use strict';

let insightInterval;

function initTopographicOverlay() {
    document.body.classList.add('topography-ready');
}

// Ferramentas de acessibilidade: ver js/accessibility.js (compartilhado
// por todas as páginas, incluindo esta).

function initInsightCarousel() {
    const container = document.getElementById('eventosListaVitrine');
    const slides = [...(container?.querySelectorAll('.insight-slide') || [])];
    const dots = [...(container?.querySelectorAll('.insight-dots span') || [])];
    if (slides.length < 2) return;

    let activeIndex = 0;
    const showSlide = index => {
        activeIndex = index % slides.length;
        slides.forEach((slide, slideIndex) => {
            const isActive = slideIndex === activeIndex;
            slide.classList.toggle('is-active', isActive);
            slide.setAttribute('aria-hidden', String(!isActive));
        });
        dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === activeIndex));
    };

    window.clearInterval(insightInterval);
    insightInterval = window.setInterval(() => showSlide(activeIndex + 1), 5000);
    container.addEventListener('mouseenter', () => window.clearInterval(insightInterval));
    container.addEventListener('mouseleave', () => {
        insightInterval = window.setInterval(() => showSlide(activeIndex + 1), 5000);
    });
    container.addEventListener('focusin', () => window.clearInterval(insightInterval));
    container.addEventListener('focusout', () => {
        insightInterval = window.setInterval(() => showSlide(activeIndex + 1), 5000);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTopographicOverlay();
});
document.addEventListener('insight:ready', initInsightCarousel);

window.initTopographicOverlay = initTopographicOverlay;
window.initInsightCarousel = initInsightCarousel;
