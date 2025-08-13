// Configuración del cliente Socket.io
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://tu-quiz-backend.railway.app'; // Cambiar por tu URL de Railway

const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling']
});

// Variables globales
let nombreUsuario = '';
let esDocente = false;
let preguntaActiva = false;
let tiempoInicio = null;

// Referencias a elementos del DOM
const elementos = {
    // Panel de registro
    registrationPanel: document.getElementById('registrationPanel'),
    nombreUsuarioInput: document.getElementById('nombreUsuario'),
    btnRegistrarse: document.getElementById('btnRegistrarse'),
    
    // Panel del juego
    gamePanel: document.getElementById('gamePanel'),
    teacherPanel: document.getElementById('teacherPanel'),
    studentPanel: document.getElementById('studentPanel'),
    
    // Panel del docente
    formPregunta: document.getElementById('formPregunta'),
    textoPregunta: document.getElementById('textoPregunta'),
    respuestaCorrecta: document.getElementById('respuestaCorrecta'),
    btnReiniciar: document.getElementById('btnReiniciar'),
    
    // Área de pregunta
    questionArea: document.getElementById('questionArea'),
    noQuestion: document.getElementById('noQuestion'),
    questionCard: document.getElementById('questionCard'),
    questionText: document.getElementById('questionText'),
    questionTimer: document.getElementById('questionTimer'),
    questionAuthor: document.getElementById('questionAuthor'),
    
    // Área de respuesta
    answerArea: document.getElementById('answerArea'),
    respuestaUsuario: document.getElementById('respuestaUsuario'),
    btnEnviarRespuesta: document.getElementById('btnEnviarRespuesta'),
    answerFeedback: document.getElementById('answerFeedback'),
    
    // Área de resultados
    resultArea: document.getElementById('resultArea'),
    winnerMessage: document.getElementById('winnerMessage'),
    winnerName: document.getElementById('winnerName'),
    correctAnswer: document.getElementById('correctAnswer'),
    btnNuevaPregunta: document.getElementById('btnNuevaPregunta'),
    
    // Estadísticas
    connectedCount: document.getElementById('connectedCount'),
    leaderboard: document.getElementById('leaderboard'),
    
    // Estado de conexión
    connectionStatus: document.getElementById('connectionStatus'),
    statusText: document.getElementById('statusText'),
    toastContainer: document.getElementById('toastContainer')
};

// 🚀 INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    inicializarEventListeners();
    elementos.nombreUsuarioInput.focus();
});

// 📱 EVENT LISTENERS
function inicializarEventListeners() {
    // Registro de usuario
    elementos.btnRegistrarse.addEventListener('click', registrarUsuario);
    elementos.nombreUsuarioInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') registrarUsuario();
    });
    
    // Formulario de pregunta (docente)
    elementos.formPregunta.addEventListener('submit', publicarPregunta);
    elementos.btnReiniciar.addEventListener('click', reiniciarJuego);
    
    // Respuesta del estudiante
    elementos.btnEnviarRespuesta.addEventListener('click', enviarRespuesta);
    elementos.respuestaUsuario.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !elementos.btnEnviarRespuesta.disabled) {
            enviarRespuesta();
        }
    });
    
    // Cerrar modal de resultado
    elementos.btnNuevaPregunta.addEventListener('click', () => {
        elementos.resultArea.style.display = 'none';
    });
}

