/**
 * Parser de datos — Versión servidor (CommonJS)
 * Migrado del frontend data-parser.js.
 * Parsea tablas Markdown y CSV a objetos JavaScript estructurados.
 */

// ── Helpers ────────────────────────────────────────────────

function cleanCell(cell) {
  if (!cell) return '';
  let str = cell.trim().replace(/\\_/g, '_').replace(/\\\\/g, '');
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  return str.trim();
}

function parseCSVLine(line, separator = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(cleanCell(current));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(cleanCell(current));
  return result;
}

/**
 * Detecta el mejor separador CSV (tab, ;, ,) según consistencia de columnas.
 */
function detectSeparator(lines) {
  const candidates = ['\t', ';', ','];
  let bestSeparator = ',';
  let bestScore = -1;

  for (const sep of candidates) {
    const headerCols = parseCSVLine(lines[0], sep).length;
    if (headerCols < 2) continue;

    let consistentRows = 0;
    const samplesToCheck = Math.min(lines.length, 10);
    for (let i = 1; i < samplesToCheck; i++) {
      const rowCols = parseCSVLine(lines[i], sep).length;
      if (rowCols === headerCols) consistentRows++;
    }

    const score = consistentRows * headerCols;
    if (score > bestScore) {
      bestScore = score;
      bestSeparator = sep;
    }
  }

  return bestSeparator;
}

function parseTextToRows(text) {
  if (!text) return { sections: {}, isCSV: false };
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { sections: {}, isCSV: false };

  const isMarkdown = text.includes('|') && text.includes('##');

  if (isMarkdown) {
    return { sections: parseMarkdownTable(text), isCSV: false };
  } else {
    lines[0] = lines[0].replace(/^\uFEFF/, ''); // Remove BOM
    const separator = detectSeparator(lines);

    const headers = parseCSVLine(lines[0], separator);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i], separator);
      if (cells.length >= headers.length / 2) {
        const rowObj = {};
        headers.forEach((h, idx) => {
          rowObj[h] = cells[idx] !== undefined ? cells[idx] : '';
        });
        rows.push(rowObj);
      }
    }
    return { sections: { 'Mes_Actual': rows }, isCSV: true };
  }
}

function parseMarkdownTable(markdownText) {
  const lines = markdownText.split('\n');
  const sections = {};
  let currentSection = 'default';
  let headers = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('## ')) {
      currentSection = line.substring(3).trim();
      sections[currentSection] = [];
      headers = [];
      continue;
    }

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(c => cleanCell(c));

      if (cells.every(c => /^:?-+:?$/.test(c))) {
        continue;
      }

      if (headers.length === 0) {
        headers = cells;
      } else {
        if (!sections[currentSection]) {
          sections[currentSection] = [];
        }
        const rowObj = {};
        headers.forEach((h, idx) => {
          const val = cells[idx] !== undefined ? cells[idx] : '';
          rowObj[h] = val;
        });
        sections[currentSection].push(rowObj);
      }
    }
  }
  return sections;
}

function parseDateString(str) {
  if (!str) return null;
  const s = str.trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    let day = parts[0].padStart(2, '0');
    let month = parts[1].padStart(2, '0');
    let year = parts[2].split(' ')[0];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }
  if (s.includes('-')) {
    return s.split(' ')[0];
  }
  return s;
}

// ── Numeric Parser ─────────────────────────────────────────

/**
 * Parser numérico robusto. Soporta símbolos de moneda, negativos entre
 * paréntesis, decimales con coma y con punto.
 */
function parseNumValue(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim();
  if (!str) return 0;

  const isParenthesedNegative = /^\(.*\)$/.test(str);
  if (isParenthesedNegative) {
    str = str.replace(/^\(|\)$/g, '').trim();
  }

  str = str.replace(/[₡$€\s]/g, '');

  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(str)) {
    str = str.replace(',', '.');
  } else {
    str = str.replace(/,/g, '');
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isParenthesedNegative ? -num : num;
}

