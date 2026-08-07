// 1. Definindo os limites (Bounding Box) de Bueno Brandão
const limitesBuenoBrandao = [
    [-22.5800, -46.4800], // Sudoeste
    [-22.3100, -46.1500]  // Nordeste
];

// 2. Configuração avançada do Mapa
const mapa = L.map('meu-mapa', {
    center: [-22.440578063594376, -46.347808722640764], // Centro de Bueno Brandão
    zoom: 16, 
    minZoom: 14, 
    maxZoom: 18,
    maxBounds: limitesBuenoBrandao, 
    maxBoundsViscosity: 1.0, 
    zoomControl: false 
});

// 3. Adiciona o botão de zoom no canto inferior direito
L.control.zoom({
    position: 'bottomright'
}).addTo(mapa);

// 4. Camada Visual: CartoDB Voyager
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd'
}).addTo(mapa);

// 5. Banco de Dados Local (Simulação para o MVP)
const pontosCulturais = [
    {
        nome: "Praça Matriz",
        categoria: "História & Lazer",
        descricao: "O coração da cidade. Ponto de encontro para eventos culturais e feiras de artesanato.",
        coordenadas: [-22.4389, -46.3517],
        imagem: "https://via.placeholder.com/250x120?text=Foto+da+Praça"
    },
    {
        nome: "Clube Montesino",
        categoria: "Eventos & Cultura",
        descricao: "Espaço tradicional de Bueno Brandão, palco de festas e encontros da comunidade local.",
        coordenadas: [-22.4410, -46.3530],
        imagem: "https://via.placeholder.com/250x120?text=Foto+do+Clube"
    }
];

// 6. Renderizando os marcadores
pontosCulturais.forEach(ponto => {
    const marcador = L.marker(ponto.coordenadas).addTo(mapa);

    const conteudoPopup = `
        <div style="font-family: 'Inter', sans-serif; min-width: 200px;">
            <img src="${ponto.imagem}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;" alt="${ponto.nome}">
            <h3 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 16px;">${ponto.nome}</h3>
            <span style="background: #3498db; color: white; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${ponto.categoria}</span>
            <p style="font-size: 13px; color: #555; margin-top: 10px;">${ponto.descricao}</p>
            <button style="width: 100%; padding: 8px; background: #2ecc71; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Ver Roteiro</button>
        </div>
    `;

    marcador.bindPopup(conteudoPopup);
});