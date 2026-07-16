/**
 * Validador de datos — Versión servidor (CommonJS)
 * Migrado del frontend data-validator.js.
 * Asegura limpieza de datos, auto-reparación y tipos estrictos.
 */

/**
 * Valida y limpia registros de inventario/ventas Codisa.
 * @param {Array<Object>} records
 * @returns {{ validRecords: Array, invalidCount: number, warnings: string[] }}
 */
function validateCodisa(records) {
  if (!Array.isArray(records)) {
    return { validRecords: [], invalidCount: 0, warnings: ['La entrada no es un arreglo'] };
  }

  const validRecords = [];
  let invalidCount = 0;
  const warnings = [];

  records.forEach((r, idx) => {
    if (!r || typeof r !== 'object') {
      invalidCount++;
      return;
    }

    // Debe tener al menos código de producto o descripción
    const codigo = String(r.codigo || '').trim();
    const articulo = String(r.articulo || '').trim();

    if (!codigo && !articulo) {
      invalidCount++;
      return;
    }

    const cleanRecord = {
      cia: String(r.cia || '1').trim(),
      centro: String(r.centro || '').trim(),
      bodega: String(r.bodega || '').trim(),
      codigo: codigo || 'N/A',
      articulo: articulo || 'Producto Sin Nombre',
      unidad: String(r.unidad || 'UND').trim(),
      cantidad: isNaN(r.cantidad) ? 0 : Number(r.cantidad),
      precio: isNaN(r.precio) ? 0 : Number(r.precio),
      montoBruto: isNaN(r.montoBruto) ? 0 : Number(r.montoBruto),
      costoUnitario: isNaN(r.costoUnitario) ? 0 : Number(r.costoUnitario),
      saldoActual: isNaN(r.saldoActual) ? 0 : Math.max(0, Number(r.saldoActual)),
      valorStock: isNaN(r.valorStock) ? 0 : Number(r.valorStock),
      costoUniMerma: isNaN(r.costoUniMerma) ? 0 : Number(r.costoUniMerma),
      costoBrutoMerma: isNaN(r.costoBrutoMerma) ? 0 : Number(r.costoBrutoMerma),
      unidadesMerma: isNaN(r.unidadesMerma) ? 0 : Number(r.unidadesMerma),
      fechaProceso: String(r.fechaProceso || '').trim(),
    };

    // Auto-corrección de anomalías en cantidad
    if (cleanRecord.precio > 0 && cleanRecord.montoBruto > 0 && cleanRecord.cantidad > 0) {
      const expectedQty = cleanRecord.montoBruto / cleanRecord.precio;
      if (cleanRecord.cantidad > expectedQty * 10 || cleanRecord.cantidad < expectedQty * 0.1) {
        warnings.push(
          `Fila ${idx + 1} (${cleanRecord.codigo}): Cantidad (${cleanRecord.cantidad}) anómala. Auto-corregida a ${expectedQty.toFixed(2)}.`
        );
        cleanRecord.cantidad = expectedQty;
      }
    }

    // Auto-corrección de anomalías en merma
    if (cleanRecord.costoUniMerma > 0 && cleanRecord.costoBrutoMerma > 0 && cleanRecord.unidadesMerma > 0) {
      const expectedMermaQty = cleanRecord.costoBrutoMerma / cleanRecord.costoUniMerma;
      if (cleanRecord.unidadesMerma > expectedMermaQty * 10 || cleanRecord.unidadesMerma < expectedMermaQty * 0.1) {
        warnings.push(
          `Fila ${idx + 1} (${cleanRecord.codigo}): Unidades de merma (${cleanRecord.unidadesMerma}) anómalas. Auto-corregidas a ${expectedMermaQty.toFixed(2)}.`
        );
        cleanRecord.unidadesMerma = expectedMermaQty;
      }
    }

    // Precio negativo
    if (cleanRecord.precio < 0) {
      warnings.push(`Fila ${idx + 1} (${cleanRecord.codigo}): Precio negativo corregido a 0.`);
      cleanRecord.precio = 0;
    }

    validRecords.push(cleanRecord);
  });

  return { validRecords, invalidCount, warnings };
}

/**
 * Valida y limpia registros de Estado de Resultados (P&L).
 * @param {Array<Object>} records
 * @returns {{ validRecords: Array, invalidCount: number, warnings: string[] }}
 */
function validatePnL(records) {
  if (!Array.isArray(records)) {
    return { validRecords: [], invalidCount: 0, warnings: ['La entrada no es un arreglo'] };
  }

  const validRecords = [];
  let invalidCount = 0;
  const warnings = [];

  records.forEach((r, idx) => {
    if (!r || typeof r !== 'object') {
      invalidCount++;
      return;
    }

    const cuenta = String(r.cuenta || '').trim();
    if (!cuenta) {
      invalidCount++;
      return;
    }

    const año = Number(r.año) || 0;
    const mes = Number(r.mes) || 0;
    const monto = isNaN(r.monto) ? 0 : Number(r.monto);

    const cleanRecord = {
      canal: String(r.canal || 'Consolidado').trim(),
      sucursal: String(r.sucursal || 'Santo Domingo').trim(),
      cuenta,
      fecha: String(r.fecha || '').trim(),
      año,
      mes,
      monto,
    };

    validRecords.push(cleanRecord);
  });

  return { validRecords, invalidCount, warnings };
}

module.exports = { validateCodisa, validatePnL };
