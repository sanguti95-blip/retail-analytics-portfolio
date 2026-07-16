const fs = require('fs');
const path = require('path');
const parser = require('../services/parser');

function check() {
  try {
    const rawPath = path.join(__dirname, '../../Data_Tableau_Codisa.md');
    const content = fs.readFileSync(rawPath, 'utf8');
    const records = parser.parseCodisaData(content);
    
    // Group records by date
    const groups = {};
    records.forEach(r => {
      if (!groups[r.fechaProceso]) groups[r.fechaProceso] = [];
      groups[r.fechaProceso].push(r);
    });
    
    const dates = Object.keys(groups);
    console.log('Available dates:', dates);
    
    // Compare 2026-07-03 06:46:32.073 with 2025-10-01
    const groupA = groups['2026-07-03 06:46:32.073'] || [];
    const groupB = groups['2025-10-01'] || [];
    
    console.log(`\nComparing 2026-07-03 06:46:32.073 (${groupA.length} rows) with 2025-10-01 (${groupB.length} rows):`);
    
    // Check first 5 rows of each
    console.log('\nFirst 3 rows of 2026-07-03:');
    groupA.slice(0, 3).forEach(r => console.log(`  ${r.codigo} - ${r.articulo} -> Qty: ${r.cantidad}, Price: ${r.precio}, Sales: ${r.montoBruto}`));
    
    console.log('\nFirst 3 rows of 2025-10-01:');
    groupB.slice(0, 3).forEach(r => console.log(`  ${r.codigo} - ${r.articulo} -> Qty: ${r.cantidad}, Price: ${r.precio}, Sales: ${r.montoBruto}`));
    
    // Calculate hash or compare content
    const matchingArticulos = groupA.filter((r, idx) => {
      const other = groupB[idx];
      return other && r.codigo === other.codigo && r.cantidad === other.cantidad && r.montoBruto === other.montoBruto;
    });
    console.log(`\nNumber of exact row matches (same index, code, qty, price, sales): ${matchingArticulos.length} / ${groupA.length}`);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
