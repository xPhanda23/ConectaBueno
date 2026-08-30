/**
 * temporada.js — Alta e baixa temporada — Conecta Bueno
 *
 * Classifica dinamicamente o período turístico de Bueno Brandão a
 * partir de regras de calendário e da agenda real do Firestore.
 * Nada aqui é inventado:
 *
 *   • os feriados nacionais fixos estão declarados com sua base legal;
 *   • os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são
 *     calculados a partir da Páscoa pelo algoritmo de Meeus/Butcher;
 *   • as janelas de férias escolares são as bordas usuais dos dois
 *     recessos longos, documentadas abaixo;
 *   • a contagem de eventos vem da coleção `eventos` do Firestore.
 *
 * Uso:
 *   <div data-temporada data-temporada-agenda="pages/eventos.html"></div>
 *   <script src="js/temporada.js"></script>
 *
 * A página que já carregou a agenda pode evitar uma segunda leitura do
 * Firestore marcando o contêiner com data-temporada-fonte="host" e
 * chamando Temporada.definirEventos(lista) quando tiver os dados.
 */

'use strict';

(function () {

// ─────────────────────────────────────────────────────────────────
// CALENDÁRIO
// ─────────────────────────────────────────────────────────────────

/* Feriados nacionais de data fixa. Base legal: Lei nº 662/1949 e Lei
   nº 6.802/1980; o 20 de novembro passou a ser feriado nacional pela
   Lei nº 14.759/2023. */
const FERIADOS_FIXOS = [
    { mes:  1, dia:  1, nome: 'Confraternização Universal', tipo: 'nacional' },
    { mes:  4, dia: 21, nome: 'Tiradentes',                 tipo: 'nacional' },
    { mes:  5, dia:  1, nome: 'Dia do Trabalho',            tipo: 'nacional' },
    { mes:  9, dia:  7, nome: 'Independência do Brasil',    tipo: 'nacional' },
    { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida',    tipo: 'nacional' },
    { mes: 11, dia:  2, nome: 'Finados',                    tipo: 'nacional' },
    { mes: 11, dia: 15, nome: 'Proclamação da República',   tipo: 'nacional' },
    { mes: 11, dia: 20, nome: 'Consciência Negra',          tipo: 'nacional' },
    { mes: 12, dia: 25, nome: 'Natal',                      tipo: 'nacional' },

    /* Emancipação de Bueno Brandão — Decreto-Lei nº 148, de 17/12/1938
       (mesma fonte da linha do tempo em home.js). Fica aqui para ser
       NOMEADA na interface, mas com folga:false — não há confirmação de
       que seja feriado municipal, então não pesa como dia de folga. */
    { mes: 12, dia: 17, nome: 'Aniversário de Bueno Brandão', tipo: 'cidade', folga: false }
];

/* Datas móveis, em dias de deslocamento a partir do domingo de Páscoa.
   Carnaval e Corpus Christi são ponto facultativo no calendário federal,
   mas movimentam o turismo como feriado — por isso contam como folga. */
const FERIADOS_MOVEIS = [
    { desloc: -48, nome: 'Segunda de Carnaval', tipo: 'facultativo' },
    { desloc: -47, nome: 'Terça de Carnaval',   tipo: 'facultativo' },
    { desloc:  -2, nome: 'Sexta-feira Santa',   tipo: 'nacional' },
    { desloc:   0, nome: 'Domingo de Páscoa',   tipo: 'nacional' },
    { desloc:  60, nome: 'Corpus Christi',      tipo: 'facultativo' }
];

/* Janelas de férias escolares. As bordas exatas mudam a cada ano e a
   cada rede de ensino — em Minas quem publica o calendário anual é a
   SEE/MG. Estas são as bordas usuais dos dois recessos longos, e é a
   elas que o mercado de turismo chama de alta temporada. */
const JANELAS_FERIAS = [
    { id: 'verao',   nome: 'Férias escolares de verão', icone: '🌞', inicio: [12, 15], fim: [1, 31] },
    { id: 'inverno', nome: 'Férias escolares de julho', icone: '🎒', inicio: [ 7,  1], fim: [7, 31] }
];

/* Pesos do modelo. Férias e bloco de folga somam; o teto é 100. */
const PESOS = {
    ferias:            55,  // dentro de um recesso escolar longo
    feriadaoLongo:     55,  // bloco de folga de 4 dias ou mais
    feriadoProlongado: 45,  // bloco de folga de 3 dias
    fimDeSemana:       30,  // sábado e domingo sem feriado emendado
    feriadoIsolado:    30,  // feriado no meio da semana, sem emenda
    feriadoComAgenda:  10   // bônus: o feriado tem evento marcado na agenda
};

const LIMIARES = { alta: 45, media: 25 };

const NIVEIS = {
    alta:  { rotulo: 'Alta temporada',     icone: '🔥', chamada: 'A cidade recebe bem mais visitantes agora',            passos: 3 },
    media: { rotulo: 'Movimento moderado', icone: '👣', chamada: 'Fluxo intermediário — dá para aproveitar sem disputar espaço', passos: 2 },
    baixa: { rotulo: 'Baixa temporada',    icone: '🍃', chamada: 'Cidade tranquila, do jeito de quem quer sossego',      passos: 1 }
};

const DIA_MS = 86400000;

// ─────────────────────────────────────────────────────────────────
// DATAS — utilitários
// ─────────────────────────────────────────────────────────────────

/** Converte qualquer valor de data do Firestore para Date ou null.
 *  Mesmo tratamento de eventos.js: "AAAA-MM-DD" (vindo do <input
 *  type="date"> do painel) é construído em horário local, senão a
 *  leitura em UTC-3 devolveria o dia anterior. */
function paraData(val) {
    if (!val) return null;
    if (val?.toDate)  return val.toDate();
    if (val?.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [y, m, d] = val.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function inicioDoDia(data) {
    const d = new Date(data);
    d.setHours(0, 0, 0, 0);
    return d;
}

function fimDoDia(data) {
    const d = new Date(data);
    d.setHours(23, 59, 59, 999);
    return d;
}

function somarDias(data, n) {
    const d = new Date(data);
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
}

function chaveDia(data) {
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${m}-${d}`;
}

function mesmoDia(a, b) {
    return chaveDia(a) === chaveDia(b);
}

function diasEntre(a, b) {
    return Math.round((inicioDoDia(b) - inicioDoDia(a)) / DIA_MS);
}

function dataLonga(data) {
    return data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dataCurta(data) {
    return data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

/** "5 a 7 de setembro" quando o mês é o mesmo, "28 de dezembro a 4 de
 *  janeiro" quando vira o mês. */
function intervaloTexto(a, b) {
    if (mesmoDia(a, b)) return dataCurta(a);
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
        return `${a.getDate()} a ${dataCurta(b)}`;
    }
    return `${dataCurta(a)} a ${dataCurta(b)}`;
}

// ─────────────────────────────────────────────────────────────────
// FERIADOS
// ─────────────────────────────────────────────────────────────────

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (gregoriano). */
function calcularPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = março, 4 = abril
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
}

const _cacheFeriados = new Map();

/** Mapa "AAAA-MM-DD" → { nome, tipo, folga } com os feriados do ano. */
function feriadosDoAno(ano) {
    if (_cacheFeriados.has(ano)) return _cacheFeriados.get(ano);

    const mapa = new Map();

    FERIADOS_FIXOS.forEach(f => {
        mapa.set(chaveDia(new Date(ano, f.mes - 1, f.dia)), {
            nome: f.nome, tipo: f.tipo, folga: f.folga !== false
        });
    });

    const pascoa = calcularPascoa(ano);
    FERIADOS_MOVEIS.forEach(f => {
        mapa.set(chaveDia(somarDias(pascoa, f.desloc)), {
            nome: f.nome, tipo: f.tipo, folga: f.folga !== false
        });
    });

    _cacheFeriados.set(ano, mapa);
    return mapa;
}

/** Feriado do dia, ou null. */
function feriadoDe(data) {
    return feriadosDoAno(data.getFullYear()).get(chaveDia(data)) || null;
}

// ─────────────────────────────────────────────────────────────────
// REGRAS DE PERÍODO
// ─────────────────────────────────────────────────────────────────

/** Janela de férias escolares que contém a data, ou null. */
function janelaDeFerias(data) {
    const mes = data.getMonth() + 1;
    const dia = data.getDate();

    for (const j of JANELAS_FERIAS) {
        const [mi, di] = j.inicio;
        const [mf, df] = j.fim;
        const depoisDoInicio = mes > mi || (mes === mi && dia >= di);
        const antesDoFim     = mes < mf || (mes === mf && dia <= df);
        // A janela de verão atravessa a virada do ano (15/12 → 31/01).
        const viraOAno = mi > mf;
        if (viraOAno ? (depoisDoInicio || antesDoFim) : (depoisDoInicio && antesDoFim)) return j;
    }
    return null;
}

/** Dia sem expediente: fim de semana ou feriado que conta como folga. */
function ehFolga(data) {
    const dow = data.getDay();
    if (dow === 0 || dow === 6) return true;
    const f = feriadoDe(data);
    return !!f && f.folga;
}

/** Dia útil espremido entre duas folgas — a clássica "emenda": segunda
 *  entre o domingo e um feriado na terça, sexta entre um feriado na
 *  quinta e o sábado. */
function ehPonte(data) {
    if (ehFolga(data)) return false;
    return ehFolga(somarDias(data, -1)) && ehFolga(somarDias(data, 1));
}

/** Bloco contíguo de folga (incluindo emendas) que contém a data, ou
 *  null se for um dia útil comum. */
function blocoDeFolga(data) {
    const dentro = d => ehFolga(d) || ehPonte(d);
    if (!dentro(data)) return null;

    let inicio = data;
    let fim    = data;
    // Um bloco real nunca passa de ~10 dias; o teto evita laço infinito.
    for (let i = 0; i < 15 && dentro(somarDias(inicio, -1)); i++) inicio = somarDias(inicio, -1);
    for (let i = 0; i < 15 && dentro(somarDias(fim,     1)); i++) fim    = somarDias(fim,     1);

    const feriados = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
        const f = feriadoDe(d);
        if (f && f.folga) feriados.push({ data: d, ...f });
    }

    return { inicio, fim, dias: diasEntre(inicio, fim) + 1, feriados };
}

/** Eventos da agenda que acontecem (ou atravessam) o intervalo. */
function eventosNoIntervalo(eventos, de, ate) {
    if (!Array.isArray(eventos) || !eventos.length) return [];

    const a = inicioDoDia(de);
    const b = fimDoDia(ate);

    return eventos.filter(ev => {
        const inicio = paraData(ev.dataInicio ?? ev.startDate);
        if (!inicio) return false;
        const fim = paraData(ev.dataFim ?? ev.endDate) || inicio;
        return inicioDoDia(inicio) <= b && fimDoDia(fim) >= a;
    });
}

// ─────────────────────────────────────────────────────────────────
// AVALIAÇÃO
// ─────────────────────────────────────────────────────────────────

/**
 * Classifica a temporada de uma data.
 * @param {Date}  [dataRef=hoje]
 * @param {Array} [eventos=[]]  documentos da coleção `eventos`
 */
function avaliar(dataRef, eventos) {
    const data   = inicioDoDia(dataRef || new Date());
    const agenda = Array.isArray(eventos) ? eventos : [];
    const sinais = [];
    let pontos   = 0;

    // 1. Férias escolares — o maior motor de alta temporada no Brasil.
    const ferias = janelaDeFerias(data);
    if (ferias) {
        pontos += PESOS.ferias;
        sinais.push({ icone: ferias.icone, texto: ferias.nome });
    }

    // 2. Feriados e fins de semana, avaliados como bloco contíguo.
    const bloco = blocoDeFolga(data);
    let tipoFolga = null;

    if (bloco) {
        const temFeriado = bloco.feriados.length > 0;
        if      (temFeriado && bloco.dias >= 4)  tipoFolga = 'feriadaoLongo';
        else if (temFeriado && bloco.dias === 3) tipoFolga = 'feriadoProlongado';
        else if (temFeriado)                     tipoFolga = 'feriadoIsolado';
        else                                     tipoFolga = 'fimDeSemana';

        pontos += PESOS[tipoFolga];

        if (temFeriado) {
            sinais.push({ icone: '🎉', texto: bloco.feriados.map(f => f.nome).join(' · ') });
        }
        if (bloco.dias >= 3) {
            sinais.push({ icone: '🧳', texto: `Feriado prolongado de ${bloco.dias} dias` });
        } else if (tipoFolga === 'fimDeSemana') {
            sinais.push({ icone: '📅', texto: 'Fim de semana' });
        }
    }

    // Datas do calendário local que não são folga, mas contextualizam o
    // dia (ex.: aniversário de emancipação da cidade).
    const doDia = feriadoDe(data);
    if (doDia && !doDia.folga) {
        sinais.push({ icone: '🎂', texto: doDia.nome });
    }

    // 3. Cruzamento com a agenda real do Firestore.
    const janela = bloco || { inicio: data, fim: data };
    const eventosDoPeriodo = eventosNoIntervalo(agenda, janela.inicio, janela.fim);

    if (eventosDoPeriodo.length) {
        sinais.push({
            icone: '🎪',
            texto: eventosDoPeriodo.length === 1
                ? '1 evento na agenda'
                : `${eventosDoPeriodo.length} eventos na agenda`
        });
        // Feriado com programação confirmada puxa mais gente do que um
        // feriado vazio — é esse o cruzamento feriado × agenda.
        if (bloco && bloco.feriados.length) pontos += PESOS.feriadoComAgenda;
    }

    pontos = Math.min(100, pontos);

    let nivel = pontos >= LIMIARES.alta  ? 'alta'
              : pontos >= LIMIARES.media ? 'media'
              : 'baixa';

    // A agenda não muda a estação do ano, mas muda o movimento da
    // cidade: dois ou mais eventos tiram um período parado da baixa.
    if (nivel === 'baixa' && eventosDoPeriodo.length >= 2) nivel = 'media';

    return {
        data,
        nivel,
        pontos,
        ...NIVEIS[nivel],
        sinais,
        ferias,
        bloco,
        tipoFolga,
        eventos: eventosDoPeriodo,
        principal: motivoPrincipal(ferias, bloco, tipoFolga),
        dica: montarDica(nivel, ferias, tipoFolga, eventosDoPeriodo)
    };
}

/** Rótulo curto do que domina o período — usado no horizonte. */
function motivoPrincipal(ferias, bloco, tipoFolga) {
    if (bloco && bloco.feriados.length && tipoFolga !== 'feriadoIsolado') {
        return bloco.feriados.map(f => f.nome).join(' e ');
    }
    if (ferias) return ferias.nome.toLowerCase();
    if (bloco && bloco.feriados.length) return bloco.feriados[0].nome;
    if (tipoFolga === 'fimDeSemana') return 'fim de semana';
    return 'movimento comum da semana';
}

/** Dica de planejamento — orientação prática, sem afirmar nada que a
 *  aplicação não saiba de fato. */
function montarDica(nivel, ferias, tipoFolga, eventos) {
    if (nivel === 'alta') {
        if (tipoFolga === 'feriadaoLongo' || tipoFolga === 'feriadoProlongado') {
            return 'Feriado prolongado é quando a cidade mais recebe visitantes. Reserve hospedagem antes de viajar, confirme a reserva na véspera e comece os passeios cedo — as cachoeiras enchem no meio da manhã.';
        }
        if (ferias?.id === 'inverno') {
            return 'Julho concentra as férias escolares e é um dos períodos de maior procura na Mantiqueira. Garanta hospedagem com antecedência e deixe as trilhas para o começo do dia, quando estão mais vazias.';
        }
        if (ferias?.id === 'verao') {
            return 'As férias de fim de ano trazem o maior fluxo de visitantes. Reserve hospedagem com semanas de antecedência e programe os passeios mais concorridos para o início da manhã.';
        }
        return 'Período de maior movimento: reserve hospedagem antes de viajar e chegue cedo aos atrativos mais procurados.';
    }

    const quantos = eventos.length === 1 ? '1 evento' : `${eventos.length} eventos`;

    if (nivel === 'media') {
        if (eventos.length) {
            return `A cidade tem programação neste período — ${quantos} na agenda. Confira horários e locais antes de sair; quem prefere sossego pode deixar as trilhas para os dias sem evento.`;
        }
        if (tipoFolga === 'feriadoIsolado') {
            return 'Feriado no meio da semana: parte do comércio costuma abrir em horário reduzido. Confirme o funcionamento dos atrativos antes de fechar a programação do dia.';
        }
        if (tipoFolga === 'fimDeSemana') {
            return 'Os fins de semana movimentam a cidade sem lotar. É uma boa janela para cachoeiras e trilhas: saia cedo e confirme se os atrativos estarão abertos.';
        }
        return 'Movimento moderado — bom momento para visitar sem enfrentar filas. Ainda assim, vale confirmar os horários dos atrativos antes de sair.';
    }

    // Um evento sozinho não muda a estação, mas seria incoerente o card
    // mostrar o selo da agenda e a dica ignorar que há algo acontecendo.
    if (eventos.length) {
        return `Período tranquilo, mas com programação: ${quantos} na agenda. As trilhas e cachoeiras seguem vazias — confirme horário e local do que está marcado antes de fechar o roteiro.`;
    }

    return 'Baixa temporada: trilhas e cachoeiras ficam mais vazias e as diárias tendem a ser menores. Em compensação, parte dos atrativos e do comércio opera em horário reduzido — confirme antes de ir.';
}

// ─────────────────────────────────────────────────────────────────
// HORIZONTE — até quando vai a alta, ou quando ela volta
// ─────────────────────────────────────────────────────────────────

/** Nível considerando só o calendário: a agenda mexe no movimento do
 *  dia, mas não desloca a estação — por isso fica de fora daqui. */
function nivelDeCalendario(data) {
    return avaliar(data, []).nivel;
}

/** Fim da alta atual ou próxima janela de alta temporada. */
function horizonte(dataRef) {
    const hoje = inicioDoDia(dataRef || new Date());

    if (nivelDeCalendario(hoje) === 'alta') {
        let fim = hoje;
        for (let i = 1; i <= 200; i++) {
            const d = somarDias(hoje, i);
            if (nivelDeCalendario(d) !== 'alta') break;
            fim = d;
        }
        return {
            tipo: 'fim',
            inicio: hoje,
            fim,
            texto: mesmoDia(fim, hoje)
                ? 'Último dia de alta temporada'
                : `Alta temporada até ${dataCurta(fim)}`
        };
    }

    for (let i = 1; i <= 400; i++) {
        const inicio = somarDias(hoje, i);
        if (nivelDeCalendario(inicio) !== 'alta') continue;

        let fim = inicio;
        for (let j = 1; j <= 200; j++) {
            const d = somarDias(inicio, j);
            if (nivelDeCalendario(d) !== 'alta') break;
            fim = d;
        }

        return {
            tipo: 'proximo',
            inicio,
            fim,
            emDias: i,
            texto: `Próxima alta: ${intervaloTexto(inicio, fim)} · ${avaliar(inicio, []).principal}`
        };
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────
// AGENDA (Firestore)
// ─────────────────────────────────────────────────────────────────

let _eventos  = [];
let _promessa = null;

function aguardarFirebase(ms = 6000) {
    return new Promise(resolve => {
        if (window.db) { resolve(); return; }
        const t0 = Date.now();
        const id = setInterval(() => {
            if (window.db || Date.now() - t0 > ms) { clearInterval(id); resolve(); }
        }, 100);
    });
}

/** Lê a agenda uma única vez por página. Sem orderBy — não exige índice
 *  composto e o recorte por data é feito aqui mesmo. */
function obterEventos() {
    if (_promessa) return _promessa;

    _promessa = (async () => {
        await aguardarFirebase();
        if (!window.db) return [];
        try {
            const snap = await window.db.collection('eventos')
                .where('status', 'in', ['ativo', 'destaque'])
                .get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.warn('⚠️ temporada: agenda indisponível —', err);
            return [];
        }
    })();

    return _promessa;
}

/** Injeta a agenda já carregada pela página (evita uma segunda leitura). */
function definirEventos(lista) {
    _eventos  = Array.isArray(lista) ? lista : [];
    _promessa = Promise.resolve(_eventos);
    repintarTodos();
}

// ─────────────────────────────────────────────────────────────────
// INTERFACE
// ─────────────────────────────────────────────────────────────────

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const _containers = new Set();

function pintar(el) {
    const r = avaliar(new Date(), _eventos);
    const h = horizonte(r.data);
    const agenda = el.dataset.temporadaAgenda || '';

    const chips = r.sinais
        .map(s => `<li class="tp-chip"><span aria-hidden="true">${s.icone}</span>${esc(s.texto)}</li>`)
        .join('');

    const medidor = [1, 2, 3]
        .map(n => `<span class="tp-gauge-step${n <= r.passos ? ' is-on' : ''}"></span>`)
        .join('');

    // Nomeia até dois eventos do período — o resto vira "e mais N".
    const titulos = r.eventos
        .map(ev => ev.titulo || ev.title || ev.nome)
        .filter(Boolean);
    const restantes = titulos.length - 2;
    const listaEventos = titulos.length
        ? `${titulos.slice(0, 2).map(esc).join(' · ')}${restantes > 0 ? ` e mais ${restantes}` : ''}`
        : '';

    el.innerHTML = `
        <article class="tp-card tp-${r.nivel}">
            <div class="tp-top">
                <span class="tp-orb" aria-hidden="true">${r.icone}</span>
                <div class="tp-head">
                    <p class="tp-eyebrow">Temporada agora · ${esc(dataLonga(r.data))}</p>
                    <h3 class="tp-level">${esc(r.rotulo)}</h3>
                    <p class="tp-call">${esc(r.chamada)}</p>
                </div>
                <div class="tp-gauge" role="img" aria-label="Intensidade do movimento: ${esc(r.rotulo)}">${medidor}</div>
            </div>

            ${chips ? `<ul class="tp-chips">${chips}</ul>` : ''}

            <div class="tp-tip">
                <span class="tp-tip-icon" aria-hidden="true">💡</span>
                <p>${esc(r.dica)}</p>
            </div>

            <div class="tp-foot">
                <span class="tp-horizon">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <rect x="2" y="3" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M4.5 1.5v2M9.5 1.5v2M2 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    ${h ? esc(h.texto) : 'Sem picos previstos nos próximos meses'}
                </span>
                ${listaEventos ? `<span class="tp-agenda-names" title="${esc(titulos.join(' · '))}">Na agenda: ${listaEventos}</span>` : ''}
                ${agenda ? `
                    <a class="tp-link" href="${esc(agenda)}">
                        Ver agenda
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                            <path d="M4.5 3l4 3.5-4 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        </svg>
                    </a>
                ` : ''}
            </div>
        </article>
    `;
}

function repintarTodos() {
    _containers.forEach(el => {
        if (el.isConnected) pintar(el);
        else _containers.delete(el);
    });
}

/** Reavalia sozinho na virada do dia — a página pode ficar aberta. */
function agendarViradaDeDia() {
    const amanha = somarDias(new Date(), 1);
    const espera = Math.max(60000, amanha - Date.now() + 2000);
    setTimeout(() => { repintarTodos(); agendarViradaDeDia(); }, espera);
}

async function montar(el) {
    if (!el || el.dataset.temporadaPronto === 'true') return;
    el.dataset.temporadaPronto = 'true';

    el.setAttribute('role', 'region');
    if (!el.hasAttribute('aria-label')) {
        el.setAttribute('aria-label', 'Situação da temporada turística');
    }

    _containers.add(el);

    // Primeiro render é imediato e offline: só as regras de calendário.
    pintar(el);

    // A página pode fornecer a agenda que ela já carregou.
    if (el.dataset.temporadaFonte === 'host') return;

    definirEventos(await obterEventos());
}

function iniciar() {
    document.querySelectorAll('[data-temporada]').forEach(montar);
    agendarViradaDeDia();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
} else {
    iniciar();
}

// ─────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────

window.Temporada = {
    avaliar,
    horizonte,
    definirEventos,
    montar,
    // expostas para teste e reuso
    calcularPascoa,
    feriadosDoAno,
    janelaDeFerias,
    blocoDeFolga,
    PESOS,
    LIMIARES
};

})();
