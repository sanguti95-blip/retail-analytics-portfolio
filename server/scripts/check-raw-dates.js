const fs = require('fs');
const path = require('path');

function check() {
  try {
    const rawPath = path.join(__dirname, '../../Data_Tableau_Codisa.md');
    const content = fs.readFileSync(rawPath, 'utf8');
    
    // Find all columns or strings that look like dates: DD/MM/YYYY or YYYY-MM-DD
    const dates = {};
    const regex = /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const dateStr = match[0];
      dates[dateStr] = (dates[dateStr] || 0) + 1;
    }
    
    console.log('Unique raw date values found in file:');
    console.log(dates);
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
