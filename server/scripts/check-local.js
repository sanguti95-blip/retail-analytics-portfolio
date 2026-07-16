const fs = require('fs');
const path = require('path');
const parser = require('../services/parser');

function check() {
  try {
    const rawPath = path.join(__dirname, '../../Data_Tableau_Codisa.md');
    console.log('Reading:', rawPath);
    const content = fs.readFileSync(rawPath, 'utf8');
    
    console.log('Parsing local markdown...');
    const records = parser.parseCodisaData(content);
    console.log('Total records parsed from markdown:', records.length);
    
    // Group and sum in memory
    const monthly = {};
    records.forEach(r => {
      if (!r.fechaProceso) return;
      const d = new Date(r.fechaProceso);
      if (isNaN(d.getTime())) return;
      const yr = d.getFullYear();
      const mon = d.getMonth() + 1;
      const key = `${yr}-${mon}`;
      
      if (!monthly[key]) {
        monthly[key] = { count: 0, sales: 0, merma: 0 };
      }
      monthly[key].count++;
      monthly[key].sales += Number(r.montoBruto) || 0;
      monthly[key].merma += Number(r.costoBrutoMerma) || 0;
    });
    
    console.log('\nMonthly sums in local Markdown:');
    Object.keys(monthly).sort().reverse().forEach(key => {
      const data = monthly[key];
      console.log(`Month ${key} -> Rows: ${data.count}, Sales: ${data.sales.toFixed(2)}, Merma: ${data.merma.toFixed(2)}`);
    });
    
  } catch (err) {
    console.error('Error checking local file:', err);
  }
}

check();
