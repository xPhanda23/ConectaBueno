/**
 * noticias.js — Sala de notícias — Conecta Bueno
 *
 * Redação da página de eventos: lê a coleção `noticias` do Firestore e
 * monta uma seção editorial com hierarquia (matéria de destaque + grade),
 * busca, filtro por categoria, paginação e um leitor dedicado com barra
 * de progresso, compartilhamento e navegação entre matérias.
 *
 * ZERO dados fake — tudo vem do Firestore. Metadados como tempo de
 * leitura e "há 2 dias" são DERIVADOS do próprio conteúdo salvo, não
 * inventados.
 *
 * Quem dispara a carga é eventos.js, já dentro do onAuthStateChanged:
 * as regras do Firestore exigem sessão (mesmo anônima) para ler.
 *
 * API: window.Noticias.carregar()
 */

'use strict';

(function () {

// ─────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────

const POR_PAGINA   = 6;    // matérias por lote na grade
const LIMITE_LEITURA = 60; // teto de documentos lidos do Firestore
const PPM          = 200;  // palavras por minuto — média de leitura adulta
const DIAS_NOVO    = 7;    // janela do selo "Novo"

/* Ícone por categoria — as mesmas opções do formulário do painel
   (pages/panel.html → #noticiaCategoria). */
const ICONES_CAT = {
    'Cultura':     '🎭',
    'Eventos':     '📅',
    'Turismo':     '🌿',
    'Gastronomia': '🍽️',
    'Patrimônio':  '🏛️',
    'Geral':       '📰'
};

// ─────────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────────

let _todas     = [];        // tudo que veio do Firestore
let _visiveis  = [];        // após categoria + busca
let _categoria = 'todas';
let _busca     = '';
let _pagina    = 1;
let _lendo     = null;      // matéria aberta no leitor
let _focoAnterior = null;   // para devolver o foco ao fechar
let _ligado    = false;     // listeners já registrados?
let _entradaPropria = false; // criamos uma entrada de histórico ao abrir?

// ─────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────────

/* Cópias locais para o módulo não depender da ordem de carregamento
   dos scripts da página. */

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Escapa uma URL para uso dentro de url('...') num atributo style:
 *  esc() vira &#39; que o navegador decodifica de volta para ' e
 *  encerraria a string CSS antes da hora. */
function escUrl(url) {
    return esc(String(url ?? '').replace(/["'()\\]/g, encodeURIComponent));
}

function toDate(val) {
    if (!val) return null;
    if (val?.toDate)  return val.toDate();
    if (val?.seconds) return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function avisar(msg, tipo = 'info') {
    if (typeof window.showToast === 'function') window.showToast(msg, tipo);
}

function el(id) { return document.getElementById(id); }

/** Texto de pré-visualização: resumo do editor ou o começo do conteúdo. */
function preview(n) {
    const bruto = (n.resumo || '').trim() || (n.conteudo || '').trim();
    return bruto.replace(/\s+/g, ' ');
}

/** Minutos de leitura, contados do conteúdo real salvo. */
function tempoDeLeitura(n) {
    const palavras = (n.conteudo || '').trim().split(/\s+/).filter(Boolean).length;
    if (!palavras) return null;
    return Math.max(1, Math.round(palavras / PPM));
}

function ehNova(n) {
    const d = toDate(n.createdAt);
    if (!d) return false;
    return (Date.now() - d.getTime()) < DIAS_NOVO * 86400000;
}

/** "hoje", "ontem", "há 4 dias", "há 3 semanas" — depois disso, a data. */
function dataRelativa(data) {
    if (!data) return '';

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dia  = new Date(data); dia.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje - dia) / 86400000);

    if (dias <  0) return dataAbsoluta(data);
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias <  7) return `há ${dias} dias`;
    if (dias < 30) {
        const semanas = Math.floor(dias / 7);
        return semanas === 1 ? 'há 1 semana' : `há ${semanas} semanas`;
    }
    return dataAbsoluta(data);
}

function dataAbsoluta(data) {
    return data
        ? data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
}

function dataPorExtenso(data) {
    return data
        ? data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
}

function iconeCat(cat) {
    return ICONES_CAT[cat] || '📰';
}

function linkDe(n) {
    return `${location.origin}${location.pathname}?noticia=${encodeURIComponent(n.id)}`;
}

// ─────────────────────────────────────────────────────────────────
// CARGA
// ─────────────────────────────────────────────────────────────────

async function carregar() {
    const secao = el('secNoticias');
    if (!secao) return;

    const db = window.db;
    if (!db) { estadoErro('Não foi possível conectar ao servidor.'); return; }

    try {
        let docs;
        try {
            const snap = await db.collection('noticias')
                .where('status', '==', 'publicado')
                .orderBy('createdAt', 'desc')
                .limit(LIMITE_LEITURA)
                .get();
            docs = snap.docs;
        } catch (err) {
            // A consulta com orderBy exige índice composto; sem ele a seção
            // inteira sumia da página. Ordenamos aqui mesmo.
            console.warn('⚠️ notícias (fallback sem orderBy):', err?.code || err);
            const snap = await db.collection('noticias')
                .where('status', '==', 'publicado')
                .get();
            docs = snap.docs;
        }

        _todas = docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (toDate(b.createdAt) ?? 0) - (toDate(a.createdAt) ?? 0))
            .slice(0, LIMITE_LEITURA);

    } catch (err) {
        console.warn('⚠️ notícias indisponíveis:', err?.code || err);
        estadoErro('Não foi possível carregar as notícias agora.');
        return;
    }

    ligarListeners();
    montarFiltros();
    aplicarFiltros();
    abrirDoQuery();
}

// ─────────────────────────────────────────────────────────────────
// FILTROS E BUSCA
// ─────────────────────────────────────────────────────────────────

function montarFiltros() {
    const wrap = el('nwFilters');
    if (!wrap) return;

    const cats = [...new Set(_todas.map(n => n.categoria).filter(Boolean))].sort();

    // Uma categoria só (ou nenhuma) não dá escolha nenhuma ao leitor.
    if (cats.length < 2) { wrap.hidden = true; return; }

    wrap.hidden = false;
    wrap.innerHTML = '';

    const botoes = [{ valor: 'todas', rotulo: 'Todas', icone: '' }]
        .concat(cats.map(c => ({ valor: c, rotulo: c, icone: iconeCat(c) })));

    botoes.forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nw-chip' + (b.valor === _categoria ? ' is-active' : '');
        btn.dataset.nwCat = b.valor;
        btn.setAttribute('aria-pressed', String(b.valor === _categoria));
        btn.innerHTML = b.icone
            ? `<span aria-hidden="true">${b.icone}</span>${esc(b.rotulo)}`
            : esc(b.rotulo);
        wrap.appendChild(btn);
    });
}

