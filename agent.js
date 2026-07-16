const AGENT_KEY = 'chsd_agent_api_key';
const AGENT_PROVIDER = 'chsd_agent_provider';
const AGENT_CHAT_KEY = 'chsd_agent_chat';
const AGENT_MODEL_KEY = 'chsd_agent_model';

const AGENT_SYSTEM_PROMPT = `Eres un consultor experto en gestión de tiendas de abarrotes y retail, especializado en la tienda "Country House Santo Domingo" (Costa Rica).

Tienes acceso a los datos actuales de la tienda a través del dashboard. Cuando el usuario te haga una pregunta, debes analizar los datos que recibes en el contexto y dar recomendaciones PRÁCTICAS y ACCIONABLES.

REGLAS:
1. Siempre responde en ESPAÑOL de Costa Rica (con "usted").
2. Sé directo, concreto y basado en datos.
3. Si no tienes suficiente información, di exactamente qué datos faltan.
4. Prioriza acciones urgentes (stock crítico, mermas altas).
5. Usa números concretos de los datos proporcionados.
6. Da sugerencias de pedidos basadas en días de inventario.
7. Señala productos con exceso de inventario (más de 30 días).`;

function buildAgentContext() {
    const items = window.__agentData ? window.__agentData.codisaData || [] : [];
    const er = window.__agentData ? window.__agentData.estadoResultados || [] : [];
    const state = window.__agentState || {};
    const month = state.globalMonth || 'all';
    const year = state.globalYear || '2026';

    const fn = (v) => window.__formatNumber ? window.__formatNumber(v) : (v || 0).toFixed(2);
    const pd = (v) => window.__parseDateStr ? window.__parseDateStr(v) : null;

    const filtered = items.filter(r => {
        if (!r.fechaProceso) return false;
        const d = pd(r.fechaProceso);
        if (!d) return false;
        const matchYear = year === 'all' || d.getFullYear().toString() === year;
        const matchMonth = month === 'all' || (d.getMonth() + 1).toString() === month;
        return matchYear && matchMonth;
    });

    const totalVentas = filtered.reduce((s, r) => s + (r.montoBruto || 0), 0);
    const totalMerma = filtered.reduce((s, r) => s + (r.costoBrutoMerma || 0), 0);
    const mermaPct = totalVentas > 0 ? ((totalMerma / totalVentas) * 100).toFixed(1) : '0.0';
    const stockValor = filtered.reduce((s, r) => s + ((r.saldoActual || 0) * (r.costoUnitario || 0)), 0);

    const grouped = {};
    filtered.forEach(r => {
        if (!grouped[r.codigo]) {
            grouped[r.codigo] = { codigo: r.codigo, articulo: r.articulo, ventas: 0, merma: 0, saldo: r.saldoActual || 0, cant: 0, costoU: r.costoUnitario || 0 };
        }
        const g = grouped[r.codigo];
        g.ventas += r.montoBruto || 0;
        g.merma += r.costoBrutoMerma || 0;
        g.cant += r.cantidad || 0;
        if ((r.saldoActual || 0) > 0) g.saldo = r.saldoActual;
    });

    let itemsArr = Object.values(grouped).map(g => {
        const vtaDiaria = g.cant / 30;
        g.diasInv = vtaDiaria > 0 ? (g.saldo / vtaDiaria) : 999;
        g.pctMerma = g.ventas > 0 ? ((g.merma / g.ventas) * 100) : 0;
        return g;
    });

    const topMerma = [...itemsArr].sort((a, b) => b.merma - a.merma).slice(0, 5);
    const topVentas = [...itemsArr].sort((a, b) => b.ventas - a.ventas).slice(0, 5);
    const critico = itemsArr.filter(i => i.diasInv < 3 || i.saldo === 0);
    const exceso = itemsArr.filter(i => i.diasInv > 30 && i.saldo > 0);
    const bajo = itemsArr.filter(i => i.diasInv >= 3 && i.diasInv <= 7);

    const yrVentas = er.filter(r => r.cuenta.toLowerCase() === 'ventas');
    const totalVentasER = yrVentas.reduce((s, r) => s + (r.monto || 0), 0);
    const neto = er.filter(r => r.cuenta.toLowerCase() === 'resultado neto').reduce((s, r) => s + (r.monto || 0), 0);

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    return `DATOS DE COUNTRY HOUSE SANTO DOMINGO (${month === 'all' ? 'Año Completo' : monthNames[parseInt(month)-1]} ${year}):

RESUMEN:
- Ventas totales: ₡${fn(totalVentas)}
- Pérdida por merma: ₡${fn(totalMerma)} (${mermaPct}% de ventas)
- Valor total inventario (a costo): ₡${fn(stockValor)}
- Ventas contables (P&L): ₡${fn(totalVentasER)}
- Resultado neto: ₡${fn(neto)}

PRODUCTOS CRÍTICOS (stock < 3 días o agotado - URGENTE): ${critico.length} productos
${critico.slice(0, 5).map(i => `- ${i.articulo} (código ${i.codigo}): saldo ${i.saldo}, días inventario: ${i.diasInv.toFixed(0)}`).join('\n')}

EXCESO DE INVENTARIO (>30 días): ${exceso.length} productos
${exceso.slice(0, 5).map(i => `- ${i.articulo} (código ${i.codigo}): saldo ${i.saldo}, días inventario: ${i.diasInv.toFixed(0)}, monto merma: ₡${fn(i.merma)}`).join('\n')}

STOCK BAJO (3-7 días - requiere reorden): ${bajo.length} productos
${bajo.slice(0, 5).map(i => `- ${i.articulo} (código ${i.codigo}): saldo ${i.saldo}, días inventario: ${i.diasInv.toFixed(0)}`).join('\n')}

TOP 5 PRODUCTOS CON MAYOR MERMA:
${topMerma.map(i => `- ${i.articulo} (código ${i.codigo}): ₡${fn(i.merma)} (${i.pctMerma.toFixed(1)}% de sus ventas)`).join('\n')}

TOP 5 PRODUCTOS CON MAYOR VENTA:
${topVentas.map(i => `- ${i.articulo} (código ${i.codigo}): ₡${fn(i.ventas)}`).join('\n')}`;
}