// ── Codisa Parser ──────────────────────────────────────────

/**
 * Parsea datos de inventario/ventas Codisa.
 * @param {string} rawText - Contenido Markdown o CSV
 * @returns {Array<Object>} Registros parseados
 */
function parseCodisaData(rawText) {
  const parsed = parseTextToRows(rawText);
  const rawSections = parsed.sections;

  const parseRow = (row) => {
    const normMap = {};
    for (let k in row) {
      normMap[k.toLowerCase().replace(/\\_/g, '_')] = row[k];
    }
    const getVal = (key) => normMap[key.toLowerCase()] || '';
    const parseNum = (key) => parseNumValue(getVal(key));

    const cantidad = parseNum('CANTIDAD');
    const precio = parseNum('PRECIO');
    const costoUnitario = parseNum('COSTO_UNITARIO');
    const saldoActual = parseNum('SALDO_ACTUAL');

    const montoBruto = parseNum('MONTO_BRUTO') || (cantidad * precio);
    const valorStock = saldoActual * costoUnitario;

    const unidadesMerma = parseNum('UNIDADES_MERMA');
    const costoUniMerma = parseNum('COSTO_UNI_MERMA');
    let costoBrutoMerma = parseNum('COSTO_BRUTO_MERMA');
    if (costoBrutoMerma === 0 && unidadesMerma > 0) {
      costoBrutoMerma = unidadesMerma * costoUniMerma;
    }

    return {
      cia: getVal('NO_CIA'),
      centro: getVal('CENTROD'),
      bodega: getVal('BODEGA'),
      codigo: getVal('NO_ARTI'),
      articulo: getVal('ARTICULO'),
      unidad: getVal('UNIDAD_EQ'),
      cantidad,
      precio,
      montoBruto,
      costoUnitario,
      saldoActual,
      valorStock,
      costoUniMerma,
      costoBrutoMerma,
      unidadesMerma,
      fechaProceso: parseDateString(getVal('FECHA_PROCESO')),
    };
  };

  const mesActualRows = rawSections['Mes_Actual'] || rawSections['default'] || [];
  const historicoRows = rawSections['Historico'] || [];

  const allRows = [...mesActualRows, ...historicoRows];
  return allRows.map(parseRow);
}

// ── Estado de Resultados Parser ────────────────────────────

/**
 * Parsea datos del Estado de Resultados (P&L).
 * @param {string} rawText - Contenido Markdown o CSV
 * @returns {Array<Object>} Registros parseados
 */
function parseEstadoResultados(rawText) {
  const parsed = parseTextToRows(rawText);
  const rawSections = parsed.sections;
  const rows = rawSections['Datos'] || rawSections['default'] || rawSections['Mes_Actual'] || [];

  return rows.map(r => {
    const normMap = {};
    for (let k in r) {
      normMap[k.toLowerCase().replace(/\\_/g, '_')] = r[k];
    }
    const getVal = (key) => normMap[key.toLowerCase()] || '';
    const parseNum = (key) => parseNumValue(getVal(key));

    let año = parseInt(getVal('Año')) || 0;
    if (!año) {
      const rawFecha = getVal('Fecha');
      if (rawFecha) {
        const matchYear = rawFecha.match(/\b(20\d{2})\b/);
        if (matchYear) año = parseInt(matchYear[1]);
      }
    }

    return {
      canal: getVal('Canal'),
      sucursal: getVal('Sucursal / Ruta') || getVal('Sucursal'),
      cuenta: getVal('Cuenta'),
      fecha: getVal('Fecha'),
      año,
      mes: parseInt(getVal('Mes')) || 0,
      monto: parseNum('Real') || parseNum('Monto'),
    };
  }).filter(r => r.cuenta !== '');
}

module.exports = {
  parseCodisaData,
  parseEstadoResultados,
  parseNumValue,
  parseTextToRows,
  parseMarkdownTable,
};