function aplicarFiltros() {
    const termo = _busca.trim().toLowerCase();

    _visiveis = _todas.filter(n => {
        if (_categoria !== 'todas' && n.categoria !== _categoria) return false;
        if (!termo) return true;
        return [n.titulo, n.resumo, n.conteudo, n.autor, n.categoria]
            .some(campo => (campo || '').toLowerCase().includes(termo));
    });

    _pagina = 1;
    renderizar();
}

function filtrando() {
    return _categoria !== 'todas' || _busca.trim() !== '';
}

// ─────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────

function renderizar() {
    const lead  = el('nwLead');
    const grade = el('nwGrid');
    const mais  = el('nwMore');
    const vazio = el('nwEmpty');
    const conta = el('nwCount');
    if (!grade) return;

    // Nada encontrado
    if (!_visiveis.length) {
        lead.innerHTML  = '';
        lead.hidden     = true;
        grade.innerHTML = '';
        mais.hidden     = true;
        if (conta) conta.textContent = _todas.length ? '0 resultados' : '';
        mostrarVazio(vazio, _todas.length
            ? { titulo: 'Nenhuma notícia encontrada', texto: 'Tente outra busca ou volte para todas as categorias.', limpar: true }
            : { titulo: 'Ainda não há notícias publicadas', texto: 'Assim que a redação publicar algo, aparece aqui.', limpar: false });
        return;
    }

    vazio.hidden = true;

    if (conta) {
        conta.textContent = _visiveis.length === 1
            ? '1 notícia'
            : `${_visiveis.length} notícias`;
    }

    // A matéria de destaque só faz sentido na visão sem filtro — buscando,
    // o leitor quer comparar resultados equivalentes, não uma manchete.
    let paraGrade = _visiveis;

    if (!filtrando()) {
        // O editor escolhe a manchete pelo campo `destaque`; sem escolha,
        // vale a mais recente.
        const manchete = _visiveis.find(n => n.destaque) || _visiveis[0];
        lead.innerHTML = cardManchete(manchete);
        lead.hidden = false;
        paraGrade = _visiveis.filter(n => n.id !== manchete.id);
    } else {
        lead.innerHTML = '';
        lead.hidden = true;
    }

    const ate = _pagina * POR_PAGINA;
    grade.innerHTML = paraGrade.slice(0, ate).map(cardPadrao).join('');
    grade.hidden = paraGrade.length === 0;

    const restam = paraGrade.length - ate;
    mais.hidden = restam <= 0;
    const btn = el('nwMoreBtn');
    if (btn && restam > 0) {
        btn.textContent = restam === 1
            ? 'Carregar mais 1 notícia'
            : `Carregar mais ${Math.min(restam, POR_PAGINA)} notícias`;
    }
}

