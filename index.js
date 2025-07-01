// backend/index.js (Este es tu archivo del backend)

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

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
app.use(cors());
app.use(express.json());

// *******************************************************************
// *** AQUÍ DEBES AGREGAR TODAS TUS RUTAS Y LÓGICA DE BACKEND ***
// (Las mismas rutas de login, registro, usuarios, etc. que te di antes para server.js)
// *******************************************************************

// Ruta de ejemplo (mantén tus rutas de login, registro, etc. aquí)
app.get('/api/saludo-backend', (req, res) => {
  res.json({ message: '¡Hola desde tu API de Backend!' });
});

// Ruta para el login de usuarios
app.post('/api/login', async (req, res) => {
    const { email, clave } = req.body;
    try {
        const userResult = await pool.query('SELECT id, correo, clave, nombre, apellido, rol, foto FROM usuarios WHERE correo = $1', [email]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(clave, user.clave);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, correo: user.correo, rol: user.rol, nombre: user.nombre, apellido: user.apellido, foto: user.foto },
            process.env.JWT_SECRET || 'tu_secreto_jwt',
            { expiresIn: '1h' }
        );

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
        const hashedPassword = await bcrypt.hash(clave, 10);
        const newUser = await pool.query(
            'INSERT INTO usuarios (nombre, apellido, correo, clave, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, correo, nombre, apellido, rol, foto',
            [nombre, apellido, email, hashedPassword, 'estudiante']
        );
        res.status(201).json({ message: 'Usuario registrado con éxito', user: newUser.rows[0] });
    } catch (error) {
        console.error('Error en el registro:', error);
        if (error.code === '23505') {
            return res.status(400).json({ message: 'El correo electrónico ya está registrado.' });
        }
        res.status(500).json({ message: 'Error interno del servidor al registrar usuario' });
    }
});

// Ruta para obtener usuarios (solo para admin)
app.get('/api/users', async (req, res) => {
    try {
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
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
        res.status(500).json({ message: 'Error interno del servidor al obtener usuarios' });
    }
});

// Ruta para eliminar un usuario
app.delete('/users/:id', async (req, res) => {
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

// Ruta para actualizar foto de perfil (solo esqueleto)
app.post('/api/profile/photo', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No autorizado' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secreto_jwt');
        const userId = decoded.id;
        const { fotoUrl } = req.body;

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
  console.log(`Servidor de backend escuchando en el puerto ${PORT}`);
});