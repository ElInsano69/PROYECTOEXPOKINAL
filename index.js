// Importa módulos necesarios
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // Importa cors

const app = express();
app.use(express.json());
app.use(cors()); // Usa cors para permitir solicitudes desde otros dominios

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Ruta para servir archivos estáticos (tu frontend)
const path = require('path');
app.use(express.static(path.join(__dirname, 'proyecto')));

// Middleware para verificar el token JWT
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(403).json({ message: 'Token no proporcionado.' });
    }
    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(500).json({ message: 'Fallo al autenticar el token.' });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role; // Asumiendo que el rol está en el token
        next();
    });
};

// Función para inicializar la base de datos y asegurar las columnas
async function initializeDb() {
    try {
        // Asegúrate de que la tabla base 'usuarios' existe con las columnas principales
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                apellido VARCHAR(255) NOT NULL,
                -- Inicialmente usa 'email' si no sabemos el estado
                email_or_correo VARCHAR(255) UNIQUE NOT NULL, 
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(50), -- rol puede ser null al inicio, luego se verifica
                foto VARCHAR(255) -- foto puede ser null al inicio, luego se verifica
            );
        `);
        console.log('Tabla "usuarios" verificada o creada.');

        // Verificar y renombrar 'email' a 'correo' si existe
        const columnCheckEmail = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'email_or_correo' AND data_type = 'character varying';
        `);
        // Si la columna 'email_or_correo' existe, y es realmente 'email', la renombramos.
        // Esto es un poco más complejo porque si ya la renombró antes, no queremos otro ALTER.
        // La forma más segura es verificar si 'correo' no existe y 'email' existe.
        const correoExists = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'correo';
        `);
        const emailExists = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'email';
        `);

        if (emailExists.rows.length > 0 && correoExists.rows.length === 0) {
            await pool.query(`ALTER TABLE usuarios RENAME COLUMN email TO correo;`);
            console.log('Columna "email" renombrada a "correo" en la tabla "usuarios".');
        } else if (correoExists.rows.length > 0) {
            console.log('Columna "correo" ya existe en la tabla "usuarios".');
        } else {
             // Si ninguna existe, y la tabla se creó con email_or_correo, renómbrala a correo
             // Esto cubre el caso donde la tabla se crea con email_or_correo y necesitamos la 'correo' final
             await pool.query(`ALTER TABLE usuarios RENAME COLUMN email_or_correo TO correo;`);
             console.log('Columna inicial renombrada a "correo".');
        }


        // Verificar si la columna 'foto' existe, y si no, añadirla
        const columnCheckFoto = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'foto';
        `);

        if (columnCheckFoto.rows.length === 0) {
            await pool.query(`ALTER TABLE usuarios ADD COLUMN foto VARCHAR(255);`);
            console.log('Columna "foto" añadida a la tabla "usuarios".');
        } else {
            console.log('Columna "foto" ya existe en la tabla "usuarios".');
        }

        // Verificar si la columna 'rol' existe, y si no, añadirla
        const columnCheckRol = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'rol';
        `);

        if (columnCheckRol.rows.length === 0) {
            await pool.query(`ALTER TABLE usuarios ADD COLUMN rol VARCHAR(50) DEFAULT 'estudiante';`);
            console.log('Columna "rol" añadida a la tabla "usuarios".');
        } else {
            console.log('Columna "rol" ya existe en la tabla "usuarios".');
        }


        // Crear usuario administrador si no existe
        const adminExists = await pool.query("SELECT * FROM usuarios WHERE correo = 'admin@admin.com'");
        if (adminExists.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query(
                "INSERT INTO usuarios (nombre, apellido, correo, password, rol) VALUES ($1, $2, $3, $4, $5)",
                ['Admin', 'User', 'admin@admin.com', hashedPassword, 'admin']
            );
            console.log('Usuario administrador creado.');
        }

    } catch (err) {
        console.error('Error al conectar o inicializar la base de datos:', err);
    }
}

// Llama a la función de inicialización al iniciar el servidor
initializeDb();

// ... (resto de tus rutas, como /register, /login, /profile, etc.) ...

// Ruta de registro de usuario
app.post('/register', async (req, res) => {
    const { nombre, apellido, correo, password, rol, foto } = req.body; // Asegúrate de que 'foto' se reciba aquí
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO usuarios (nombre, apellido, correo, password, rol, foto) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [nombre, apellido, correo, hashedPassword, rol || 'estudiante', foto || null] // Asigna null si no se proporciona foto
        );
        res.status(201).json({ message: 'Usuario registrado con éxito', user: result.rows[0] });
    } catch (err) {
        console.error('Error al registrar usuario:', err);
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario.' });
    }
});

// Ruta de inicio de sesión
app.post('/login', async (req, res) => {
    const { correo, password } = req.body;
    try {
        const user = await pool.query("SELECT * FROM usuarios WHERE correo = $1", [correo]);
        if (user.rows.length === 0) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        // Generar token JWT
        const token = jwt.sign(
            { id: user.rows[0].id, role: user.rows[0].rol },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Devolver el token y la información del usuario (incluyendo la foto)
        res.status(200).json({
            message: 'Inicio de sesión exitoso',
            token,
            user: {
                id: user.rows[0].id,
                nombre: user.rows[0].nombre,
                apellido: user.rows[0].apellido,
                correo: user.rows[0].correo,
                rol: user.rows[0].rol,
                foto: user.rows[0].foto // Asegúrate de incluir la columna 'foto' aquí
            }
        });
    } catch (err) {
        console.error('Error al iniciar sesión:', err);
        res.status(500).json({ message: 'Error interno del servidor al iniciar sesión.' });
    }
});

// Ruta para obtener todos los usuarios (solo para administradores)
app.get('/users', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }
    try {
        const users = await pool.query("SELECT id, nombre, apellido, correo, rol, foto FROM usuarios"); // Incluye 'foto'
        res.status(200).json(users.rows);
    }
    //... (el resto de tus rutas PUT y DELETE están bien)
    catch (err) {
        console.error('Error al obtener usuarios:', err);
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios.' });
    }
});

// Ruta para obtener perfil de usuario
app.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await pool.query("SELECT id, nombre, apellido, correo, rol, foto FROM usuarios WHERE id = $1", [req.userId]); // Incluye 'foto'
        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        res.status(200).json(user.rows[0]);
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        res.status(500).json({ message: 'Error interno del servidor al obtener perfil.' });
    }
});

// Ruta para actualizar perfil de usuario
app.put('/profile', verifyToken, async (req, res) => {
    const { nombre, apellido, correo, foto } = req.body; // Asegúrate de que 'foto' se reciba aquí
    try {
        const result = await pool.query(
            "UPDATE usuarios SET nombre = $1, apellido = $2, correo = $3, foto = $4 WHERE id = $5 RETURNING *",
            [nombre, apellido, correo, foto, req.userId] // Asegúrate de actualizar 'foto'
        );
        res.status(200).json({ message: 'Perfil actualizado con éxito', user: result.rows[0] });
    } catch (err) {
        console.error('Error al actualizar perfil:', err);
        res.status(500).json({ message: 'Error interno del servidor al actualizar perfil.' });
    }
});

// Ruta para eliminar usuario (solo para administradores)
app.delete('/users/:id', verifyToken, async (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
    }
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
        res.status(200).json({ message: 'Usuario eliminado con éxito.' });
    } catch (err) {
        console.error('Error al eliminar usuario:', err);
        res.status(500).json({ message: 'Error interno del servidor al eliminar usuario.' });
    }
});

// Define el puerto del servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
});