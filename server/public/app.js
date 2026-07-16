/**
 * App Controller for Codisa BI Store & Financial Dashboard (v3.0)
 */

/* ================================================
   LOGIN & AUTHENTICATION CONTROLLER
   ================================================ */
const API_URL = window.API_URL || '';
const SESSION_KEY = 'chsd_auth_session';
const USER_KEY    = 'chsd_auth_user';
const TOKEN_KEY   = 'chsd_auth_token';
const ROLE_KEY    = 'chsd_auth_role';
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxNLOOjTlzp-WLcIiQXpoxw510xMvu3hgXF1Bec8mvhdVR3Kpi8GVN2VcIFZKnAvH21Cg/exec';

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, match => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escapeMap[match];
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const loginScreen   = document.getElementById('loginScreen');
    const appDashboard  = document.getElementById('appDashboard');
    const loginForm     = document.getElementById('loginForm');
    const loginError    = document.getElementById('loginError');
    const loginErrorMsg = document.getElementById('loginErrorMsg');
    const btnLogin      = document.getElementById('loginBtn');
    const loginBtnText  = document.getElementById('loginBtnText');
    const togglePass    = document.getElementById('togglePass');
    const eyeIcon       = document.getElementById('eyeIcon');
    const passInput     = document.getElementById('loginPass');
    const userInput     = document.getElementById('loginUser');
    const userNameDisp  = document.getElementById('userNameDisplay');
    const btnLogout     = document.getElementById('btnLogout');

    let isAppInitialized = false;

    function showError(msg) {
        if (!loginError || !loginErrorMsg) return;
        loginErrorMsg.textContent = msg;
        loginError.style.display = 'flex';
        loginError.style.animation = 'none';
        void loginError.offsetHeight; // reflow
        loginError.style.animation = 'shake 0.4s ease';
    }

    function setLoading(loading) {
        if (!btnLogin || !loginBtnText) return;
        btnLogin.disabled = loading;
        loginBtnText.textContent = loading ? 'Verificando...' : 'Ingresar al Panel';
    }

    function unlockDashboard(user) {
        const username = user || sessionStorage.getItem(USER_KEY) || 'admin';
        const role = sessionStorage.getItem(ROLE_KEY) || 'viewer';
        if (userNameDisp) userNameDisp.textContent = username.charAt(0).toUpperCase() + username.slice(1);

        // Hide developer controls for non-admin query users (e.g. gerencia)
        const isAdmin = role === 'admin';
        if (isAdmin) {
            if (elements.btnUploadFiles) elements.btnUploadFiles.style.display = 'inline-flex';
            if (elements.btnConnectSheet) elements.btnConnectSheet.style.display = 'inline-flex';
            if (elements.btnClearCache) elements.btnClearCache.style.display = 'inline-flex';
        } else {
            if (elements.btnUploadFiles) elements.btnUploadFiles.style.display = 'none';
            if (elements.btnConnectSheet) elements.btnConnectSheet.style.display = 'none';
            if (elements.btnClearCache) elements.btnClearCache.style.display = 'none';
        }

        // Animate login hide & dashboard show
        if (loginScreen) {
            loginScreen.classList.add('hidden');
            setTimeout(() => {
                loginScreen.style.display = 'none';
            }, 500);
        }

        if (appDashboard) {
            appDashboard.style.display = 'block';
        }
        document.body.classList.add('authenticated');

        // Dispatch event so sub-modules (e.g. user manager) can react
        document.dispatchEvent(new CustomEvent('chsd:authenticated', { detail: { username, role } }));

        // Boot dashboard if not initialized
        if (!isAppInitialized) {
            isAppInitialized = true;
            init();
        }
    }

    // Toggle Password Visibility
    if (togglePass && passInput && eyeIcon) {
        togglePass.addEventListener('click', () => {
            const isHidden = passInput.type === 'password';
            passInput.type = isHidden ? 'text' : 'password';
            eyeIcon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        });
    }

    // Handle Login Form Submit
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = userInput.value.trim().toLowerCase();
            const pass = passInput.value;

            setLoading(true);

            fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(data => { throw new Error(data.error || 'Credenciales incorrectas.'); });
                }
                return res.json();
            })
            .then(data => {
                sessionStorage.setItem(SESSION_KEY, 'authenticated');
                sessionStorage.setItem(USER_KEY, data.user.username);
                sessionStorage.setItem(TOKEN_KEY, data.token);
                sessionStorage.setItem(ROLE_KEY, data.user.role);
                if (loginError) loginError.style.display = 'none';
                
                // Cargar datos del servidor
                loadDataPromise = loadData();
                unlockDashboard(data.user.username);
            })
            .catch(err => {
                setLoading(false);
                showError(err.message || 'Error de conexión con el servidor.');
                if (passInput) {
                    passInput.value = '';
                    passInput.focus();
                }
            });
        });
    }

    // Logout Action
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(USER_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(ROLE_KEY);
            window.location.reload();
        });
    }

    const currentMonthStr = (new Date().getMonth() + 1).toString();
    // App State
    const state = {
        activeTab: 'ventas-mermas',
        codisaData: [],
        estadoResultados: [],
        globalYear: '2026',
        globalMonth: currentMonthStr,
        globalChannel: 'all', // 'all', 'tienda', 'ruta'
        plFilterYear: '2026',
        plFilterMonth: currentMonthStr,
        plFilterChannel: 'all',
        yoyMonth: currentMonthStr,
        yoyYearA: '2025',
        yoyYearB: '2026',
        stockStatus: 'all', // 'all', 'danger', 'warning', 'normal'
        stockSortBy: 'costoBrutoMerma',
        stockSortDesc: true,
        stockSearchInput: '',
        historyYear: '2026',
        charts: {},
        expandedPLAccounts: new Set(),
        lastUpdated: null,
        selectedProductSku: null
    };
    window.__appState = state;

    // DOM Elements
    const elements = {
        tabs: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        btnRefreshData: document.getElementById('btnRefreshData'),
        btnConnectSheet: document.getElementById('btnConnectSheet'),
        btnUploadFiles: document.getElementById('btnUploadFiles'),
        inputFileUpload: document.getElementById('inputFileUpload'),
        modalSheets: document.getElementById('modalSheets'),
        btnCloseModal: document.getElementById('btnCloseModal'),
        btnSaveSheetUrl: document.getElementById('btnSaveSheetUrl'),
        inputSheetUrl: document.getElementById('inputSheetUrl'),
        selectPLYear: document.getElementById('selectPLYear'),
        selectPLMonth: document.getElementById('selectPLMonth'),
        selectPLChannel: document.getElementById('selectPLChannel'),
        globalYear: document.getElementById('globalYear'),
        globalMonth: document.getElementById('globalMonth'),
        globalChannel: document.getElementById('globalChannel'),
        selectYoYearA: document.getElementById('selectYoYearA'),
        selectYoYearB: document.getElementById('selectYoYearB'),
        inputStockSearch: document.getElementById('searchStockCodeDesc'),
        selectStockStatus: document.getElementById('selectStockStatus'),
        syncStatusBadge: document.getElementById('syncStatusBadge'),
        syncStatusText: document.getElementById('syncStatusText'),
        lastUpdatedText: document.getElementById('lastUpdatedText'),
        dataSourceText: document.getElementById('dataSourceText'),
        modalProductHistory: document.getElementById('modalProductHistory'),
        btnCloseProductModal: document.getElementById('btnCloseProductModal'),
        modalProductTitle: document.getElementById('modalProductTitle'),
        modalProductSubtitle: document.getElementById('modalProductSubtitle'),
        btnClearCache: document.getElementById('btnClearCache')
    };

    // Formatters
    const formatCurrency = (val) => {
        const absVal = Math.abs(val || 0);
        const maxDigits = absVal >= 1000 ? 0 : 2;
        return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: maxDigits }).format(val || 0);
    };

    const formatNumber = (val) => {
        return new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(val || 0);
    };
    window.__formatNumber = formatNumber;

    const formatCompactCurrency = (val) => {
        if (val === null || val === undefined || val === 0) return '';
        const num = Number(val);
        const absVal = Math.abs(num);
        const sign = num < 0 ? '-' : '';
        
        let formatted = '';
        if (absVal >= 1000000) { // >= 1M
            formatted = (absVal / 1000000).toFixed(2);
        } else if (absVal >= 1000) { // >= 1k
            formatted = (absVal / 1000).toFixed(1);
        } else {
            formatted = absVal.toFixed(0);
        }
        
        if (formatted.includes('.')) {
            formatted = formatted.replace(/\.?0+$/, '');
        }
        
        const suffix = absVal >= 1000000 ? 'M' : (absVal >= 1000 ? 'k' : '');
        return `${sign}₡${formatted}${suffix}`;
    };

    const getCssColor = (varName, defaultVal) => {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || defaultVal;
    };

    const debounce = (fn, delay = 250) => {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    // Start loading data in the background immediately on page load
    let loadDataPromise = loadData();

    // Check Authentication on Page Load
    if (sessionStorage.getItem(SESSION_KEY) === 'authenticated') {
        unlockDashboard(sessionStorage.getItem(USER_KEY));
    } else {
        if (appDashboard) appDashboard.style.display = 'none';
        if (loginScreen) {
            loginScreen.style.display = 'flex';
            loginScreen.classList.remove('hidden');
        }
    }

    // Initialize Application
    async function init() {
        if (elements.globalMonth) elements.globalMonth.value = state.globalMonth;
        if (elements.selectPLMonth) elements.selectPLMonth.value = state.plFilterMonth;

        setupEventListeners();
        await loadDataPromise;
    }

    // Event Listeners Setup
    function setupEventListeners() {
        elements.tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                switchTab(targetTab);
            });
        });

        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const subtabId = btn.getAttribute('data-subtab');
                switchSubTab(subtabId);
            });
        });

        elements.btnUploadFiles.addEventListener('click', () => {
            elements.inputFileUpload.click();
        });

        elements.inputFileUpload.addEventListener('change', handleFileSelect);

        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processSelectedFiles(e.dataTransfer.files);
            }
        });

        elements.btnRefreshData.addEventListener('click', async () => {
            localStorage.removeItem('cached_codisa_json');
            loadDataPromise = loadData();
            await loadDataPromise;
        });

        // Clear Cache Button
        if (elements.btnClearCache) {
            elements.btnClearCache.addEventListener('click', () => {
                if (confirm('¿Limpiar todos los datos en caché?\n\nEsto eliminará los datos guardados localmente. Necesitarás volver a cargar tus archivos.')) {
                    localStorage.removeItem('cached_codisa_json');
                    localStorage.removeItem('cached_codisa_md');
                    localStorage.removeItem('cached_er_md');
                    localStorage.removeItem('cached_data_timestamp');
                    localStorage.setItem('force_empty', 'true');
                    state.codisaData = [];
                    state.estadoResultados = [];
                    state.lastUpdated = null;
                    loadData();
                    elements.syncStatusText.innerText = 'Caché limpiado — Cargue sus archivos';
                    elements.syncStatusBadge.style.borderColor = '#f59e0b';
                }
            });
        }

        elements.btnConnectSheet.addEventListener('click', () => {
            if (elements.inputSheetUrl) {
                elements.inputSheetUrl.value = localStorage.getItem('codisa_sheet_url') || DEFAULT_SHEET_URL || '';
            }
            elements.modalSheets.classList.add('active');
        });
        elements.btnCloseModal.addEventListener('click', () => {
            elements.modalSheets.classList.remove('active');
        });
        elements.btnSaveSheetUrl.addEventListener('click', async () => {
            const url = elements.inputSheetUrl.value.trim();
            
            // Mostrar estado de carga en el botón
            const originalText = elements.btnSaveSheetUrl.innerHTML;
            elements.btnSaveSheetUrl.disabled = true;
            elements.btnSaveSheetUrl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            if (elements.btnCloseModal) elements.btnCloseModal.disabled = true;

            if (url) {
                localStorage.setItem('codisa_sheet_url', url);
            } else {
                localStorage.removeItem('codisa_sheet_url');
            }

            try {
                const token = sessionStorage.getItem(TOKEN_KEY);
                const syncRes = await fetch(`${API_URL}/api/sync/sheets`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ url: url })
                });

                if (syncRes.status === 401 || syncRes.status === 403) {
                    handleSessionExpired();
                    return;
                }

                if (!syncRes.ok) {
                    const errorData = await syncRes.json();
                    throw new Error(errorData.error || 'Error al sincronizar con Google Sheets desde el servidor.');
                }

                const result = await syncRes.json();
                loadDataPromise = loadData();
                await loadDataPromise;
                
                showToast(`Datos de Google Sheets sincronizados correctamente: ${result.codisaCount} Codisa, ${result.erCount} P&L.`, 'success');
                elements.modalSheets.classList.remove('active');
            } catch (err) {
                showToast('Error al sincronizar Google Sheets: ' + (err.message || err), 'danger');
            } finally {
                // Restaurar estado del botón
                elements.btnSaveSheetUrl.disabled = false;
                elements.btnSaveSheetUrl.innerHTML = originalText;
                if (elements.btnCloseModal) elements.btnCloseModal.disabled = false;
            }
        });

        // Global Filters
        if (elements.globalYear) {
            elements.globalYear.addEventListener('change', (e) => {
                state.globalYear = e.target.value;
                if (elements.selectPLYear) elements.selectPLYear.value = e.target.value;
                state.plFilterYear = e.target.value;
                renderAllModules();
            });
        }
        if (elements.globalMonth) {
            elements.globalMonth.addEventListener('change', (e) => {
                state.globalMonth = e.target.value;
                renderAllModules();
            });
        }
        if (elements.globalChannel) {
            elements.globalChannel.addEventListener('change', (e) => {
                state.globalChannel = e.target.value;
                if (elements.selectPLChannel) elements.selectPLChannel.value = e.target.value;
                state.plFilterChannel = e.target.value;
                renderAllModules();
            });
        }

        // P&L Filters
        if (elements.selectPLChannel) {
            elements.selectPLChannel.addEventListener('change', (e) => {
                state.plFilterChannel = e.target.value;
                renderPLGastosTab();
            });
        }
        if (elements.selectPLYear) {
            elements.selectPLYear.addEventListener('change', (e) => {
                state.plFilterYear = e.target.value;
                renderPLGastosTab();
            });
        }
        if (elements.selectPLMonth) {
            elements.selectPLMonth.addEventListener('change', (e) => {
                state.plFilterMonth = e.target.value;
                renderPLGastosTab();
            });
        }


        if (elements.selectYoYearA) {
            elements.selectYoYearA.addEventListener('change', (e) => {
                state.yoyYearA = e.target.value;
                renderYoYSection();
            });
        }
        if (elements.selectYoYearB) {
            elements.selectYoYearB.addEventListener('change', (e) => {
                state.yoyYearB = e.target.value;
                renderYoYSection();
            });
        }

        // Stock Filters
        if (elements.inputStockSearch) {
            elements.inputStockSearch.addEventListener('input', debounce((e) => {
                state.stockSearchInput = e.target.value.toLowerCase();
                renderStockSubSection();
            }, 250));
        }
        if (elements.selectStockStatus) {
            elements.selectStockStatus.addEventListener('change', (e) => {
                state.stockStatus = e.target.value;
                renderStockSubSection();
            });
        }

        // Modal Product Close
        if (elements.btnCloseProductModal) {
            elements.btnCloseProductModal.addEventListener('click', () => {
                elements.modalProductHistory.classList.remove('active');
            });
        }

        // Table Sort Listeners for Master Table
        document.querySelectorAll('#tab-ventas-mermas .sortable').forEach(th => {
            th.addEventListener('click', () => {
                const sortKey = th.getAttribute('data-sort');
                if (state.stockSortBy === sortKey) {
                    state.stockSortDesc = !state.stockSortDesc;
                } else {
                    state.stockSortBy = sortKey;
                    const textCols = ['codigo', 'articulo'];
                    state.stockSortDesc = !textCols.includes(sortKey);
                }
                renderStockSubSection();
            });
        });

        // ⌨️ Keyboard Shortcuts (Atajos de Teclado)
        document.addEventListener('keydown', (e) => {
            if (sessionStorage.getItem(SESSION_KEY) !== 'authenticated') return;

            const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

            // 1. ESC to close modals
            if (e.key === 'Escape') {
                if (elements.modalSheets && elements.modalSheets.classList.contains('active')) {
                    elements.modalSheets.classList.remove('active');
                    e.preventDefault();
                }
                if (elements.modalProductHistory && elements.modalProductHistory.classList.contains('active')) {
                    elements.modalProductHistory.classList.remove('active');
                    e.preventDefault();
                }
            }

            // 2. Alt + 1/2 or raw 1/2 (when not typing) to switch tabs
            if (e.altKey || !isTyping) {
                if (e.key === '1') {
                    switchTab('ventas-mermas');
                    e.preventDefault();
                } else if (e.key === '2') {
                    switchTab('pl-gastos');
                    e.preventDefault();
                }
            }

            // 3. '/' to search SKU (when not typing)
            if (e.key === '/' && !isTyping) {
                const searchInput = document.getElementById('searchStockCodeDesc');
                if (searchInput) {
                    e.preventDefault();
                    switchTab('ventas-mermas');
                    setTimeout(() => {
                        searchInput.focus();
                        searchInput.select();
                    }, 50);
                }
            }
        });
    }

    function handleFileSelect(e) {
        if (e.target.files && e.target.files.length > 0) {
            processSelectedFiles(e.target.files);
        }
    }

    // ─── Mejora A: Toast de error visual ──────────────────────────────────────
    function showToast(msg, type = 'info') {
        const colors = { danger: '#dc2626', warning: '#d97706', success: '#059669', info: getCssColor('--primary', '#aa1e38') };
        const icons  = { danger: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', success: 'fa-circle-check', info: 'fa-circle-info' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 99999;
            background: var(--card-bg); border-left: 4px solid ${colors[type] || colors.info};
            border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
            padding: 14px 20px; display: flex; align-items: flex-start; gap: 12px;
            font-family: Inter, sans-serif; font-size: 13px; max-width: 420px;
            animation: fadeInUp 0.25s ease; color: var(--text-main);
        `;
        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info}" style="color:${colors[type]};font-size:18px;margin-top:1px;flex-shrink:0;"></i>
            <div style="flex:1;line-height:1.5;">${msg}</div>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:0;margin-left:8px;">×</button>
        `;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 7000);
    }

    async function uploadFileToServer(file) {
        const token = sessionStorage.getItem(TOKEN_KEY);
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (res.status === 401 || res.status === 403) {
            handleSessionExpired();
            return null;
        }

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Error al procesar el archivo en el servidor.');
        }

        return await res.json();
    }

    async function processSelectedFiles(fileList) {
        localStorage.removeItem('force_empty');
        const filesArray = Array.from(fileList);
        let pending = filesArray.length;
        let loadedCount = 0;
        const qualityReport = { codisaItems: 0, erRecords: 0 };

        for (const file of filesArray) {
            try {
                showToast(`Subiendo y procesando <strong>"${file.name}"</strong>...`, 'info');
                const data = await uploadFileToServer(file);
                if (data) {
                    loadedCount++;
                    if (data.codisaCount) qualityReport.codisaItems += data.codisaCount;
                    if (data.erCount) qualityReport.erRecords += data.erCount;
                }
            } catch (err) {
                console.error('[Upload Error]', file.name, err);
                showToast(`Error al procesar <strong>"${file.name}"</strong>: ${err.message || 'Error inesperado'}.`, 'danger');
            }
            pending--;
        }

        if (loadedCount > 0) {
            // Reload local data state from backend
            await loadData();
            showToast(`Carga completada en el servidor: <strong>${qualityReport.codisaItems}</strong> Codisa, <strong>${qualityReport.erRecords}</strong> P&L.`, 'success');
        }
    }

    function switchTab(tabId) {
        state.activeTab = tabId;
        elements.tabs.forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        elements.tabContents.forEach(content => {
            if (content.id === `tab-${tabId}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        if (tabId === 'ventas-mermas') {
            renderVentasMermasTab();
        } else if (tabId === 'pl-gastos') {
            renderPLGastosTab();
        }

        setTimeout(() => {
            Object.values(state.charts).forEach(chart => {
                if (chart) chart.resize();
            });
        }, 50);
    }

    function switchSubTab(subTabId) {
        document.querySelectorAll('.sub-tab-btn').forEach(btn => {
            if (btn.getAttribute('data-subtab') === subTabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        document.querySelectorAll('.sub-tab-content').forEach(content => {
            if (content.id === `subtab-${subTabId}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        setTimeout(() => {
            if (subTabId === 'finance-overview') {
                const items = state.codisaData || [];
                const topVentas = [...items].sort((a, b) => b.montoBruto - a.montoBruto).slice(0, 10);
                renderBarChart('chartTopVentas', topVentas.map(i => i.articulo.substring(0, 15)), topVentas.map(i => i.montoBruto), 'Ventas (₡)', getCssColor('--primary', '#aa1e38'));
                const topMermas = [...items].sort((a, b) => b.costoBrutoMerma - a.costoBrutoMerma).slice(0, 10);
                renderBarChart('chartTopMermas', topMermas.map(i => i.articulo.substring(0, 15)), topMermas.map(i => i.costoBrutoMerma), 'Merma (₡)', getCssColor('--danger', '#ef4444'));
            } else if (subTabId === 'finance-pl') {
                renderPLSubSection();
            } else if (subTabId === 'finance-yoy') {
                renderYoYSection();
            }
            Object.values(state.charts).forEach(chart => {
                if (chart) chart.resize();
            });
        }, 50);
    }

    // Data Fetching

    // URL por defecto del Apps Script (Codisa + Estado de Resultados).
    // Si el navegador/dispositivo no tiene una URL guardada en localStorage
    // (por ejemplo, primera vez que se abre el sitio, o se limpió el caché),
    // se usa esta automáticamente sin necesidad de pegarla en el modal.


    function buildTypedSheetUrl(baseUrl, type) {
        try {
            const url = new URL(baseUrl);
            url.searchParams.set('type', type);
            return url.toString();
        } catch (e) {
            const sep = baseUrl.indexOf('?') !== -1 ? '&' : '?';
            return baseUrl + sep + 'type=' + encodeURIComponent(type);
        }
    }

    async function fetchSheetCsv(url) {
        const controller = new AbortController();
        // 30s: los Apps Script Web Apps pueden tardar por "cold start" +
        // generación del CSV en hojas grandes. 10s era muy ajustado.
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const sheetText = await response.text();
        if (!sheetText || sheetText.trim().length === 0) {
            throw new Error('La hoja de Google Sheets retornó un contenido vacío');
        }
        // Si Apps Script no está desplegado como "Cualquier persona" o pide
        // iniciar sesión, la respuesta es una página HTML de Google, no CSV.
        const looksLikeHtml = /^\s*<(!doctype|html)/i.test(sheetText);
        if (looksLikeHtml) {
            throw new Error('La URL devolvió una página HTML de Google en vez de datos CSV. Verifica que el despliegue esté configurado como "Cualquier persona" tenga acceso.');
        }
        return sheetText;
    }

    function handleSessionExpired() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(ROLE_KEY);
        alert('Su sesión ha expirado. Por favor, inicie sesión de nuevo.');
        window.location.reload();
    }

    async function loadData() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) return;

        // Activar estado de carga visual en el badge y botón de refrescar
        if (elements.syncStatusText) {
            elements.syncStatusText.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin text-warning"></i> Conectando al servidor...';
        }
        if (elements.syncStatusBadge) {
            elements.syncStatusBadge.style.borderColor = '#f59e0b';
        }
        if (elements.btnRefreshData) {
            elements.btnRefreshData.disabled = true;
        }

        try {
            // 1. Fetch Codisa Records
            const codisaRes = await fetch(`${API_URL}/api/data/codisa`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (codisaRes.status === 401 || codisaRes.status === 403) {
                handleSessionExpired();
                return;
            }
            if (!codisaRes.ok) throw new Error('Error al obtener datos de inventario del servidor.');
            const codisaData = await codisaRes.json();
            state.codisaData = codisaData.records;

            // 2. Fetch P&L Records
            const erRes = await fetch(`${API_URL}/api/data/estado-resultados`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!erRes.ok) throw new Error('Error al obtener datos financieros del servidor.');
            const erData = await erRes.json();
            state.estadoResultados = erData.records;

            // Update UI status
            const role = sessionStorage.getItem(ROLE_KEY) || 'viewer';
            if (role === 'admin') {
                elements.syncStatusText.innerText = `Servidor central conectado ✓ (${state.codisaData.length} registros)`;
                if (elements.dataSourceText) elements.dataSourceText.innerText = 'Fuente: Base de Datos Supabase (Cloud)';
            } else {
                elements.syncStatusText.innerText = 'Servicios en línea y sincronizados con éxito ✓';
                if (elements.dataSourceText) elements.dataSourceText.innerText = 'Fuente: Servidor central';
            }
            elements.syncStatusBadge.style.borderColor = 'var(--success)';
            updateLastUpdatedText();
            renderAllModules();

            if (elements.btnRefreshData) {
                elements.btnRefreshData.disabled = false;
            }
        } catch (err) {
            console.error('Error al cargar datos del backend:', err);
            elements.syncStatusText.innerText = `⚠ Error de conexión: ${err.message || 'Error del servidor'}`;
            elements.syncStatusBadge.style.borderColor = 'var(--danger)';
            if (elements.btnRefreshData) {
                elements.btnRefreshData.disabled = false;
            }
        }
    }

    let autoSyncTimer = null;
    function setupAutoSyncInterval() {
        if (autoSyncTimer) clearInterval(autoSyncTimer);
        const customSheetUrl = localStorage.getItem('codisa_sheet_url');
        if (customSheetUrl) {
            // Background polling every 5 minutes
            autoSyncTimer = setInterval(() => {
                console.log('🔄 Sincronización automática en segundo plano (Google Sheets)...');
                loadData();
            }, 300000);
        }
    }

    function updateLastUpdatedText() {
        const ts = localStorage.getItem('cached_data_timestamp');
        if (ts) {
            const d = new Date(ts);
            const formatted = d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            state.lastUpdated = d;
            if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = `Última actualización: ${formatted}`;
        }
    }

    function updateAuditContextBanner() {
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const monthText = state.globalMonth === 'all' ? 'Año Completo (Ene-Dic)' : (monthNames[parseInt(state.globalMonth) - 1] || 'Julio');
        const yearText = state.globalYear || '2026';
        
        const channelMap = {
            'all': 'Consolidado (Ambos Canales)',
            'tienda': 'Tienda Santo Domingo',
            'ruta': 'Ruta 403 (Distribución)'
        };
        const scopeText = channelMap[state.globalChannel] || 'Consolidado';

        const lblPeriod = document.getElementById('lblAuditPeriod');
        if (lblPeriod) lblPeriod.innerText = `${monthText} ${yearText}`;

        const lblScope = document.getElementById('lblAuditScope');
        if (lblScope) lblScope.innerText = scopeText;
    }

    function renderAllModules() {
        state.lastUpdated = new Date();
        if (elements.lastUpdatedText) {
            const opts = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
            elements.lastUpdatedText.innerText = 'Última actualización: ' + state.lastUpdated.toLocaleString('es-CR', opts);
        }

        updateAuditContextBanner();
        if (state.activeTab === 'ventas-mermas') renderVentasMermasTab();
        else if (state.activeTab === 'pl-gastos') renderPLGastosTab();
    }

    function getFilteredCodisaItems() {
        const records = Array.isArray(state.codisaData) ? state.codisaData : [];
        
        let filtered = records;
        if (state.globalChannel && state.globalChannel !== 'all') {
            filtered = filtered.filter(r => String(r.bodega).toLowerCase() === state.globalChannel.toLowerCase());
        }
        
        if (state.globalMonth === 'all' && state.globalYear === 'all') return filtered;
        
        return filtered.filter(r => {
            const d = parseDateStr(r.fechaProceso);
            if (!d) return false;
            const y = d.getFullYear().toString();
            const m = (d.getMonth() + 1).toString();
            
            const matchYear = state.globalYear === 'all' || y === state.globalYear;
            const matchMonth = state.globalMonth === 'all' || m === state.globalMonth;
            
            return matchYear && matchMonth;
        });
    }

    // ==========================================
    // 3 DEDICATED SECTIONS RENDERERS
    // ==========================================
    function renderVentasMermasTab() {
        const items = getFilteredCodisaItems();
        const totalVentas = items.reduce((acc, curr) => acc + curr.montoBruto, 0);
        const totalStockValor = items.reduce((acc, curr) => acc + (curr.saldoActual * curr.costoUnitario), 0);
        const totalMermaCost = items.reduce((acc, curr) => acc + curr.costoBrutoMerma, 0);
        const mermaPercent = totalVentas > 0 ? (totalMermaCost / totalVentas) * 100 : 0;

        // Update KPIs
        const elVentas = document.getElementById('kpiOverviewVentas');
        if (elVentas) elVentas.innerText = formatCurrency(totalVentas);

        const elMermaCost = document.getElementById('kpiOverviewMermaCost');
        if (elMermaCost) elMermaCost.innerText = formatCurrency(totalMermaCost);

        const elMermaPercent = document.getElementById('kpiOverviewMermaPercent');
        if (elMermaPercent) elMermaPercent.innerText = `${mermaPercent.toFixed(1)}%`;

        const elStockValor = document.getElementById('kpiStockTotalCosto');
        if (elStockValor) elStockValor.innerText = formatCurrency(totalStockValor);

        // Render Top 10 Ventas Chart
        const topVentas = [...items].sort((a, b) => b.montoBruto - a.montoBruto).slice(0, 10);
        renderBarChart('chartTopVentas', topVentas.map(i => i.articulo.substring(0, 15)), topVentas.map(i => i.montoBruto), 'Ventas (₡)', getCssColor('--primary', '#aa1e38'));

        // Render Top 10 Mermas Chart
        const topMermas = [...items].sort((a, b) => b.costoBrutoMerma - a.costoBrutoMerma).slice(0, 10);
        renderBarChart('chartTopMermas', topMermas.map(i => i.articulo.substring(0, 15)), topMermas.map(i => i.costoBrutoMerma), 'Merma (₡)', getCssColor('--danger', '#ef4444'));

        // Render Monthly Ventas Comparison Chart (chartVentasMonthly)
        const yearAVentas = parseInt(state.yoyYearA) || 2025;
        const yearBVentas = parseInt(state.yoyYearB) || 2026;
        const getMonthlyVentas = (y) => {
            const arr = Array(12).fill(0);
            let mItems = state.codisaData || [];
            if (state.globalChannel && state.globalChannel !== 'all') {
                mItems = mItems.filter(i => String(i.bodega).toLowerCase() === state.globalChannel.toLowerCase());
            }
            mItems.forEach(i => {
                if (!i.fechaProceso) return;
                const d = parseDateStr(i.fechaProceso);
                if (d && d.getFullYear() === y) {
                    arr[d.getMonth()] += (i.montoBruto || 0);
                }
            });
            return arr;
        };
        renderYoYChart('chartVentasMonthly', yearAVentas, yearBVentas, getMonthlyVentas(yearAVentas), getMonthlyVentas(yearBVentas), '#64748b', getCssColor('--primary', '#aa1e38'));

        // Render Monthly Merma Comparison Chart (chartMermaMonthly)
        const getMonthlyMerma = (y) => {
            const arr = Array(12).fill(0);
            let mItems = state.codisaData || [];
            if (state.globalChannel && state.globalChannel !== 'all') {
                mItems = mItems.filter(i => String(i.bodega).toLowerCase() === state.globalChannel.toLowerCase());
            }
            mItems.forEach(i => {
                if (!i.fechaProceso) return;
                const d = parseDateStr(i.fechaProceso);
                if (d && d.getFullYear() === y) arr[d.getMonth()] += (i.costoBrutoMerma || 0);
            });
            return arr;
        };
        renderYoYChart('chartMermaMonthly', yearAVentas, yearBVentas, getMonthlyMerma(yearAVentas), getMonthlyMerma(yearBVentas), '#64748b', '#dc2626');

        // Render Inventory Master Table
        renderStockSubSection();
    }

    function renderPLGastosTab() {
        // Render P&L Table, Waterfall, etc. (which also updates Resultado Neto KPI)
        renderPLSubSection();

        // Render YoY KPIs (Net/Sales variation) and Expenses breakdown
        renderYoYSection();

        // Render Multianual History Table
        renderHistorySubSection();
    }

    function renderPLSubSection() {
        const records = state.estadoResultados || [];
        if (records.length === 0) return;

        const targetYear = parseInt(state.globalYear) || 2026;
        const targetMonth = state.globalMonth;
        const channelFilter = state.globalChannel || 'all';

        let filteredRecords = records.filter(r => r.año === targetYear);

        // Filter by Channel / Sucursal
        if (channelFilter === 'tienda') {
            filteredRecords = filteredRecords.filter(r => r.sucursal.toLowerCase().includes('tienda'));
        } else if (channelFilter === 'ruta') {
            filteredRecords = filteredRecords.filter(r => r.sucursal.toLowerCase().includes('ruta'));
        }

        if (targetMonth !== 'all') {
            filteredRecords = filteredRecords.filter(r => r.mes === parseInt(targetMonth));
        }

        const plNotice = document.getElementById('plNoticeBanner');
        if (filteredRecords.length === 0) {
            if (plNotice) {
                plNotice.style.display = 'flex';
                const noticeText = document.getElementById('plNoticeText');
                if (noticeText) {
                    noticeText.innerHTML = `El archivo de Estado de Resultados enviado incluye cierres contables de <strong>Enero a Mayo 2026</strong>. Para el período seleccionado, no existen registros registrados en la hoja de P&L. Seleccione <strong>Enero a Mayo 2026</strong> o <strong>"Todos los Meses"</strong> para ver el P&L completo.`;
                }
            }
        } else {
            if (plNotice) plNotice.style.display = 'none';
        }

        const ventasRecords = filteredRecords.filter(r => r.cuenta.toLowerCase() === 'ventas');
        const totalVentas = ventasRecords.reduce((sum, r) => sum + r.monto, 0);

        const costosRecords = filteredRecords.filter(r => r.cuenta.toLowerCase() === 'costos de ventas');
        const totalCostos = costosRecords.reduce((sum, r) => sum + r.monto, 0);

        const utilidadBrutaRecords = filteredRecords.filter(r => r.cuenta.toLowerCase() === 'utilidad bruta');
        const totalUtilidadBruta = utilidadBrutaRecords.reduce((sum, r) => sum + r.monto, 0) || (totalVentas - totalCostos);

        const gastosOpRecords = filteredRecords.filter(r => 
            r.cuenta.toLowerCase() === 'total gastos de operación' || 
            r.cuenta.toLowerCase() === 'sub-total gastos de operación'
        );
        const totalGastosOp = gastosOpRecords.reduce((sum, r) => sum + r.monto, 0);

        const resultadoNetoRecords = filteredRecords.filter(r => r.cuenta.toLowerCase() === 'resultado neto');
        const totalResultadoNeto = resultadoNetoRecords.reduce((sum, r) => sum + r.monto, 0) || (totalUtilidadBruta - totalGastosOp);

        const margenBruto = totalVentas > 0 ? (totalUtilidadBruta / totalVentas) * 100 : 0;
        const margenNeto = totalVentas > 0 ? (totalResultadoNeto / totalVentas) * 100 : 0;

        const elResultadoNeto = document.getElementById('kpiPLResultadoNeto');
        if (elResultadoNeto) elResultadoNeto.innerText = formatCurrency(totalResultadoNeto);

        const elMargenNeto = document.getElementById('kpiPLMargenNeto');
        if (elMargenNeto) elMargenNeto.innerText = `Margen Neto: ${margenNeto.toFixed(1)}%`;

        const kpiCardNeto = document.getElementById('kpiCardNeto');
        if (kpiCardNeto) {
            kpiCardNeto.className = totalResultadoNeto >= 0 ? 'kpi-card success' : 'kpi-card danger';
        }


        renderPLTable(filteredRecords, totalVentas);
    }

    function renderPLTable(records, totalVentas) {
        const tbody = document.getElementById('tbodyPL');
        tbody.innerHTML = '';

        const uniqueAccounts = [...new Set(records.map(r => r.cuenta))];
        const accountSums = {};
        uniqueAccounts.forEach(acc => {
            accountSums[acc] = records.filter(r => r.cuenta === acc).reduce((sum, r) => sum + r.monto, 0);
        });

        const mainCategoryKeys = [
            'VENTAS',
            'COSTOS DE VENTAS',
            'UTILIDAD BRUTA',
            'SUB-TOTAL GASTOS DE OPERACIÓN',
            'TOTAL GASTOS DE OPERACIÓN',
            'UTILIDAD OPERATIVA',
            'Resultado Neto'
        ];

        mainCategoryKeys.forEach(catKey => {
            const exactKey = uniqueAccounts.find(a => a.toLowerCase() === catKey.toLowerCase());
            if (!exactKey && catKey !== 'Resultado Neto') return;

            const val = exactKey ? accountSums[exactKey] : 0;
            const pct = totalVentas > 0 ? (val / totalVentas) * 100 : 0;

            const tr = document.createElement('tr');
            const isTotalRow = catKey === 'UTILIDAD BRUTA' || catKey === 'Resultado Neto' || catKey === 'VENTAS';
            tr.className = isTotalRow ? 'pl-row-total' : 'pl-row-header';

            let expandBtnHtml = '';
            if (catKey === 'SUB-TOTAL GASTOS DE OPERACIÓN' || catKey === 'TOTAL GASTOS DE OPERACIÓN') {
                const isExpanded = state.expandedPLAccounts.has(catKey);
                expandBtnHtml = `<button class="pl-expand-btn" data-cat="${catKey}"><i class="fa-solid ${isExpanded ? 'fa-minus' : 'fa-plus'}"></i></button>`;
            }

            tr.innerHTML = `
                <td>${expandBtnHtml} ${escapeHTML(exactKey || catKey)}</td>
                <td class="text-right text-bold">${formatCurrency(val)}</td>
                <td class="text-right">${pct.toFixed(1)}%</td>
            `;
            tbody.appendChild(tr);

            if ((catKey === 'SUB-TOTAL GASTOS DE OPERACIÓN' || catKey === 'TOTAL GASTOS DE OPERACIÓN') && state.expandedPLAccounts.has(catKey)) {
                const detailAccounts = uniqueAccounts.filter(a => 
                    !mainCategoryKeys.some(mk => mk.toLowerCase() === a.toLowerCase()) &&
                    !a.toLowerCase().includes('sub-total') &&
                    !a.toLowerCase().includes('total')
                );

                detailAccounts.forEach(childName => {
                    const childVal = accountSums[childName];
                    if (childVal !== 0) {
                        const childPct = totalVentas > 0 ? (childVal / totalVentas) * 100 : 0;
                        const childTr = document.createElement('tr');
                        childTr.innerHTML = `
                            <td class="pl-row-sub">${escapeHTML(childName)}</td>
                            <td class="text-right">${formatCurrency(childVal)}</td>
                            <td class="text-right text-muted">${childPct.toFixed(1)}%</td>
                        `;
                        tbody.appendChild(childTr);
                    }
                });
            }
        });

        document.querySelectorAll('.pl-expand-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const catName = btn.getAttribute('data-cat');
                if (state.expandedPLAccounts.has(catName)) {
                    state.expandedPLAccounts.delete(catName);
                } else {
                    state.expandedPLAccounts.add(catName);
                }
                renderPLTable(records, totalVentas);
            });
        });
    }

    function renderYoYSection() {
        const records = state.estadoResultados || [];
        const yearA = parseInt(state.yoyYearA);
        const yearB = parseInt(state.yoyYearB);

        // Calculate 12-month data arrays
        const getMonthlyData = (y) => {
            const monthsData = Array.from({length: 12}, () => ({ ventas: 0, neto: 0, merma: 0 }));
            
            const yrRecs = records.filter(r => r.año === y);
            yrRecs.forEach(r => {
                const mIdx = r.mes - 1;
                if(mIdx >= 0 && mIdx < 12) {
                    if (r.cuenta.toLowerCase() === 'ventas') monthsData[mIdx].ventas += r.monto;
                    if (r.cuenta.toLowerCase() === 'costos de ventas') monthsData[mIdx].costos = (monthsData[mIdx].costos || 0) + r.monto;
                    if (r.cuenta.toLowerCase() === 'total gastos de operación' || r.cuenta.toLowerCase() === 'sub-total gastos de operación') monthsData[mIdx].gastos = (monthsData[mIdx].gastos || 0) + r.monto;
                    if (r.cuenta.toLowerCase() === 'resultado neto') {
                        monthsData[mIdx].neto += r.monto;
                        monthsData[mIdx].hasNeto = true;
                    }
                }
            });

            const codisaItems = state.codisaData.filter(i => {
                if (!i.fechaProceso) return false;
                const d = parseDateStr(i.fechaProceso);
                return d && d.getFullYear() === y;
            });
            codisaItems.forEach(i => {
                const d = parseDateStr(i.fechaProceso);
                if (d) {
                    const mIdx = d.getMonth();
                    if(mIdx >= 0 && mIdx < 12) monthsData[mIdx].merma += i.costoBrutoMerma;
                }
            });

            monthsData.forEach(m => {
                if(!m.hasNeto) m.neto = m.ventas - (m.costos || 0) - (m.gastos || 0);
            });

            return {
                ventas: monthsData.map(m => m.ventas),
                neto: monthsData.map(m => m.neto),
                merma: monthsData.map(m => m.merma)
            };
        };

        const dataA = getMonthlyData(yearA);
        const dataB = getMonthlyData(yearB);

        // Find max active month in year B to calculate YTD correctly
        let maxMonthB = -1;
        for (let i = 11; i >= 0; i--) {
            if (dataB.ventas[i] !== 0 || dataB.neto[i] !== 0 || dataB.merma[i] !== 0) {
                maxMonthB = i;
                break;
            }
        }
        if (maxMonthB === -1) maxMonthB = 11; // Fallback if completely empty

        const metricsA_total = { ventas: 0, neto: 0, merma: 0 };
        const metricsB_total = { ventas: 0, neto: 0, merma: 0 };

        for (let i = 0; i <= maxMonthB; i++) {
            metricsA_total.ventas += dataA.ventas[i];
            metricsA_total.neto += dataA.neto[i];
            metricsA_total.merma += dataA.merma[i];
            
            metricsB_total.ventas += dataB.ventas[i];
            metricsB_total.neto += dataB.neto[i];
            metricsB_total.merma += dataB.merma[i];
        }

        const calcDelta = (valB, valA) => {
            const diff = valB - valA;
            const pct = valA !== 0 ? (diff / Math.abs(valA)) * 100 : 0;
            return { diff, pct };
        };

        const deltaVentas = calcDelta(metricsB_total.ventas, metricsA_total.ventas);
        const deltaNeto = calcDelta(metricsB_total.neto, metricsA_total.neto);
        const deltaMerma = calcDelta(metricsB_total.merma, metricsA_total.merma);

        // Render YoY KPI Cards
        document.getElementById('kpiYoYVentasValue').innerText = formatCurrency(metricsB_total.ventas);
        const badgeV = document.getElementById('kpiYoYVentasBadge');
        badgeV.innerText = `${deltaVentas.pct >= 0 ? '+' : ''}${deltaVentas.pct.toFixed(1)}%`;
        badgeV.className = deltaVentas.pct >= 0 ? 'kpi-badge up' : 'kpi-badge down';
        document.getElementById('kpiYoYVentasSub').innerText = `${yearB} vs ${yearA} (${formatCurrency(deltaVentas.diff)}) YTD`;

        document.getElementById('kpiYoYNetoValue').innerText = formatCurrency(metricsB_total.neto);
        const badgeN = document.getElementById('kpiYoYNetoBadge');
        badgeN.innerText = `${deltaNeto.pct >= 0 ? '+' : ''}${deltaNeto.pct.toFixed(1)}%`;
        badgeN.className = deltaNeto.pct >= 0 ? 'kpi-badge up' : 'kpi-badge down';
        document.getElementById('kpiYoYNetoSub').innerText = `${yearB} vs ${yearA} (${formatCurrency(deltaNeto.diff)}) YTD`;

        // YoY charts and Merma KPI were removed by user request, keeping only Ventas & Neto logic intact

        // Render Expenses Comparison Module
        renderExpensesComparison(records, yearA, yearB, maxMonthB);
    }

    function renderExpensesComparison(records, yearA, yearB, maxMonthB) {
        const lblYearB = document.getElementById('lblGastosYearB');
        if (lblYearB) lblYearB.innerText = yearB;

        // Extract all unique accounts to populate the filter (excluding main totals/revenues)
        const alwaysExclude = [
            'ventas', 'ventas brutas', 'costos de ventas', 'utilidad bruta', 
            'sub-total gastos de operación', 'total gastos de operación', 
            'utilidad operativa', 'resultado neto', 'base para calculo comisones'
        ];
        
        const allAccountsSet = new Set();
        records.forEach(r => {
            if (!alwaysExclude.includes(r.cuenta.toLowerCase())) {
                allAccountsSet.add(r.cuenta);
            }
        });
        const allAccounts = Array.from(allAccountsSet).sort();

        // Default valid expenses (if user hasn't selected anything yet)
        const defaultExpenses = [
            'Alquileres', 'Arrendamientos', 'Auditoria', 'Fletes', 'Flotilla Vehicular',
            'Gastos Corporativos', 'Gastos Financieros', 'Insumos', 'Licenciamientos',
            'Marketing', 'Material de Empaque', 'Otros Gastos', 'Planilla',
            'Plataforma Administrativa Corporativa', 'Plataforma Tecnologica',
            'Reparaciones y Mantenimientos', 'Seguros', 'Servicios Comunes',
            'Servicios Profesionales', 'Servicios Publicos', 'Soporte Tecnico (Informatica)',
            'Staff Gerencial', 'Transportes - Flete/Acarreos', 'Viaticos',
            'Comision Administrador', 'Comision Gerencial 11%', 'Reserva 1% RRHH',
            'Reserva 3% Incobrables', 'Reserva 5% Piblicidad'
        ];

        // Initialize state if first time
        if (!state.selectedExpenseAccounts) {
            state.selectedExpenseAccounts = new Set();
            allAccounts.forEach(acc => {
                if (defaultExpenses.some(d => acc.toLowerCase() === d.toLowerCase())) {
                    state.selectedExpenseAccounts.add(acc);
                }
            });
            // If none matched, select all
            if (state.selectedExpenseAccounts.size === 0) {
                allAccounts.forEach(acc => state.selectedExpenseAccounts.add(acc));
            }
        }

        // Render custom multi-select dropdown if container exists
        const filterContainer = document.getElementById('gastosAccountFilters');
        if (filterContainer && filterContainer.children.length === 0) {
            // Build the custom dropdown wrapper
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; display: inline-block; min-width: 320px; max-width: 100%; font-family: Inter, sans-serif;';

            // Trigger button
            const btn = document.createElement('button');
            btn.id = 'gastosDropdownBtn';
            btn.type = 'button';
            const updateBtnLabel = () => {
                const count = state.selectedExpenseAccounts.size;
                btn.innerHTML = `<i class="fa-solid fa-filter" style="margin-right:6px; color:var(--primary)"></i>${count === allAccounts.length ? 'Todas las cuentas' : count === 0 ? 'Sin selección' : `${count} cuenta${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}`}<i class="fa-solid fa-chevron-down" style="margin-left:auto; font-size:11px; transition:transform 0.2s;" id="gastosDropdownChevron"></i>`;
            };
            btn.style.cssText = `
                display: flex; align-items: center; gap: 6px; padding: 8px 14px;
                background: var(--card-bg); border: 1.5px solid var(--border-color);
                border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
                color: var(--text-main); width: 100%; text-align: left;
                box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: border-color 0.2s;
            `;
            btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--primary)');
            btn.addEventListener('mouseleave', () => { if (!panel.classList.contains('open')) btn.style.borderColor = 'var(--border-color)'; });
            updateBtnLabel();

            // Dropdown panel
            const panel = document.createElement('div');
            panel.style.cssText = `
                display: none; position: absolute; top: calc(100% + 6px); left: 0; z-index: 9999;
                background: var(--card-bg); border: 1.5px solid var(--border-color);
                border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.14);
                min-width: 340px; max-width: 520px; overflow: hidden;
            `;

            // Panel header with Select All / Clear All
            const panelHeader = document.createElement('div');
            panelHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border-color); background: var(--bg);';
            const panelTitle = document.createElement('span');
            panelTitle.style.cssText = 'font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;';
            panelTitle.textContent = 'Cuentas de Gasto';
            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display: flex; gap: 8px;';

            const makeActionBtn = (label, action) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.style.cssText = 'font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg); color: var(--primary); cursor: pointer;';
                b.addEventListener('click', () => {
                    action();
                    // Update all checkboxes in panel
                    panel.querySelectorAll('input[type=checkbox]').forEach(c => {
                        c.checked = state.selectedExpenseAccounts.has(c.value);
                    });
                    updateBtnLabel();
                    renderExpensesComparison(records, yearA, yearB, maxMonthB);
                });
                return b;
            };
            btnGroup.appendChild(makeActionBtn('Todos', () => allAccounts.forEach(a => state.selectedExpenseAccounts.add(a))));
            btnGroup.appendChild(makeActionBtn('Ninguno', () => state.selectedExpenseAccounts.clear()));
            panelHeader.appendChild(panelTitle);
            panelHeader.appendChild(btnGroup);

            // Search box inside panel
            const searchBox = document.createElement('input');
            searchBox.type = 'text';
            searchBox.placeholder = '🔍 Buscar cuenta...';
            searchBox.style.cssText = 'display: block; width: 100%; box-sizing: border-box; padding: 8px 14px; border: none; border-bottom: 1px solid var(--border-color); font-size: 12px; background: var(--bg); color: var(--text-main); outline: none;';

            // Scrollable list
            const list = document.createElement('div');
            list.style.cssText = 'max-height: 240px; overflow-y: auto; padding: 6px 0;';

            const buildList = (filter = '') => {
                list.innerHTML = '';
                allAccounts.filter(a => a.toLowerCase().includes(filter.toLowerCase())).forEach(acc => {
                    const row = document.createElement('label');
                    row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 7px 14px; cursor: pointer; font-size: 13px; color: var(--text-main); transition: background 0.15s;';
                    row.addEventListener('mouseenter', () => row.style.background = 'rgba(37,99,235,0.06)');
                    row.addEventListener('mouseleave', () => row.style.background = '');
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.value = acc;
                    cb.checked = state.selectedExpenseAccounts.has(acc);
                    cb.style.cssText = 'width: 15px; height: 15px; accent-color: var(--primary); cursor: pointer; flex-shrink: 0;';
                    cb.addEventListener('change', (e) => {
                        if (e.target.checked) state.selectedExpenseAccounts.add(acc);
                        else state.selectedExpenseAccounts.delete(acc);
                        updateBtnLabel();
                        renderExpensesComparison(records, yearA, yearB, maxMonthB);
                    });
                    const txt = document.createElement('span');
                    txt.textContent = acc;
                    row.appendChild(cb);
                    row.appendChild(txt);
                    list.appendChild(row);
                });
            };
            buildList();
            searchBox.addEventListener('input', () => buildList(searchBox.value));

            panel.appendChild(panelHeader);
            panel.appendChild(searchBox);
            panel.appendChild(list);

            // Toggle logic
            let isOpen = false;
            const openPanel = () => {
                isOpen = true;
                panel.style.display = 'block';
                panel.classList.add('open');
                btn.style.borderColor = 'var(--primary)';
                const chev = document.getElementById('gastosDropdownChevron');
                if (chev) chev.style.transform = 'rotate(180deg)';
                searchBox.value = '';
                buildList();
                setTimeout(() => searchBox.focus(), 50);
            };
            const closePanel = () => {
                isOpen = false;
                panel.style.display = 'none';
                panel.classList.remove('open');
                btn.style.borderColor = 'var(--border-color)';
                const chev = document.getElementById('gastosDropdownChevron');
                if (chev) chev.style.transform = 'rotate(0deg)';
            };
            btn.addEventListener('click', (e) => { e.stopPropagation(); isOpen ? closePanel() : openPanel(); });
            document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) closePanel(); });

            wrapper.appendChild(btn);
            wrapper.appendChild(panel);
            filterContainer.appendChild(wrapper);
        } else if (filterContainer) {
            // Update button label if already rendered
            const btnEl = document.getElementById('gastosDropdownBtn');
            if (btnEl) {
                const count = state.selectedExpenseAccounts.size;
                const total = Array.from(filterContainer.querySelectorAll('input[type=checkbox]')).length || allAccounts.length;
                btnEl.childNodes[1].textContent = count === total ? 'Todas las cuentas' : count === 0 ? 'Sin selección' : `${count} cuenta${count !== 1 ? 's' : ''} seleccionada${count !== 1 ? 's' : ''}`;
            }
        }

        const validAccounts = Array.from(state.selectedExpenseAccounts);

        // Sum up monthly expenses per account for Year B
        const getMonthlyByAccount = (y) => {
            const accData = {};
            validAccounts.forEach(acc => accData[acc] = Array(12).fill(0));
            
            const yrRecs = records.filter(r => r.año === y);
            yrRecs.forEach(r => {
                if(accData[r.cuenta]) {
                    const mIdx = r.mes - 1;
                    if(mIdx >= 0 && mIdx < 12) {
                        accData[r.cuenta][mIdx] += r.monto;
                    }
                }
            });
            return accData;
        };

        const expB_Monthly = getMonthlyByAccount(yearB);

        // Calculate totals (YTD) for sorting and Top Gastos chart
        const expArray = validAccounts.map(acc => {
            const months = expB_Monthly[acc];
            let totalYTD = 0;
            for(let i=0; i<=maxMonthB; i++) totalYTD += months[i];
            
            return { acc, months, totalYTD };
        }).filter(e => e.totalYTD !== 0 || e.months.some(m => m !== 0));

        expArray.sort((a, b) => b.totalYTD - a.totalYTD);

        // Render Table (Monthly breakdown) if present
        const thead = document.getElementById('theadGastos');
        if (thead) {
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            let ths = `<th style="text-align: left; position: sticky; left: 0; background: var(--card-bg); z-index: 2;">Cuenta de Gasto</th>`;
            for (let i = 0; i <= maxMonthB; i++) {
                ths += `<th style="text-align: right;">${monthNames[i]}</th>`;
            }
            ths += `<th style="text-align: right; font-weight: bold; background: rgba(0,0,0,0.02);">Total</th>`;
            thead.innerHTML = `<tr>${ths}</tr>`;
        }

        const tbody = document.getElementById('tbodyGastos');
        if (tbody) {
            tbody.innerHTML = '';
            expArray.forEach(e => {
                const tr = document.createElement('tr');
                
                let tds = `<td><strong style="white-space: nowrap;">${escapeHTML(e.acc)}</strong></td>`;
                let fullYearTotal = 0;
                for(let i=0; i <= maxMonthB; i++) {
                    const val = e.months[i];
                    fullYearTotal += val;
                    tds += `<td style="text-align: right; font-size: 13px;">${val === 0 ? '-' : formatCurrency(val)}</td>`;
                }
                tds += `<td style="text-align: right; font-weight: bold; background: rgba(0,0,0,0.02);">${formatCurrency(fullYearTotal)}</td>`;
                
                tr.innerHTML = tds;
                tbody.appendChild(tr);
            });
        }

        // Render Chart (Top 10 Expenses YTD)
        const top10 = expArray.slice(0, 10);
        const labels = top10.map(e => e.acc);
        const dataB = top10.map(e => e.totalYTD);

        renderBarChart('chartGastosVariacion', labels, dataB, 'Total (YTD)', getCssColor('--warning', '#f59e0b'));

        // Calculate 12-month trend for total valid expenses
        const getMonthlyExpenses = (y) => {
            const monthly = Array(12).fill(0);
            const yrRecs = records.filter(r => r.año === y);
            yrRecs.forEach(r => {
                if(validAccounts.includes(r.cuenta)) {
                    const mIdx = r.mes - 1;
                    if(mIdx >= 0 && mIdx < 12) {
                        monthly[mIdx] += r.monto;
                    }
                }
            });
            return monthly;
        };
        const monthlyGastosA = getMonthlyExpenses(yearA);
        const monthlyGastosB = getMonthlyExpenses(yearB);
        renderYoYChart('chartGastos12Meses', yearA, yearB, monthlyGastosA, monthlyGastosB, getCssColor('--secondary', '#8b5cf6'), getCssColor('--warning', '#f59e0b'));
    }

    function renderYoYChart(canvasId, yearA, yearB, dataA, dataB, colorA, colorB) {
        if (state.charts[canvasId]) state.charts[canvasId].destroy();

        const ctx = document.getElementById(canvasId);
        if(!ctx) return;
        
        const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        state.charts[canvasId] = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `Año ${yearA}`,
                        data: dataA,
                        backgroundColor: colorA,
                        borderColor: colorA,
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: `Año ${yearB}`,
                        data: dataB,
                        backgroundColor: colorB,
                        borderColor: colorB,
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 45,
                        right: 8,
                        bottom: 0,
                        left: 0
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'var(--text-muted)', font: { family: 'Inter', size: 12 } } },
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        offset: 4,
                        rotation: -90,
                        color: 'var(--text-main)',
                        font: { weight: 'bold', size: 10, family: 'Inter' },
                        formatter: (val) => formatCompactCurrency(val)
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: 'var(--text-muted)' }, grid: { display: false } },
                    y: {
                        grace: '22%',
                        ticks: {
                            color: 'var(--text-muted)',
                            callback: function(value) {
                                const sign = value < 0 ? '-' : '';
                                const abs = Math.abs(value);
                                if (abs >= 1000000) return sign + '₡' + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
                                if (abs >= 1000) return sign + '₡' + (abs / 1000).toFixed(0) + 'k';
                                return sign + '₡' + abs;
                            }
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderHistorySubSection() {
        const records = state.estadoResultados || [];
        if (records.length === 0) return;

        // Dynamically derive years from data instead of hardcoding
        const yearsSet = new Set(records.map(r => r.año).filter(y => y >= 2020));
        const years = Array.from(yearsSet).sort((a, b) => a - b);
        if (years.length === 0) return;

        const historySummary = years.map(yr => {
            const yrRecords = records.filter(r => r.año === yr);
            const ventas = yrRecords.filter(r => r.cuenta.toLowerCase() === 'ventas').reduce((sum, r) => sum + r.monto, 0);
            const costos = yrRecords.filter(r => r.cuenta.toLowerCase() === 'costos de ventas').reduce((sum, r) => sum + r.monto, 0);
            const gastos = yrRecords.filter(r => r.cuenta.toLowerCase() === 'total gastos de operación' || r.cuenta.toLowerCase() === 'sub-total gastos de operación').reduce((sum, r) => sum + r.monto, 0);
            const neto = yrRecords.filter(r => r.cuenta.toLowerCase() === 'resultado neto').reduce((sum, r) => sum + r.monto, 0) || (ventas - costos - gastos);
            const margenNeto = ventas > 0 ? (neto / ventas) * 100 : 0;
            return { yr, ventas, costos, gastos, neto, margenNeto };
        });


        const tbody = document.getElementById('tbodyHistoryYears');
        tbody.innerHTML = '';
        historySummary.reverse().forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-bold">${row.yr}</td>
                <td class="text-right text-success text-bold">${formatCurrency(row.ventas)}</td>
                <td class="text-right">${formatCurrency(row.costos)}</td>
                <td class="text-right">${formatCurrency(row.gastos)}</td>
                <td class="text-right text-bold ${row.neto >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(row.neto)}</td>
                <td class="text-right">${row.margenNeto.toFixed(1)}%</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ==========================================
    // TAB 1 — INVENTARIO & MERMAS (Master Table)
    // ==========================================

    function renderStockSubSection() {
        const tbody = document.getElementById('tbodyStock');
        tbody.innerHTML = '';

        let itemsToProcess = getFilteredCodisaItems();

        // Group by codigo
        const grouped = {};
        itemsToProcess.forEach(item => {
            if (!grouped[item.codigo]) {
                grouped[item.codigo] = {
                    codigo: item.codigo,
                    articulo: item.articulo,
                    saldoActual: item.saldoActual, 
                    fechaMax: parseDateStr(item.fechaProceso) || new Date(0),
                    montoBruto: 0,
                    cantidad: 0,
                    unidadesMerma: 0,
                    costoBrutoMerma: 0,
                    costoUnitario: item.costoUnitario,
                    precio: item.precio
                };
            }
            const g = grouped[item.codigo];
            const d = parseDateStr(item.fechaProceso) || new Date(0);
            
            // For saldoActual, take the one from the most recent date
            if (d > g.fechaMax) {
                g.fechaMax = d;
                g.saldoActual = item.saldoActual;
                g.costoUnitario = item.costoUnitario;
                g.precio = item.precio;
            }

            g.montoBruto += item.montoBruto || 0;
            g.cantidad += item.cantidad || 0;
            g.unidadesMerma += item.unidadesMerma || 0;
            g.costoBrutoMerma += item.costoBrutoMerma || 0;
        });

        let items = Object.values(grouped);

        // Add calculated fields to items for sorting and rendering
        items = items.map(item => {
            const ventaDiaria = item.cantidad / 30;
            const diasInv = ventaDiaria > 0 ? (item.saldoActual / ventaDiaria) : 999;
            const pctMonto = item.montoBruto > 0 ? (item.costoBrutoMerma / item.montoBruto) * 100 : 0;
            const pctUnidades = item.cantidad > 0 ? (item.unidadesMerma / item.cantidad) * 100 : 0;
            return { ...item, diasInv, pctMonto, pctUnidades };
        });

        // KPI Calculations - Stock
        const stockTotalCosto = items.reduce((acc, curr) => acc + (curr.saldoActual * curr.costoUnitario), 0);
        const stockTotalVenta = items.reduce((acc, curr) => acc + (curr.saldoActual * (curr.precio || 0)), 0);
        const criticalCount = items.filter(i => i.diasInv < 3 || i.saldoActual === 0).length;

        if (document.getElementById('kpiStockTotalCosto')) document.getElementById('kpiStockTotalCosto').innerText = formatCurrency(stockTotalCosto);
        if (document.getElementById('kpiStockTotalVenta')) document.getElementById('kpiStockTotalVenta').innerText = formatCurrency(stockTotalVenta);
        if (document.getElementById('kpiStockCriticalCount')) document.getElementById('kpiStockCriticalCount').innerText = criticalCount;

        // KPI Calculations - Mermas
        const mermaItems = items.filter(i => i.unidadesMerma > 0 || i.costoBrutoMerma > 0);
        const totalCostMerma = mermaItems.reduce((acc, curr) => acc + curr.costoBrutoMerma, 0);
        const totalUnitsMerma = mermaItems.filter(i => i.unidadesMerma > 0).reduce((acc, curr) => acc + curr.unidadesMerma, 0);
        const topMermaItem = [...mermaItems].sort((a, b) => b.costoBrutoMerma - a.costoBrutoMerma)[0];

        if (document.getElementById('kpiMermaTotalMonto')) {
            document.getElementById('kpiMermaTotalMonto').innerText = formatCurrency(totalCostMerma);
            document.getElementById('kpiMermaTotalUnidades').innerText = formatNumber(totalUnitsMerma);
            if (topMermaItem) {
                document.getElementById('kpiMermaTopItem').innerText = topMermaItem.articulo;
                document.getElementById('kpiMermaTopItemCost').innerText = formatCurrency(topMermaItem.costoBrutoMerma);
            } else {
                document.getElementById('kpiMermaTopItem').innerText = 'Sin mermas';
                document.getElementById('kpiMermaTopItemCost').innerText = '₡0.00';
            }
        }

        const searchTerm = (state.stockSearchInput || '').toLowerCase();
        if (searchTerm) {
            items = items.filter(i => 
                String(i.articulo).toLowerCase().includes(searchTerm) || 
                String(i.codigo).toLowerCase().includes(searchTerm)
            );
        }

        // Status Filter
        if (state.stockStatus === 'danger') {
            items = items.filter(i => i.diasInv < 3 || i.saldoActual === 0);
        } else if (state.stockStatus === 'warning') {
            items = items.filter(i => i.diasInv >= 3 && i.diasInv <= 7);
        } else if (state.stockStatus === 'normal') {
            items = items.filter(i => i.diasInv > 7);
        }

        // Update Header Sort Icons & Indicators
        document.querySelectorAll('#tab-ventas-mermas .sortable').forEach(th => {
            const key = th.getAttribute('data-sort');
            const icon = th.querySelector('i');
            if (key === state.stockSortBy) {
                th.style.color = 'var(--primary)';
                th.style.fontWeight = '700';
                if (icon) {
                    icon.className = state.stockSortDesc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up';
                    icon.style.color = 'var(--primary)';
                    icon.style.opacity = '1';
                }
            } else {
                th.style.color = '';
                th.style.fontWeight = '';
                if (icon) {
                    icon.className = 'fa-solid fa-sort text-muted';
                    icon.style.color = '';
                    icon.style.opacity = '0.4';
                }
            }
        });

        // Sort Master Table
        const numericKeys = ['saldoActual', 'montoBruto', 'cantidad', 'unidadesMerma', 'costoBrutoMerma', 'pctUnidades', 'pctMonto', 'diasInv'];
        const sortKey = state.stockSortBy || 'costoBrutoMerma';

        items.sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];

            if (numericKeys.includes(sortKey)) {
                const numA = typeof valA === 'number' ? valA : (parseFloat(valA) || 0);
                const numB = typeof valB === 'number' ? valB : (parseFloat(valB) || 0);
                if (numA === numB) return 0;
                return state.stockSortDesc ? (numB - numA) : (numA - numB);
            } else {
                const strA = String(valA || '');
                const strB = String(valB || '');
                const cmp = strA.localeCompare(strB, 'es', { numeric: true, sensitivity: 'base' });
                return state.stockSortDesc ? -cmp : cmp;
            }
        });

        items.forEach(item => {
            let diasInvHtml = `<td class="text-right">${formatNumber(item.diasInv)}</td>`;
            if (item.diasInv < 3 || item.saldoActual === 0) {
                diasInvHtml = `<td class="text-right text-danger text-bold" title="Riesgo inminente de desabasto">🔴 ${formatNumber(item.diasInv)}</td>`;
            } else if (item.diasInv <= 7) {
                diasInvHtml = `<td class="text-right text-warning font-weight-bold">🟡 ${formatNumber(item.diasInv)}</td>`;
            } else {
                diasInvHtml = `<td class="text-right text-success">🟢 ${formatNumber(item.diasInv)}</td>`;
            }

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `
                <td><code>${escapeHTML(item.codigo)}</code></td>
                <td class="text-bold">${escapeHTML(item.articulo)}</td>
                <td class="text-right text-bold">${formatNumber(item.saldoActual)}</td>
                <td class="text-right">${formatCurrency(item.montoBruto)}</td>
                <td class="text-right">${formatNumber(item.cantidad)}</td>
                <td class="text-right text-danger">${formatNumber(item.unidadesMerma)}</td>
                <td class="text-right text-danger font-weight-bold">${formatCurrency(item.costoBrutoMerma)}</td>
                <td class="text-right">${item.pctUnidades.toFixed(1)}%</td>
                <td class="text-right">${item.pctMonto.toFixed(1)}%</td>
                ${diasInvHtml}
            `;

            tr.addEventListener('click', () => {
                openProductHistoryModal(item.codigo, item.articulo);
            });

            tbody.appendChild(tr);
        });
    }

    // Modal SKU Trend Handler
    function openProductHistoryModal(codigo, articulo) {
        if (!elements.modalProductHistory) return;
        state.selectedProductSku = codigo;
        if (elements.modalProductTitle) elements.modalProductTitle.innerText = `${codigo} - ${articulo}`;
        if (elements.modalProductSubtitle) elements.modalProductSubtitle.innerText = `Evolución mensual de ventas y mermas en los últimos 18 meses (2025 - 2026)`;
        elements.modalProductHistory.classList.add('active');

        // Gather all monthly records for this SKU from unified codisaData
        const allItems = Array.isArray(state.codisaData) ? state.codisaData : [];
        const targetCodeStr = String(codigo || '').trim();

        let skuRecords = allItems.filter(i => String(i.codigo || '').trim() === targetCodeStr);

        // Fallback search by article name if code match returns empty
        if (skuRecords.length === 0 && articulo) {
            const targetArtStr = String(articulo).trim().toLowerCase();
            skuRecords = allItems.filter(i => String(i.articulo || '').trim().toLowerCase() === targetArtStr);
        }

        // Filter by the active global channel/bodega
        if (state.globalChannel && state.globalChannel !== 'all') {
            skuRecords = skuRecords.filter(i => String(i.bodega).toLowerCase() === state.globalChannel.toLowerCase());
        }

        // Group and aggregate by month to prevent duplicated months
        const monthlyAggregated = {};
        skuRecords.forEach(r => {
            const d = parseDateStr(r.fechaProceso);
            if (!d) return;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyAggregated[monthKey]) {
                monthlyAggregated[monthKey] = {
                    year: d.getFullYear(),
                    month: d.getMonth(),
                    montoBruto: 0,
                    costoBrutoMerma: 0,
                    cantidad: 0
                };
            }
            monthlyAggregated[monthKey].montoBruto += Number(r.montoBruto) || 0;
            monthlyAggregated[monthKey].costoBrutoMerma += Number(r.costoBrutoMerma) || 0;
            monthlyAggregated[monthKey].cantidad += Number(r.cantidad) || 0;
        });

        const sortedMonthKeys = Object.keys(monthlyAggregated).sort();

        let labels = [];
        let dataVentas = [];
        let dataMermas = [];
        let dataCantidades = [];

        if (sortedMonthKeys.length > 0) {
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            labels = sortedMonthKeys.map(key => {
                const item = monthlyAggregated[key];
                return `${months[item.month]} ${item.year.toString().substring(2)}`;
            });
            dataVentas = sortedMonthKeys.map(key => monthlyAggregated[key].montoBruto);
            dataMermas = sortedMonthKeys.map(key => monthlyAggregated[key].costoBrutoMerma);
            dataCantidades = sortedMonthKeys.map(key => monthlyAggregated[key].cantidad);
        } else {
            labels = ['Actual'];
            dataVentas = [0];
            dataMermas = [0];
            dataCantidades = [0];
        }

        renderLineChart('chartProductHistory', labels, dataVentas, dataMermas, dataCantidades, 'Ventas (₡)', 'Merma (₡)', 'Ventas (Unidades)');
    }

    function parseDateStr(fp) {
        if (!fp) return null;
        fp = fp.trim();
        let match = fp.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        match = fp.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
        return null;
    }
    window.__parseDateStr = parseDateStr;

    // --- Chart Helpers ---
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    function hexToRgba(hex, alpha = 1) {
        if (!hex || typeof hex !== 'string') return `rgba(37, 99, 235, ${alpha})`;
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const r = parseInt(hex.substring(0, 2), 16) || 37;
        const g = parseInt(hex.substring(2, 4), 16) || 99;
        const b = parseInt(hex.substring(4, 6), 16) || 235;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function createGradient(ctx, colorStr) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 320);
        if (!colorStr || !colorStr.startsWith('#')) {
            gradient.addColorStop(0, 'rgba(37, 99, 235, 0.85)');
            gradient.addColorStop(1, 'rgba(37, 99, 235, 0.08)');
            return gradient;
        }
        gradient.addColorStop(0, hexToRgba(colorStr, 0.85));
        gradient.addColorStop(1, hexToRgba(colorStr, 0.08));
        return gradient;
    }

    function renderBarChart(canvasId, labels, data, datasetLabel, color) {
        if (state.charts[canvasId]) state.charts[canvasId].destroy();

        const elem = document.getElementById(canvasId);
        if (!elem) return;
        const ctx = elem.getContext('2d');
        const grad = createGradient(ctx, color);

        state.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: datasetLabel,
                    data,
                    backgroundColor: grad,
                    borderColor: color,
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 0, right: 35, bottom: 0, left: 0 } },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        offset: 4,
                        color: 'var(--text-main)',
                        font: { weight: 'bold', size: 10, family: 'Inter' },
                        formatter: (val) => formatCompactCurrency(val)
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.x !== null) {
                                    label += formatCurrency(context.parsed.x);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grace: '18%',
                        ticks: {
                            color: 'var(--text-muted)',
                            callback: function(value) {
                                const sign = value < 0 ? '-' : '';
                                const abs = Math.abs(value);
                                if (abs >= 1000000) return sign + '₡' + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
                                if (abs >= 1000) return sign + '₡' + (abs / 1000).toFixed(0) + 'k';
                                return sign + '₡' + abs;
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }
                    },
                    y: {
                        ticks: { color: 'var(--text-muted)' },
                        grid: { display: false }
                    }
                }
            }
        });
    }




    function renderLineChart(canvasId, labels, data1, data2, data3 = null, label1 = 'Ventas (₡)', label2 = 'Merma (₡)', label3 = 'Ventas (Unidades)') {
        if (state.charts[canvasId]) state.charts[canvasId].destroy();

        const elem = document.getElementById(canvasId);
        if (!elem) return;
        const ctx = elem.getContext('2d');
        const color1 = getCssColor('--primary', '#aa1e38');
        const color2 = label2.includes('Merma') ? '#dc2626' : '#059669';
        const bgVal = '#ffffff';
        
        const datasets = [
            {
                label: label1,
                data: data1,
                borderColor: color1,
                backgroundColor: createGradient(ctx, color1),
                borderWidth: 3,
                pointBackgroundColor: bgVal,
                pointBorderColor: color1,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
                yAxisID: 'y',
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    color: 'var(--text-main)',
                    font: { weight: 'bold', size: 10, family: 'Inter' },
                    formatter: (val) => formatCompactCurrency(val)
                }
            },
            {
                label: label2,
                data: data2,
                borderColor: color2,
                backgroundColor: createGradient(ctx, color2),
                borderWidth: 3,
                pointBackgroundColor: bgVal,
                pointBorderColor: color2,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
                yAxisID: 'y',
                datalabels: {
                    display: false // hide static labels to prevent overlapping with X-axis
                }
            }
        ];

        if (data3) {
            const color3 = '#0284c7'; // Sky Blue
            datasets.push({
                label: label3,
                data: data3,
                borderColor: color3,
                borderWidth: 2,
                borderDash: [5, 5], // Dashed line for units
                pointBackgroundColor: bgVal,
                pointBorderColor: color3,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: false,
                tension: 0.4,
                yAxisID: 'y1',
                datalabels: {
                    display: false // disable datalabels on units to keep it clean
                }
            });
        }

        state.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: 'var(--text-muted)', font: { family: 'Inter', size: 12 } } },
                    datalabels: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.dataset.yAxisID === 'y') {
                                        // Currency formatting (CRC)
                                        label += new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 }).format(context.parsed.y);
                                    } else {
                                        // Unit count formatting
                                        label += new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(context.parsed.y);
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: 'var(--text-muted)' }, grid: { display: false } },
                    y: { 
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: {
                            color: 'var(--text-muted)',
                            callback: function(value) {
                                const sign = value < 0 ? '-' : '';
                                const abs = Math.abs(value);
                                if (abs >= 1000000) return sign + '₡' + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
                                if (abs >= 1000) return sign + '₡' + (abs / 1000).toFixed(0) + 'k';
                                return sign + '₡' + abs;
                            }
                        }, 
                        grid: { display: false } 
                    },
                    y1: {
                        type: 'linear',
                        display: !!data3,
                        position: 'right',
                        ticks: { color: 'var(--text-muted)' },
                        grid: { drawOnChartArea: false },
                        title: {
                            display: !!data3,
                            text: 'Unidades',
                            color: 'var(--text-muted)',
                            font: { family: 'Inter', size: 11, weight: 'bold' }
                        }
                    }
                }
            }
        });
    }

    // NOTA: init() ya se llama desde unlockDashboard() (protegido por
    // isAppInitialized) cuando la sesión está autenticada o justo después del
    // login. Llamarlo también aquí, sin condición, duplicaba TODOS los event
    // listeners (incluyendo los de ordenar la tabla), causando que alternar
    // ascendente/descendente pareciera no funcionar (dos toggles = ninguno).
});