function mostrarVazio(box, { titulo, texto, limpar }) {
    box.hidden = false;
    box.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" stroke-width="2"/>
            <path d="M12 18h12M12 24h18M12 30h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h3>${esc(titulo)}</h3>
        <p>${esc(texto)}</p>
        ${limpar ? '<button type="button" class="nw-btn-ghost" data-nw-clear>Limpar filtros</button>' : ''}
    `;
}

function estadoErro(msg) {
    const grade = el('nwGrid');
    const vazio = el('nwEmpty');
    el('nwLead')?.setAttribute('hidden', '');
    el('nwMore')?.setAttribute('hidden', '');
    el('nwFilters')?.setAttribute('hidden', '');
    if (grade) { grade.innerHTML = ''; grade.hidden = true; }
    if (vazio) mostrarVazio(vazio, { titulo: 'Notícias indisponíveis', texto: msg, limpar: false });
}

/** Fundo do card: foto real quando existe, senão um marcador neutro. */
function midia(n, classe) {
    const style = n.imagem
        ? ` style="background-image:url('${escUrl(n.imagem)}')"`
        : '';
    return `
        <div class="${classe}${n.imagem ? '' : ' is-sem-foto'}"${style}>
            ${n.imagem ? '' : `
                <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                    <rect x="3" y="7" width="30" height="22" rx="2" stroke="currentColor" stroke-width="1.8"/>
                    <path d="M7 5v3M29 5v3M3 15h30" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>`}
            ${n.categoria ? `<span class="nw-badge-cat"><span aria-hidden="true">${iconeCat(n.categoria)}</span>${esc(n.categoria)}</span>` : ''}
            ${ehNova(n) ? '<span class="nw-badge-novo">Novo</span>' : ''}
        </div>
    `;
}

/** Linha de assinatura: autor · quando · tempo de leitura. */
function assinatura(n) {
    const data = toDate(n.createdAt);
    const min  = tempoDeLeitura(n);

    const partes = [];
    if (n.autor) partes.push(`<span class="nw-autor">${esc(n.autor)}</span>`);
    if (data)    partes.push(`<time datetime="${data.toISOString()}" title="${esc(dataPorExtenso(data))}">${esc(dataRelativa(data))}</time>`);
    if (min)     partes.push(`<span>${min} min de leitura</span>`);

    return partes.join('<span class="nw-sep" aria-hidden="true">·</span>');
}

function cardManchete(n) {
    return `
        <article class="nw-lead-card">
            ${midia(n, 'nw-lead-media')}
            <div class="nw-lead-body">
                <span class="nw-eyebrow">${n.destaque ? 'Destaque da redação' : 'Última notícia'}</span>
                <h3 class="nw-lead-title">
                    <button type="button" class="nw-open" data-nw-id="${esc(n.id)}">${esc(n.titulo || 'Notícia')}</button>
                </h3>
                ${preview(n) ? `<p class="nw-lead-resumo">${esc(preview(n))}</p>` : ''}
                <p class="nw-meta">${assinatura(n)}</p>
                <span class="nw-cta">
                    Ler matéria completa
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path d="M4.5 3l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                </span>
            </div>
        </article>
    `;
}

function cardPadrao(n) {
    return `
        <article class="nw-card">
            ${midia(n, 'nw-card-media')}
            <div class="nw-card-body">
                <h3 class="nw-card-title">
                    <button type="button" class="nw-open" data-nw-id="${esc(n.id)}">${esc(n.titulo || 'Notícia')}</button>
                </h3>
                ${preview(n) ? `<p class="nw-card-resumo">${esc(preview(n))}</p>` : ''}
            </div>
            <footer class="nw-card-foot">
                <p class="nw-meta">${assinatura(n)}</p>
            </footer>
        </article>
    `;
}

// ─────────────────────────────────────────────────────────────────
// LEITOR
// ─────────────────────────────────────────────────────────────────

/** Parágrafos do conteúdo salvo. O primeiro ganha destaque tipográfico,
 *  como o lide de uma matéria impressa. */
function corpo(n) {
    const paragrafos = (n.conteudo || '')
        .split(/\n+/)
        .map(p => p.trim())
        .filter(Boolean);

    if (!paragrafos.length) return '<p class="nw-read-vazio">Esta notícia ainda não tem conteúdo.</p>';

    return paragrafos
        .map((p, i) => `<p${i === 0 ? ' class="nw-lide"' : ''}>${esc(p)}</p>`)
        .join('');
}

/**
 * @param {string} id
 * @param {{ deepLink?: boolean }} [opcoes] deepLink: a página já abriu em
 *        ?noticia=<id>, então a URL não precisa (nem deve) ser empilhada.
 */
function abrirLeitor(id, opcoes = {}) {
    const n = _todas.find(x => x.id === id);
    if (!n) return;

    const modal   = el('newsReader');
    const conteudo = el('nwReaderContent');
    const scroll  = el('nwReaderScroll');
    if (!modal || !conteudo) return;

    const jaAberto = modal.hidden === false;

    _lendo = n;
    if (!jaAberto) _focoAnterior = document.activeElement;

    const data = toDate(n.createdAt);
    const min  = tempoDeLeitura(n);

    conteudo.innerHTML = `
        ${n.imagem ? `<div class="nw-read-hero" style="background-image:url('${escUrl(n.imagem)}')"></div>` : ''}
        <div class="nw-read-body">
            <div class="nw-read-tags">
                ${n.categoria ? `<span class="nw-read-cat"><span aria-hidden="true">${iconeCat(n.categoria)}</span>${esc(n.categoria)}</span>` : ''}
                ${ehNova(n) ? '<span class="nw-badge-novo nw-badge-novo--inline">Novo</span>' : ''}
            </div>

            <h2 class="nw-read-title" id="nwReaderTitle">${esc(n.titulo || 'Notícia')}</h2>

            <p class="nw-read-meta">
                ${n.autor ? `Por <strong>${esc(n.autor)}</strong>` : 'Redação Conecta Bueno'}
                ${data ? `<span class="nw-sep" aria-hidden="true">·</span><time datetime="${data.toISOString()}">${esc(dataPorExtenso(data))}</time>` : ''}
                ${min ? `<span class="nw-sep" aria-hidden="true">·</span>${min} min de leitura` : ''}
            </p>

            <div class="nw-read-acoes">
                <button type="button" class="nw-acao" data-nw-share>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <circle cx="11" cy="3" r="2" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="3" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="11" cy="11" r="2" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M4.8 6L9.2 4M4.8 8l4.4 2" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    Compartilhar
                </button>
                <a class="nw-acao" data-nw-whats href="https://wa.me/?text=${encodeURIComponent(`${n.titulo || 'Notícia'} — ${linkDe(n)}`)}" target="_blank" rel="noopener">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M7 1.5a5.5 5.5 0 00-4.7 8.3L1.5 12.5l2.8-.75A5.5 5.5 0 107 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    </svg>
                    WhatsApp
                </a>
                <button type="button" class="nw-acao" data-nw-copy>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M9.5 4.5v-1a1.5 1.5 0 00-1.5-1.5H3a1.5 1.5 0 00-1.5 1.5V8A1.5 1.5 0 003 9.5h1" stroke="currentColor" stroke-width="1.4"/>
                    </svg>
                    Copiar link
                </button>
            </div>

            <div class="nw-read-conteudo">${corpo(n)}</div>
        </div>
    `;

    montarNavegacao(n);

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (scroll) scroll.scrollTop = 0;
    atualizarProgresso();
    if (!jaAberto) el('nwReaderClose')?.focus();

    // Uma entrada de histórico por SESSÃO de leitura, não por matéria:
    // pular de uma para outra troca a URL no lugar, então "voltar" sai da
    // leitura em vez de desandar matéria por matéria.
    if (opcoes.deepLink) {
        _entradaPropria = false;               // a URL já é a da matéria
    } else if (jaAberto) {
        trocarUrl('replaceState', linkDe(n));
    } else {
        _entradaPropria = trocarUrl('pushState', linkDe(n));
    }
}

/** Mexe na barra de endereços sem recarregar. Devolve false em contextos
 *  onde a History API não funciona (file://, por exemplo). */
function trocarUrl(metodo, url) {
    try {
        history[metodo]({ noticia: _lendo?.id ?? null }, '', url);
        return true;
    } catch {
        return false;
    }
}

function montarNavegacao(n) {
    const nav = el('nwReaderNav');
    if (!nav) return;

    // Navega dentro do que o leitor está vendo, não da coleção inteira.
    const lista = _visiveis.length ? _visiveis : _todas;
    const i = lista.findIndex(x => x.id === n.id);

    const anterior = i > 0 ? lista[i - 1] : null;              // mais recente
    const proxima  = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null; // mais antiga

    if (!anterior && !proxima) { nav.hidden = true; nav.innerHTML = ''; return; }

    nav.hidden = false;
    nav.innerHTML = `
        ${anterior ? `
            <button type="button" class="nw-nav-item nw-nav-prev" data-nw-id="${esc(anterior.id)}">
                <span class="nw-nav-dir">← Mais recente</span>
                <span class="nw-nav-titulo">${esc(anterior.titulo || 'Notícia')}</span>
            </button>` : '<span></span>'}
        ${proxima ? `
            <button type="button" class="nw-nav-item nw-nav-next" data-nw-id="${esc(proxima.id)}">
                <span class="nw-nav-dir">Mais antiga →</span>
                <span class="nw-nav-titulo">${esc(proxima.titulo || 'Notícia')}</span>
            </button>` : '<span></span>'}
    `;
}

/** Fechamento pedido pelo usuário (X, overlay, Esc). Quando a abertura
 *  criou uma entrada de histórico, desfazemos por ela — o popstate chama
 *  fecharLeitor() e a URL volta sozinha ao que era antes. */
function pedirFechar() {
    if (_entradaPropria) { _entradaPropria = false; history.back(); return; }
    fecharLeitor();
}

function fecharLeitor() {
    const modal = el('newsReader');
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    document.body.style.overflow = '';
    _lendo = null;
    _entradaPropria = false;

    // Sobrou ?noticia= na barra (caso do deep link)? Limpa sem empilhar.
    if (new URLSearchParams(location.search).has('noticia')) {
        trocarUrl('replaceState', location.pathname);
    }

    _focoAnterior?.focus?.();
    _focoAnterior = null;
}

/** Barra de progresso da leitura. */
function atualizarProgresso() {
    const scroll = el('nwReaderScroll');
    const barra  = el('nwProgressBar');
    if (!scroll || !barra) return;

    const total = scroll.scrollHeight - scroll.clientHeight;
    const pct   = total > 8 ? Math.min(100, (scroll.scrollTop / total) * 100) : 0;
    barra.style.width = pct.toFixed(1) + '%';
}

// ─────────────────────────────────────────────────────────────────
// COMPARTILHAMENTO
// ─────────────────────────────────────────────────────────────────

function compartilhar(n) {
    const url = linkDe(n);
    if (navigator.share) {
        navigator.share({ title: n.titulo || 'Notícia', text: preview(n).slice(0, 120), url }).catch(() => {});
        return;
    }
    copiarLink(n);
}

function copiarLink(n) {
    navigator.clipboard?.writeText(linkDe(n))
        .then(() => avisar('Link da notícia copiado!', 'success'))
        .catch(() => avisar('Não foi possível copiar o link', 'error'));
}

// ─────────────────────────────────────────────────────────────────
// DEEP LINK
// ─────────────────────────────────────────────────────────────────

function abrirDoQuery() {
    const id = new URLSearchParams(location.search).get('noticia');
    if (!id) return;

    if (_todas.some(n => n.id === id)) abrirLeitor(id, { deepLink: true });
    else avisar('Notícia não encontrada ou não publicada', 'error');
}

// ─────────────────────────────────────────────────────────────────
// LISTENERS
// ─────────────────────────────────────────────────────────────────

function ligarListeners() {
    if (_ligado) return;
    _ligado = true;

    const secao = el('secNoticias');

    // Delegação: os cards são recriados a cada render.
    secao?.addEventListener('click', ev => {
        const abrir = ev.target.closest('[data-nw-id]');
        if (abrir) { abrirLeitor(abrir.dataset.nwId); return; }

        const chip = ev.target.closest('[data-nw-cat]');
        if (chip) {
            _categoria = chip.dataset.nwCat;
            secao.querySelectorAll('[data-nw-cat]').forEach(b => {
                const ativo = b === chip;
                b.classList.toggle('is-active', ativo);
                b.setAttribute('aria-pressed', String(ativo));
            });
            aplicarFiltros();
            return;
        }

        if (ev.target.closest('[data-nw-clear]')) { limparFiltros(); return; }
        if (ev.target.closest('#nwMoreBtn'))      { _pagina++; renderizar(); }
    });

    // Busca
    const busca = el('nwSearch');
    let debounce;
    busca?.addEventListener('input', () => {
        _busca = busca.value;
        el('nwSearchClear').hidden = !_busca;
        clearTimeout(debounce);
        debounce = setTimeout(aplicarFiltros, 200);
    });
    el('nwSearchClear')?.addEventListener('click', () => {
        busca.value = '';
        _busca = '';
        el('nwSearchClear').hidden = true;
        busca.focus();
        aplicarFiltros();
    });

    // Leitor
    const modal = el('newsReader');
    modal?.addEventListener('click', ev => {
        if (ev.target.closest('[data-nw-close]')) { pedirFechar(); return; }

        const nav = ev.target.closest('[data-nw-id]');
        if (nav) { abrirLeitor(nav.dataset.nwId); return; }

        if (ev.target.closest('[data-nw-share]') && _lendo) { compartilhar(_lendo); return; }
        if (ev.target.closest('[data-nw-copy]')  && _lendo) { copiarLink(_lendo); }
    });

    el('nwReaderScroll')?.addEventListener('scroll', atualizarProgresso, { passive: true });

    document.addEventListener('keydown', ev => {
        if (el('newsReader')?.hidden !== false) return;
        if (ev.key === 'Escape')     { pedirFechar(); return; }
        if (ev.key === 'ArrowLeft')  { el('nwReaderNav')?.querySelector('.nw-nav-prev')?.click(); }
        if (ev.key === 'ArrowRight') { el('nwReaderNav')?.querySelector('.nw-nav-next')?.click(); }
    });

    // Voltar do navegador fecha a leitura em vez de sair da página.
    window.addEventListener('popstate', () => {
        if (el('newsReader')?.hidden === false) fecharLeitor();
    });
}

function limparFiltros() {
    _categoria = 'todas';
    _busca = '';

    const busca = el('nwSearch');
    if (busca) busca.value = '';
    const limpar = el('nwSearchClear');
    if (limpar) limpar.hidden = true;

    document.querySelectorAll('[data-nw-cat]').forEach(b => {
        const ativo = b.dataset.nwCat === 'todas';
        b.classList.toggle('is-active', ativo);
        b.setAttribute('aria-pressed', String(ativo));
    });

    aplicarFiltros();
}

// ─────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────

window.Noticias = { carregar, abrirLeitor, fecharLeitor };

})();
