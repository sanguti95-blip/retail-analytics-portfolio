/**
 * Ruta de carga de archivos
 * Acepta .md, .csv, .txt — Parsea, valida, e inserta en la base de datos.
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseCodisaData, parseEstadoResultados } = require('../services/parser');
const { validateCodisa, validatePnL } = require('../services/validator');

// Multer con almacenamiento en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.md', '.csv', '.txt'];
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Extensión no permitida: ${ext}. Use .md, .csv o .txt`));
    }
  },
});

/**
 * Inserta registros Codisa en batch.
 */
async function batchInsertCodisa(client, records, batchSize = 500) {
  let inserted = 0;

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
        r.unidadesMerma, r.fechaProceso
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
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Inserta registros de Estado de Resultados en batch.
 */
async function batchInsertER(client, records, batchSize = 500) {
  let inserted = 0;

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
    inserted += batch.length;
  }

  return inserted;
}

/**
 * POST /api/upload
 * Sube y procesa un archivo de datos.
 */
router.post('/', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó ningún archivo.' });
  }

  const client = await pool.connect();

  try {
    const rawText = req.file.buffer.toString('utf-8');
    const fileName = req.file.originalname.toLowerCase();

    let codisaCount = 0;
    let erCount = 0;
    const allWarnings = [];

    await client.query('BEGIN');

    // Detectar tipo de datos por nombre de archivo
    const isCodisa = fileName.includes('codisa') || fileName.includes('inventario') || fileName.includes('tableau_codisa');
    const isER = fileName.includes('estado') || fileName.includes('resultados') || fileName.includes('pnl');

    if (isCodisa) {
      const parsed = parseCodisaData(rawText);
      const { validRecords, invalidCount, warnings } = validateCodisa(parsed);
      allWarnings.push(...warnings);

      if (validRecords.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'No se encontraron registros Codisa válidos.',
          invalidCount,
          warnings,
        });
      }

      // Eliminar registros antiguos e insertar nuevos
      await client.query('DELETE FROM codisa_records');
      codisaCount = await batchInsertCodisa(client, validRecords);
    } else if (isER) {
      const parsed = parseEstadoResultados(rawText);
      const { validRecords, invalidCount, warnings } = validatePnL(parsed);
      allWarnings.push(...warnings);

      if (validRecords.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'No se encontraron registros de Estado de Resultados válidos.',
          invalidCount,
          warnings,
        });
      }

      await client.query('DELETE FROM estado_resultados');
      erCount = await batchInsertER(client, validRecords);
    } else {
      // Intentar ambos parsers
      const codisaParsed = parseCodisaData(rawText);
      const erParsed = parseEstadoResultados(rawText);

      if (codisaParsed.length > erParsed.length) {
        const { validRecords, invalidCount, warnings } = validateCodisa(codisaParsed);
        allWarnings.push(...warnings);
        if (validRecords.length > 0) {
          await client.query('DELETE FROM codisa_records');
          codisaCount = await batchInsertCodisa(client, validRecords);
        }
      } else if (erParsed.length > 0) {
        const { validRecords, invalidCount, warnings } = validatePnL(erParsed);
        allWarnings.push(...warnings);
        if (validRecords.length > 0) {
          await client.query('DELETE FROM estado_resultados');
          erCount = await batchInsertER(client, validRecords);
        }
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'No se pudieron identificar datos válidos en el archivo.',
        });
      }
    }

    // Registrar en sync_log
    await client.query(
      'INSERT INTO sync_log (source, records_codisa, records_er, synced_by) VALUES ($1, $2, $3, $4)',
      ['upload:' + req.file.originalname, codisaCount, erCount, req.user.username]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Archivo procesado exitosamente.',
      codisaRecords: codisaCount,
      erRecords: erCount,
      warnings: allWarnings.slice(0, 20), // Limitar warnings en respuesta
      totalWarnings: allWarnings.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al procesar archivo:', err);
    res.status(500).json({ error: 'Error al procesar el archivo: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
