// Importación de módulos necesarios
const express = require('express');
const { Pool } = require('pg'); // Para interactuar con PostgreSQL
const bcrypt = require('bcryptjs'); // Para encriptar y comparar contraseñas
const jwt = require('jsonwebtoken'); // Para manejar tokens de autenticación
const path = require('path'); // Para manejar rutas de archivos estáticos
const cors = require('cors'); // Para habilitar Cross-Origin Resource Sharing

const app = express(); // Inicializa la aplicación Express

// Configuración del puerto del servidor
// Render inyecta el puerto en process.env.PORT; usamos 10000 como fallback para desarrollo local.
const PORT = process.env.PORT || 10000;

// Configuración de la base de datos PostgreSQL
// Render inyecta la URL de conexión a la DB en process.env.DATABASE_URL.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necesario para conexiones SSL en Render.com
    }
});

// **********************************************************************************
// !!! RECORDATORIO IMPORTANTE SOBRE EL CÓDIGO TEMPORAL DE 'DROP TABLE' !!!
// Las siguientes líneas de código (comentadas abajo) fueron añadidas TEMPORALMENTE
// para forzar la recreación de la tabla 'usuarios' y solucionar el error de columna 'password'.
// SI YA HAS LOGRADO REGISTRAR UN USUARIO EXITOSAMENTE DESDE NETLIFY, DEBES ELIMINAR
// ESTE BLOQUE DE CÓDIGO COMENTADO de tu archivo index.js para evitar que la tabla
// se borre en cada reinicio del servidor.
// **********************************************************************************
/*
// Este bloque estaba dentro de pool.connect().then(async client => { ...
// y DEBE SER ELIMINADO si ya solucionaste el problema inicial.
try {
    await client.query('DROP TABLE IF EXISTS usuarios CASCADE;'); // Borra la tabla si existe
    console.log('Tabla "usuarios" eliminada temporalmente para forzar recreación.');
} catch (dropError) {
    console.error('Error al intentar eliminar la tabla usuarios (puede que no existiera):', dropError.message);
}
*/
// **********************************************************************************
// !!! FIN DEL RECORDATORIO SOBRE EL CÓDIGO TEMPORAL !!!
// **********************************************************************************


// Configuración de CORS
// Define los orígenes permitidos para las solicitudes del frontend.
// Reemplaza 'https://TU_DOMINIO_NETLIFY.netlify.app' con tu dominio REAL de Netlify.
// Por ejemplo: 'https://mi-proyecto-kinal.netlify.app'
const allowedOrigins = [
    'http://localhost:3000', // Para desarrollo local (si tu frontend corre en este puerto)
    'https://proyectoexpokinal.onrender.com', // Tu propia URL de backend en Render
    'https://TU_DOMINO_NETLIFY.netlify.app' // ¡¡¡AQUÍ VA LA URL REAL DE TU SITIO EN NETLIFY!!!
];

app.use(cors({
    origin: function (origin, callback) {
        // Permite solicitudes sin un origen (por ejemplo, Postman, CURL) o
        // solicitudes que provienen de uno de los orígenes en allowedOrigins.
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    }
}));


app.use(express.json()); // Middleware para parsear cuerpos de solicitud JSON

// =========================================================
// RUTAS DE LA API
// =========================================================

// Ruta de Registro de Usuario
// Espera: { nombre, apellido, email, password }
app.post('/register', async (req, res) => {
    const { nombre, apellido, email, password } = req.body;

    // Validación básica de campos
    if (!nombre || !apellido || !email || !password) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    try {
        // Verifica si el email ya está registrado
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(409).json({ mensaje: 'El email ya está registrado.' });
        }

        // Encripta la contraseña antes de guardarla en la base de datos
        const hashedPassword = await bcrypt.hash(password, 10); // 10 es el costo del salt (nivel de complejidad)

        // Inserta el nuevo usuario en la base de datos
        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, email, password) VALUES ($1, $2, $3, $4) RETURNING id, nombre, apellido, email',
            [nombre, apellido, email, hashedPassword]
        );

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: resultado.rows[0] });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        // Devuelve un error genérico para no exponer detalles internos
        res.status(500).json({ mensaje: 'Error interno del servidor al registrar usuario.' });
    }
});

// Ruta de Inicio de Sesión de Usuario
// Espera: { username: email, password: clave }
app.post('/login', async (req, res) => {
    const { username, password } = req.body; // 'username' se usa para el email

    // Validación básica de campos
    if (!username || !password) {
        return res.status(400).json({ mensaje: 'El email y la contraseña son obligatorios.' });
    }

    try {
        // Busca el usuario por email en la base de datos
        const usuarioResultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [username]);
        const usuario = usuarioResultado.rows[0];

        // Si el usuario no existe
        if (!usuario) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        // Compara la contraseña proporcionada con la contraseña hasheada de la base de datos
        const passwordValido = await bcrypt.compare(password, usuario.password);

        // Si la contraseña no es válida
        if (!passwordValido) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
        }

        // Genera un token JWT (JSON Web Token) para la sesión del usuario
        // Usa una clave secreta del entorno de Render o un fallback seguro para desarrollo
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email },
            process.env.JWT_SECRET || 'mi_clave_secreta_super_segura_y_larga', // ¡CAMBIA ESTA CLAVE EN PRODUCCIÓN!
            { expiresIn: '1h' } // El token expira en 1 hora
        );

        // Devuelve el token y los datos del usuario (sin la contraseña hasheada)
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

// Ruta para obtener todos los usuarios (para la tabla de administración)
// Solo selecciona datos públicos.
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
// (Estas rutas deben ir DESPUÉS de las rutas de la API)
// =========================================================

// Servir archivos estáticos desde la carpeta 'proyecto'
// Esto permite que el navegador cargue CSS, JavaScript del frontend, imágenes, etc.
app.use(express.static(path.join(__dirname, 'proyecto')));

// Ruta principal para servir el index.html
// Cuando se accede a la URL base de la aplicación, se devuelve este archivo.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});

// Ruta catch-all para Single Page Applications (SPA)
// Si ninguna ruta de API coincide, se devuelve el index.html.
// Esto permite que el frontend maneje el enrutamiento del lado del cliente.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});


// =========================================================
// INICIALIZACIÓN DEL SERVIDOR
// =========================================================

// Conectar a la base de datos y crear la tabla 'usuarios' si no existe.
// Esta parte se ejecuta una vez al iniciar el servidor.
pool.connect()
    .then(client => { // Usamos 'client' para asegurar que la consulta se hace en la conexión establecida
        console.log('Conectado a la base de datos PostgreSQL.');
        // Si la tabla 'usuarios' no existe, la crea con las columnas especificadas.
        // Si ya existe (y fue creada correctamente), este comando no hará nada.
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
        // Inicia el servidor Express una vez que la DB esté lista.
        app.listen(PORT, () => {
            console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
            console.log(`Available at your primary URL ${process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`}`);
        });
    })
    .catch(err => {
        // En caso de error crítico al iniciar la DB, la aplicación se detiene.
        console.error('Error al conectar o inicializar la base de datos:', err);
        process.exit(1); // Sale de la aplicación con un código de error
    });