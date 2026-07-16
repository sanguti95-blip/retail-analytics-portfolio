/**
 * Data Parser for Codisa BI Store & Financial Dashboard
 * Parses Markdown tables & CSV format into structured JavaScript data objects.
 */

class DataParser {
    static cleanCell(cell) {
        if (!cell) return '';
        let str = cell.trim().replace(/\\_/g, '_').replace(/\\/g, '');
        if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
            str = str.slice(1, -1);
        }
        return str.trim();
    }

    static parseCSVLine(line, separator = ',') {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    // Escaped double-quote inside quoted field: "" → "
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === separator && !inQuotes) {
                result.push(this.cleanCell(current));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(this.cleanCell(current));
        return result;
    }

    /**
     * Detects the best CSV separator by testing which candidate produces
     * consistent column counts between the header and data rows.
     */
    static detectSeparator(lines) {
        const candidates = ['\t', ';', ','];
        let bestSeparator = ',';
        let bestScore = -1;

        for (const sep of candidates) {
            const headerCols = this.parseCSVLine(lines[0], sep).length;
            if (headerCols < 2) continue;

            let consistentRows = 0;
            const samplesToCheck = Math.min(lines.length, 10);
            for (let i = 1; i < samplesToCheck; i++) {
                const rowCols = this.parseCSVLine(lines[i], sep).length;
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

    static parseTextToRows(text) {
        if (!text) return { sections: {}, isCSV: false };
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return { sections: {}, isCSV: false };

        const isMarkdown = text.includes('|') && text.includes('##');
        
        if (isMarkdown) {
            return { sections: this.parseMarkdownTable(text), isCSV: false };
        } else {
            lines[0] = lines[0].replace(/^\uFEFF/, ''); // Remove BOM
            const separator = this.detectSeparator(lines);
            
            const headers = this.parseCSVLine(lines[0], separator);
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const cells = this.parseCSVLine(lines[i], separator);
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

    static parseMarkdownTable(markdownText) {
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
                const cells = line.split('|').slice(1, -1).map(c => this.cleanCell(c));

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

    /**
     * Robust numeric parser supporting currency symbols, parenthesized negative values,
     * comma-decimals (1.250,50) and dot-decimals (1,250.50).
     */
    static parseNumValue(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        let str = String(val).trim();
        if (!str) return 0;

        const isParenthesedNegative = /^\((.*)\)$/.test(str);
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

    static parseCodisaData(mdContent) {
        const parsed = this.parseTextToRows(mdContent);
        const rawSections = parsed.sections;
        
        const parseRow = (row) => {
            const normMap = {};
            for (let k in row) {
                normMap[k.toLowerCase().replace(/\\_/g, '_')] = row[k];
            }
            const getVal = (key) => normMap[key.toLowerCase()] || '';

            const parseNum = (key) => this.parseNumValue(getVal(key));

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
                fechaProceso: getVal('FECHA_PROCESO')
            };
        };

        const mesActualRows = rawSections['Mes_Actual'] || rawSections['default'] || [];
        const historicoRows = rawSections['Historico'] || [];

        const allRows = [...mesActualRows, ...historicoRows];
        return allRows.map(parseRow);
    }

    static parseEstadoResultados(mdContent) {
        const parsed = this.parseTextToRows(mdContent);
        const rawSections = parsed.sections;
        const rows = rawSections['Datos'] || rawSections['default'] || rawSections['Mes_Actual'] || [];

        return rows.map(r => {
            const normMap = {};
            for (let k in r) {
                normMap[k.toLowerCase().replace(/\\_/g, '_')] = r[k];
            }
            const getVal = (key) => normMap[key.toLowerCase()] || '';

            const parseNum = (key) => this.parseNumValue(getVal(key));

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
                monto: parseNum('Real') || parseNum('Monto')
            };
        }).filter(r => r.cuenta !== '');
    }
}

if (typeof window !== 'undefined') window.DataParser = DataParser;
if (typeof module !== 'undefined') module.exports = DataParser;
