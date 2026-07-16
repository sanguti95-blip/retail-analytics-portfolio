/**
 * Rutas de autenticación
 * Login, perfil del usuario actual.
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const JWT_EXPIRATION = '24h';

// ── Rate Limiter (Protección fuerza bruta) solo para login ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                  // Máximo 10 intentos por ventana de 15 minutos
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Por favor, inténtelo de nuevo en 15 minutos.' },
});

/**
 * POST /api/auth/login
 * Inicia sesión con usuario y contraseña.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    const result = await query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * GET /api/auth/me
 * Retorna el usuario autenticado actual.
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error en /me:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * GET /api/auth/users
 * Lista todos los usuarios. Solo admin.
 */
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/users
 * Crea un nuevo usuario. Solo admin.
 */
router.post('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'El rol debe ser "admin" o "viewer".' });
    }

    // Verificar unicidad del username
    const existing = await query('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `El usuario "${username}" ya existe.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username.trim().toLowerCase(), passwordHash, role || 'viewer']
    );

    res.status(201).json({ user: result.rows[0], message: 'Usuario creado exitosamente.' });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * PUT /api/auth/users/:id
 * Actualiza contraseña y/o rol de un usuario. Solo admin.
 */
router.put('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { password, role } = req.body;

    if (!password && !role) {
      return res.status(400).json({ error: 'Debe enviar al menos contraseña o rol para actualizar.' });
    }

    // No puede cambiar su propio rol
    if (role && userId === req.user.id) {
      return res.status(403).json({ error: 'No puede cambiar su propio rol.' });
    }
    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'El rol debe ser "admin" o "viewer".' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      }
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(await bcrypt.hash(password, 10));
    }
    if (role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, role, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ user: result.rows[0], message: 'Usuario actualizado exitosamente.' });
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * DELETE /api/auth/users/:id
 * Elimina un usuario. Solo admin. No puede eliminarse a sí mismo.
 */
router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (userId === req.user.id) {
      return res.status(403).json({ error: 'No puede eliminarse a sí mismo.' });
    }

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ message: `Usuario "${result.rows[0].username}" eliminado exitosamente.` });
  } catch (err) {
    console.error('Error eliminando usuario:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

module.exports = router;
