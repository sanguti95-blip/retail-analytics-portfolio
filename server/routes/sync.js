/**
 * Ruta de sincronización con Google Sheets
 * Descarga CSV desde una URL pública, parsea e inserta en la BD.
 */
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { parseCodisaData, parseEstadoResultados } = require('../services/parser');
const { validateCodisa, validatePnL } = require('../services/validator');

/**
 * POST /api/sync/sheets
 * Sincroniza datos desde Google Sheets (exportado como CSV).
 */
router.post('/sheets', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const url = req.body.url || process.env.GOOGLE_SHEETS_URL;

    if (!url) {
      return res.status(400).json({ error: 'URL de Google Sheets no proporcionada.' });
    }
    
    // SSRF Protection: Ensure the URL strictly matches Google Sheets domain
    const allowedPattern = /^https:\/\/docs\.google\.com\/spreadsheets\/.*/;
    if (!allowedPattern.test(url)) {
      return res.status(400).json({ error: 'URL inválida. Solo se permiten enlaces de Google Sheets.' });
    }

    // Helper to build typed URLs for Google Sheets
    function buildTypedSheetUrl(baseUrl, type) {
      try {
        const u = new URL(baseUrl);
        u.searchParams.set('type', type);
        return u.toString();
      } catch (e) {
        const sep = baseUrl.indexOf('?') !== -1 ? '&' : '?';
        return baseUrl + sep + 'type=' + encodeURIComponent(type);
      }
    }

    // 1. Descargar y parsear Codisa
    const codisaResponse = await fetch(url);
    if (!codisaResponse.ok) {
      throw new Error(`Error al descargar datos de inventario: HTTP ${codisaResponse.status}`);
    }
    const codisaText = await codisaResponse.text();
    const codisaParsed = parseCodisaData(codisaText);

    // 2. Descargar y parsear Estado de Resultados
    let erParsed = [];
    try {
      const erUrl = buildTypedSheetUrl(url, 'er');
      const erResponse = await fetch(erUrl);
      if (erResponse.ok) {
        const erText = await erResponse.text();
        erParsed = parseEstadoResultados(erText);
      } else {
        console.warn(`Advertencia: HTTP ${erResponse.status} al descargar P&L de Sheets.`);
      }
    } catch (erErr) {
      console.warn('Advertencia: No se pudo descargar P&L de Sheets:', erErr.message);
    }

    let codisaCount = 0;
    let erCount = 0;
    const allWarnings = [];

    await client.query('BEGIN');

    // Procesar e insertar Codisa
    if (codisaParsed.length > 0) {
      const { validRecords, warnings } = validateCodisa(codisaParsed);
      allWarnings.push(...warnings);

      if (validRecords.length > 0) {
        await client.query('DELETE FROM codisa_records');

        // Batch insert (16 columns)
        for (let i = 0; i < validRecords.length; i += 500) {
          const batch = validRecords.slice(i, i + 500);
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

          await client.query(
            `INSERT INTO codisa_records (cia, centro, bodega, codigo, articulo, unidad, cantidad, precio, monto_bruto, costo_unitario, saldo_actual, valor_stock, costo_uni_merma, costo_bruto_merma, unidades_merma, fecha_proceso) VALUES ${placeholders.join(', ')}`,
            values
          );
          codisaCount += batch.length;
        }
      }
    }

    // Procesar e insertar Estado de Resultados
    if (erParsed.length > 0) {
      const { validRecords, warnings } = validatePnL(erParsed);
      allWarnings.push(...warnings);

      if (validRecords.length > 0) {
        await client.query('DELETE FROM estado_resultados');

        for (let i = 0; i < validRecords.length; i += 500) {
          const batch = validRecords.slice(i, i + 500);
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

          await client.query(
            `INSERT INTO estado_resultados (canal, sucursal, cuenta, fecha, anio, mes, monto) VALUES ${placeholders.join(', ')}`,
            values
          );
          erCount += batch.length;
        }
      }
    }

    // Registrar en sync_log
    await client.query(
      'INSERT INTO sync_log (source, records_codisa, records_er, synced_by) VALUES ($1, $2, $3, $4)',
      ['sheets', codisaCount, erCount, req.user.username]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Sincronización completada.',
      codisaRecords: codisaCount,
      erRecords: erCount,
      warnings: allWarnings.slice(0, 20),
      totalWarnings: allWarnings.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en sincronización:', err);
    res.status(500).json({ error: 'Error al sincronizar: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
