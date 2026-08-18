/**
 * firebase-config.js — Configuração do Firebase
 * Versão simplificada e robusta
 */

// ⚠️ SUAS CREDENCIAIS FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyD2MfH7zPRJQngD-Ygas5ulhvbrwZnYq6E",
  authDomain: "conecta-bueno.firebaseapp.com",
  projectId: "conecta-bueno",
  storageBucket: "conecta-bueno.firebasestorage.app",
  messagingSenderId: "846824630799",
  appId: "1:846824630799:web:1cc9aee9337ba0661c517a",
  measurementId: "G-YQF5HHT646"
};

// Função de inicialização
function initializeFirebase() {
    // Verificar se Firebase está disponível
    if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK não carregado, aguardando...');
        return false;
    }
    
    // Verificar se já foi inicializado
    if (firebase.apps.length > 0) {
        console.log('✅ Firebase já inicializado');
        return true;
    }
    
    try {
        // Inicializar Firebase
        firebase.initializeApp(firebaseConfig);
        
        // Expor globalmente
        window.firebase = firebase;
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        
        console.log('✅ Firebase inicializado');
        console.log('✅ Firestore disponível:', !!window.db);
        console.log('✅ Auth disponível:', !!window.auth);
        
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar Firebase:', error);
        return false;
    }
}

// Tentar inicializar quando window.load disparar
window.addEventListener('load', function() {
    console.log('🔥 window.load - Inicializando Firebase...');
    
    // Tentar inicializar
    if (!initializeFirebase()) {
        // Se falhar, tentar novamente após 200ms
        setTimeout(() => {
            if (!initializeFirebase()) {
                // Última tentativa após 500ms
                setTimeout(initializeFirebase, 500);
            }
        }, 200);
    }
});

// Para compatibilidade
window.firebaseConfig = firebaseConfig;
