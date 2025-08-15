const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { OAuth2Client } = require('google-auth-library'); // Google Auth

require('dotenv').config(); // Cargar variables de entorno

const app = express();
const server = http.createServer(app);

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Configuración de CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000'
];

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
}));

// Socket.io con CORS
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Middleware
app.use(express.json());

// Variables globales del juego
let respuestaCorrectaActual = '';
let rondaActiva = false;
let preguntaActual = '';
let usuariosConectados = new Map(); // socketId -> nombre
let estadisticas = new Map(); // nombre -> puntos

const PORT = process.env.PORT || 5000;

// ✅ Ruta para validar el login de Google
app.post('/auth/google', async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const userInfo = {
            nombre: payload.name,
            email: payload.email,
            picture: payload.picture,
        };

        console.log('✅ Usuario autenticado con Google:', userInfo);
        return res.status(200).json(userInfo);

    } catch (error) {
        console.error('❌ Error verificando token de Google:', error);
        return res.status(401).json({ error: 'Token inválido' });
    }
});

// Socket.io
io.on('connection', (socket) => {
    console.log(`🔗 Usuario conectado: ${socket.id}`);
    socket.emit('estadisticas:actualizadas', Object.fromEntries(estadisticas));

    socket.on('usuario:conectado', (nombre) => {
        usuariosConectados.set(socket.id, nombre);
        console.log(`👤 Usuario registrado: ${nombre} (${socket.id})`);

        if (!estadisticas.has(nombre)) {
            estadisticas.set(nombre, 0);
        }

        io.emit('usuario:nuevo', {
            nombre,
            totalConectados: usuariosConectados.size
        });

        if (preguntaActual && rondaActiva) {
            socket.emit('pregunta:publicada', {
                pregunta: preguntaActual,
                timestamp: Date.now()
            });
        }
    });

    socket.on('pregunta:nueva', (data) => {
        const nombreDocente = usuariosConectados.get(socket.id);
        console.log(`📝 Nueva pregunta de ${nombreDocente}:`, data);

        respuestaCorrectaActual = data.respuesta.toLowerCase().trim();
        preguntaActual = data.pregunta;
        rondaActiva = true;

        io.emit('pregunta:publicada', {
            pregunta: data.pregunta,
            timestamp: Date.now(),
            docente: nombreDocente
        });

        console.log(`🎯 Respuesta correcta guardada: ${respuestaCorrectaActual}`);
    });

    socket.on('respuesta:enviada', (respuestaUsuario) => {
        const nombreUsuario = usuariosConectados.get(socket.id);

        if (!nombreUsuario) {
            socket.emit('error:usuario', 'Usuario no registrado');
            return;
        }

        console.log(`💭 Respuesta de ${nombreUsuario}: ${respuestaUsuario}`);

        if (!rondaActiva) {
            socket.emit('respuesta:tardia', 'La ronda ya terminó');
            return;
        }

        if (!respuestaCorrectaActual) {
            socket.emit('error:sin_pregunta', 'No hay pregunta activa');
            return;
        }

        const respuestaNormalizada = respuestaUsuario.toLowerCase().trim();

        if (respuestaNormalizada === respuestaCorrectaActual) {
            rondaActiva = false;

            const puntosActuales = estadisticas.get(nombreUsuario) || 0;
            estadisticas.set(nombreUsuario, puntosActuales + 1);

            console.log(`🏆 ¡${nombreUsuario} ha ganado la ronda!`);

            io.emit('ronda:terminada', {
                ganador: nombreUsuario,
                respuestaCorrecta: respuestaCorrectaActual,
                timestamp: Date.now(),
                nuevoPuntaje: estadisticas.get(nombreUsuario)
            });

            io.emit('estadisticas:actualizadas', Object.fromEntries(estadisticas));

            respuestaCorrectaActual = '';
            preguntaActual = '';

        } else {
            socket.emit('respuesta:incorrecta', {
                tuRespuesta: respuestaUsuario,
                mensaje: 'Respuesta incorrecta, ¡sigue intentando!'
            });
        }
    });

    socket.on('disconnect', () => {
        const nombreUsuario = usuariosConectados.get(socket.id);
        if (nombreUsuario) {
            usuariosConectados.delete(socket.id);
            console.log(`👋 Usuario desconectado: ${nombreUsuario}`);

            io.emit('usuario:desconectado', {
                nombre: nombreUsuario,
                totalConectados: usuariosConectados.size
            });
        }
    });

    socket.on('juego:reiniciar', () => {
        const nombreUsuario = usuariosConectados.get(socket.id);

        if (nombreUsuario && nombreUsuario.toLowerCase().includes('docente')) {
            respuestaCorrectaActual = '';
            preguntaActual = '';
            rondaActiva = false;
            estadisticas.clear();

            io.emit('juego:reiniciado', {
                mensaje: 'El juego ha sido reiniciado',
                timestamp: Date.now()
            });

            console.log('🔄 Juego reiniciado por el docente');
        }
    });
});

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        usuariosConectados: usuariosConectados.size,
        rondaActiva,
        hayPregunta: !!preguntaActual
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'Servidor de juego de preguntas funcionando correctamente',
        endpoints: {
            health: '/health',
            socket: 'ws://localhost:' + PORT
        }
    });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🌐 Socket.io configurado para CORS`);
});