// 👤 REGISTRO DE USUARIO
function registrarUsuario() {
    const nombre = elementos.nombreUsuarioInput.value.trim();
    
    if (!nombre) {
        mostrarToast('❌ Por favor ingresa tu nombre', 'error');
        elementos.nombreUsuarioInput.focus();
        return;
    }
    
    if (nombre.length > 20) {
        mostrarToast('❌ El nombre debe tener máximo 20 caracteres', 'error');
        return;
    }
    
    nombreUsuario = nombre;
    esDocente = nombre.toLowerCase() === 'docente';
    
    // Emitir evento de conexión
    socket.emit('usuario:conectado', nombreUsuario);
    
    // Cambiar vista
    elementos.registrationPanel.style.display = 'none';
    elementos.gamePanel.style.display = 'block';
    
    // Mostrar panel correspondiente
    if (esDocente) {
        elementos.teacherPanel.style.display = 'block';
        mostrarToast(`👨‍🏫 Bienvenido, ${nombreUsuario}! Puedes crear preguntas`, 'success');
    } else {
        mostrarToast(`👋 ¡Hola ${nombreUsuario}! Esperando pregunta del docente...`, 'success');
    }
    
    inicializarTimer();
}

// 📝 PUBLICAR PREGUNTA (DOCENTE)
function publicarPregunta(e) {
    e.preventDefault();
    
    const pregunta = elementos.textoPregunta.value.trim();
    const respuesta = elementos.respuestaCorrecta.value.trim();
    
    if (!pregunta || !respuesta) {
        mostrarToast('❌ Completa todos los campos', 'error');
        return;
    }
    
    if (pregunta.length > 200) {
        mostrarToast('❌ La pregunta debe tener máximo 200 caracteres', 'error');
        return;
    }
    
    if (respuesta.length > 50) {
        mostrarToast('❌ La respuesta debe tener máximo 50 caracteres', 'error');
        return;
    }
    
    // Emitir pregunta
    socket.emit('pregunta:nueva', {
        pregunta: pregunta,
        respuesta: respuesta
    });
    
    // Limpiar formulario
    elementos.formPregunta.reset();
    mostrarToast('📢 Pregunta publicada exitosamente', 'success');
    
    // Cerrar área de resultados si está abierta
    elementos.resultArea.style.display = 'none';
}

// 📤 ENVIAR RESPUESTA (ESTUDIANTE)
function enviarRespuesta() {
    const respuesta = elementos.respuestaUsuario.value.trim();
    
    if (!respuesta) {
        mostrarToast('❌ Escribe una respuesta', 'error');
        elementos.respuestaUsuario.focus();
        return;
    }
    
    if (!preguntaActiva) {
        mostrarToast('❌ No hay pregunta activa', 'error');
        return;
    }
    
    // Deshabilitar botón para evitar doble envío
    elementos.btnEnviarRespuesta.disabled = true;
    elementos.respuestaUsuario.disabled = true;
    
    // Emitir respuesta
    socket.emit('respuesta:enviada', respuesta);
    
    mostrarToast('📤 Respuesta enviada', 'info');
}

// 🔄 REINICIAR JUEGO (DOCENTE)
function reiniciarJuego() {
    if (confirm('¿Estás seguro de que quieres reiniciar el juego? Se perderán todas las estadísticas.')) {
        socket.emit('juego:reiniciar');
    }
}

// ⏰ TIMER DE PREGUNTA
let timerInterval;

function inicializarTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function actualizarTimer() {
    if (!tiempoInicio || !elementos.questionTimer) return;
    
    const tiempoTranscurrido = Math.floor((Date.now() - tiempoInicio) / 1000);
    const minutos = Math.floor(tiempoTranscurrido / 60);
    const segundos = tiempoTranscurrido % 60;
    
    elementos.questionTimer.textContent = `${minutos}:${segundos.toString().padStart(2, '0')}`;
}

