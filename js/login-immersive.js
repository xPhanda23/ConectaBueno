/* Efeitos visuais e controles de acessibilidade da entrada. */
'use strict';

let insightInterval;

function initTopographicOverlay() {
    document.body.classList.add('topography-ready');
}

function initAccessibilityTools() {
    const toggle = document.getElementById('a11yToggle');
    const menu = document.getElementById('a11yMenu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
        const isOpen = !menu.hidden;
        menu.hidden = isOpen;
        toggle.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) menu.querySelector('button')?.focus();
    });

    menu.querySelector('.a11y-menu__close')?.addEventListener('click', () => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
    });

    menu.querySelector('[data-a11y="focus"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-focus');
        _setAccessibilityState(event.currentTarget, document.body.classList.contains('a11y-focus'));
    });

    menu.querySelector('[data-a11y="contrast"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-high-contrast');
        _setAccessibilityState(event.currentTarget, document.body.classList.contains('a11y-high-contrast'));
    });

    menu.querySelector('[data-a11y="color"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-color-filter');
        _setAccessibilityState(event.currentTarget, document.body.classList.contains('a11y-color-filter'));
    });

    let textSize = 16;
    menu.querySelector('[data-text-size="decrease"]')?.addEventListener('click', () => {
        textSize = Math.max(14, textSize - 1);
        document.documentElement.style.fontSize = `${textSize}px`;
        _updateTextSize(textSize);
    });

    menu.querySelector('[data-text-size="increase"]')?.addEventListener('click', () => {
        textSize = Math.min(20, textSize + 1);
        document.documentElement.style.fontSize = `${textSize}px`;
        _updateTextSize(textSize);
    });

    function _updateTextSize(size) {
        const output = document.getElementById('a11yTextSize');
        if (output) output.textContent = `${Math.round((size / 16) * 100)}%`;
    }

    function _setAccessibilityState(button, enabled) {
        button.classList.toggle('is-active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
    }

    document.addEventListener('click', event => {
        if (!event.target.closest('.a11y-tools') && !menu.hidden) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
        }
    });
}

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
    initAccessibilityTools();
});
document.addEventListener('insight:ready', initInsightCarousel);

window.initTopographicOverlay = initTopographicOverlay;
window.initAccessibilityTools = initAccessibilityTools;
window.initInsightCarousel = initInsightCarousel;
