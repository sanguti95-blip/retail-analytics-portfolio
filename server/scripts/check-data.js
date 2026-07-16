require('dotenv').config();
const { query } = require('../config/db');

async function check() {
  try {
    console.log('Querying database counts...');
    const total = await query('SELECT count(*) FROM codisa_records');
    console.log('Total codisa rows:', total.rows[0].count);

    const monthly = await query(`
      SELECT 
        EXTRACT(YEAR FROM fecha_proceso) as yr,
        EXTRACT(MONTH FROM fecha_proceso) as mon,
        count(*) as count,
        SUM(monto_bruto) as total_ventas,
        SUM(costo_bruto_merma) as total_merma
      FROM codisa_records
      GROUP BY yr, mon
      ORDER BY yr DESC, mon DESC
    `);
    
    console.log('\nMonthly sums in PostgreSQL:');
    monthly.rows.forEach(r => {
      console.log(`Year: ${r.yr}, Month: ${r.mon} -> Rows: ${r.count}, Sales: ${r.total_ventas}, Merma: ${r.total_merma}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error checking:', err);
    process.exit(1);
  }
}

check();
