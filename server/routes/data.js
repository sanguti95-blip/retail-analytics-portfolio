/**
 * Rutas de datos
 * Consultas a codisa_records y estado_resultados con filtros.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

/**
 * Convierte un objeto con columnas snake_case a camelCase.
 */
const numericFields = [
  'cantidad', 'precio', 'montoBruto', 'costoUnitario', 'saldoActual', 
  'valorStock', 'costoUniMerma', 'costoBrutoMerma', 'unidadesMerma', 'monto'
];

function snakeToCamel(row) {
  const result = {};
  for (const key in row) {
    let camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (camelKey === 'anio') camelKey = 'año';
    
    let val = row[key];
    if (numericFields.includes(camelKey) && val !== null) {
      val = Number(val);
    }
    result[camelKey] = val;
  }
  return result;
}

/**
 * GET /api/data/codisa
 * Retorna registros Codisa filtrados por año, mes y canal/bodega.
 */
router.get('/codisa', authenticate, async (req, res) => {
  try {
    const { year, month, channel } = req.query;

    let sql = 'SELECT * FROM codisa_records WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (year) {
      sql += ` AND EXTRACT(YEAR FROM fecha_proceso) = $${paramIdx++}`;
      params.push(parseInt(year));
    }
    if (month) {
      sql += ` AND EXTRACT(MONTH FROM fecha_proceso) = $${paramIdx++}`;
      params.push(parseInt(month));
    }
    if (channel) {
      sql += ` AND bodega ILIKE $${paramIdx++}`;
      params.push(`%${channel}%`);
    }

    sql += ' ORDER BY fecha_proceso DESC, articulo ASC';

    const result = await query(sql, params);
    const records = result.rows.map(snakeToCamel);

    res.json({ count: records.length, records });
  } catch (err) {
    console.error('Error al consultar codisa:', err);
    res.status(500).json({ error: 'Error al obtener datos de inventario.' });
  }
});

/**
 * GET /api/data/estado-resultados
 * Retorna registros del Estado de Resultados filtrados.
 */
router.get('/estado-resultados', authenticate, async (req, res) => {
  try {
    const { year, month, channel } = req.query;

    let sql = 'SELECT * FROM estado_resultados WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (year) {
      sql += ` AND anio = $${paramIdx++}`;
      params.push(parseInt(year));
    }
    if (month) {
      sql += ` AND mes = $${paramIdx++}`;
      params.push(parseInt(month));
    }
    if (channel) {
      sql += ` AND canal ILIKE $${paramIdx++}`;
      params.push(`%${channel}%`);
    }

    sql += ' ORDER BY anio DESC, mes DESC, cuenta ASC';

    const result = await query(sql, params);
    const records = result.rows.map(snakeToCamel);

    res.json({ count: records.length, records });
  } catch (err) {
    console.error('Error al consultar estado de resultados:', err);
    res.status(500).json({ error: 'Error al obtener datos financieros.' });
  }
});

/**
 * GET /api/data/kpis
 * Retorna KPIs calculados a partir de los datos.
 */