// 🔔 SISTEMA DE NOTIFICACIONES TOAST
function mostrarToast(mensaje, tipo = 'info', duracion = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    const iconos = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span>${iconos[tipo] || 'ℹ️'}</span>
        <span>${mensaje}</span>
    `;
    
    elementos.toastContainer.appendChild(toast);
    
    // Remover automáticamente
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, duracion);
}

// 📊 ACTUALIZAR ESTADÍSTICAS
function actualizarEstadisticas(estadisticas) {
    const estadisticasArray = Object.entries(estadisticas)
        .filter(([nombre]) => nombre.toLowerCase() !== 'docente')
        .sort(([,a], [,b]) => b - a);
    
    if (estadisticasArray.length === 0) {
        elementos.leaderboard.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem;">No hay puntuaciones aún</div>';
        return;
    }
    
    elementos.leaderboard.innerHTML = estadisticasArray
        .map(([nombre, puntos], index) => `
            <div class="leader-item">
                <div class="leader-rank">${index + 1}</div>
                <div class="leader-name">${nombre}</div>
                <div class="leader-score">${puntos} 🏆</div>
            </div>
        `).join('');
}

// 🔌 EVENTOS DE SOCKET.IO

// Conexión establecida
socket.on('connect', () => {
    console.log('✅ Conectado al servidor');
    elementos.statusText.textContent = 'Conectado';
    document.querySelector('.status-dot').classList.add('connected');
    mostrarToast('🔗 Conectado al servidor', 'success');
});

// Error de conexión
socket.on('connect_error', (error) => {
    console.error('❌ Error de conexión:', error);
    elementos.statusText.textContent = 'Error de conexión';
    document.querySelector('.status-dot').classList.remove('connected');
    mostrarToast('❌ Error de conexión al servidor', 'error');
});

// Desconexión
socket.on('disconnect', () => {
    console.log('🔌 Desconectado del servidor');
    elementos.statusText.textContent = 'Desconectado';
    document.querySelector('.status-dot').classList.remove('connected');
    mostrarToast('🔌 Desconectado del servidor', 'warning');
});

// Nuevo usuario conectado
socket.on('usuario:nuevo', (data) => {
    elementos.connectedCount.textContent = data.totalConectados;
    if (data.nombre !== nombreUsuario) {
        mostrarToast(`👋 ${data.nombre} se unió al quiz`, 'info');
    }
});

// Usuario desconectado
socket.on('usuario:desconectado', (data) => {
    elementos.connectedCount.textContent = data.totalConectados;
    mostrarToast(`👋 ${data.nombre} abandonó el quiz`, 'info');
});

// Nueva pregunta publicada
socket.on('pregunta:publicada', (data) => {
    preguntaActiva = true;
    tiempoInicio = data.timestamp;
    
    // Mostrar pregunta
    elementos.noQuestion.style.display = 'none';
    elementos.questionCard.style.display = 'block';
    elementos.questionText.textContent = data.pregunta;
    
    if (data.docente) {
        elementos.questionAuthor.textContent = `👨‍🏫 ${data.docente}`;
    }
    
    // Habilitar respuesta para estudiantes
    if (!esDocente) {
        elementos.respuestaUsuario.disabled = false;
        elementos.btnEnviarRespuesta.disabled = false;
        elementos.respuestaUsuario.focus();
        mostrarToast('❓ Nueva pregunta disponible', 'info');
    }
    
    // Limpiar feedback anterior
    elementos.answerFeedback.className = 'answer-feedback';
    elementos.answerFeedback.innerHTML = '';
    
    // Iniciar timer
    timerInterval = setInterval(actualizarTimer, 1000);
    
    // Cerrar área de resultados
    elementos.resultArea.style.display = 'none';
});

// Respuesta incorrecta
socket.on('respuesta:incorrecta', (data) => {
    elementos.answerFeedback.className = 'answer-feedback incorrect show';
    elementos.answerFeedback.innerHTML = `
        <div>❌ ${data.mensaje}</div>
        <div style="margin-top: 0.5rem; font-size: 0.9rem;">Tu respuesta: "${data.tuRespuesta}"</div>
    `;
    
    // Habilitar para nuevo intento
    elementos.respuestaUsuario.disabled = false;
    elementos.btnEnviarRespuesta.disabled = false;
    elementos.respuestaUsuario.value = '';
    elementos.respuestaUsuario.focus();
    
    mostrarToast('❌ Respuesta incorrecta, ¡inténtalo de nuevo!', 'error');
});

//