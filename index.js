const express = require('express');
const { Pool } = require('pg'); // Importa Pool de 'pg'
const bcrypt = require('bcryptjs'); // Para encriptar contraseñas
const jwt = require('jsonwebtoken'); // Para tokens JWT
const path = require('path'); // Para manejar rutas de archivos
const app = express();

// Configuración del puerto para Render
// Render inyecta el puerto en process.env.PORT
const PORT = process.env.PORT || 10000; // Usa 10000 como fallback para desarrollo local

// Configuración de la base de datos PostgreSQL para Render
// Render inyecta la URL de conexión a la DB en process.env.DATABASE_URL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necesario para conexiones SSL en Render
    }
});

// Middleware para parsear JSON en las solicitudes
app.use(express.json());

// =========================================================
// RUTAS DE LA API (¡COLOCA ESTO ANTES DE SERVIR ARCHIVOS ESTÁTICOS!)
// =========================================================

// Ruta de Registro de Usuario
app.post('/registro', async (req, res) => {
    const { nombre, apellido, email, password } = req.body;

    if (!nombre || !apellido || !email || !password) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    try {
        // Verificar si el email ya existe
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(409).json({ mensaje: 'El email ya está registrado.' });
        }

        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(password, 10); // 10 es el costo del salt

        // Insertar el nuevo usuario en la base de datos
        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, email, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, apellido, email, hashedPassword]
        );

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: resultado.rows[0] });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al registrar usuario.' });
    }
});

// Ruta de Inicio de Sesión de Usuario
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ mensaje: 'El email y la contraseña son obligatorios.' });
    }

    try {
        // Buscar el usuario por email
        const usuarioResultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        const usuario = usuarioResultado.rows[0];

        if (!usuario) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        // Comparar la contraseña ingresada con la contraseña hasheada
        const passwordValido = await bcrypt.compare(password, usuario.password);

        if (!passwordValido) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        // Generar un token JWT (usar una clave secreta fuerte y en una variable de entorno)
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email },
            process.env.JWT_SECRET || 'mi_clave_secreta_super_segura', // Usar variable de entorno, fallback para desarrollo
            { expiresIn: '1h' } // El token expira en 1 hora
        );

        res.status(200).json({ mensaje: 'Inicio de sesión exitoso', token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email } });

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al iniciar sesión.' });
    }
});


// =========================================================
// SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND (¡DESPUÉS DE LAS RUTAS DE API!)
// =========================================================

// Servir archivos estáticos desde la carpeta 'proyecto'
// Esto permite que el navegador solicite archivos como css/style.css, img/logo.png, etc.
app.use(express.static(path.join(__dirname, 'proyecto')));

// Ruta principal para servir el index.html
// Cuando alguien accede a la URL base de tu aplicación (ej. https://tuapp.onrender.com/),
// se le enviará este archivo.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});

// Opcional: Ruta catch-all para Single Page Applications (SPA)
// Esto asegura que cualquier ruta no definida por la API devuelva el index.html,
// permitiendo que tu frontend maneje el enrutamiento del lado del cliente.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});


// =========================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================

// Conectar a la base de datos y crear la tabla si no existe
pool.connect()
    .then(() => {
        console.log('Conectado a la base de datos PostgreSQL.');
        // Crear la tabla 'usuarios' si no existe
        return pool.query(`
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
        // Iniciar el servidor Express después de la conexión a la DB
        app.listen(PORT, () => {
            console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
            console.log(`Available at your primary URL ${process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`}`);
        });
    })
    .catch(err => {
        console.error('Error al conectar o inicializar la base de datos:', err);
        process.exit(1); // Salir si hay un error crítico al iniciar la DB
    });