router.get('/kpis', authenticate, async (req, res) => {
  try {
    const { year, month, channel } = req.query;

    // ── KPIs de Codisa ───────────────────────────────────
    let codisaSql = `
      SELECT
        COUNT(*) AS total_productos,
        COALESCE(SUM(monto_bruto), 0) AS venta_bruta,
        COALESCE(SUM(valor_stock), 0) AS valor_inventario,
        COALESCE(SUM(costo_bruto_merma), 0) AS merma_total,
        COALESCE(SUM(unidades_merma), 0) AS unidades_merma_total,
        COALESCE(SUM(cantidad), 0) AS unidades_vendidas,
        COALESCE(AVG(CASE WHEN cantidad > 0 THEN precio ELSE NULL END), 0) AS precio_promedio,
        COALESCE(AVG(CASE WHEN saldo_actual > 0 THEN saldo_actual ELSE NULL END), 0) AS saldo_promedio
      FROM codisa_records WHERE 1=1
    `;
    const codisaParams = [];
    let pIdx = 1;

    if (year) {
      codisaSql += ` AND EXTRACT(YEAR FROM fecha_proceso) = $${pIdx++}`;
      codisaParams.push(parseInt(year));
    }
    if (month) {
      codisaSql += ` AND EXTRACT(MONTH FROM fecha_proceso) = $${pIdx++}`;
      codisaParams.push(parseInt(month));
    }
    if (channel) {
      codisaSql += ` AND bodega ILIKE $${pIdx++}`;
      codisaParams.push(`%${channel}%`);
    }

    const codisaResult = await query(codisaSql, codisaParams);
    const codisaKpis = codisaResult.rows[0];

    // ── KPIs de Estado de Resultados ─────────────────────
    let erSql = `
      SELECT
        COALESCE(SUM(CASE WHEN cuenta ILIKE '%venta%' OR cuenta ILIKE '%ingreso%' THEN monto ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN cuenta ILIKE '%costo de venta%' OR cuenta ILIKE '%costo venta%' THEN monto ELSE 0 END), 0) AS costo_ventas,
        COALESCE(SUM(CASE WHEN cuenta ILIKE '%gasto%' THEN monto ELSE 0 END), 0) AS gastos,
        COALESCE(SUM(monto), 0) AS resultado_neto,
        COUNT(DISTINCT cuenta) AS total_cuentas
      FROM estado_resultados WHERE 1=1
    `;
    const erParams = [];
    let eIdx = 1;

    if (year) {
      erSql += ` AND anio = $${eIdx++}`;
      erParams.push(parseInt(year));
    }
    if (month) {
      erSql += ` AND mes = $${eIdx++}`;
      erParams.push(parseInt(month));
    }
    if (channel) {
      erSql += ` AND canal ILIKE $${eIdx++}`;
      erParams.push(`%${channel}%`);
    }

    const erResult = await query(erSql, erParams);
    const erKpis = erResult.rows[0];

    // ── Margen bruto ─────────────────────────────────────
    const ingresos = parseFloat(erKpis.ingresos) || 0;
    const costoVentas = parseFloat(erKpis.costo_ventas) || 0;
    const margenBruto = ingresos > 0
      ? ((ingresos - Math.abs(costoVentas)) / ingresos * 100).toFixed(2)
      : 0;

    // ── Ratio de merma ───────────────────────────────────
    const ventaBruta = parseFloat(codisaKpis.venta_bruta) || 0;
    const mermaTotal = parseFloat(codisaKpis.merma_total) || 0;
    const ratioMerma = ventaBruta > 0
      ? (mermaTotal / ventaBruta * 100).toFixed(2)
      : 0;

    res.json({
      inventario: {
        totalProductos: parseInt(codisaKpis.total_productos) || 0,
        ventaBruta: parseFloat(codisaKpis.venta_bruta) || 0,
        valorInventario: parseFloat(codisaKpis.valor_inventario) || 0,
        mermaTotal: parseFloat(codisaKpis.merma_total) || 0,
        unidadesMermaTotal: parseFloat(codisaKpis.unidades_merma_total) || 0,
        unidadesVendidas: parseFloat(codisaKpis.unidades_vendidas) || 0,
        precioPromedio: parseFloat(codisaKpis.precio_promedio) || 0,
        saldoPromedio: parseFloat(codisaKpis.saldo_promedio) || 0,
        ratioMerma: parseFloat(ratioMerma),
      },
      financiero: {
        ingresos: parseFloat(erKpis.ingresos) || 0,
        costoVentas: parseFloat(erKpis.costo_ventas) || 0,
        gastos: parseFloat(erKpis.gastos) || 0,
        resultadoNeto: parseFloat(erKpis.resultado_neto) || 0,
        totalCuentas: parseInt(erKpis.total_cuentas) || 0,
        margenBruto: parseFloat(margenBruto),
      },
    });
  } catch (err) {
    console.error('Error al calcular KPIs:', err);
    res.status(500).json({ error: 'Error al calcular indicadores.' });
  }
});

module.exports = router;
