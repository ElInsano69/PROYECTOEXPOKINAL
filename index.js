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
    // Asegúrate de que process.env.JWT_SECRET esté definido en Render
    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('Error al verificar token:', err); // Log para depuración
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
        // Usamos 'temp_correo_col' para evitar conflictos si 'correo' o 'email' ya existen
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                apellido VARCHAR(255) NOT NULL,
                temp_correo_col VARCHAR(255) UNIQUE, -- Columna temporal para el correo
                password VARCHAR(255) NOT NULL,
                rol VARCHAR(50), 
                foto VARCHAR(255) 
            );
        `);
        console.log('Tabla "usuarios" verificada o creada.');

        // Lógica para asegurar que la columna 'correo' exista y sea la correcta
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
        const tempCorreoColExists = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'usuarios' AND column_name = 'temp_correo_col';
        `);

        if (tempCorreoColExists.rows.length > 0 && correoExists.rows.length === 0 && emailExists.rows.length === 0) {
            // Si solo existe la temporal y no 'correo' ni 'email', renómbrala
            await pool.query(`ALTER TABLE usuarios RENAME COLUMN temp_correo_col TO correo;`);
            console.log('Columna "temp_correo_col" renombrada a "correo".');
        } else if (emailExists.rows.length > 0 && correoExists.rows.length === 0) {
            // Si 'email' existe y 'correo' no, renombra 'email' a 'correo'
            await pool.query(`ALTER TABLE usuarios RENAME COLUMN email TO correo;`);
            console.log('Columna "email" renombrada a "correo" en la tabla "usuarios".');
            // Si temp_correo_col también existía, elimínala para limpiar
            if (tempCorreoColExists.rows.length > 0) {
                await pool.query(`ALTER TABLE usuarios DROP COLUMN temp_correo_col;`);
                console.log('Columna "temp_correo_col" eliminada.');
            }
        } else if (correoExists.rows.length > 0) {
            console.log('Columna "correo" ya existe en la tabla "usuarios".');
            // Si 'correo' ya existe, y la temporal también, elimina la temporal
            if (tempCorreoColExists.rows.length > 0) {
                await pool.query(`ALTER TABLE usuarios DROP COLUMN temp_correo_col;`);
                console.log('Columna "temp_correo_col" eliminada.');
            }
            // Si 'email' también existe, elimínala si no se ha renombrado
            if (emailExists.rows.length > 0) {
               await pool.query(`ALTER TABLE usuarios DROP COLUMN email;`);
               console.log('Columna "email" eliminada (ya existe "correo").');
            }
        } else {
            // Si por alguna razón ninguna existe, y no se creó con temp_correo_col, la añade
            await pool.query(`ALTER TABLE usuarios ADD COLUMN correo VARCHAR(255) UNIQUE NOT NULL DEFAULT 'default@email.com';`);
            console.log('Columna "correo" añadida a la tabla "usuarios" con un valor por defecto.');
            // Eliminar la columna temporal si se creó pero no se renombró
            if (tempCorreoColExists.rows.length > 0) {
                await pool.query(`ALTER TABLE usuarios DROP COLUMN temp_correo_col;`);
                console.log('Columna "temp_correo_col" eliminada.');
            }
        }
        // Asegurar que la columna 'correo' sea NOT NULL y UNIQUE
        // Esto solo se ejecutará si la columna ya existe y no tiene estas restricciones
        try {
            await pool.query(`ALTER TABLE usuarios ALTER COLUMN correo SET NOT NULL;`);
            await pool.query(`ALTER TABLE usuarios ADD CONSTRAINT unique_correo UNIQUE (correo);`);
            console.log('Restricciones NOT NULL y UNIQUE añadidas a la columna "correo".');
        } catch (constraintErr) {
            if (constraintErr.code === '42P07' || constraintErr.code === '42710') { // 42P07: duplicate_object, 42710: duplicate_constraint
                console.log('Restricciones NOT NULL y/o UNIQUE ya existen para "correo".');
            } else {
                console.warn('Advertencia al añadir restricciones a "correo":', constraintErr.message);
            }
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

// Ruta de registro de usuario
app.post('/register', async (req, res) => {
    const { nombre, apellido, correo, password, rol, foto } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            "INSERT INTO usuarios (nombre, apellido, correo, password, rol, foto) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [nombre, apellido, correo, hashedPassword, rol || 'estudiante', foto || null]
        );

        const newUser = result.rows[0];

        // Generar token JWT para el nuevo usuario
        const token = jwt.sign(
            { id: newUser.id, role: newUser.rol },
            process.env.JWT_SECRET, // Asegúrate de que esta variable de entorno esté configurada en Render
            { expiresIn: '1h' }
        );

        res.status(201).json({
            message: 'Usuario registrado con éxito',
            token, // Incluir el token en la respuesta
            user: {
                id: newUser.id,
                nombre: newUser.nombre,
                apellido: newUser.apellido,
                correo: newUser.correo,
                rol: newUser.rol,
                foto: newUser.foto
            }
        });
    } catch (err) {
        console.error('Error al registrar usuario:', err);
        // Manejo de error específico para correo duplicado
        if (err.code === '23505') { // Código de error de PostgreSQL para violación de restricción UNIQUE
            return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
        }
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
            process.env.JWT_SECRET, // Asegúrate de que esta variable de entorno esté configurada en Render
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
                foto: user.rows[0].foto
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
        const users = await pool.query("SELECT id, nombre, apellido, correo, rol, foto FROM usuarios");
        res.status(200).json(users.rows);
    } catch (err) {
        console.error('Error al obtener usuarios:', err);
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios.' });
    }
});

// Ruta para obtener perfil de usuario
app.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await pool.query("SELECT id, nombre, apellido, correo, rol, foto FROM usuarios WHERE id = $1", [req.userId]);
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
    const { nombre, apellido, correo, foto } = req.body;
    try {
        // Asegúrate de que el correo no se cambie a uno que ya existe, a menos que sea el mismo del usuario actual
        const existingUser = await pool.query("SELECT id FROM usuarios WHERE correo = $1 AND id != $2", [correo, req.userId]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'El correo electrónico ya está en uso por otro usuario.' });
        }

        const result = await pool.query(
            "UPDATE usuarios SET nombre = $1, apellido = $2, correo = $3, foto = $4 WHERE id = $5 RETURNING *",
            [nombre, apellido, correo, foto, req.userId]
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