const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg'); // Importa Pool de 'pg'

const app = express();
const port = process.env.PORT || 10000; // Usa el puerto de Render o 10000

// Configuración de la conexión a la base de datos PostgreSQL
// Render inyecta la DATABASE_URL en el entorno
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Importante para conexiones SSL en Render
    }
});

// Conectar a la base de datos
pool.connect((err, client, done) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        return;
    }
    console.log('Conectado a la base de datos PostgreSQL.');

    // Crear tabla de usuarios si no existe
    client.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL
        );
    `, (err, res) => {
        done(); // Libera el cliente a la pool
        if (err) {
            console.error('Error al verificar o crear la tabla "usuarios":', err);
            return;
        }
        console.log('Tabla "usuarios" verificada o creada.');
    });
});

// Middleware para parsear el cuerpo de las solicitudes JSON
app.use(bodyParser.json());

// ====================================================================
// Rutas API para el Backend
// ====================================================================

// Ruta de registro de usuario
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO usuarios (username, password) VALUES ($1, $2) RETURNING id',
            [username, password]
        );
        res.status(201).json({ message: 'Usuario registrado exitosamente', userId: result.rows[0].id });
    } catch (error) {
        if (error.code === '23505') { // Código de error para restricción de unicidad (duplicate key)
            return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
        }
        console.error('Error al registrar usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta de login de usuario
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Nombre de usuario y contraseña son requeridos.' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE username = $1 AND password = $2',
            [username, password]
        );

        if (result.rows.length > 0) {
            res.status(200).json({ message: 'Login exitoso', user: result.rows[0] });
        } else {
            res.status(401).json({ message: 'Credenciales inválidas.' });
        }
    } catch (error) {
        console.error('Error al intentar login:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// ====================================================================
// Servir archivos estáticos del Frontend
// ====================================================================

// Ruta para servir los archivos estáticos de tu frontend desde la carpeta 'proyecto'
// Asegura que Render los encuentre correctamente.
// process.cwd() apunta al directorio de trabajo actual en Render (/opt/render/project/src/)
app.use(express.static(path.join(process.cwd(), 'proyecto')));


// ====================================================================
// IMPORTANTE: Ruta para manejar cualquier otra solicitud (para servir index.html como fallback)
// Esta es la ruta de respaldo para tu frontend SPA
// ====================================================================
app.get('*', (req, res) => {
    // Si la solicitud no coincide con ninguna ruta API ni archivo estático,
    // sirve el index.html principal de tu aplicación frontend.
    res.sendFile(path.join(process.cwd(), 'proyecto', 'index.html'));
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${port}`);
});