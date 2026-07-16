/**
 * Rutas de gestión de usuarios (solo admin)
 * GET    /api/users         — Listar usuarios
 * POST   /api/users         — Crear usuario
 * PUT    /api/users/:id     — Cambiar contraseña o rol
 * DELETE /api/users/:id     — Eliminar usuario
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Todos los endpoints requieren autenticación + ser admin
router.use(authenticate, requireAdmin);

// ── GET /api/users ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, created_at FROM users ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// ── POST /api/users ────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Usuario, contraseña y rol son requeridos.' });
    }
    if (!['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido. Usa "admin" o "viewer".' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username.toLowerCase().trim(), hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
    }
    console.error('Error creando usuario:', err);
    res.status(500).json({ error: 'Error al crear el usuario.' });
  }
});

// ── PUT /api/users/:id ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role } = req.body;

    if (!password && !role) {
      return res.status(400).json({ error: 'Debes enviar al menos una contraseña o rol a actualizar.' });
    }

    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      const hash = await bcrypt.hash(password, 10);
      if (role) {
        await query('UPDATE users SET password_hash = $1, role = $2 WHERE id = $3', [hash, role, id]);
      } else {
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
      }
    } else {
      await query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    }

    const updated = await query('SELECT id, username, role, created_at FROM users WHERE id = $1', [id]);
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error actualizando usuario:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// ── DELETE /api/users/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Protección: no borrar al usuario actual
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }

    const target = await query('SELECT username FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    if (target.rows[0].username === 'admin') {
      return res.status(400).json({ error: 'No se puede eliminar el usuario "admin" principal.' });
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: `Usuario eliminado correctamente.` });
  } catch (err) {
    console.error('Error eliminando usuario:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

module.exports = router;
