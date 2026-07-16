/**
 * Automated Test Suite & Backend Pipeline Validator
 * Run via: node test-pipeline.js
 */

const fs = require('fs');
const path = require('path');
const DataParser = require('./data-parser.js');
const DataValidator = require('./data-validator.js');

console.log('====================================================');
console.log('🧪 RUNNING BACKEND PIPELINE & INTEGRITY TESTS');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failCount++;
    }
}

// ── TEST 1: DataParser Number Formats ────────────────────
console.log('Test Suite 1: DataParser Number & Currency Parsing');
assert(DataParser.parseNumValue('₡1.250,50') === 1250.5, 'Parses LatAm dot-thousand comma-decimal (₡1.250,50 -> 1250.5)');
assert(DataParser.parseNumValue('$1,250.50') === 1250.5, 'Parses US comma-thousand dot-decimal ($1,250.50 -> 1250.5)');
assert(DataParser.parseNumValue('(500.25)') === -500.25, 'Parses parenthesized negative numbers ((500.25) -> -500.25)');
assert(DataParser.parseNumValue('') === 0, 'Handles empty numeric strings gracefully (0)');

// ── TEST 2: CSV Separator Auto-Detection ─────────────────
console.log('\nTest Suite 2: CSV Separator Auto-Detection');
const commaCSV = 'NO_ARTI,ARTICULO,MONTO_BRUTO\n99,"Agua de Pipa, 16oz",623494';
const tabCSV   = 'NO_ARTI\tARTICULO\tMONTO_BRUTO\n99\tAgua de Pipa\t623494';
assert(DataParser.detectSeparator(commaCSV.split('\n')) === ',', 'Detects comma separator in CSV with quoted commas');
assert(DataParser.detectSeparator(tabCSV.split('\n')) === '\t', 'Detects tab separator in TSV');

// ── TEST 3: Demo Data Integrity Check ────────────────────
console.log('\nTest Suite 3: Bundle Files & Validation Pipeline');
try {
    const codisaPath = path.join(__dirname, 'Data_Tableau_Codisa.md');
    const erPath = path.join(__dirname, 'Estado_Resultados_Santo_Domingo_Tableau.md');

    if (fs.existsSync(codisaPath) && fs.existsSync(erPath)) {
        const codisaContent = fs.readFileSync(codisaPath, 'utf8');
        const erContent = fs.readFileSync(erPath, 'utf8');

        const rawCodisa = DataParser.parseCodisaData(codisaContent);
        const rawER = DataParser.parseEstadoResultados(erContent);

        assert(rawCodisa.length > 0, `Codisa parsed ${rawCodisa.length} records successfully`);
        assert(rawER.length > 0, `Estado de Resultados parsed ${rawER.length} records successfully`);

        const validCodisa = DataValidator.validateCodisa(rawCodisa);
        const validER = DataValidator.validatePnL(rawER);

        assert(validCodisa.invalidCount === 0, 'Zero invalid records in Codisa dataset');
        assert(validER.invalidCount === 0, 'Zero invalid records in P&L dataset');
    } else {
        console.log('  ⚠️ SKIP: Bundle source files not found locally');
    }
} catch (err) {
    assert(false, `Pipeline execution error: ${err.message}`);
}

// ── SUMMARY ──────────────────────────────────────────────
console.log('\n====================================================');
console.log(`📊 TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('====================================================');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
