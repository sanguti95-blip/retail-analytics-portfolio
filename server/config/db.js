/**
 * Configuración de conexión a PostgreSQL (Supabase)
 * Usa DATABASE_URL desde variables de entorno.
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Helper para ejecutar queries parametrizados.
 * @param {string} text - SQL query
 * @param {Array} params - Parámetros
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 2000) {
    console.warn(`⚠️  Query lenta (${duration}ms): ${text.substring(0, 80)}...`);
  }
  return result;
}

/**
 * Verifica la conexión a la base de datos.
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW() AS now');
    console.log('✅ Conexión a la base de datos exitosa:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ Error de conexión a la base de datos:', err.message);
    return false;
  }
}

module.exports = { pool, query, testConnection };
