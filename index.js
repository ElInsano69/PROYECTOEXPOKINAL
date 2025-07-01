const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg'); // Importa Pool de pg

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(cors());
app.use(express.json());

// --- Configuración de la Base de Datos PostgreSQL ---
// Render inyectará la variable de entorno DATABASE_URL automáticamente para PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // NECESARIO para conexiones SSL en Render si tu DB no tiene un certificado de CA conocido
    }
});

// Prueba la conexión a la base de datos al iniciar
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error al conectar a la base de datos:', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return console.error('Error al ejecutar query de prueba:', err.stack);
        }
        console.log('Conectado a PostgreSQL. Hora actual de la DB:', result.rows[0].now);

        // --- Crear tabla de usuarios si no existe ---
        // Usar un IIFE (Immediately Invoked Function Expression) o una función async/await para esto
        (async () => {
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS usuarios (
                        id SERIAL PRIMARY KEY,
                        nombre VARCHAR(255),
                        apellido VARCHAR(255),
                        correo VARCHAR(255) UNIQUE,
                        clave VARCHAR(255),
                        rol VARCHAR(50) DEFAULT 'estudiante',
                        foto TEXT DEFAULT ''
                    );
                `);
                console.log('Tabla "usuarios" verificada/creada.');

                // Opcional: Crear un usuario administrador si no existe
                const res = await pool.query("SELECT * FROM usuarios WHERE correo = 'admin@admin.com'");
                if (res.rows.length === 0) {
                    await pool.query("INSERT INTO usuarios (nombre, apellido, correo, clave, rol) VALUES ($1, $2, $3, $4, $5)",
                        ['Admin', 'Principal', 'admin@admin.com', 'adminpass', 'admin']); // Cambia 'adminpass'
                    console.log("Usuario admin creado.");
                } else {
                    console.log("Usuario admin ya existe.");
                }
            } catch (err) {
                console.error('Error al inicializar la base de datos:', err.stack);
            }
        })();
    });
});


// --- RUTAS DE LA API (ENDPOINT DEL BACKEND) ---

// Ruta de Login
app.post('/login', async (req, res) => {
    const { email, clave } = req.body;
    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [email]);
        const user = result.rows[0];

        if (!user || user.clave !== clave) { // En un entorno real, usar bcrypt para comparar contraseñas
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
        // En un entorno real, generar un JWT (JSON Web Token)
        const token = 'fake-jwt-token-for-' + user.id; // Token simulado
        res.json({ message: 'Login exitoso', token, user });
    } catch (err) {
        console.error('Error en login:', err.stack);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta de Registro
app.post('/register', async (req, res) => {
    const { nombre, apellido, email, clave } = req.body;
    try {
        const result = await pool.query('INSERT INTO usuarios (nombre, apellido, correo, clave, rol, foto) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [nombre, apellido, email, clave, 'estudiante', '']);
        res.status(201).json({ message: 'Usuario registrado exitosamente', userId: result.rows[0].id });
    } catch (err) {
        console.error('Error en registro:', err.stack);
        if (err.code === '23505') { // Código de error para violaciones de unicidad (correo ya existe)
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta para obtener todos los usuarios (solo para administradores)
app.get('/users', async (req, res) => {
    // Aquí deberías añadir una verificación de TOKEN y ROL en un entorno real
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token no proporcionado.' });
    }
    const token = authHeader.split(' ')[1];

    // Simulación de verificación de token y rol (muy básica)
    if (!token.includes('fake-jwt-token-for-1') && token !== 'fake-admin-token') {
        return res.status(403).json({ message: 'Acceso denegado. Se requiere token de administrador.' });
    }

    try {
        const result = await pool.query('SELECT id, nombre, apellido, correo, rol, foto FROM usuarios');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener usuarios:', err.stack);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta para eliminar un usuario (solo para administradores)
app.delete('/users/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token no proporcionado.' });
    }
    const token = authHeader.split(' ')[1];
    if (!token.includes('fake-jwt-token-for-1') && token !== 'fake-admin-token') {
        return res.status(403).json({ message: 'Acceso denegado. Se requiere token de administrador.' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }

    // Simulación: No permitir eliminar al propio admin si el ID del admin es 1
    // En un caso real, el ID del usuario que intenta eliminar vendría del token JWT
    if (userId === 1 && (token.includes('fake-jwt-token-for-1') || token === 'fake-admin-token')) {
        return res.status(403).json({ message: 'No puedes eliminar tu propia cuenta de administrador.' });
    }

    try {
        const result = await pool.query('DELETE FROM usuarios WHERE id = $1', [userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.json({ message: 'Usuario eliminado con éxito.' });
    } catch (err) {
        console.error('Error al eliminar usuario:', err.stack);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta para actualizar la foto de perfil (simulado por ahora)
app.post('/profile/photo', async (req, res) => {
    const { fotoUrl } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token no proporcionado.' });
    }
    // En un entorno real, aquí obtendrías el ID del usuario del token
    // y actualizarías la base de datos:
    // const userId = obtenerUserIdDelToken(token);
    // await pool.query('UPDATE usuarios SET foto = $1 WHERE id = $2', [fotoUrl, userId]);
    console.log(`Foto de perfil recibida para actualización: ${fotoUrl}`);
    res.json({ message: 'URL de foto recibida y procesada (simulado).' });
});


// --- SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND ---
// Esto es idéntico a la versión anterior, ya que el manejo de archivos estáticos no cambia con la DB.
app.use(express.static(path.join(__dirname, 'proyecto')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'proyecto', 'index.html'));
});

app.get('/:pageName.html', (req, res) => {
    const pagePath = path.join(__dirname, 'proyecto', req.params.pageName + '.html');
    res.sendFile(pagePath, (err) => {
        if (err) {
            console.error(`Error al servir ${req.params.pageName}.html:`, err);
            res.status(404).send('Página no encontrada');
        }
    });
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor de backend escuchando en el puerto ${PORT}`);
    console.log(`Tu servicio está en vivo`);
});