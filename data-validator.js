/**
 * Data Validator & Schema Sanitizer for Codisa BI Dashboard
 * Ensures data cleanliness, auto-repairs missing fields, and enforces strict types.
 */

class DataValidator {
    /**
     * Validates and cleans Codisa inventory & sales records.
     */
    static validateCodisa(records) {
        if (!Array.isArray(records)) return { validRecords: [], invalidCount: 0, warnings: ['Input is not an array'] };

        const validRecords = [];
        let invalidCount = 0;
        const warnings = [];

        records.forEach((r, idx) => {
            if (!r || (typeof r !== 'object')) {
                invalidCount++;
                return;
            }

            // Must have at least a product code or article description
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
                fechaProceso: String(r.fechaProceso || '').trim()
            };

            // Auto-correct quantity anomalies (e.g. missing decimal point like 5111667 instead of 511.16)
            if (cleanRecord.precio > 0 && cleanRecord.montoBruto > 0 && cleanRecord.cantidad > 0) {
                const expectedQty = cleanRecord.montoBruto / cleanRecord.precio;
                if (cleanRecord.cantidad > expectedQty * 10 || cleanRecord.cantidad < expectedQty * 0.1) {
                    warnings.push(`Fila ${idx + 1} (${cleanRecord.codigo}): Cantidad (${cleanRecord.cantidad}) anómala. Auto-corregida a ${expectedQty.toFixed(2)}.`);
                    cleanRecord.cantidad = expectedQty;
                }
            }

            // Auto-correct units of merma anomalies
            if (cleanRecord.costoUniMerma > 0 && cleanRecord.costoBrutoMerma > 0 && cleanRecord.unidadesMerma > 0) {
                const expectedMermaQty = cleanRecord.costoBrutoMerma / cleanRecord.costoUniMerma;
                if (cleanRecord.unidadesMerma > expectedMermaQty * 10 || cleanRecord.unidadesMerma < expectedMermaQty * 0.1) {
                    warnings.push(`Fila ${idx + 1} (${cleanRecord.codigo}): Unidades de merma (${cleanRecord.unidadesMerma}) anómalas. Auto-corregidas a ${expectedMermaQty.toFixed(2)}.`);
                    cleanRecord.unidadesMerma = expectedMermaQty;
                }
            }

            // Warning for extreme data anomalies (e.g. negative prices or mermas > sales)
            if (cleanRecord.precio < 0) {
                warnings.push(`Fila ${idx + 1} (${cleanRecord.codigo}): Precio negativo corregido a 0.`);
                cleanRecord.precio = 0;
            }

            validRecords.push(cleanRecord);
        });

        return { validRecords, invalidCount, warnings };
    }

    /**
     * Validates and cleans P&L (Estado de Resultados) records.
     */
    static validatePnL(records) {
        if (!Array.isArray(records)) return { validRecords: [], invalidCount: 0, warnings: ['Input is not an array'] };

        const validRecords = [];
        let invalidCount = 0;
        const warnings = [];

        records.forEach((r, idx) => {
            if (!r || (typeof r !== 'object')) {
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
                monto
            };

            validRecords.push(cleanRecord);
        });

        return { validRecords, invalidCount, warnings };
    }
}

if (typeof window !== 'undefined') window.DataValidator = DataValidator;
if (typeof module !== 'undefined') module.exports = DataValidator;
