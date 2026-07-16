const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

async function runAudit() {
    console.log('🚀 Iniciando servidor local para pruebas...');
    
    const projectRoot = path.join(__dirname, '..');

    // Iniciar http-server en el puerto 8080
    const server = spawn('npx', ['http-server', '.', '-p', '8080', '--silent'], {
        cwd: projectRoot,
        shell: true
    });

    // Esperar un momento para que el servidor levante
    await new Promise(r => setTimeout(r, 2000));

    console.log('🌐 Lanzando navegador Headless...');
    const browser = await puppeteer.launch({
        headless: true
    });
    
    const page = await browser.newPage();
    let consoleErrors = 0;

    // Capturar errores en la consola
    page.on('console', msg => {
        if (msg.type() === 'error') {
            // Ignoramos errores de favicon y recursos 404
            if (!msg.text().includes('favicon.ico') && !msg.text().includes('404 (Not Found)')) {
                console.error(`[Error Consola JS] ${msg.text()}`);
                consoleErrors++;
            }
        }
    });

    try {
        console.log('➡️  Navegando al Dashboard (Login)...');
        await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle2' });

        // Verificar Login
        await page.type('#loginUser', 'admin');
        await page.type('#loginPass', 'admin');
        await page.click('#loginBtn');
        
        await page.waitForSelector('#appDashboard', { visible: true });
        console.log('✅ Login exitoso. Dashboard cargado y autenticado.');

        // Verificar Pestañas
        console.log('➡️  Alternando a la pestaña de Estado de Resultados...');
        await page.click('button[data-tab="pl-gastos"]');
        await page.waitForSelector('#tab-pl-gastos.active', { visible: true });
        console.log('✅ Pestaña de Resultados funciona correctamente.');

        // Verificar Google Sheets Connection UI
        console.log('➡️  Abriendo Modal de Google Sheets...');
        await page.click('#btnConnectSheet');
        await page.waitForSelector('#modalSheets.active', { visible: true });
        
        // Simular Cerrar Modal
        await page.click('#btnCloseModal');
        console.log('✅ Modal de Sheets responde adecuadamente.');

        console.log(`\n================================`);
        console.log(`🎯 AUDITORÍA UI E2E FINALIZADA`);
        console.log(`Errores JS Críticos Detectados: ${consoleErrors}`);
        console.log(`================================`);
        
        if (consoleErrors > 0) {
            console.error('❌ La prueba de flujo terminó con errores en la consola.');
            process.exitCode = 1;
        } else {
            console.log('✨ Todo el flujo básico funciona de maravilla.');
            process.exitCode = 0;
        }

    } catch (err) {
        console.error('❌ Ocurrió un error inesperado durante la navegación:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
        server.kill();
        process.exit();
    }
}

runAudit();
