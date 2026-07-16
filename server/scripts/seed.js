/**
 * Script de inicialización de base de datos (seed)
 * 1. Crea tablas con índices
 * 2. Inserta usuarios por defecto
 * 3. Lee archivos .md de datos y los inserta en batch
 *
 * Uso: node scripts/seed.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, query, testConnection } = require('../config/db');
const { parseCodisaData, parseEstadoResultados } = require('../services/parser');
const { validateCodisa, validatePnL } = require('../services/validator');

// ── SQL de creación de tablas ──────────────────────────────
const CREATE_TABLES_SQL = `
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS estado_resultados CASCADE;
DROP TABLE IF EXISTS codisa_records CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS codisa_records (
  id SERIAL PRIMARY KEY,
  cia VARCHAR(10) DEFAULT '1',
  centro VARCHAR(50) DEFAULT '',
  bodega VARCHAR(100) DEFAULT '',
  codigo VARCHAR(50) DEFAULT 'N/A',
  articulo VARCHAR(255) DEFAULT '',
  unidad VARCHAR(20) DEFAULT 'UND',
  cantidad DECIMAL(12,2) DEFAULT 0,
  precio DECIMAL(12,2) DEFAULT 0,
  monto_bruto DECIMAL(14,2) DEFAULT 0,
  costo_unitario DECIMAL(12,2) DEFAULT 0,
  saldo_actual DECIMAL(12,2) DEFAULT 0,
  valor_stock DECIMAL(14,2) DEFAULT 0,
  costo_uni_merma DECIMAL(12,2) DEFAULT 0,
  costo_bruto_merma DECIMAL(14,2) DEFAULT 0,
  unidades_merma DECIMAL(12,2) DEFAULT 0,
  fecha_proceso DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estado_resultados (
  id SERIAL PRIMARY KEY,
  canal VARCHAR(50) DEFAULT 'Consolidado',
  sucursal VARCHAR(100) DEFAULT 'Santo Domingo',
  cuenta VARCHAR(255) NOT NULL,
  fecha VARCHAR(20) DEFAULT '',
  anio INTEGER DEFAULT 0,
  mes INTEGER DEFAULT 0,
  monto DECIMAL(14,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  records_codisa INTEGER DEFAULT 0,
  records_er INTEGER DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW(),
  synced_by VARCHAR(50) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_codisa_fecha ON codisa_records(fecha_proceso);
CREATE INDEX IF NOT EXISTS idx_codisa_bodega ON codisa_records(bodega);
CREATE INDEX IF NOT EXISTS idx_codisa_codigo ON codisa_records(codigo);
CREATE INDEX IF NOT EXISTS idx_er_anio_mes ON estado_resultados(anio, mes);
CREATE INDEX IF NOT EXISTS idx_er_cuenta ON estado_resultados(cuenta);
`;

// ── Usuarios por defecto ───────────────────────────────────
const DEFAULT_USERS = [
  { username: 'admin', password: 'admin', role: 'admin' },
  { username: 'gerencia', password: 'ch2026', role: 'viewer' },
];

// ── Funciones de inserción en batch ────────────────────────

async function batchInsertCodisa(client, records, batchSize = 500) {
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];

    batch.forEach((r, batchIdx) => {
      const offset = batchIdx * 16;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`
      );
      values.push(
        r.cia, r.centro, r.bodega, r.codigo, r.articulo,
        r.unidad, r.cantidad, r.precio, r.montoBruto, r.costoUnitario,
        r.saldoActual, r.valorStock, r.costoUniMerma, r.costoBrutoMerma,
        r.unidadesMerma, r.fechaProceso || null
      );
    });

    const sql = `
      INSERT INTO codisa_records
        (cia, centro, bodega, codigo, articulo, unidad, cantidad, precio,
         monto_bruto, costo_unitario, saldo_actual, valor_stock,
         costo_uni_merma, costo_bruto_merma, unidades_merma, fecha_proceso)
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(sql, values);
    totalInserted += batch.length;

    const progress = Math.round((Math.min(i + batchSize, records.length) / records.length) * 100);
    process.stdout.write(`\r   📦 Codisa: ${totalInserted}/${records.length} registros insertados (${progress}%)`);
  }

  console.log(); // Nueva línea después del progreso
  return totalInserted;
}

async function batchInsertER(client, records, batchSize = 500) {
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const values = [];
    const placeholders = [];

    batch.forEach((r, batchIdx) => {
      const offset = batchIdx * 7;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
      );
      values.push(
        r.canal, r.sucursal, r.cuenta, r.fecha,
        r.año, r.mes, r.monto
      );
    });

    const sql = `
      INSERT INTO estado_resultados (canal, sucursal, cuenta, fecha, anio, mes, monto)
      VALUES ${placeholders.join(', ')}
    `;

    await client.query(sql, values);
    totalInserted += batch.length;

    const progress = Math.round((Math.min(i + batchSize, records.length) / records.length) * 100);
    process.stdout.write(`\r   📦 Estado Resultados: ${totalInserted}/${records.length} registros insertados (${progress}%)`);
  }

  console.log(); // Nueva línea después del progreso
  return totalInserted;
}

// ── Función principal ──────────────────────────────────────

async function seed() {
  console.log('\n🌱 Iniciando seed de la base de datos...\n');

  // 1. Verificar conexión
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos. Verifique DATABASE_URL en .env');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // 2. Crear tablas
    console.log('📋 Creando tablas e índices...');
    await client.query(CREATE_TABLES_SQL);
    console.log('   ✅ Tablas creadas exitosamente.\n');

    // 3. Insertar usuarios
    console.log('👤 Insertando usuarios por defecto...');
    for (const user of DEFAULT_USERS) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(user.password, salt);
      await client.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO UPDATE SET password_hash = $2, role = $3',
        [user.username, hash, user.role]
      );
      console.log(`   ✅ Usuario "${user.username}" (${user.role}) creado.`);
    }
    console.log();

    // 4. Leer y parsear datos Codisa
    const codisaPath = path.resolve(__dirname, '..', '..', 'Data_Tableau_Codisa.md');
    let codisaCount = 0;

    if (fs.existsSync(codisaPath)) {
      console.log('📄 Leyendo Data_Tableau_Codisa.md...');
      const codisaRaw = fs.readFileSync(codisaPath, 'utf-8');
      console.log(`   Tamaño del archivo: ${(codisaRaw.length / 1024).toFixed(1)} KB`);

      const codisaParsed = parseCodisaData(codisaRaw);
      console.log(`   Registros parseados: ${codisaParsed.length}`);

      const { validRecords, invalidCount, warnings } = validateCodisa(codisaParsed);
      console.log(`   Registros válidos: ${validRecords.length}, Inválidos: ${invalidCount}`);

      if (warnings.length > 0) {
        console.log(`   ⚠️  ${warnings.length} advertencias (mostrando primeras 5):`);
        warnings.slice(0, 5).forEach(w => console.log(`      - ${w}`));
      }

      if (validRecords.length > 0) {
        console.log('   Insertando registros Codisa...');
        codisaCount = await batchInsertCodisa(client, validRecords);
        console.log(`   ✅ ${codisaCount} registros Codisa insertados.\n`);
      }
    } else {
      console.log(`⚠️  Archivo no encontrado: ${codisaPath}`);
      console.log('   Omitiendo carga de datos Codisa.\n');
    }

    // 5. Leer y parsear Estado de Resultados
    const erPath = path.resolve(__dirname, '..', '..', 'Estado_Resultados_Santo_Domingo_Tableau.md');
    let erCount = 0;

    if (fs.existsSync(erPath)) {
      console.log('📄 Leyendo Estado_Resultados_Santo_Domingo_Tableau.md...');
      const erRaw = fs.readFileSync(erPath, 'utf-8');
      console.log(`   Tamaño del archivo: ${(erRaw.length / 1024).toFixed(1)} KB`);

      const erParsed = parseEstadoResultados(erRaw);
      console.log(`   Registros parseados: ${erParsed.length}`);

      const { validRecords, invalidCount, warnings } = validatePnL(erParsed);
      console.log(`   Registros válidos: ${validRecords.length}, Inválidos: ${invalidCount}`);

      if (warnings.length > 0) {
        console.log(`   ⚠️  ${warnings.length} advertencias (mostrando primeras 5):`);
        warnings.slice(0, 5).forEach(w => console.log(`      - ${w}`));
      }

      if (validRecords.length > 0) {
        console.log('   Insertando registros de Estado de Resultados...');
        erCount = await batchInsertER(client, validRecords);
        console.log(`   ✅ ${erCount} registros de Estado de Resultados insertados.\n`);
      }
    } else {
      console.log(`⚠️  Archivo no encontrado: ${erPath}`);
      console.log('   Omitiendo carga de Estado de Resultados.\n');
    }

    // 6. Registrar en sync_log
    await client.query(
      'INSERT INTO sync_log (source, records_codisa, records_er, synced_by) VALUES ($1, $2, $3, $4)',
      ['seed', codisaCount, erCount, 'system']
    );

    // 7. Resumen final
    console.log('═'.repeat(50));
    console.log('🎉 Seed completado exitosamente!');
    console.log('═'.repeat(50));
    console.log(`   📦 Registros Codisa:     ${codisaCount.toLocaleString()}`);
    console.log(`   📊 Registros ER:         ${erCount.toLocaleString()}`);
    console.log(`   👤 Usuarios creados:     ${DEFAULT_USERS.length}`);
    console.log(`   📅 Fecha:                ${new Date().toISOString()}`);
    console.log('═'.repeat(50));
    console.log();

  } catch (err) {
    console.error('\n❌ Error durante el seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecutar
seed();