/* ============================================================
   MÓDULO DE GESTIÓN DE USUARIOS (solo admin)
   ============================================================ */
(function initUserManager() {
    const API_URL = window.API_URL || '';
    let editingUserId = null;

    const modal         = document.getElementById('modalUsers');
    const btnOpen       = document.getElementById('btnManageUsers');
    const btnClose      = document.getElementById('btnCloseUsersModal');
    const tbody         = document.getElementById('usersTableBody');
    const inputName     = document.getElementById('inputUserName');
    const inputPass     = document.getElementById('inputUserPassword');
    const selectRole    = document.getElementById('selectUserRole');
    const btnSave       = document.getElementById('btnSaveUser');
    const btnCancelEdit = document.getElementById('btnCancelUserEdit');
    const btnSaveLabel  = document.getElementById('btnSaveUserLabel');
    const formTitle     = document.getElementById('userFormTitle');
    const formMsg       = document.getElementById('userFormMsg');

    function getToken() { return sessionStorage.getItem('chsd_auth_token'); }

    function showMsg(msg, ok = false) {
        formMsg.textContent = msg;
        formMsg.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }

    function resetForm() {
        editingUserId = null;
        inputName.value = '';
        inputName.disabled = false;
        inputPass.value = '';
        selectRole.value = 'viewer';
        btnSaveLabel.textContent = 'Crear';
        formTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Crear nuevo usuario';
        btnCancelEdit.style.display = 'none';
        formMsg.textContent = '';
    }

    async function loadUsers() {
        tbody.innerHTML = '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text-dim);">Cargando...</td></tr>';
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error('Sin permisos');
            const users = await res.json();
            tbody.innerHTML = users.map(u => `
                <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:10px 12px;font-weight:600;">
                        <i class="fa-solid fa-user" style="color:var(--primary);margin-right:6px;font-size:11px;"></i>${escapeHTML(u.username)}
                    </td>
                    <td style="padding:10px 12px;">
                        <span style="background:${u.role==='admin'?'var(--primary)':'var(--border-color)'};color:${u.role==='admin'?'#fff':'var(--text-muted)'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${u.role.toUpperCase()}</span>
                    </td>
                    <td style="padding:10px 12px;color:var(--text-muted);font-size:12px;">${u.created_at ? u.created_at.slice(0,10) : '-'}</td>
                    <td style="padding:10px 12px;text-align:center;display:flex;gap:6px;justify-content:center;">
                        <button class="control-btn icon-only" title="Editar" onclick="window.__editUser(${u.id},'${escapeHTML(u.username)}','${escapeHTML(u.role)}')">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="control-btn icon-only danger-text" title="Eliminar" onclick="window.__deleteUser(${u.id},'${escapeHTML(u.username)}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch(e) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--danger);">Error al cargar usuarios.</td></tr>';
        }
    }

    window.__editUser = function(id, username, role) {
        editingUserId = id;
        inputName.value = username;
        inputName.disabled = true;
        selectRole.value = role;
        inputPass.value = '';
        btnSaveLabel.textContent = 'Guardar';
        formTitle.innerHTML = `<i class="fa-solid fa-pen"></i> Editando: <strong>${escapeHTML(username)}</strong> <span style="font-size:11px;font-weight:400;">(deja vacío si no cambias la contraseña)</span>`;
        btnCancelEdit.style.display = 'inline-flex';
        formMsg.textContent = '';
        inputPass.focus();
    };

    window.__deleteUser = async function(id, username) {
        if (!confirm(`¿Estás seguro de que quieres eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`${API_URL}/api/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al eliminar.');
            await loadUsers();
            showMsg(`✅ Usuario "${username}" eliminado.`, true);
        } catch(e) {
            showMsg(`❌ ${e.message}`);
        }
    };

    btnSave.addEventListener('click', async () => {
        const username = inputName.value.trim();
        const password = inputPass.value;
        const role     = selectRole.value;

        if (!editingUserId && (!username || !password)) {
            return showMsg('❌ El usuario y la contraseña son obligatorios.');
        }

        try {
            btnSave.disabled = true;
            let res, data;

            if (editingUserId) {
                const body = { role };
                if (password) body.password = password;
                res = await fetch(`${API_URL}/api/users/${editingUserId}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch(`${API_URL}/api/users`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, role })
                });
            }

            data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error.');
            await loadUsers();
            resetForm();
            showMsg(`✅ Usuario guardado correctamente.`, true);
        } catch(e) {
            showMsg(`❌ ${e.message}`);
        } finally {
            btnSave.disabled = false;
        }
    });

    btnCancelEdit.addEventListener('click', resetForm);

    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            modal.classList.add('active');
            resetForm();
            loadUsers();
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => { modal.classList.remove('active'); });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // Mostrar botón solo si es admin
    document.addEventListener('chsd:authenticated', (e) => {
        if (e.detail && e.detail.role === 'admin' && btnOpen) {
            btnOpen.style.display = 'inline-flex';
        }
    });

    // Check on initial load if already authenticated
    if (sessionStorage.getItem('chsd_auth_token') && sessionStorage.getItem('chsd_user_role') === 'admin' && btnOpen) {
        btnOpen.style.display = 'inline-flex';
    }
})();
