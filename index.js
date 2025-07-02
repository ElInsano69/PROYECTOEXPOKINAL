const express = require('express');
const path = require('path'); // Para manejar rutas de archivos
const app = express();
const port = process.env.PORT || 10000; // Render usará process.env.PORT, localmente 10000

// --- MIDDLEWARE GENERAL DE EXPRESS ---
// Middleware para procesar solicitudes con cuerpo JSON
app.use(express.json());
// Middleware para procesar solicitudes con cuerpo URL-encoded (para formularios HTML simples)
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURACIÓN DE TU BACKEND Y CONEXIÓN A LA BASE DE DATOS (PostgreSQL) ---
const { Pool } = require('pg');

// Crea un pool de conexiones a la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render proporciona esta URL
  ssl: {
    rejectUnauthorized: false // Necesario para Render si no tienes un certificado SSL válido instalado
  }
});

// Prueba la conexión a la base de datos al iniciar el servidor
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
  } else {
    console.log('Conexión a la base de datos PostgreSQL exitosa:', res.rows[0].now);
  }
});

// *** TUS RUTAS DE API Y LÓGICA DE BACKEND AQUÍ ***
// Aquí van tus funciones para manejar el login, registro, gestión de usuarios, etc.
// ESTOS SON EJEMPLOS. AJÚSTALOS A LA ESTRUCTURA EXACTA DE TU BASE DE DATOS Y LÓGICA.

// Ruta de Registro de Usuario
app.post('/api/register', async (req, res) => {
    const { nombre, apellido, email, clave } = req.body;
    try {
        // !!! MUY IMPORTANTE: En una aplicación real, HASHEA la contraseña antes de guardarla.
        // Por ejemplo, usando bcrypt: const hashedPassword = await bcrypt.hash(clave, 10);
        const result = await pool.query(
            'INSERT INTO users (nombre, apellido, correo, clave, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, correo, nombre, apellido, rol',
            [nombre, apellido, email, clave, 'user'] // 'user' es el rol por defecto
        );
        res.status(201).json({ message: 'Usuario registrado con éxito', user: result.rows[0] });
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        if (error.code === '23505') { // Código de error de PostgreSQL para violación de unicidad (ej. correo duplicado)
            res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        } else {
            res.status(500).json({ message: 'Error interno del servidor al registrar.' });
        }
    }
});

// Ruta de Login de Usuario
app.post('/api/login', async (req, res) => {
    const { email, clave } = req.body;
    try {
        const result = await pool.query('SELECT id, nombre, apellido, correo, clave, rol FROM users WHERE correo = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        // !!! MUY IMPORTANTE: En una aplicación real, compara la contraseña hasheada.
        // Por ejemplo, usando bcrypt: const isMatch = await bcrypt.compare(clave, user.clave);
        // if (!isMatch) { return res.status(400).json({ message: 'Credenciales inválidas.' }); }

        // Si NO usas bcrypt (solo para pruebas locales con contraseñas en texto plano):
        if (clave !== user.clave) { 
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        // !!! MUY IMPORTANTE: Genera un JSON Web Token (JWT) aquí para autenticación real.
        const token = 'fake-jwt-token-for-testing'; // Reemplázalo con un JWT real

        // Elimina la contraseña del objeto de usuario antes de enviarlo al frontend por seguridad
        delete user.clave; 
        res.json({ message: 'Login exitoso', token, user });

    } catch (error) {
        console.error('Error durante el login:', error);
        res.status(500).json({ message: 'Error interno del servidor durante el login.' });
    }
});

// Middleware de autenticación (ejemplo simple, si usarías tokens)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Espera "Bearer TU_TOKEN"

    if (token == null) return res.sendStatus(401); // No autorizado si no hay token

    // !!! MUY IMPORTANTE: Aquí verificarías el token JWT con una librería como 'jsonwebtoken'.
    // jwt.verify(token, process.env.JWT_SECRET, (err, user) => { ... });
    
    // Para el ejemplo, simulamos un token válido:
    if (token === 'fake-jwt-token-for-testing') { 
        req.user = { id: 1, correo: 'admin@admin.com', rol: 'admin' }; // Simula un usuario administrador
        next(); // Continúa con la siguiente función de middleware/ruta
    } else {
        return res.sendStatus(403); // Prohibido si el token no es válido
    }
}

// Ruta para obtener todos los usuarios (requiere autenticación y rol de 'admin')
app.get('/api/users', authenticateToken, async (req, res) => {
    // Verifica si el usuario autenticado tiene rol de administrador
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. No tienes permisos de administrador.' });
    }
    try {
        // Selecciona todos los usuarios, excluyendo la clave
        const result = await pool.query('SELECT id, nombre, apellido, correo, rol FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios.' });
    }
});

// Ruta para eliminar un usuario por ID (requiere autenticación y rol de 'admin')
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. No tienes permisos de administrador.' });
    }
    const userId = parseInt(req.params.id); // Obtiene el ID del usuario de la URL

    // Evitar que el administrador se elimine a sí mismo
    if (req.user.id === userId && req.user.rol === 'admin') {
        return res.status(403).json({ message: 'No puedes eliminar tu propia cuenta de administrador.' });
    }

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
        if (result.rowCount > 0) {
            res.json({ message: 'Usuario eliminado con éxito.', id: userId });
        } else {
            res.status(404).json({ message: 'Usuario no encontrado.' });
        }
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar usuario.' });
    }
});

// --- SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND DESDE LA CARPETA 'public/' ---
// Esta línea es crucial. Le dice a Express que sirva todos los archivos
// dentro de la carpeta 'public' (tu HTML, CSS, imágenes, y el script.js del frontend).
// Cuando alguien acceda a la raíz de tu servidor (ej. http://localhost:10000/),
// Express buscará 'index.html' dentro de 'public' y lo enviará.
app.use(express.static(path.join(__dirname, 'public')));

// --- RUTA CATCH-ALL PARA EL FRONTEND (SPA - Single Page Application) ---
// Esta ruta es importante para aplicaciones de una sola página.
// Si una solicitud del navegador no coincide con ninguna de las rutas de API definidas arriba,
// Express enviará el 'index.html' de tu frontend. Esto permite que las rutas de la URL
// (ej. /login, /dashboard) sean manejadas por el JavaScript de tu frontend (script.js).
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- INICIO DEL SERVIDOR ---
// El servidor Express comienza a escuchar en el puerto configurado.
app.listen(port, () => {
    console.log(`Servidor fullstack corriendo en el puerto ${port}`);
});