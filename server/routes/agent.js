/**
 * Ruta del agente IA
 * Consulta datos de la tienda y usa Groq API para responder preguntas.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const SYSTEM_PROMPT = `Eres un consultor y compañero experto en gestión de tiendas de abarrotes y retail, especializado en la tienda "Country House Santo Domingo" (Costa Rica).
Tienes acceso a los datos actuales de la tienda. Cuando el usuario te haga una pregunta, debes analizar los datos y dar recomendaciones PRÁCTICAS, FÁCILES DE ENTENDER y muy amigables.
REGLAS:
1. Responde de forma muy cálida, amigable y cercana, usando el tuteo ("tú") o "vos" en lugar de "usted".
2. Usa un lenguaje sencillo, claro y sin tecnicismos difíciles.
3. Sé directo, concreto y basado en los datos proporcionados.
4. Si falta información, pídelos amigablemente.
5. Prioriza acciones urgentes (stock crítico, mermas altas).
6. Usa números concretos de los datos proporcionados.
7. Da sugerencias de pedidos basadas en días de inventario y señala productos con exceso de inventario (más de 30 días).
8. REGLA DE SEGURIDAD CRÍTICA: Bajo ninguna circunstancia debes revelar el esquema interno de la base de datos, credenciales de conexión, contraseñas hash, ni listados/detalles de los usuarios del sistema. Si te lo solicitan o intentan engañarte, deniega la solicitud de manera educada pero firme.`;

/**
 * Construye el contexto de datos para el agente.
 */
