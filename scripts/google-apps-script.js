/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT FOR COUNTRY HOUSE SANTO DOMINGO - LIVE DATA EXPORTER (v3.4)
 * ==============================================================================
 *
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Abre tu Hoja de Cálculo en Google Sheets (donde tienes la data de Codisa/P&L).
 * 2. Crea una pestaña llamada "Estado_Resultados" con las columnas:
 *    Canal | Sucursal / Ruta | Cuenta | Fecha | Año | Mes | Real
 * 3. En el menú superior, ve a: Extensiones -> Apps Script.
 * 4. Borra el código por defecto y pega TODO el contenido de este archivo.
 * 5. Guarda con (Ctrl + S).
 * 6. Haz clic en "Desplegar" -> "Gestionar despliegues" -> lápiz de editar
 *    (o "Nuevo despliegue" si es la primera vez).
 * 7. Selecciona tipo: "Aplicación Web".
 * 8. En "Quién tiene acceso": Selecciona "Cualquier persona" (Anyone).
 * 9. Haz clic en "Desplegar" y copia la URL generada.
 * 10. En tu panel BI:
 *     - Botón "Google Sheets" (Codisa): pega la URL tal cual.
 *     - Botón "Google Sheets" (Estado de Resultados): pega la URL + "?type=er"
 *
 * Este script sirve dos conjuntos de datos desde el mismo despliegue:
 * - Sin parámetro (o ?type=codisa): combina HISTORICO + MES_ACTUAL (inventario/merma).
 * - Con ?type=er: sirve la pestaña ESTADO_RESULTADOS tal cual (Canal, Cuenta, Real, etc.).
 *
 * En ambos casos, las hojas se combinan/leen alineando columnas por NOMBRE
 * (no por posición), y las celdas de fecha se formatean como dd/MM/yyyy.
 */

var CODISA_SHEET_NAMES = ['Historico', 'Mes_Actual'];
var ER_SHEET_NAMES = ['Estado_Resultados'];

function doGet(e) {
  var type = (e && e.parameter && e.parameter.type) ? String(e.parameter.type).toLowerCase() : 'codisa';
  var sheetNames = (type === 'er' || type === 'estado_resultados') ? ER_SHEET_NAMES : CODISA_SHEET_NAMES;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var csvContent = buildCombinedCsv(ss, sheetNames);

  return ContentService.createTextOutput(csvContent)
    .setMimeType(csvContent ? ContentService.MimeType.CSV : ContentService.MimeType.TEXT);
}

/**
 * Combina una o más hojas (por nombre) en un solo CSV, alineando columnas por
 * nombre de encabezado y formateando fechas reales como texto dd/MM/yyyy.
 */
function buildCombinedCsv(ss, sheetNames) {
  var canonicalHeader = null;
  var combinedRows = [];

  for (var s = 0; s < sheetNames.length; s++) {
    var sheet = ss.getSheetByName(sheetNames[s]);
    if (!sheet) continue; // si el nombre no existe, se ignora silenciosamente

    var data = sheet.getDataRange().getValues();
    if (!data || data.length === 0) continue;

    var sheetHeader = data[0];
    var sheetDataRows = data.slice(1);

    if (canonicalHeader === null) {
      canonicalHeader = sheetHeader;
      combinedRows = combinedRows.concat(sheetDataRows);
    } else {
      // Mapear cada columna del encabezado propio de esta hoja hacia la
      // posición correspondiente en el encabezado canónico (por nombre).
      var colIndexInThisSheet = {};
      for (var c = 0; c < sheetHeader.length; c++) {
        var key = String(sheetHeader[c]).trim();
        colIndexInThisSheet[key] = c;
      }

      for (var r = 0; r < sheetDataRows.length; r++) {
        var srcRow = sheetDataRows[r];
        var reorderedRow = new Array(canonicalHeader.length);
        for (var h = 0; h < canonicalHeader.length; h++) {
          var colName = String(canonicalHeader[h]).trim();
          var srcIdx = colIndexInThisSheet[colName];
          reorderedRow[h] = (srcIdx !== undefined) ? srcRow[srcIdx] : '';
        }
        combinedRows.push(reorderedRow);
      }
    }
  }

  if (canonicalHeader === null || combinedRows.length === 0) {
    return '';
  }

  var tz = ss.getSpreadsheetTimeZone();
  var allRows = [canonicalHeader].concat(combinedRows);

  // Construir el CSV con arrays + join (mucho más rápido que += en un loop,
  // que es O(n^2) y se vuelve lento con hojas de cientos/miles de filas).
  var csvLines = new Array(allRows.length);
  for (var i = 0; i < allRows.length; i++) {
    var row = allRows[i];
    var escapedRow = new Array(row.length);
    for (var j = 0; j < row.length; j++) {
      var cell = row[j];
      var cellStr;
      if (cell === null || cell === undefined) {
        cellStr = '';
      } else if (Object.prototype.toString.call(cell) === '[object Date]') {
        // Las celdas con formato de fecha llegan como objetos Date de JS.
        // Se formatean como dd/MM/yyyy (mismo formato que usa Mes_Actual como
        // texto), para que app.js las interprete igual sin importar la hoja.
        cellStr = Utilities.formatDate(cell, tz, 'dd/MM/yyyy');
      } else {
        cellStr = cell.toString().replace(/"/g, '""');
      }
      if (cellStr.indexOf(',') !== -1 || cellStr.indexOf('\n') !== -1 || cellStr.indexOf('"') !== -1) {
        cellStr = '"' + cellStr + '"';
      }
      escapedRow[j] = cellStr;
    }
    csvLines[i] = escapedRow.join(',');
  }
  return csvLines.join('\n') + '\n';
}

/**
 * Función opcional para ejecutar una actualización periódica (Timer Trigger)
 */
function createAutoSyncTrigger() {
  ScriptApp.newTrigger('doGet')
    .timeBased()
    .everyHours(1)
    .create();
}
