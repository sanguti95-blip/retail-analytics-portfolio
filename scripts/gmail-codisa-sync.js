/**
 * ==============================================================================
 * AUTOMATIZACIÓN AVANZADA: GMAIL -> GOOGLE SHEETS -> PANEL BI (v3.4)
 * Soporte Nativo de 2 Pestañas ("Mes_Actual" e "Historico")
 * ==============================================================================
 */

const CONFIG = {
  GMAIL_LABEL: 'Codisa-Reportes',   // Nombre de la etiqueta en tu Gmail
  TAB_ACTUAL: 'Mes_Actual',         // Pestaña del corte más reciente
  TAB_HISTORICO: 'Historico',       // Pestaña acumulativa histórica de 18 meses
  ARCHIVE_EMAIL: true               // Marcar correo como leído tras procesar
};

function processCodisaEmail() {
  const threads = GmailApp.search('label:' + CONFIG.GMAIL_LABEL + ' is:unread', 0, 5);
  
  if (threads.length === 0) {
    Logger.log('ℹ️ No hay nuevos correos sin leer bajo la etiqueta: ' + CONFIG.GMAIL_LABEL);
    return;
  }

  const messages = threads[0].getMessages();
  const lastMessage = messages[messages.length - 1];
  const emailDate = lastMessage.getDate();
  const formattedDate = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const attachments = lastMessage.getAttachments();

  let csvAttachment = null;
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const name = att.getName().toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.md')) {
      csvAttachment = att;
      break;
    }
  }

  if (!csvAttachment) {
    Logger.log('⚠️ Se encontró correo pero no contenía adjunto CSV/TXT.');
    return;
  }

  const csvText = csvAttachment.getDataAsString('UTF-8');
  let parsedData = Utilities.parseCsv(csvText);

  if (!parsedData || parsedData.length === 0) {
    Logger.log('⚠️ El archivo adjunto está vacío.');
    return;
  }

  // Inyección automática de columna FECHA_PROCESO si falta
  const headers = parsedData[0];
  let fechaColIdx = -1;

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c].toString().trim().toUpperCase();
    if (h === 'FECHA_PROCESO' || h === 'FECHA') {
      fechaColIdx = c;
      break;
    }
  }

  if (fechaColIdx === -1) {
    headers.push('FECHA_PROCESO');
    for (let r = 1; r < parsedData.length; r++) {
      parsedData[r].push(formattedDate);
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Actualizar Pestaña "Mes_Actual" (Foto limpia del día)
  let sheetActual = ss.getSheetByName(CONFIG.TAB_ACTUAL) || ss.insertSheet(CONFIG.TAB_ACTUAL);
  sheetActual.clearContents();
  sheetActual.getRange(1, 1, parsedData.length, parsedData[0].length).setValues(parsedData);

  // 2. Acumular en Pestaña "Historico" (Historico 18 Meses)
  let sheetHistorico = ss.getSheetByName(CONFIG.TAB_HISTORICO);
  if (!sheetHistorico) {
    sheetHistorico = ss.insertSheet(CONFIG.TAB_HISTORICO);
    sheetHistorico.getRange(1, 1, 1, parsedData[0].length).setValues([parsedData[0]]);
  }

  const dataRowsOnly = parsedData.slice(1);
  if (dataRowsOnly.length > 0) {
    const lastRowHist = sheetHistorico.getLastRow();
    sheetHistorico.getRange(lastRowHist + 1, 1, dataRowsOnly.length, dataRowsOnly[0].length).setValues(dataRowsOnly);
  }

  if (CONFIG.ARCHIVE_EMAIL) {
    lastMessage.markRead();
  }

  Logger.log('✅ CORTE PROCESADO CON ÉXITO (' + formattedDate + '): Mes_Actual e Historico actualizados.');
}

/**
 * Endpoint inteligente que exporta AMBAS pestañas ("Mes_Actual" e "Historico")
 * estructuradas con secciones ## para el DataParser del Dashboard.
 */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetActual = ss.getSheetByName(CONFIG.TAB_ACTUAL);
  var sheetHistorico = ss.getSheetByName(CONFIG.TAB_HISTORICO);

  var outputText = '';

  function convertSheetToCSV(sheet) {
    if (!sheet) return '';
    var data = sheet.getDataRange().getValues();
    if (!data || data.length === 0) return '';
    var rows = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var escaped = [];
      for (var j = 0; j < row.length; j++) {
        var cellStr = row[j].toString().replace(/"/g, '""');
        if (cellStr.indexOf(',') !== -1 || cellStr.indexOf('\n') !== -1 || cellStr.indexOf('"') !== -1) {
          cellStr = '"' + cellStr + '"';
        }
        escaped.push(cellStr);
      }
      rows.push(escaped.join(','));
    }
    return rows.join('\n');
  }

  if (sheetActual) {
    outputText += '## Mes_Actual\n' + convertSheetToCSV(sheetActual) + '\n\n';
  }

  if (sheetHistorico) {
    outputText += '## Historico\n' + convertSheetToCSV(sheetHistorico) + '\n';
  }

  if (!outputText) {
    var defaultData = convertSheetToCSV(ss.getActiveSheet());
    outputText = defaultData;
  }

  return ContentService.createTextOutput(outputText)
    .setMimeType(ContentService.MimeType.TEXT);
}
