const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path'); // Necesario para servir archivos estáticos

const app = express();
const PORT = process.env.PORT || 3000;

// Configura tu Pool de conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors()); // Permite peticiones desde tu frontend
app.use(express.json()); // Habilita el parseo de JSON en las peticiones

// **********************************************************************************
// *** NUEVO: SERVIR ARCHIVOS ESTÁTICOS (TU HTML, CSS, JS DE FRONTEND)             ***
// *** Asegúrate de que tu index.html y otros archivos de frontend estén en la raíz ***
// **********************************************************************************
app.use(express.static(__dirname)); // Sirve archivos estáticos desde el directorio actual (la raíz del proyecto)

// Ruta para la raíz, sirve el index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Rutas de tu API (Login, Registro, Usuarios, etc.) - Estas NO USAN 'document'
// Ruta de ejemplo para verificar que el backend funciona
app.get('/api/saludo-backend', (req, res) => {
  res.json({ message: '¡Hola desde tu API de Backend!' });
});

// Ruta para el login de usuarios
app.post('/api/login', async (req, res) => {
    const { email, clave } = req.body;
    try {
        const userResult = await pool.query('SELECT id, correo, clave, clave, nombre, apellido, rol, foto FROM usuarios WHERE correo = $1', [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(clave, user.clave);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        // Generar token JWT con la información del usuario
        const token = jwt.sign(
            { id: user.id, correo: user.correo, rol: user.rol, nombre: user.nombre, apellido: user.apellido, foto: user.foto },
            process.env.JWT_SECRET || 'tu_secreto_jwt', // Usa una variable de entorno para el secreto
            { expiresIn: '1h' } // Token expira en 1 hora
        );

        // Envía los datos del usuario (sin la clave hasheada) y el token
        res.json({ token, user: { id: user.id, correo: user.correo, nombre: user.nombre, apellido: user.apellido, rol: user.rol, foto: user.foto } });
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Ruta para el registro de usuarios
app.post('/api/register', async (req, res) => {
    const { nombre, apellido, email, clave } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(clave, 10); // Hashear la contraseña
        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, correo, clave, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, correo, nombre, apellido, rol, foto',
            [nombre, apellido, email, hashedPassword, 'estudiante'] // Rol por defecto 'estudiante'
        );
        res.status(201).json({ message: 'Usuario registrado con éxito', user: newUser.rows[0] });
    } catch (error) {
        console.error('Error en el registro:', error);
        if (error.code === '23505') { // Código de error para clave duplicada (ej. correo ya registrado)
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario' });
    }
});

// Ruta para obtener usuarios (protegida, solo para admin)
app.get('/api/users', async (req, res) => {
    try {
        // Verificar token y rol de administrador
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No autorizado: Token no proporcionado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt');
        if (decoded.rol !== 'admin') {
            return res.status(403).json({ message: 'Acceso denegado: Se requiere rol de administrador' });
        }

        const result = await pool.query('SELECT id, correo, nombre, apellido, rol, foto FROM usuarios');
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        if (error instanceof jwt.JsonWebTokenError) { // Token inválido o expirado
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios' });
    }
});

// Ruta para eliminar un usuario (protegida, solo para admin)
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userIdToDelete = req.params.id;
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'No autorizado: Token no proporcionado' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt');
        if (decoded.rol !== 'admin') {
            return res.status(403).json({ message: 'Acceso denegado: Se requiere rol de administrador para eliminar' });
        }

        // Evitar que un admin se elimine a sí mismo
        if (decoded.id == userIdToDelete) {
            return res.status(403).json({ message: 'No puedes eliminar tu propia cuenta de administrador.' });
        }

        const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [userIdToDelete]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.status(200).json({ message: 'Usuario eliminado con éxito', deletedUser: result.rows[0] });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        res.status(500).json({ message: 'Error interno del servidor al eliminar usuario' });
    }
});

// Ruta para actualizar foto de perfil (esqueleto, aún necesita lógica de subida real)
app.post('/api/profile/photo', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No autorizado' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt');
        const userId = decoded.id;
        const { fotoUrl } = req.body; // Se espera que fotoUrl ya sea una URL accesible públicamente

        if (!fotoUrl) {
            return res.status(400).json({ message: 'URL de la foto no proporcionada' });
        }

        const result = await pool.query(
            'UPDATE usuarios SET foto = $1 WHERE id = $2 RETURNING foto',
            [fotoUrl, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ message: 'Foto de perfil actualizada con éxito', foto: result.rows[0].foto });
    } catch (error) {
        console.error('Error al actualizar la foto:', error);
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        res.status(500).json({ message: 'Error interno del servidor al actualizar foto' });
    }
});


// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});