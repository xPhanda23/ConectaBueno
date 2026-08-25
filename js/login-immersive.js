/* Efeitos visuais e controles de acessibilidade da entrada. */
'use strict';

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
    });

    menu.querySelector('[data-a11y="focus"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-focus');
        event.currentTarget.classList.toggle('is-active');
    });

    menu.querySelector('[data-a11y="contrast"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-high-contrast');
        event.currentTarget.classList.toggle('is-active');
    });

    menu.querySelector('[data-a11y="color"]')?.addEventListener('click', event => {
        document.body.classList.toggle('a11y-color-filter');
        event.currentTarget.classList.toggle('is-active');
    });

    let textSize = 16;
    menu.querySelector('[data-text-size="decrease"]')?.addEventListener('click', () => {
        textSize = Math.max(14, textSize - 1);
        document.documentElement.style.fontSize = `${textSize}px`;
    });

    menu.querySelector('[data-text-size="increase"]')?.addEventListener('click', () => {
        textSize = Math.min(20, textSize + 1);
        document.documentElement.style.fontSize = `${textSize}px`;
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.a11y-tools') && !menu.hidden) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTopographicOverlay();
    initAccessibilityTools();
});

window.initTopographicOverlay = initTopographicOverlay;
window.initAccessibilityTools = initAccessibilityTools;
