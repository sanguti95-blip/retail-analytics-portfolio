const fs = require('fs');
const path = require('path');

const dir = __dirname;
const codisa = fs.readFileSync(path.join(dir, 'Data_Tableau_Codisa.md'), 'utf8');
const er = fs.readFileSync(path.join(dir, 'Estado_Resultados_Santo_Domingo_Tableau.md'), 'utf8');

const bundle = `window.RAW_CODISA_MD = ${JSON.stringify(codisa)};\nwindow.RAW_ER_MD = ${JSON.stringify(er)};\n`;

fs.writeFileSync(path.join(dir, 'data-bundle.js'), bundle, 'utf8');
console.log('SUCCESS: data-bundle.js created with length', bundle.length);
