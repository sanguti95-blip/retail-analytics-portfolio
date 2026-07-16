/**
 * Country House Santo Domingo — Backend API
 * Servidor Express principal.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://docs.google.com", "https://cdn.jsdelivr.net"],
    },
  },
}));

// Necesario para que express-rate-limit funcione detrás del proxy de Render
app.set('trust proxy', 1);

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = [
  'https://cute-druid-14a9db.netlify.app',
  'https://chsd-backend.onrender.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000'
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(o => o.trim()));
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    // Allow any localhost origin or matches in allowedOrigins
    if (allowedOrigins.indexOf(origin) !== -1 || /^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    const msg = `El origen CORS ${origin} no está permitido.`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsers ───────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Request logger (desarrollo) ────────────────────────────
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ── Rutas ─────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/users', require('./routes/users'));

// ── Health check (Cron-Job) ──────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'Country House API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Frontend Estático ──────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Redirección SPA ────────────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ── Manejador global de errores ────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const { testConnection } = require('./config/db');

// ── Arrancar servidor ──────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🏠 Country House API corriendo en puerto ${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   CORS origin: ${process.env.CORS_ORIGIN || '*'}\n`);
  
  await testConnection();
});

module.exports = app;
