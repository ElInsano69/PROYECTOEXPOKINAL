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

// Configuración de CORS
// Define los orígenes permitidos para las solicitudes del frontend.
// Dado que el frontend está siendo servido por este mismo backend,
// la URL del backend será un origen permitido automáticamente.
const allowedOrigins = [
    'http://localhost:3000', // Para desarrollo local (si tu frontend corre en este puerto)
    'https://proyectoexpokinal.onrender.com' // Tu propia URL de backend en Render
    // Si tu frontend está en Netlify o un dominio diferente, deberías añadirlo aquí:
    // 'https://tu-dominio-netlify-o-otro.netlify.app'
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

app.use(express.json({ limit: '50mb' })); // Middleware para parsear cuerpos de solicitud JSON
// Se aumentó el límite para permitir el envío de imágenes en Base64

// =========================================================
// RUTAS DE LA API
// =========================================================

// Ruta de Registro de Usuario
// Espera: { nombre, apellido, email, password, foto (opcional) }
app.post('/register', async (req, res) => {
    const { nombre, apellido, email, password, foto } = req.body; // Se añade 'foto'

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

        // Inserta el nuevo usuario en la base de datos, incluyendo la foto
        // Se añade 'foto' a la lista de columnas y a los valores a insertar
        const resultado = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, email, password, foto) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, apellido, email, foto',
            [nombre, apellido, email, hashedPassword, foto || null] // Pasa 'foto' o null si está vacía
        );

        res.status(201).json({ mensaje: 'Usuario registrado exitosamente', usuario: resultado.rows[0] });

    } catch (error) {
        console.error('Error al registrar usuario:', error);
        // Devuelve un error genérico para no exponer detalles internos
        res.status(500).json({ mensaje: 'Error interno del servidor al registrar usuario.' });
    }
});

// Ruta de Inicio de Sesión de Usuario
// Espera: { email, password }
app.post('/login', async (req, res) => {
    // Se usará 'email' en lugar de 'username' como nombre de campo para mayor claridad,
    // ya que el frontend envía 'email'.
    const { email, password } = req.body; 

    // Validación básica de campos
    if (!email || !password) {
        return res.status(400).json({ mensaje: 'El email y la contraseña son obligatorios.' });
    }

    try {
        // Busca el usuario por email en la base de datos
        // Se selecciona también la columna 'foto'
        const usuarioResultado = await pool.query('SELECT id, nombre, apellido, email, password, foto FROM usuarios WHERE email = $1', [email]);
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

        // Devuelve el token y los datos del usuario (sin la contraseña hasheada), incluyendo la foto
        res.status(200).json({
            mensaje: 'Inicio de sesión exitoso',
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                email: usuario.email,
                foto: usuario.foto // Se incluye el campo foto
            }
        });

    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al iniciar sesión.' });
    }
});

// Ruta para obtener todos los usuarios (para la tabla de administración)
// Solo selecciona datos públicos. Se incluye la foto para mostrarla en la tabla si es necesario
app.get('/usuarios', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT id, nombre, apellido, email, foto FROM usuarios ORDER BY id ASC'); // Se añade 'foto'
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
        // Se añade la columna 'foto' de tipo TEXT para almacenar la imagen en Base64.
        return client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                apellido VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                foto TEXT, -- Columna para almacenar la foto en Base64
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    })
    .then(() => {
        console.log('Tabla "usuarios" verificada o creada (con columna foto).');
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