function getAgentData() {
    const s = window.__appState;
    return {
        codisaData: s ? s.codisaData : [],
        estadoResultados: s ? s.estadoResultados : []
    };
}

function formatAgentReply(reply) {
    return reply
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^# (.*?)$/gm, '<strong style="font-size:16px;">$1</strong>');
}

function initAgent() {
    const chatContainer = document.getElementById('agentChat');
    const agentInput = document.getElementById('agentInput');
    const btnSend = document.getElementById('btnAgentSend');
    const statusText = document.getElementById('agentStatusText');
    const btnConfig = document.getElementById('btnAgentConfig');
    const btnClear = document.getElementById('btnClearChat');
    const API_URL = window.API_URL || 'http://localhost:3000';
    let isProcessing = false;

    function updateStatus() {
        const customKey = localStorage.getItem(AGENT_KEY);
        if (customKey) {
            statusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Agente activo (API Key Propia)`;
        } else {
            statusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Agente activo (API Key de Backend)`;
        }
        agentInput.disabled = false;
        btnSend.disabled = false;
        btnSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar';
        agentInput.placeholder = `Pregúntale al agente...`;
        
        if (btnConfig) {
            btnConfig.style.display = 'block'; 
        }
    }

    function loadChat() {
        const saved = localStorage.getItem(AGENT_CHAT_KEY);
        if (saved) {
            try { chatContainer.innerHTML = saved; } catch(e) {}
        }
    }

    function saveChat() {
        try { localStorage.setItem(AGENT_CHAT_KEY, chatContainer.innerHTML); } catch(e) {}
    }

    function addMessage(text, isUser = false) {
        const div = document.createElement('div');
        div.className = `agent-message ${isUser ? 'agent-user' : 'agent-bot'}`;
        div.innerHTML = `
            <div class="agent-avatar"><i class="fa-solid ${isUser ? 'fa-user' : 'fa-robot'}"></i></div>
            <div class="agent-bubble">${text}</div>
        `;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        saveChat();
    }

    function addTypingIndicator() {
        const div = document.createElement('div');
        div.className = 'agent-message agent-bot agent-typing';
        div.id = 'typingIndicator';
        div.innerHTML = '<div class="agent-avatar"><i class="fa-solid fa-robot"></i></div><div class="agent-bubble"><em>Analizando datos de la tienda</em></div>';
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typingIndicator');
        if (el) el.remove();
    }

    async function askGroq(question) {
        const token = sessionStorage.getItem('chsd_auth_token');
        const state = window.__appState || {};
        const customKey = localStorage.getItem(AGENT_KEY);
        
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        if (customKey) {
            headers['X-Groq-Api-Key'] = customKey;
        }

        const response = await fetch(`${API_URL}/api/agent/ask`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                question: question,
                month: state.globalMonth || 'all',
                year: state.globalYear || '2026',
                channel: state.globalChannel || 'all'
            })
        });

        if (response.status === 401 || response.status === 403) {
            sessionStorage.clear();
            alert('Su sesión ha expirado. Por favor, inicie sesión de nuevo.');
            window.location.reload();
            return 'Sesión expirada.';
        }

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Error ${response.status}`);
        }

        const data = await response.json();
        return data.answer || 'No pude generar una respuesta.';
    }

    async function askAgent(question) {
        if (isProcessing) return;
        isProcessing = true;
        btnSend.disabled = true;
        agentInput.disabled = true;

        addMessage(question, true);
        addTypingIndicator();

        try {
            const reply = await askGroq(question);
            removeTypingIndicator();
            addMessage(formatAgentReply(reply));
        } catch (err) {
            removeTypingIndicator();
            console.error('[Agent Error]', err);
            addMessage(`⚠️ Error del agente: ${err.message || 'Error inesperado al conectar con el servidor.'}`);
        }

        isProcessing = false;
        agentInput.disabled = false;
        btnSend.disabled = false;
        agentInput.focus();
    }

    function handleSend() {
        const text = agentInput.value.trim();
        if (!text) return;
        agentInput.value = '';
        askAgent(text);
    }

    btnSend.addEventListener('click', handleSend);
    agentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    btnClear.addEventListener('click', () => {
        if (confirm('¿Limpiar toda la conversación con el agente?')) {
            chatContainer.innerHTML = '';
            addMessage('🔄 <strong>Conversación reiniciada.</strong> ¿En qué puedo ayudarte?');
            localStorage.removeItem(AGENT_CHAT_KEY);
        }
    });

    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const q = chip.getAttribute('data-question');
            if (q && !agentInput.disabled) {
                agentInput.value = q;
                handleSend();
            }
        });
    });

    const modalApiKey = document.getElementById('modalApiKey');
    const inputApiKey = document.getElementById('inputApiKey');
    const btnSaveApiKey = document.getElementById('btnSaveApiKey');
    const btnCloseApiModal = document.getElementById('btnCloseApiModal');

    if (btnConfig && modalApiKey) {
        btnConfig.addEventListener('click', () => {
            const savedKey = localStorage.getItem(AGENT_KEY) || '';
            inputApiKey.value = savedKey;
            modalApiKey.style.display = 'flex';
        });

        btnCloseApiModal.addEventListener('click', () => {
            modalApiKey.style.display = 'none';
        });

        btnSaveApiKey.addEventListener('click', () => {
            const val = inputApiKey.value.trim();
            if (val) {
                localStorage.setItem(AGENT_KEY, val);
            } else {
                localStorage.removeItem(AGENT_KEY);
            }
            modalApiKey.style.display = 'none';
            updateStatus();
        });
    }

    updateStatus();
    loadChat();
}

document.addEventListener('DOMContentLoaded', () => {
    const checkInterval = setInterval(() => {
        if (window.__appState && window.__appState.codisaData) {
            clearInterval(checkInterval);
            initAgent();
        }
    }, 500);
});