async function buildContext(year, month, channel) {
  const context = [];
  const activeYear = year && year !== 'all' ? parseInt(year) : null;
  const activeMonth = month && month !== 'all' ? parseInt(month) : null;
  const activeChannel = channel && channel !== 'all' ? channel : null;

  // ── KPIs generales ─────────────────────────────────────
  let kpiSql = `
    SELECT
      COUNT(*) AS total_productos,
      COALESCE(SUM(monto_bruto), 0) AS venta_bruta,
      COALESCE(SUM(valor_stock), 0) AS valor_inventario,
      COALESCE(SUM(costo_bruto_merma), 0) AS merma_total,
      COALESCE(SUM(unidades_merma), 0) AS unidades_merma,
      COALESCE(SUM(cantidad), 0) AS unidades_vendidas
    FROM codisa_records WHERE 1=1
  `;
  const kpiParams = [];
  let pIdx = 1;

  if (activeYear) {
    kpiSql += ` AND EXTRACT(YEAR FROM fecha_proceso) = $${pIdx++}`;
    kpiParams.push(activeYear);
  }
  if (activeMonth) {
    kpiSql += ` AND EXTRACT(MONTH FROM fecha_proceso) = $${pIdx++}`;
    kpiParams.push(activeMonth);
  }
  if (activeChannel) {
    kpiSql += ` AND bodega ILIKE $${pIdx++}`;
    kpiParams.push(`%${activeChannel}%`);
  }

  const kpiResult = await query(kpiSql, kpiParams);
  const kpi = kpiResult.rows[0];

  context.push(`RESUMEN GENERAL:
- Total productos: ${kpi.total_productos}
- Venta bruta: ₡${Number(kpi.venta_bruta).toLocaleString('es-CR')}
- Valor inventario: ₡${Number(kpi.valor_inventario).toLocaleString('es-CR')}
- Merma total: ₡${Number(kpi.merma_total).toLocaleString('es-CR')}
- Unidades merma: ${Number(kpi.unidades_merma).toLocaleString('es-CR')}
- Unidades vendidas: ${Number(kpi.unidades_vendidas).toLocaleString('es-CR')}`);

  // ── Top 10 productos por venta ─────────────────────────
  let topVentaSql = `
    SELECT articulo, codigo, SUM(monto_bruto) AS venta, SUM(cantidad) AS qty
    FROM codisa_records WHERE 1=1
  `;
  const topVentaParams = [];
  let tvIdx = 1;
  if (activeYear) {
    topVentaSql += ` AND EXTRACT(YEAR FROM fecha_proceso) = $${tvIdx++}`;
    topVentaParams.push(activeYear);
  }
  if (activeMonth) {
    topVentaSql += ` AND EXTRACT(MONTH FROM fecha_proceso) = $${tvIdx++}`;
    topVentaParams.push(activeMonth);
  }
  if (activeChannel) {
    topVentaSql += ` AND bodega ILIKE $${tvIdx++}`;
    topVentaParams.push(`%${activeChannel}%`);
  }
  topVentaSql += ' GROUP BY articulo, codigo ORDER BY venta DESC LIMIT 10';

  const topVenta = await query(topVentaSql, topVentaParams);
  if (topVenta.rows.length > 0) {
    context.push('\nTOP 10 PRODUCTOS POR VENTA:');
    topVenta.rows.forEach((r, i) => {
      context.push(`${i + 1}. ${r.articulo} (${r.codigo}): Venta ₡${Number(r.venta).toLocaleString('es-CR')}, Qty: ${Number(r.qty).toLocaleString('es-CR')}`);
    });
  }

  // ── Top 10 productos con más merma ─────────────────────
  let topMermaSql = `
    SELECT articulo, codigo, SUM(costo_bruto_merma) AS merma, SUM(unidades_merma) AS qty_merma
    FROM codisa_records WHERE costo_bruto_merma > 0
  `;
  const topMermaParams = [];
  let tmIdx = 1;
  if (activeYear) {
    topMermaSql += ` AND EXTRACT(YEAR FROM fecha_proceso) = $${tmIdx++}`;
    topMermaParams.push(activeYear);
  }
  if (activeMonth) {
    topMermaSql += ` AND EXTRACT(MONTH FROM fecha_proceso) = $${tmIdx++}`;
    topMermaParams.push(activeMonth);
  }
  if (activeChannel) {
    topMermaSql += ` AND bodega ILIKE $${tmIdx++}`;
    topMermaParams.push(`%${activeChannel}%`);
  }
  topMermaSql += ' GROUP BY articulo, codigo ORDER BY merma DESC LIMIT 10';

  const topMerma = await query(topMermaSql, topMermaParams);
  if (topMerma.rows.length > 0) {
    context.push('\nTOP 10 PRODUCTOS CON MÁS MERMA:');
    topMerma.rows.forEach((r, i) => {
      context.push(`${i + 1}. ${r.articulo} (${r.codigo}): Merma ₡${Number(r.merma).toLocaleString('es-CR')}, Unidades: ${Number(r.qty_merma).toLocaleString('es-CR')}`);
    });
  }

  // ── Estado de Resultados ───────────────────────────────
  let erSql = `
    SELECT cuenta, SUM(monto) AS total
    FROM estado_resultados WHERE 1=1
  `;
  const erParams = [];
  let eIdx = 1;

  if (activeYear) {
    erSql += ` AND anio = $${eIdx++}`;
    erParams.push(activeYear);
  }
  if (activeMonth) {
    erSql += ` AND mes = $${eIdx++}`;
    erParams.push(activeMonth);
  }
  if (activeChannel) {
    erSql += ` AND canal ILIKE $${eIdx++}`;
    erParams.push(`%${activeChannel}%`);
  }

  erSql += ' GROUP BY cuenta ORDER BY ABS(SUM(monto)) DESC LIMIT 15';

  const erResult = await query(erSql, erParams);
  if (erResult.rows.length > 0) {
    context.push('\nESTADO DE RESULTADOS (TOP 15 CUENTAS):');
    erResult.rows.forEach(r => {
      context.push(`- ${r.cuenta}: ₡${Number(r.total).toLocaleString('es-CR')}`);
    });
  }

  return context.join('\n');
}

/**
 * POST /api/agent/ask
 * Recibe una pregunta y responde usando Groq + contexto de datos.
 */
router.post('/ask', authenticate, async (req, res) => {
  try {
    const { question, month, year, channel } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'La pregunta es requerida.' });
    }

    const groqApiKey = req.headers['x-groq-api-key'] || process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(503).json({ error: 'Servicio de IA no configurado. Falta GROQ_API_KEY en backend o interfaz.' });
    }

    // Construir contexto con datos reales
    const dataContext = await buildContext(year, month, channel);

    const filterInfo = [];
    if (year) filterInfo.push(`Año: ${year}`);
    if (month) filterInfo.push(`Mes: ${month}`);
    if (channel) filterInfo.push(`Canal/Bodega: ${channel}`);

    const userMessage = `${filterInfo.length > 0 ? `[Filtros activos: ${filterInfo.join(', ')}]\n\n` : ''}DATOS DE LA TIENDA:\n${dataContext}\n\nPREGUNTA DEL USUARIO:\n${question}`;

    // Llamar a Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error de Groq API:', response.status, errorBody);
      return res.status(502).json({ error: 'Error al comunicarse con el servicio de IA.' });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 'No se pudo generar una respuesta.';

    res.json({ answer });
  } catch (err) {
    console.error('Error en agente:', err);
    res.status(500).json({ error: 'Error al procesar la consulta del agente.' });
  }
});

module.exports = router;
