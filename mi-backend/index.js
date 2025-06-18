const express = require('express');
const { Pool } = require('pg'); // Usamos la librería 'pg' para PostgreSQL
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Usa el puerto proporcionado por Render, o 3000 por defecto

// Middlewares
app.use(cors()); // Permite solicitudes de origen cruzado para tu frontend
app.use(express.json()); // Para parsear cuerpos de solicitudes JSON

// Sirve archivos estáticos (como tu index.html y otros assets)
// '__dirname' es la ruta actual de index.js (mi-backend). '..' sube a 'carpeta madre',
// y luego 'PROYECTO PAGINA WEB' entra en la carpeta del frontend.
app.use(express.static(path.join(__dirname, '../PROYECTO PAGINA WEB'))); 

// Configuración de la base de datos PostgreSQL
// La URL de la base de datos se obtendrá de la variable de entorno DATABASE_URL en Render
const dbConnectionString = process.env.DATABASE_URL;

// Verifica si la cadena de conexión está presente
if (!dbConnectionString) {
    console.error('Error: La variable de entorno DATABASE_URL no está definida. La base de datos no se puede conectar.');
    // En producción, podrías usar process.exit(1) aquí para evitar que la aplicación se inicie sin DB
}

// Crea un pool de conexiones a la base de datos PostgreSQL
const pool = new Pool({
    connectionString: dbConnectionString,
    ssl: {
        rejectUnauthorized: false // Importante para conexiones SSL con Render
    }
});

// Función para inicializar la base de datos (crear tabla e insertar admin)
async function initializeDatabase() {
    try {
        await pool.connect(); // Prueba la conexión a la DB
        console.log('Conectado a la base de datos PostgreSQL.');

        // Crea la tabla 'usuarios' si no existe
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                apellido TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                clave TEXT NOT NULL
            );
        `;
        await pool.query(createTableSql);
        console.log('Tabla "usuarios" verificada o creada.');

        // Insertar un usuario de ejemplo (admin) si la tabla está vacía
        const resCount = await pool.query("SELECT COUNT(*) FROM usuarios");
        const rowCount = parseInt(resCount.rows[0].count, 10); // Obtener el conteo como número

        if (rowCount === 0) {
            const insertAdminSql = `INSERT INTO usuarios (nombre, apellido, email, clave) VALUES ($1, $2, $3, $4) RETURNING id`;
            const res = await pool.query(insertAdminSql, ['Administrador', 'Kinal', 'admin@admin.com', 'adminpass']);
            console.log('Usuario de ejemplo (admin@admin.com) insertado. ID:', res.rows[0].id);
        } else {
            console.log('La tabla usuarios ya contiene datos. No se insertó el usuario de ejemplo.');
        }

    } catch (err) {
        console.error('Error al inicializar la base de datos:', err.message);
        // Si la conexión falla al inicio, la aplicación podría no funcionar correctamente.
    }
}

// Llama a la función para inicializar la base de datos
initializeDatabase();

// --- Rutas de la API ---

// Ruta de registro de usuarios
app.post('/api/usuarios', async (req, res) => {
    const { nombre, apellido, email, clave } = req.body;

    if (!nombre || !apellido || !email || !clave) {
        return res.status(400).json({ error: 'Todos los campos (nombre, apellido, email, clave) son obligatorios.' });
    }

    const sql = `INSERT INTO usuarios (nombre, apellido, email, clave) VALUES ($1, $2, $3, $4) RETURNING id`; 
    
    try {
        const result = await pool.query(sql, [nombre, apellido, email, clave]);
        res.status(201).json({
            message: 'Usuario registrado con éxito',
            id: result.rows[0].id,
            nombre: nombre,
            apellido: apellido,
            email: email
        });
    } catch (err) {
        // Código de error para UNIQUE constraint violation en PostgreSQL (email duplicado)
        if (err.code === '23505' && err.constraint === 'usuarios_email_key') {
            return res.status(409).json({ error: 'El email ya está registrado.' });
        }
        console.error('Error al registrar usuario:', err.message);
        res.status(500).json({ error: 'Error interno del servidor al registrar el usuario.' });
    }
});

// Ruta de inicio de sesión
app.post('/api/login', async (req, res) => {
    const { email, clave } = req.body;

    if (!email || !clave) {
        return res.status(400).json({ error: 'Email y clave son obligatorios.' });
    }

    const sql = 'SELECT id, nombre, apellido, email, clave FROM usuarios WHERE email = $1';
    try {
        const result = await pool.query(sql, [email]);
        const user = result.rows[0]; // PostgreSQL devuelve los resultados en .rows

        if (!user) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
        }
        
        // ¡ADVERTENCIA! En una aplicación real, usa una librería como bcrypt para comparar contraseñas.
        if (user.clave === clave) { // Comparación simple para este ejemplo, NO USAR EN PRODUCCIÓN
            res.status(200).json({
                message: 'Inicio de sesión exitoso',
                id: user.id,
                nombre: user.nombre,
                apellido: user.apellido,
                email: user.email
            });
        } else {
            res.status(401).json({ error: 'Email o contraseña incorrectos.' });
        }
    } catch (err) {
        console.error('Error al buscar usuario para login:', err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Ruta para obtener todos los usuarios (para el admin en el frontend)
app.get('/api/usuarios', async (req, res) => {
    const sql = 'SELECT id, nombre, apellido, email FROM usuarios'; // No devolver la clave/contraseña
    try {
        const result = await pool.query(sql);
        res.json(result.rows); // PostgreSQL devuelve los resultados en .rows
    } catch (err) {
        console.error('Error al obtener lista de usuarios:', err.message);
        res.status(500).json({ error: 'Error interno del servidor al obtener usuarios.' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
    console.log(`(Accesible públicamente si se despliega en un servicio como Render)`);
});