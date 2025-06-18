// Importar módulos necesarios
const express = require('express');
const { Pool } = require('pg'); // Para interactuar con PostgreSQL
const bcrypt = require('bcrypt'); // Para hashear contraseñas
const path = require('path'); // Para manejar rutas de archivos estáticos
const cors = require('cors'); // Para Cross-Origin Resource Sharing (si es necesario)

const app = express();
const PORT = process.env.PORT || 10000; // Render asigna el puerto en process.env.PORT, si no, usa 10000

// Configuración de la base de datos usando DATABASE_URL de Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // NECESARIO para conexiones SSL en Render
    }
});

// Función para inicializar la base de datos (crear tabla si no existe)
async function initializeDatabase() {
    try {
        await pool.connect(); // Intentar conectar para verificar
        console.log('Conectado a la base de datos PostgreSQL.');

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                apellido VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                clave VARCHAR(255) NOT NULL,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createTableQuery);
        console.log('Tabla "usuarios" verificada o creada.');

        // Insertar un usuario de ejemplo si no existe
        const checkAdminQuery = `SELECT * FROM usuarios WHERE email = 'admin@admin.com'`;
        const adminResult = await pool.query(checkAdminQuery);
        if (adminResult.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10); // Contraseña de ejemplo
            const insertAdminQuery = `
                INSERT INTO usuarios (nombre, apellido, email, clave)
                VALUES ($1, $2, $3, $4) RETURNING id;
            `;
            const newAdmin = await pool.query(insertAdminQuery, ['Admin', 'User', 'admin@admin.com', hashedPassword]);
            console.log(`Usuario de ejemplo (admin@admin.com) insertado. ID: ${newAdmin.rows[0].id}`);
        }

    } catch (err) {
        console.error('Error al inicializar la base de datos:', err);
    }
}

// Iniciar la inicialización de la base de datos
initializeDatabase();

// Middlewares
app.use(cors()); // Permite solicitudes de otros orígenes (necesario si tu frontend está en un dominio diferente)
app.use(express.json()); // Permite a Express parsear cuerpos de solicitud JSON
app.use(express.urlencoded({ extended: true })); // Para formularios URL-encoded

// ====================================================================
// IMPORTANTE: Ruta para la carpeta del frontend
// ====================================================================
const frontendPath = path.join(__dirname, 'PROYECTO PAGINA WEB');

// Sirve archivos estáticos desde la carpeta 'PROYECTO PAGINA WEB'
app.use(express.static(frontendPath));

// RUTAS DE LA API

// Ruta de registro de usuarios
app.post('/api/usuarios', async (req, res) => {
    const { nombre, apellido, email, clave } = req.body;

    if (!nombre || !apellido || !email || !clave) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(clave, 10); // Hashear la contraseña

        const result = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, email, clave) VALUES ($1, $2, $3, $4) RETURNING id, email',
            [nombre, apellido, email, hashedPassword]
        );
        res.status(201).json({ message: 'Usuario registrado con éxito', userId: result.rows[0].id, email: result.rows[0].email });
    } catch (err) {
        if (err.code === '23505') { // Código de error de PostgreSQL para violación de restricción UNIQUE (email ya existe)
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ error: 'Error interno del servidor al registrar el usuario.' });
    }
});

// Ruta de inicio de sesión
app.post('/api/login', async (req, res) => {
    const { email, clave } = req.body;

    if (!email || !clave) {
        return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }

    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const isMatch = await bcrypt.compare(clave, user.clave);
        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Si las credenciales son correctas
        res.status(200).json({ message: 'Inicio de sesión exitoso', userId: user.id, email: user.email });

    } catch (err) {
        console.error('Error al iniciar sesión:', err);
        res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
    }
});

// Ruta para obtener todos los usuarios (ejemplo)
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, apellido, email FROM usuarios');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Error interno del servidor al obtener usuarios.' });
    }
});

// ====================================================================
// IMPORTANTE: Ruta para manejar cualquier otra solicitud (para servir index.html)
// ====================================================================
app.get('*', (req, res) => {
    // Asegura que index.html se sirva desde la carpeta 'PROYECTO PAGINA WEB'
    res.sendFile(path.join(frontendPath, 'index.html'));
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
});