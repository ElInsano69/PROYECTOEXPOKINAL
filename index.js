const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.json());

// =========================================================
// RUTAS DE LA API
// =========================================================

app.post('/register', async (req, res) => {
    const { nombre, apellido, email, password } = req.body;

    if (!nombre || !apellido || !email || !password) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    try {
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(409).json({ mensaje: 'El email ya está registrado.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, email, password) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, email',
            [nombre, apellido, email, hashedPassword]
        );

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: resultado.rows[0] });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al registrar usuario.' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ mensaje: 'El email y la contraseña son obligatorios.' });
    }

    try {
        const usuarioResultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [username]);
        const usuario = usuarioResultado.rows[0];

        if (!usuario) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        const passwordValido = await bcrypt.compare(password, usuario.password);

        if (!passwordValido) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email },
            process.env.JWT_SECRET || 'mi_clave_secreta_super_segura',
            { expiresIn: '1h' }
        );

        res.status(200).json({
            mensaje: 'Inicio de sesión exitoso',
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                email: usuario.email
            }
        });

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al iniciar sesión.' });
    }
});

app.get('/usuarios', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, nombre, apellido, email FROM usuarios ORDER BY id ASC');
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al obtener usuarios.' });
    }
});

// =========================================================
// SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND
// =========================================================

app.use(express.static(path.join(__dirname, 'proyecto')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});

// =========================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================

// Conectar a la base de datos y TEMPORALMENTE borrar y recrear la tabla
pool.connect()
    .then(async client => { // Usamos 'async' aquí para poder usar 'await' dentro
        console.log('Conectado a la base de datos PostgreSQL.');

        // ***************************************************************
        // !!! INICIO DE CÓDIGO TEMPORAL Y CRÍTICO PARA LA DB !!!
        // ESTO FORZARÁ LA ELIMINACIÓN Y RECREACIÓN DE LA TABLA 'usuarios'.
        // UNA VEZ QUE HAYAS LOGRADO UN REGISTRO EXITOSO, DEBES QUITAR
        // LAS SIGUIENTES 4 LÍNEAS DE CÓDIGO DEL ARCHIVO index.js.
        // ***************************************************************
        try {
            await client.query('DROP TABLE IF EXISTS usuarios CASCADE;'); // CASCADE elimina dependencias (FKs)
            console.log('Tabla "usuarios" eliminada temporalmente para forzar recreación.');
        } catch (dropError) {
            console.error('Error al intentar eliminar la tabla usuarios (puede que no existiera):', dropError.message);
        }
        // ***************************************************************
        // !!! FIN DE CÓDIGO TEMPORAL Y CRÍTICO PARA LA DB !!!
        // ***************************************************************


        // Crear la tabla 'usuarios'. Como la acabamos de borrar (o no existía),
        // se creará con la definición completa, incluyendo 'password'.
        return client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                apellido VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    })
    .then(() => {
        console.log('Tabla "usuarios" verificada o creada.');
        app.listen(PORT, () => {
            console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
            console.log(`Available at your primary URL ${process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`}`);
        });
    })
    .catch(err => {
        console.error('Error al conectar o inicializar la base de datos:', err);
        process.exit(1);
    });