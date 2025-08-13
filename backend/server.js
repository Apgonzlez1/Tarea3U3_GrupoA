const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuración de CORS para Socket.io
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Variables globales del juego
let respuestaCorrectaActual = '';
let rondaActiva = false;
let preguntaActual = '';
let usuariosConectados = new Map(); // socketId -> nombre
let estadisticas = new Map(); // nombre -> puntos

const PORT = process.env.PORT || 5000;

// Eventos de Socket.io
io.on('connection', (socket) => {
    console.log(`🔗 Usuario conectado: ${socket.id}`);
    
    // Enviar estadísticas actuales al nuevo usuario
    socket.emit('estadisticas:actualizadas', Object.fromEntries(estadisticas));
    
    // Usuario se registra
    socket.on('usuario:conectado', (nombre) => {
        usuariosConectados.set(socket.id, nombre);
        console.log(`👤 Usuario registrado: ${nombre} (${socket.id})`);
        
        // Inicializar estadísticas si no existe
        if (!estadisticas.has(nombre)) {
            estadisticas.set(nombre, 0);
        }
        
        // Notificar a todos los usuarios conectados
        io.emit('usuario:nuevo', {
            nombre,
            totalConectados: usuariosConectados.size
        });
        
        // Si hay una pregunta activa, enviarla al nuevo usuario
        if (preguntaActual && rondaActiva) {
            socket.emit('pregunta:publicada', {
                pregunta: preguntaActual,
                timestamp: Date.now()
            });
        }
    });
    
    // Docente publica una nueva pregunta
    socket.on('pregunta:nueva', (data) => {
        const nombreDocente = usuariosConectados.get(socket.id);
        console.log(`📝 Nueva pregunta de ${nombreDocente}:`, data);
        
        // Guardar la respuesta correcta (no se envía a los clientes)
        respuestaCorrectaActual = data.respuesta.toLowerCase().trim();
        preguntaActual = data.pregunta;
        rondaActiva = true;
        
        // Publicar solo la pregunta a todos los clientes
        io.emit('pregunta:publicada', {
            pregunta: data.pregunta,
            timestamp: Date.now(),
            docente: nombreDocente
        });
        
        console.log(`🎯 Respuesta correcta guardada: ${respuestaCorrectaActual}`);
    });
    
    // Estudiante envía una respuesta
    socket.on('respuesta:enviada', (respuestaUsuario) => {
        const nombreUsuario = usuariosConectados.get(socket.id);
        
        if (!nombreUsuario) {
            socket.emit('error:usuario', 'Usuario no registrado');
            return;
        }
        
        console.log(`💭 Respuesta de ${nombreUsuario}: ${respuestaUsuario}`);
        
        // Verificar si la ronda está activa
        if (!rondaActiva) {
            socket.emit('respuesta:tardia', 'La ronda ya terminó');
            return;
        }
        
        // Verificar si hay una pregunta activa
        if (!respuestaCorrectaActual) {
            socket.emit('error:sin_pregunta', 'No hay pregunta activa');
            return;
        }
        
        // Comparar respuesta (case insensitive y sin espacios extra)
        const respuestaNormalizada = respuestaUsuario.toLowerCase().trim();
        
        if (respuestaNormalizada === respuestaCorrectaActual) {
            // ¡RESPUESTA CORRECTA! - El primer usuario gana
            rondaActiva = false;
            
            // Actualizar estadísticas
            const puntosActuales = estadisticas.get(nombreUsuario) || 0;
            estadisticas.set(nombreUsuario, puntosActuales + 1);
            
            console.log(`🏆 ¡${nombreUsuario} ha ganado la ronda!`);
            
            // Anunciar al ganador a todos los clientes
            io.emit('ronda:terminada', {
                ganador: nombreUsuario,
                respuestaCorrecta: data.respuesta || respuestaCorrectaActual,
                timestamp: Date.now(),
                nuevoPuntaje: estadisticas.get(nombreUsuario)
            });
            
            // Enviar estadísticas actualizadas
            io.emit('estadisticas:actualizadas', Object.fromEntries(estadisticas));
            
            // Limpiar variables
            respuestaCorrectaActual = '';
            preguntaActual = '';
            
        } else {
            // Respuesta incorrecta - solo notificar al usuario
            socket.emit('respuesta:incorrecta', {
                tuRespuesta: respuestaUsuario,
                mensaje: 'Respuesta incorrecta, ¡sigue intentando!'
            });
        }
    });
    
    // Usuario se desconecta
    socket.on('disconnect', () => {
        const nombreUsuario = usuariosConectados.get(socket.id);
        if (nombreUsuario) {
            usuariosConectados.delete(socket.id);
            console.log(`👋 Usuario desconectado: ${nombreUsuario}`);
            
            // Notificar a todos los usuarios
            io.emit('usuario:desconectado', {
                nombre: nombreUsuario,
                totalConectados: usuariosConectados.size
            });
        }
    });
    
    // Reiniciar juego (solo para docentes)
    socket.on('juego:reiniciar', () => {
        const nombreUsuario = usuariosConectados.get(socket.id);
        
        if (nombreUsuario && nombreUsuario.toLowerCase() === 'docente') {
            // Reiniciar variables del juego
            respuestaCorrectaActual = '';
            preguntaActual = '';
            rondaActiva = false;
            estadisticas.clear();
            
            // Notificar a todos los clientes
            io.emit('juego:reiniciado', {
                mensaje: 'El juego ha sido reiniciado',
                timestamp: Date.now()
            });
            
            console.log('🔄 Juego reiniciado por el docente');
        }
    });
});

// Ruta de salud para verificar que el servidor está funcionando
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        usuariosConectados: usuariosConectados.size,
        rondaActiva,
        hayPregunta: !!preguntaActual
    });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`🌐 Configurado para frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});