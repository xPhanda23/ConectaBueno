/**
 * accessibility.js — Conecta Bueno
 * Sistema único de acessibilidade, compartilhado por todas as páginas
 * (mapa, eventos, observatório, painel, configurações, login, home).
 *
 * Preferências ficam salvas em localStorage e são restauradas em
 * qualquer página que carregue este script + o widget #a11yToggle/#a11yMenu.
 */

'use strict';

(function () {
    const STORAGE_KEY = 'cb-a11y-prefs';
    const MIN_TEXT_SIZE = 14;
    const MAX_TEXT_SIZE = 22;
    const DEFAULT_TEXT_SIZE = 16;

    // No celular o tamanho já estava bom; no computador o texto ficava
    // pequeno demais. Em vez de mexer em cada font-size do CSS, aplicamos
    // um pequeno reforço extra na mesma variável de escala usada pelo
    // widget de acessibilidade, só acima do breakpoint mobile do site.
    const DESKTOP_MIN_WIDTH = 769;
    const DESKTOP_TEXT_BOOST = 1.08;

    const defaults = {
        focus: false,
        contrast: false,
        colorblind: 'none', // none | protanopia | deuteranopia | tritanopia | achromatopsia
        reduceMotion: false,
        underline: false,
        readableFont: false,
        spacing: false,
        cursor: false,
        textSize: DEFAULT_TEXT_SIZE
    };

    // Mapa entre data-a11y="..." dos botões e a chave correspondente no estado
    const TOGGLE_KEYS = {
        focus: 'focus',
        contrast: 'contrast',
        'readable-font': 'readableFont',
        spacing: 'spacing',
        underline: 'underline',
        motion: 'reduceMotion',
        cursor: 'cursor'
    };

    const BODY_CLASSES = {
        focus: 'a11y-focus',
        contrast: 'a11y-high-contrast',
        reduceMotion: 'a11y-reduce-motion',
        underline: 'a11y-underline-links',
        readableFont: 'a11y-readable-font',
        spacing: 'a11y-text-spacing',
        cursor: 'a11y-large-cursor'
    };

    let state = loadState();

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { ...defaults };
            const parsed = JSON.parse(raw);
            return { ...defaults, ...parsed };
        } catch {
            return { ...defaults };
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // localStorage indisponível (modo privado etc.) — segue sem persistir
        }
    }

    // As classes vão tanto no <body> quanto no <html>: elementos com
    // position:fixed (sidebar, header) são movidos para fora do <body>
    // por escapeFixedElementsFromFilter() logo abaixo, então uma regra
    // CSS como ".a11y-focus .admin-sidebar" só continua funcionando
    // depois desses elementos serem movidos se o <html> também carregar
    // a classe (ele é o novo ancestral deles).
    function applyBodyClasses() {
        Object.keys(BODY_CLASSES).forEach(stateKey => {
            const enabled = !!state[stateKey];
            document.body.classList.toggle(BODY_CLASSES[stateKey], enabled);
            document.documentElement.classList.toggle(BODY_CLASSES[stateKey], enabled);
        });
    }

    function applyColorblind() {
        if (state.colorblind && state.colorblind !== 'none') {
            document.body.setAttribute('data-a11y-colorblind', state.colorblind);
        } else {
            document.body.removeAttribute('data-a11y-colorblind');
        }
    }

    // O filtro de daltonismo (abaixo) precisa ficar no <body> ou no <html>
    // para colorir a página inteira — mas QUALQUER elemento com filter vira
    // "containing block" dos descendentes position:fixed (spec do CSS
    // Filter Effects). Isso quebra o próprio widget, toasts, modais, o
    // VLibras etc.: em vez de fixos à janela, eles passam a ficar fixos em
    // relação ao <body>/<html>, que é tão alto quanto a página inteira — ou
    // seja, somem de vista assim que a página rola. Corrigido movendo todo
    // elemento fixed de mais alto nível para fora do <body> (irmão dele,
    // filho de <html>) antes de qualquer filtro poder alcançá-lo.
    function escapeFixedElementsFromFilter() {
        const candidates = Array.from(document.body.querySelectorAll('*'));
        candidates.forEach(el => {
            if (getComputedStyle(el).position !== 'fixed') return;
            if (hasFixedAncestorWithinBody(el)) return; // já sai junto com o ancestral
            document.documentElement.appendChild(el);
        });
    }

    function hasFixedAncestorWithinBody(el) {
        let node = el.parentElement;
        while (node && node !== document.body) {
            if (getComputedStyle(node).position === 'fixed') return true;
            node = node.parentElement;
        }
        return false;
    }

    // A escala é aplicada via variável CSS (--a11y-text-scale), multiplicada
    // dentro de cada `font-size: calc(...)` do site (ver css/*.css). Mudar
    // diretamente o font-size do <html> só afeta unidades rem/em — e quase
    // todo o CSS do site usa px, então o texto das páginas mal mudava de
    // tamanho enquanto o próprio menu de acessibilidade (que usa rem)
    // disparava junto. A variável CSS resolve isso sem depender da unidade
    // usada em cada regra, e o menu (accessibility.css) fica de fora de
    // propósito, com tamanho fixo e estável.
    function applyTextSize() {
        const boost = window.innerWidth >= DESKTOP_MIN_WIDTH ? DESKTOP_TEXT_BOOST : 1;
        document.documentElement.style.setProperty('--a11y-text-scale', (state.textSize / DEFAULT_TEXT_SIZE) * boost);
    }

    function updateVideoPlayback() {
        const shouldPause = state.focus || state.reduceMotion;
        document.querySelectorAll('video[autoplay]').forEach(video => {
            if (shouldPause) {
                video.pause();
            } else {
                video.play().catch(() => {});
            }
        });
    }

    function applyAll() {
        applyBodyClasses();
        applyColorblind();
        applyTextSize();
        updateVideoPlayback();
    }

    // Filtros de correção de cor (daltonização), aplicados no <html> via
    // CSS `filter: url(#cb-xxx)` para não quebrar elementos com position:fixed.
    // Matrizes derivadas do modelo LMS (Machado/Viénot) + realocação de erro
    // (Daltonize), calculadas para não estourar as cores em telas saturadas.
    function ensureColorblindFilters() {
        if (document.getElementById('a11ySvgFilters')) return;
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('id', 'a11ySvgFilters');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
        svg.innerHTML = `
            <filter id="cb-protanopia" color-interpolation-filters="sRGB">
                <feColorMatrix type="matrix" values="
                    1.3107 -0.3107  0.0000 0 0
                    0.1781  0.8219  0.0000 0 0
                    0.2161 -0.2161  1.0000 0 0
                    0       0       0      1 0" />
            </filter>
            <filter id="cb-deuteranopia" color-interpolation-filters="sRGB">
                <feColorMatrix type="matrix" values="
                    1.2475 -0.2475  0.0000 0 0
                    0.0708  0.9292  0.0000 0 0
                    0.1811 -0.1811  1.0000 0 0
                    0       0       0      1 0" />
            </filter>
            <filter id="cb-tritanopia" color-interpolation-filters="sRGB">
                <!-- Protanopia/deuteranopia redistribuem o erro vermelho-verde
                     no canal azul (eixo R/G é o afetado nelas). Na tritanopia
                     quem falta é o cone S (azul), então o eixo confundido é
                     verde-azul: usar a mesma fórmula R-G aqui (como estava
                     antes) colapsava cores bem diferentes (ciano, azul,
                     laranja) todas em verde/rosa. Corrigido redistribuindo a
                     diferença G/B em vez de R/G. -->
                <feColorMatrix type="matrix" values="
                    1.0000  0.0000  0.0000 0 0
                    0.0000  1.0160 -0.0160 0 0
                    0.0000 -0.9840  1.9840 0 0
                    0       0       0      1 0" />
            </filter>
        `;
        document.body.appendChild(svg);
    }

    function setPressed(button, enabled) {
        if (!button) return;
        button.classList.toggle('is-active', !!enabled);
        button.setAttribute('aria-pressed', String(!!enabled));
    }

    function updateTextSizeOutput() {
        const output = document.getElementById('a11yTextSize');
        if (output) output.textContent = `${Math.round((state.textSize / DEFAULT_TEXT_SIZE) * 100)}%`;
    }

    function updateTextSizeButtons(menu) {
        const dec = menu.querySelector('[data-text-size="decrease"]');
        const inc = menu.querySelector('[data-text-size="increase"]');
        if (dec) dec.disabled = state.textSize <= MIN_TEXT_SIZE;
        if (inc) inc.disabled = state.textSize >= MAX_TEXT_SIZE;
    }

    function syncControls(menu) {
        Object.keys(TOGGLE_KEYS).forEach(dataKey => {
            const stateKey = TOGGLE_KEYS[dataKey];
            setPressed(menu.querySelector(`[data-a11y="${dataKey}"]`), state[stateKey]);
        });
        const select = menu.querySelector('#a11yColorblind');
        if (select) select.value = state.colorblind;
        updateTextSizeOutput();
        updateTextSizeButtons(menu);
    }

    function setupAccessibilityTools() {
        const toggle = document.getElementById('a11yToggle');
        const menu = document.getElementById('a11yMenu');
        if (!toggle || !menu) return;

        ensureColorblindFilters();
        escapeFixedElementsFromFilter();
        applyAll();
        syncControls(menu);

        toggle.addEventListener('click', () => {
            const isOpen = !menu.hidden;
            menu.hidden = isOpen;
            toggle.setAttribute('aria-expanded', String(!isOpen));
            if (!isOpen) menu.querySelector('button, select')?.focus();
        });

        menu.querySelector('.a11y-menu__close')?.addEventListener('click', () => {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.focus();
        });

        menu.querySelectorAll('[data-a11y]').forEach(button => {
            const dataKey = button.dataset.a11y;
            const stateKey = TOGGLE_KEYS[dataKey];
            if (!stateKey) return; // ignora data-a11y="reset", tratado à parte
            button.addEventListener('click', event => {
                state[stateKey] = !state[stateKey];
                applyBodyClasses();
                if (stateKey === 'focus' || stateKey === 'reduceMotion') updateVideoPlayback();
                setPressed(event.currentTarget, state[stateKey]);
                saveState();
            });
        });

        menu.querySelector('#a11yColorblind')?.addEventListener('change', event => {
            state.colorblind = event.target.value;
            // Reescaneia: widgets de terceiros (VLibras) e modais que carregam
            // depois do load inicial podem ter surgido como position:fixed
            // dentro do body nesse meio-tempo.
            escapeFixedElementsFromFilter();
            applyColorblind();
            saveState();
        });

        menu.querySelector('[data-text-size="decrease"]')?.addEventListener('click', () => {
            state.textSize = Math.max(MIN_TEXT_SIZE, state.textSize - 1);
            applyTextSize();
            updateTextSizeOutput();
            updateTextSizeButtons(menu);
            saveState();
        });

        menu.querySelector('[data-text-size="increase"]')?.addEventListener('click', () => {
            state.textSize = Math.min(MAX_TEXT_SIZE, state.textSize + 1);
            applyTextSize();
            updateTextSizeOutput();
            updateTextSizeButtons(menu);
            saveState();
        });

        menu.querySelector('[data-a11y="reset"]')?.addEventListener('click', () => {
            state = { ...defaults };
            applyAll();
            syncControls(menu);
            saveState();
        });

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

    function init() {
        setupAccessibilityTools();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Reaplica a escala se a janela cruzar o breakpoint desktop/mobile
    // (redimensionar a janela, girar um tablet, etc.), e de novo no "load"
    // como rede de segurança — em alguns navegadores/emuladores o tamanho
    // real da viewport só fica disponível depois do DOMContentLoaded.
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyTextSize, 150);
    });
    window.addEventListener('load', applyTextSize);

    if (typeof window !== 'undefined') {
        window.CBAccessibility = {
            getState: () => ({ ...state }),
            setupAccessibilityTools,
            // Idempotente — seguro chamar de novo depois de inserir UI fixa
            // nova dinamicamente (ex.: um modal criado via createElement).
            sweepFixedElements: escapeFixedElementsFromFilter
        };
    }
})();
