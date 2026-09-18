// --- GLOBAL ERROR DIAGNOSTIC HANDLER ---
window.onerror = function (message, source, lineno, colno, error) {
  const errDiv = document.createElement('div');
  errDiv.style.position = 'fixed';
  errDiv.style.bottom = '10px';
  errDiv.style.left = '10px';
  errDiv.style.background = 'rgba(220, 38, 38, 0.95)';
  errDiv.style.color = 'white';
  errDiv.style.padding = '15px';
  errDiv.style.borderRadius = '8px';
  errDiv.style.zIndex = '99999';
  errDiv.style.fontFamily = 'monospace';
  errDiv.style.fontSize = '12px';
  errDiv.style.maxWidth = '90vw';
  errDiv.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  errDiv.innerHTML = `<strong>JavaScript Error:</strong> ${message}<br><strong>File:</strong> ${source}<br><strong>Line:</strong> ${lineno}:${colno}`;
  document.body.appendChild(errDiv);
  return false;
};

// --- CONFIGURATION & SUPABASE INITIALIZATION ---
const supabaseUrl = 'https://fsdgiebjkymenayboodg.supabase.co';
const supabaseKey = window.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZGdpZWJqa3ltZW5heWJvb2RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODU2MjQsImV4cCI6MjEwNDE2MTYyNH0.ytVZKQEoETR-oena6z8AQaG42nxERt4AdGLfpPVM3II';

// Initialize Supabase Client
var supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// State cache to avoid redundant queries
let stateCache = {
  technicians: [],
  suppliers: [],
  devices: [],
  cashFlow: [],
  attendance: [],
  financialData: null
};

// Quick Stats visibility state (true = visible, false = hidden/masked)
const statsVisibility = {
  'stat-safe-cash': false,
  'stat-digital-cash': false,
  'stat-available-stock': false,
  'stat-supplier-debts': false,
  'stat-customer-receivables': false
};

let cashflowChartInstance = null;

// --- PASSCODE GATE SECURITY ---
const DEFAULT_PASSCODE = '2026';

const REBATE_CONFIGS = {
  // توفيق سالم
  'e30996b4-0369-46c8-8b80-2c5fb84595c7': {
    carrierRate: 0.035,
    mideaRate: 0.04,
    startDate: '2026-07-02T13:00:00Z'
  },
  // شارب العربي - فيوتشر
  '5390dc3f-a041-48bb-a94a-e31a9733431d': {
    sharpRate: 0.06,
    tornadoRate: 0.06,
    startDate: '2026-07-09T00:00:00Z'
  },
  // شارب العربي - ارت كول
  '8efc3173-bb35-4aa2-b94d-45d3704e4605': {
    sharpRate: 0.06,
    tornadoRate: 0.06,
    startDate: '2026-07-10T00:00:00Z'
  }
};

// Helper for safe localStorage access (avoids crashes on file:// protocol)
function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('localStorage is not available:', e);
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage is not available:', e);
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('localStorage is not available:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Disable mouse wheel value changes on all number inputs globally
  document.addEventListener('wheel', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  }, { passive: true });

  // Start glowing digital clock
  startDigitalClock();

  // 📱 Telegram Mini App Setup (Auto-expand to Large Window on PC ONLY)
  if (window.Telegram?.WebApp) {
    const twa = window.Telegram.WebApp;
    try {
      twa.ready();
      twa.expand();
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                       twa.platform === 'android' || 
                       twa.platform === 'ios';
      // 🚀 Auto Fullscreen ONLY on PC / Laptop, NEVER on mobile!
      if (!isMobile) {
        if (typeof twa.requestFullscreen === 'function') {
          twa.requestFullscreen();
        }
      } else {
        // If mobile was somehow placed in fullscreen, exit it immediately
        if (twa.isFullscreen && typeof twa.exitFullscreen === 'function') {
          twa.exitFullscreen();
        }
      }
      // 🛡️ Prevent pull-to-dismiss scroll gesture on mobile (Official Telegram SDK API)
      if (typeof twa.disableVerticalSwipes === 'function') {
        twa.disableVerticalSwipes();
      }
      if (twa.initData) {
        safeSetItem('futureair_session', 'authenticated');
      }
    } catch (tgErr) {
      console.warn('Telegram WebApp initialization notice:', tgErr);
    }
  }

  const session = safeGetItem('futureair_session');
  if (session === 'authenticated') {
    showDashboard();
  }

  // Passcode entry listeners
  document.getElementById('submit-passcode').addEventListener('click', checkPasscode);
  document.getElementById('passcode-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPasscode();
  });

  // Logout button listener
  document.getElementById('logout-btn').addEventListener('click', () => {
    safeRemoveItem('futureair_session');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('passcode-gate').classList.remove('hidden');
    document.getElementById('passcode-input').value = '';
    document.getElementById('passcode-error').style.display = 'none';
  });

  // Tab Menu Switching
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const targetTab = item.getAttribute('data-target');
      localStorage.setItem('activeTab', targetTab); // Save to localStorage
      switchTab(targetTab);
      
      // Close mobile sidebar after navigation
      toggleMobileSidebar(false);
    });
  });

  // Search input filtering for inventory
  document.getElementById('inventory-search').addEventListener('input', (e) => {
    filterInventoryTable(e.target.value);
  });

  // Search input filtering for contracts/documents archive
  document.getElementById('contracts-search').addEventListener('input', () => {
    const activeBtn = document.querySelector('.doc-filter-btn.active');
    const marker = activeBtn ? activeBtn.dataset.filter : 'all';
    filterContracts(marker);
  });

  // Search input filtering for customers
  document.getElementById('customers-search').addEventListener('input', () => {
    renderCustomersTab();
  });

  // Initialize customer autocomplete on transaction forms
  setupCustomerAutocomplete('dispatch-customer-name', 'dispatch-customer-phone', 'dispatch-customer-address');
  setupCustomerAutocomplete('cash-customer-name', 'cash-customer-phone', 'cash-customer-address');
  setupCustomerAutocomplete('edit-dev-customer-name', 'edit-dev-customer-phone', 'edit-dev-customer-address');

  // Search input filtering for cashflow
  const cashSearchInput = document.getElementById('cashflow-search');
  if (cashSearchInput) {
    cashSearchInput.addEventListener('input', () => {
      renderCashflowTab();
    });
  }

  // Helper wrapper to prevent double submission and show a loading state on buttons
  function handleAsyncSubmit(handler) {
    return async function(e) {
      e.preventDefault();
      const form = e.currentTarget || e.target;
      if (!form) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (!submitBtn) {
        try {
          await handler(e);
        } catch (err) {
          console.error('Async submit failed:', err);
        }
        return;
      }

      if (submitBtn.disabled) return;

      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.65';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;"><i class='bx bx-loader-alt bx-spin' style="font-size:1.1rem;"></i> ⏳ جاري الحفظ والمعالجة...</span>`;

      try {
        await handler(e);
      } catch (err) {
        console.error('Form submission failed:', err);
      } finally {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.innerHTML = originalHtml;
      }
    };
  }

  // Forms submit handlers
  document.getElementById('add-cash-form').addEventListener('submit', handleAsyncSubmit(handleAddCashFlow));
  document.getElementById('add-tech-form').addEventListener('submit', handleAsyncSubmit(handleAddTechnician));
  document.getElementById('pay-supplier-form').addEventListener('submit', handleAsyncSubmit(handlePaySupplierSubmit));
  document.getElementById('collect-payment-form').addEventListener('submit', handleAsyncSubmit(handleCollectPaymentSubmit));
  document.getElementById('add-device-form').addEventListener('submit', handleAsyncSubmit(handleAddDeviceSubmit));
  document.getElementById('collect-trader-form').addEventListener('submit', handleAsyncSubmit(handleCollectTraderSubmit));
  
  // New control forms handlers
  document.getElementById('dispatch-device-form').addEventListener('submit', handleAsyncSubmit(handleDispatchDeviceSubmit));
  document.getElementById('edit-device-form').addEventListener('submit', handleAsyncSubmit(handleEditDeviceSubmit));
  document.getElementById('add-supplier-form').addEventListener('submit', handleAsyncSubmit(handleAddSupplierSubmit));
  document.getElementById('add-supplier-tx-form').addEventListener('submit', handleAsyncSubmit(handleAddSupplierTxSubmit));
  document.getElementById('add-advance-form').addEventListener('submit', handleAsyncSubmit(handleAddAdvanceSubmit));
  document.getElementById('financial-item-form').addEventListener('submit', handleAsyncSubmit(handleFinancialItemSubmit));
  document.getElementById('edit-employee-form').addEventListener('submit', handleAsyncSubmit(handleEditEmployeeSubmit));
  document.getElementById('pay-salary-form').addEventListener('submit', handleAsyncSubmit(handlePaySalarySubmit));
  document.getElementById('add-doc-form').addEventListener('submit', handleAsyncSubmit(handleAddDocSubmit));

  document.getElementById('dev-supplier-select').addEventListener('change', (e) => {
    const select = e.target;
    const value = select.value;
    const selectedText = select.options[select.selectedIndex]?.text || '';
    
    const inputNew = document.getElementById('dev-supplier-new');
    const customNameGroup = document.getElementById('dev-supplier-custom-name-group');

    if (value === 'NEW') {
      inputNew.classList.remove('hidden');
      inputNew.required = true;
    } else {
      inputNew.classList.add('hidden');
      inputNew.required = false;
      document.getElementById('dev-supplier-new').value = '';
    }

    if (selectedText.includes('متنوعين') || selectedText.includes('متنوع')) {
      customNameGroup.classList.remove('hidden');
    } else {
      customNameGroup.classList.add('hidden');
      document.getElementById('dev-supplier-custom-name').value = '';
    }
  });

  document.getElementById('dispatch-trader-select').addEventListener('change', (e) => {
    const select = e.target;
    const selectedText = select.options[select.selectedIndex]?.text || '';
    const customNameGroup = document.getElementById('dispatch-trader-name-group');
    if (selectedText.includes('متنوعين') || selectedText.includes('متنوع')) {
      customNameGroup.classList.remove('hidden');
    } else {
      customNameGroup.classList.add('hidden');
      document.getElementById('dispatch-trader-name-custom').value = '';
    }
  });

  // Salary Month Change handler
  document.getElementById('salary-month-select').addEventListener('change', (e) => {
    calculateAndRenderSalaryReport(e.target.value);
  });
});

function checkPasscode() {
  const pin = document.getElementById('passcode-input').value;
  if (pin === DEFAULT_PASSCODE) {
    safeSetItem('futureair_session', 'authenticated');
    document.getElementById('passcode-error').style.display = 'none';
    showDashboard();
  } else {
    document.getElementById('passcode-error').style.display = 'block';
    document.getElementById('passcode-input').value = '';
    document.getElementById('passcode-input').focus();
  }
}

function showDashboard() {
  document.getElementById('passcode-gate').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  initApp();
}

let refreshDebounceTimer = null;
function debouncedRefreshAllData(immediate = false) {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  if (immediate) {
    refreshAllData();
    return;
  }
  refreshDebounceTimer = setTimeout(() => {
    refreshAllData();
  }, 800);
}

function setupSupabaseRealtime() {
  if (window._supabaseRealtimeSubscribed) return;
  window._supabaseRealtimeSubscribed = true;

  try {
    supabase
      .channel('realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => {
        debouncedRefreshAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_transactions' }, () => {
        debouncedRefreshAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, () => {
        debouncedRefreshAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        debouncedRefreshAllData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        debouncedRefreshAllData();
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription:', err);
  }

  // 🔄 Auto-Refresh whenever user returns to tab / re-opens Mini App
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      debouncedRefreshAllData(true);
    }
  });
  window.addEventListener('focus', () => {
    debouncedRefreshAllData(true);
  });

  // ⚡ Gentle Live Sync: Polls every 15 seconds ONLY while user is actively looking at the screen
  setInterval(() => {
    if (document.visibilityState === 'visible' && !document.hidden) {
      debouncedRefreshAllData();
    }
  }, 15000);
}

// --- INITIALIZE APPLICATION & REFRESH DATA ---
async function initApp() {
  setupSupabaseRealtime();

  // Populate the salary months selector
  populateSalaryMonthDropdown();
  
  // Refresh all cache
  await refreshAllData();

  // Initialize attendance & log date filters safely without blocking initial render
  try {
    const attDateInput = document.getElementById('attendance-date-filter');
    if (attDateInput && !attDateInput.value) {
      const d = new Date();
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - (offset * 60 * 1000));
      attDateInput.value = localDate.toISOString().split('T')[0];
    }

    const dateInput = document.getElementById('cashflow-date-filter');
    if (dateInput) dateInput.value = '';
    const actDateInput = document.getElementById('activities-date-filter');
    if (actDateInput) actDateInput.value = '';
    const invLogDateInput = document.getElementById('inventory-log-date-filter');
    if (invLogDateInput) invLogDateInput.value = '';
  } catch (dateErr) {
    console.warn('Date filter init notice:', dateErr);
  }

  // Load the current active tab (from localStorage if exists, fallback to active menu item)
  const savedTab = localStorage.getItem('activeTab');
  let activeTab = savedTab || 'overview-tab';
  
  // Make sure the correct menu item is visually active
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    if (item.getAttribute('data-target') === activeTab) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 🚀 Render initial active tab immediately so data appears without any delay!
  switchTab(activeTab);

  // Initialize unified Arabic date pickers (dd/mm/yyyy) safely after tab is rendered
  if (typeof initAllDatePickers === 'function') {
    setTimeout(() => {
      initAllDatePickers();
    }, 120);
  }
}

async function refreshAllData() {
  try {
    const [techsRes, supsRes, devsRes, cashRes, finRes] = await Promise.all([
      supabase.from('technicians').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('devices').select('*').order('created_at', { ascending: false }),
      supabase.from('cash_flow').select('*').order('created_at', { ascending: false }),
      supabase.from('bot_sessions').select('*').eq('chat_id', 999999).maybeSingle()
    ]);

    stateCache.technicians = techsRes.data || [];
    stateCache.suppliers = supsRes.data || [];
    stateCache.devices = devsRes.data || [];
    stateCache.cashFlow = cashRes.data || [];
    stateCache.financialData = (finRes.data && finRes.data.data) ? finRes.data.data : { liquidity: {}, receivables: {}, payables: {} };

    // Update Quick Stats everywhere
    updateQuickStats();
  } catch (err) {
    console.error('Failed to load database cache:', err);
  }
}

function renderStatValue(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const val = el.getAttribute('data-value') || '0';
  const isVisible = statsVisibility[elementId];

  if (isVisible) {
    el.innerText = val;
  } else {
    const isQty = elementId.includes('stock') || elementId.includes('installations');
    el.innerText = isQty ? '••• جهاز' : '•••• ج.م';
  }

  // Find the button inside the parent card to update its icon
  const card = el.closest('.stat-card');
  if (card) {
    const icon = card.querySelector('.stat-toggle-btn i');
    if (icon) {
      if (isVisible) {
        icon.className = 'bx bx-show';
      } else {
        icon.className = 'bx bx-hide';
      }
    }
  }
}

function toggleStatCard(elementId) {
  statsVisibility[elementId] = !statsVisibility[elementId];
  renderStatValue(elementId);
}

// Expose globally
window.toggleStatCard = toggleStatCard;

function updateQuickStats() {
  // 1. Split Liquidity: Safe Cash vs Digital Liquidity
  let cashTotal = 0;
  let elecTotal = 0;
  const CASH_KEYWORDS = ['خزنة'];

  if (stateCache.financialData && stateCache.financialData.liquidity &&
      Object.keys(stateCache.financialData.liquidity).length > 0) {
    Object.entries(stateCache.financialData.liquidity).forEach(([name, val]) => {
      const isCash = CASH_KEYWORDS.some(kw => name.includes(kw));
      if (isCash) cashTotal += Number(val || 0);
      else elecTotal += Number(val || 0);
    });
  } else {
    stateCache.cashFlow.forEach(c => {
      const isCash = c.description && c.description.includes('خزنة');
      const amt = Number(c.amount || 0);
      if (c.type === 'إيراد') {
        if (isCash) cashTotal += amt; else elecTotal += amt;
      } else if (c.type === 'مصروف') {
        if (isCash) cashTotal -= amt; else elecTotal -= amt;
      }
    });
  }

  const safeCashVal = document.getElementById('stat-safe-cash');
  if (safeCashVal) {
    safeCashVal.setAttribute('data-value', `${cashTotal.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-safe-cash');
  }

  const digitalCashVal = document.getElementById('stat-digital-cash');
  if (digitalCashVal) {
    digitalCashVal.setAttribute('data-value', `${elecTotal.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-digital-cash');
  }

  // 2. In Stock
  const inStock = stateCache.devices.filter(d => d.status === 'متاح').length;
  const stockVal = document.getElementById('stat-available-stock');
  if (stockVal) {
    stockVal.setAttribute('data-value', `${inStock} جهاز`);
    renderStatValue('stat-available-stock');
  }

  // 4. Customer Receivables
  let custReceivables = 0;
  if (stateCache.financialData && stateCache.financialData.receivables) {
    Object.values(stateCache.financialData.receivables).forEach(val => {
      custReceivables += Number(val || 0);
    });
  } else {
    stateCache.devices.forEach(d => {
      custReceivables += Number(d.amount_remaining || 0);
    });
  }
  const custVal = document.getElementById('stat-customer-receivables');
  if (custVal) {
    custVal.setAttribute('data-value', `${custReceivables.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-customer-receivables');
  }

  // 5. Supplier & External Debts
  let supDebts = 0;
  if (stateCache.financialData && stateCache.financialData.payables) {
    Object.values(stateCache.financialData.payables).forEach(val => {
      supDebts += Number(val || 0);
    });
  } else {
    let totalSupplierPurchased = 0;
    stateCache.devices.forEach(d => {
      totalSupplierPurchased += Number(d.cost_price || 0);
    });
    
    let totalSupplierPaid = 0;
    stateCache.cashFlow.forEach(cf => {
      if (cf.type === 'مصروف' && cf.description.includes('للمورد')) {
        totalSupplierPaid += Number(cf.amount);
      }
    });
    supDebts = Math.max(0, totalSupplierPurchased - totalSupplierPaid);
  }
  const supVal = document.getElementById('stat-supplier-debts');
  if (supVal) {
    supVal.setAttribute('data-value', `${supDebts.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-supplier-debts');
  }
}

// --- TAB ROUTING SYSTEM ---
async function switchTab(tabId) {
  if (!tabId) tabId = 'overview-tab';

  // Haptic feedback & scroll to top (tactics from رحلة عبدالله)
  if (window.Telegram?.WebApp?.HapticFeedback) {
    try { window.Telegram.WebApp.HapticFeedback.selectionChanged(); } catch (e) {}
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Hide all tab pages
  document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
  
  // Show target page
  const targetPage = document.getElementById(tabId);
  if (targetPage) {
    targetPage.classList.add('active');
  } else {
    const defaultPage = document.getElementById('overview-tab');
    if (defaultPage) defaultPage.classList.add('active');
    tabId = 'overview-tab';
  }

  // Update Title
  const menuSpan = document.querySelector(`.menu-item[data-target="${tabId}"] span`);
  if (menuSpan) {
    document.getElementById('current-tab-title').innerText = menuSpan.innerText;
  } else {
    document.getElementById('current-tab-title').innerText = 'لوحة المؤشرات';
  }

  // Load specific data for that page
  switch (tabId) {
    case 'overview-tab':
      renderOverviewTab();
      break;
    case 'inventory-tab':
      renderInventoryTab();
      break;
    case 'suppliers-tab':
      renderSuppliersTab();
      break;
    case 'customers-tab':
      renderCustomersTab();
      break;
    case 'workorders-tab':
      renderWorkOrdersTab();
      break;
    case 'cashflow-tab':
      renderCashflowTab();
      break;
    case 'hr-tab':
      renderHRTab();
      break;
    case 'contracts-tab':
      renderContractsTab();
      break;
    case 'financial-tab':
      renderFinancialTab();
      break;
    case 'profits-tab':
      renderProfitsTab();
      break;
  }
}

function formatDescriptionWithAttachment(desc) {
  if (!desc) return '';
  if (!desc.includes('__ATTACHMENT__')) return desc;
  
  const parts = desc.split('__ATTACHMENT__');
  const cleanText = parts[0].trim();
  const rawUrl = parts[1] ? parts[1].replace(/__$/, '').trim() : '';
  
  if (!rawUrl) return cleanText;
  
  const dt = typeof getDocType === 'function' ? getDocType(rawUrl) : { label: 'مستند' };
  const labelEscaped = (dt && dt.label) ? dt.label.replace(/'/g, "\\'") : 'مستند';
  const buttonHtml = ` <button type="button" class="btn btn-secondary btn-table" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 7px; font-size: 0.75rem; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;" onclick="viewDocument('${rawUrl}', '${labelEscaped}')">📄 عرض المرفق</button>`;
  
  return `${cleanText}${buttonHtml}`;
}

function getIsoTimestampForDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const todayStr = new Date().toLocaleDateString('en-CA');
  if (dateStr === todayStr) {
    return new Date().toISOString();
  }
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return new Date().toISOString();
  const [year, month, day] = parts;
  const now = new Date();
  const d = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
  return d.toISOString();
}

async function uploadAttachmentFile(file, folder = 'cash_flow', marker = '__cash_receipt__') {
  if (!file) return null;
  const rawExt = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fileName = `${folder}/${uniqueId}${marker}.${safeExt}`;

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('contracts')
    .upload(fileName, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: { publicUrl } } = supabase.storage
    .from('contracts')
    .getPublicUrl(fileName);
  return publicUrl;
}


// --- 1. OVERVIEW PAGE RENDERING ---
async function renderOverviewTab() {
  const tbody = document.querySelector('#recent-cash-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">جاري تحميل سجل النشاطات...</td></tr>';

  const dateInput = document.getElementById('activities-date-filter');
  const selectedDate = dateInput ? dateInput.value : '';
  updateDateFilterButtonStyles('activities', selectedDate);

  try {
    // Fetch items from multiple tables in parallel to cover full history without truncation
    const [supsTxRes, advancesRes, attendanceRes] = await Promise.all([
      supabase.from('supplier_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('salary_advances').select('*').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').order('created_at', { ascending: false })
    ]);

    const activities = [];

    // 1. Add Cash Flow (all entries)
    (stateCache.cashFlow || []).forEach(c => {
      activities.push({
        date: new Date(c.date || c.created_at),
        section: 'الخزنة 💵',
        type: c.type === 'إيراد' ? 'إيراد' : 'مصروف',
        typeClass: c.type === 'إيراد' ? 'badge badge-income' : 'badge badge-expense',
        details: formatDescriptionWithAttachment(c.description),
        value: `${c.type === 'إيراد' ? '+' : '-'}${c.amount.toLocaleString()} ج.م`
      });
    });

    // 2. Add Supplier Transactions
    if (supsTxRes.data) {
      supsTxRes.data.forEach(tx => {
        const sup = stateCache.suppliers.find(s => s.id === tx.supplier_id);
        const supName = sup ? sup.name : 'مورد';
        
        let typeText = tx.transaction_type;
        let typeClass = 'badge badge-assigned';
        if (tx.transaction_type === 'شراء') { typeText = 'شراء أجهزة 📦'; typeClass = 'badge badge-expense'; }
        else if (tx.transaction_type === 'دفع') { typeText = 'سداد لمورد 💸'; typeClass = 'badge badge-expense'; }
        else if (tx.transaction_type === 'بيع') { typeText = 'بيع لتاجر 🤝'; typeClass = 'badge badge-income'; }
        else if (tx.transaction_type === 'تحصيل') { typeText = 'تحصيل من تاجر 📥'; typeClass = 'badge badge-income'; }

        let txNotes = tx.notes || '';
        // If notes do not mention compressor, check if linked device has one
        if (tx.device_id && !txNotes.includes('كباس')) {
          const linkedDev = (stateCache.devices || []).find(d => d.id === tx.device_id);
          if (linkedDev) {
            const devOut = typeof getOutdoorSerial === 'function' ? getOutdoorSerial(linkedDev) : '';
            if (devOut) {
              if (txNotes.includes(`سيريال: ${linkedDev.serial_number}`)) {
                txNotes = txNotes.replace(`سيريال: ${linkedDev.serial_number}`, `سيريال فانة: ${linkedDev.serial_number} / كباس: ${devOut}`);
              } else if (txNotes.includes(linkedDev.serial_number)) {
                txNotes = txNotes.replace(linkedDev.serial_number, `فانة: ${linkedDev.serial_number} / كباس: ${devOut}`);
              } else {
                txNotes += ` (كباس: ${devOut})`;
              }
            }
          }
        }

        activities.push({
          date: new Date(tx.created_at),
          section: 'الموردين 🚛',
          type: typeText,
          typeClass: typeClass,
          details: `المورد/التاجر: ${supName} - ${txNotes}`,
          value: `${tx.amount.toLocaleString()} ج.م`
        });
      });
    }

    // 3. Add Salary Advances
    if (advancesRes.data) {
      advancesRes.data.forEach(adv => {
        const tech = stateCache.technicians.find(t => t.id === adv.technician_id);
        const techName = tech ? tech.name : 'فني';
        activities.push({
          date: new Date(adv.created_at),
          section: 'الموظفين 👤',
          type: 'سلفة 💸',
          typeClass: 'badge badge-expense',
          details: `صرف سلفة للفني: ${techName} (${adv.notes || ''})`,
          value: `-${adv.amount.toLocaleString()} ج.م`
        });
      });
    }

    // 4. Add Attendance
    if (attendanceRes.data) {
      attendanceRes.data.forEach(att => {
        const tech = stateCache.technicians.find(t => t.id === att.technician_id);
        const techName = tech ? tech.name : 'فني';
        let statusClass = 'badge badge-assigned';
        if (att.status === 'حاضر') statusClass = 'badge badge-income';
        if (att.status === 'غائب') statusClass = 'badge badge-expense';

        activities.push({
          date: new Date(att.created_at),
          section: 'الحضور 📅',
          type: att.status,
          typeClass: statusClass,
          details: `تسجيل حضور الفني: ${techName} (${att.status})`,
          value: '_'
        });
      });
    }

    // Extract all device IDs that were actually sold to a trader via supplier_transactions
    const traderSoldDeviceIds = new Set(
      (supsTxRes.data || [])
        .filter(tx => tx.transaction_type === 'بيع' && tx.device_id)
        .map(tx => tx.device_id)
    );

    // 5. Add Device Creations/Sales (all devices)
    (stateCache.devices || []).forEach(d => {
      if (d.customer_name === 'مبيعات سابقة غير مسجلة' || (d.serial_number && d.serial_number.startsWith('HIST-'))) return;
      const devOut = typeof getOutdoorSerial === 'function' ? getOutdoorSerial(d) : '';
      const serialLabel = devOut ? `سيريال فانة: ${d.serial_number} / كباس: ${devOut}` : `سيريال: ${d.serial_number}`;

      let details = `إدخال جهاز جديد: ${d.brand} (${d.capacity}) - ${serialLabel}`;
      let typeText = 'جهاز جديد';
      let typeClass = 'badge badge-income';
      let value = '_';
      let actDate = new Date(d.created_at);

      if (d.status === 'تم التركيب' && d.customer_name !== 'مبيعات سابقة غير مسجلة') {
        const isTraderMatch = (stateCache.suppliers || []).some(s => 
          d.customer_name && (d.customer_name === s.name || d.customer_name.startsWith(s.name + ' ('))
        );
        const isTraderSale = traderSoldDeviceIds.has(d.id) || (!d.customer_phone && !d.customer_address && isTraderMatch);

        typeText = isTraderSale ? 'بيع لتاجر 🤝' : 'تركيب لعميل 👤';
        typeClass = isTraderSale ? 'badge badge-expense' : 'badge badge-assigned';
        const partyLabel = isTraderSale ? 'للتاجر' : 'للعميل';
        details = `صرف وبيع جهاز ${d.brand} (${d.capacity}) - ${serialLabel} ${d.customer_name ? `${partyLabel}: ${d.customer_name}` : ''}`;
        value = d.sale_price ? `${d.sale_price.toLocaleString()} ج.م` : '_';
        if (d.installed_at || d.assigned_at) {
          actDate = new Date(d.installed_at || d.assigned_at);
        }
      } else if (d.status === 'جاري التركيب عهدة مع الفني') {
        const tech = stateCache.technicians.find(t => t.id === d.technician_id);
        typeText = 'صرف عهدة 🔧';
        typeClass = 'badge badge-assigned';
        details = `صرف جهاز ${d.brand} (${d.capacity}) كعهدة للفني: ${tech ? tech.name : 'فني'} (${serialLabel})`;
        if (d.assigned_at) {
          actDate = new Date(d.assigned_at);
        }
      }

      activities.push({
        date: actDate,
        section: 'المخزن 📦',
        type: typeText,
        typeClass: typeClass,
        details: details,
        value: value
      });
    });

    // Sort all activities by date descending
    activities.sort((a, b) => b.date - a.date);

    // ⚡ Pre-index all activities ONCE for lightning-fast 0ms instant search
    activities.forEach(act => {
      act._dateStr = act.date ? (act.date.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + act.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })) : '';
      const raw = `${act.section || ''} ${act.type || ''} ${act.details || ''} ${act.value || ''} ${act._dateStr}`.toLowerCase();
      act._rawText = raw;
      act._normText = normalizeSearchText(raw);
    });

    // Save full list globally for the "View Full Log" modal
    window.allActivities = activities;

    // Filter by selected date if specified
    let displayActivities = activities;
    if (selectedDate) {
      displayActivities = activities.filter(act => {
        const actD = new Date(act.date);
        const tzOffset = actD.getTimezoneOffset();
        const localActDate = new Date(actD.getTime() - (tzOffset * 60 * 1000)).toISOString().split('T')[0];
        return localActDate === selectedDate;
      });
    } else {
      displayActivities = activities.slice(0, 30);
    }
    window.currentFilteredActivities = displayActivities;

    // Check if user currently has an active search keyword:
    const activeSearch = document.getElementById('recent-activities-search')?.value;
    if (activeSearch && activeSearch.trim()) {
      filterRecentActivities(activeSearch);
    } else {
      renderRecentActivitiesRows(displayActivities, selectedDate);
    }

  } catch (err) {
    console.error('Failed to load recent activity log:', err);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: var(--danger);">فشل تحميل سجل النشاطات الأخير.</td></tr>';
  }

  // Draw Cashflow Line Chart
  renderOverviewChart();
}

function renderOverviewChart() {
  // Chart removed as per user request
  return;
}

// --- 🔍 RECENT ACTIVITIES HIGH-PERFORMANCE INSTANT SEARCH ENGINE ---
function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '') // remove arabic tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[\u0660-\u0669]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) // convert arabic digits to english
    .replace(/[,\s_/\-.:()]/g, ''); // remove punctuation and spaces for exact number/word matching
}

function renderRecentActivitiesRows(list, selectedDate) {
  const tbody = document.querySelector('#recent-cash-table tbody');
  if (!tbody) return;

  const countEl = document.getElementById('activities-search-count');
  if (countEl) countEl.style.display = 'none';

  if (!list || list.length === 0) {
    const msg = selectedDate 
      ? `لا توجد عمليات أو نشاطات مسجلة في هذا التاريخ (${getFormattedDateLabel(selectedDate)}).`
      : 'لا توجد نشاطات مسجلة حالياً.';
    tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 25px 15px;">${msg}</td></tr>`;
    return;
  }

  // Fast single DOM update
  tbody.innerHTML = list.map(act => {
    const dateStr = act._dateStr || (act.date ? (act.date.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + act.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })) : '');
    return `
      <tr>
        <td><strong>${act.section}</strong></td>
        <td><span class="${act.typeClass}">${act.type}</span></td>
        <td>${act.details}</td>
        <td style="font-weight: 600;">${act.value}</td>
        <td style="color: var(--text-secondary); font-size: 0.8rem;">${dateStr}</td>
      </tr>
    `;
  }).join('');
}

let activitiesSearchDebounceTimer = null;

function handleActivitiesSearchInput(val) {
  const clearBtn = document.getElementById('clear-recent-activities-search');
  if (clearBtn) {
    clearBtn.style.display = (val && val.trim()) ? 'block' : 'none';
  }
  clearTimeout(activitiesSearchDebounceTimer);
  activitiesSearchDebounceTimer = setTimeout(() => {
    filterRecentActivities(val);
  }, 180);
}
window.handleActivitiesSearchInput = handleActivitiesSearchInput;

function filterRecentActivities(query) {
  clearTimeout(activitiesSearchDebounceTimer);
  const clearBtn = document.getElementById('clear-recent-activities-search');
  const countEl = document.getElementById('activities-search-count');
  const tbody = document.querySelector('#recent-cash-table tbody');
  if (!tbody) return;

  const trimmedQuery = (query || '').trim();

  if (clearBtn) {
    clearBtn.style.display = trimmedQuery ? 'block' : 'none';
  }

  // If search query is empty, return to current date-filtered view
  if (!trimmedQuery) {
    if (countEl) countEl.style.display = 'none';
    const dateInput = document.getElementById('activities-date-filter');
    const selectedDate = dateInput ? dateInput.value : '';
    renderRecentActivitiesRows(window.currentFilteredActivities || window.allActivities || [], selectedDate);
    return;
  }

  const terms = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const preparedTerms = terms.map(t => ({
    raw: t,
    norm: normalizeSearchText(t)
  }));

  const allActs = window.allActivities || [];

  const results = allActs.filter(act => {
    if (!act._rawText) {
      act._dateStr = act.date ? (act.date.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + act.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })) : '';
      const raw = `${act.section || ''} ${act.type || ''} ${act.details || ''} ${act.value || ''} ${act._dateStr}`.toLowerCase();
      act._rawText = raw;
      act._normText = normalizeSearchText(raw);
    }

    return preparedTerms.every(pt => 
      act._rawText.includes(pt.raw) || 
      (pt.norm && act._normText.includes(pt.norm))
    );
  });

  if (countEl) {
    if (results.length > 80) {
      countEl.textContent = `(نتائج البحث: ${results.length.toLocaleString('ar-EG')} - عُرض 80)`;
    } else {
      countEl.textContent = `(نتائج البحث: ${results.length.toLocaleString('ar-EG')})`;
    }
    countEl.style.display = 'inline-block';
  }

  if (results.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center" style="color: var(--text-secondary); padding: 35px 15px;">
          🔍 لا توجد عمليات مطابقة لبحثك: "<strong>${trimmedQuery.replace(/[&<>"']/g, '')}</strong>".
        </td>
      </tr>
    `;
    return;
  }

  // Limit rendering to top 80 matches to guarantee instantaneous 60fps responsiveness
  const displayList = results.slice(0, 80);
  tbody.innerHTML = displayList.map(act => `
    <tr>
      <td><strong>${act.section}</strong></td>
      <td><span class="${act.typeClass}">${act.type}</span></td>
      <td>${act.details}</td>
      <td style="font-weight: 600;">${act.value}</td>
      <td style="color: var(--text-secondary); font-size: 0.8rem;">${act._dateStr}</td>
    </tr>
  `).join('');
}
window.filterRecentActivities = filterRecentActivities;

function clearRecentActivitiesSearch() {
  clearTimeout(activitiesSearchDebounceTimer);
  const input = document.getElementById('recent-activities-search');
  if (input) {
    input.value = '';
    filterRecentActivities('');
    input.focus();
  }
}
window.clearRecentActivitiesSearch = clearRecentActivitiesSearch;

// --- 2. INVENTORY PAGE RENDERING ---
function renderInventoryTab() {
  prebuildRecipientCache();
  renderStocktake();
  const tbody = document.querySelector('#inventory-table tbody');
  tbody.innerHTML = '';

  if (stateCache.devices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">لا توجد أجهزة بالمخزن حالياً.</td></tr>';
    return;
  }

  const tbodyHtml = [];

  const getBatchIdHelper = (dev) => getBatchIdFromDevice(dev);

  const sortedDevices = [...stateCache.devices].sort((a, b) => {
    const batchA = getBatchIdHelper(a);
    const batchB = getBatchIdHelper(b);

    if (batchA && batchB && batchA === batchB) {
      return 0; // Group devices belonging to the exact same batch together!
    }

    const aIsAvailable = a.status === 'متاح';
    const bIsAvailable = b.status === 'متاح';
    if (aIsAvailable && !bIsAvailable) return -1;
    if (!aIsAvailable && bIsAvailable) return 1;

    const timeA = new Date(a.installed_at || a.assigned_at || a.created_at || 0).getTime();
    const timeB = new Date(b.installed_at || b.assigned_at || b.created_at || 0).getTime();

    return timeB - timeA;
  });

  for (let i = 0; i < sortedDevices.length; i++) {
    try {
      const d = sortedDevices[i];
      if (!d) continue;
      if (d.serial_number && String(d.serial_number).startsWith('HIST-')) continue;
      if (d.customer_name === 'مبيعات سابقة غير مسجلة') continue;

      // Resolve Technician Name safely
      const techsList = stateCache.technicians || [];
      const tech = techsList.find(t => t.id === d.technician_id);
      const techName = tech ? tech.name : '_';

      // Resolve Supplier Name safely
      const supsList = stateCache.suppliers || [];
      const supplier = supsList.find(s => s.id === d.supplier_id);
      const supplierName = supplier ? supplier.name : '_';

      // Status Badge
      let statusClass = 'badge badge-in_stock';
      let statusText = d.status || 'متاح';
      if (d.customer_name) {
        statusClass = 'badge badge-installed';
        statusText = 'تم البيع';
      } else if (d.status === 'جاري التركيب عهدة مع الفني') {
        statusClass = 'badge badge-assigned';
        statusText = 'جاري التركيب';
      } else if (d.status === 'تم التركيب') {
        const hasContractOrReport = d.contract_images && d.contract_images.some(img => 
          String(img).includes('__sales_contract__') || String(img).includes('__installation_report__')
        );
        if (d.supplier_id && !hasContractOrReport) {
          statusClass = 'badge badge-assigned';
          statusText = 'صرف لتاجر';
        } else {
          statusClass = 'badge badge-installed';
          statusText = 'تم البيع';
        }
      }

      // Customer subtext for Sale Price column
      const salePriceStr = d.sale_price && Number(d.sale_price) > 0 ? `${Number(d.sale_price).toLocaleString()} ج.م` : '—';
      const customerSubText = (d.status !== 'متاح' && d.customer_name) ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${d.customer_name}</div>` : '';

      // Trader / Customer combined text
      let traderCustomerDisplay = '—';
      const validSupName = supplierName && supplierName !== '_' ? supplierName : '';
      const validCustName = d.customer_name ? d.customer_name : '';

      if (d.status === 'متاح') {
        traderCustomerDisplay = validSupName || 'غير محدد';
      } else {
        if (validSupName && validCustName) {
          traderCustomerDisplay = `${validSupName} / ${validCustName}`;
        } else if (validCustName) {
          traderCustomerDisplay = validCustName;
        } else if (validSupName) {
          traderCustomerDisplay = validSupName;
        }
      }

      // Batch Grouping Visual Line & Actions Consolidation with HTML Rowspan
      const curBatch = getBatchIdHelper(d);
      const prevBatch = (i > 0) ? getBatchIdHelper(sortedDevices[i - 1]) : null;
      const nextBatch = (i < sortedDevices.length - 1) ? getBatchIdHelper(sortedDevices[i + 1]) : null;

      const isBatchGroup = curBatch && (prevBatch === curBatch || nextBatch === curBatch);
      const isBatchFirstRow = isBatchGroup && (prevBatch !== curBatch);
      const isBatchLastRow = isBatchGroup && (nextBatch !== curBatch);
      const trStyle = isBatchLastRow ? 'style="border-bottom: 2px solid rgba(168, 85, 247, 0.35);"' : '';

      // Calculate total items in this batch group for rowspan
      let batchGroupSize = 1;
      if (isBatchGroup) {
        let j = i;
        while (j < sortedDevices.length && getBatchIdHelper(sortedDevices[j]) === curBatch) {
          j++;
        }
        batchGroupSize = j - i;
      }

      let cellTraderStyle = '';
      let traderDisplayContent = traderCustomerDisplay;
      let actionsTdHtml = '';

      if (isBatchGroup) {
        const barTop = isBatchFirstRow ? '6px' : '0';
        const barBottom = isBatchLastRow ? '6px' : '0';
        let barRadius = '0';
        if (isBatchFirstRow && isBatchLastRow) {
          barRadius = '4px';
        } else if (isBatchFirstRow) {
          barRadius = '4px 4px 0 0';
        } else if (isBatchLastRow) {
          barRadius = '0 0 4px 4px';
        }

        cellTraderStyle = 'position: relative; padding-right: 14px;';
        const batchBarHtml = `<div style="position: absolute; right: 0; top: ${barTop}; bottom: ${barBottom}; width: 4px; background: #a855f7; border-radius: ${barRadius}; box-shadow: 0 0 6px rgba(168, 85, 247, 0.4);"></div>`;
        traderDisplayContent = batchBarHtml + traderCustomerDisplay;

        if (isBatchFirstRow) {
          const batchImages = getBatchDeviceImages(d);
          const docsHtml = getDeviceDocumentsHtml(batchImages, d.id);
          const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
          const batchBtnHtml = batchInfo ? `
            <button class="btn btn-secondary btn-sm" onclick="openBatchDetailModal('${batchInfo.batchId}')" style="padding: 4px 10px; font-size: 0.78rem; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
              🔗 إذن مجمع (#${batchInfo.batchId})
            </button>` : '';

          const actionsContent = `
            <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; height: 100%;">
              ${docsHtml ? `<div style="display: flex; gap: 3px; flex-wrap: wrap; justify-content: center;">${docsHtml}</div>` : ''}
              <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; align-items: center;">
                ${batchBtnHtml}
                <button type="button" class="btn btn-secondary btn-table btn-edit-device" data-action="edit-device" data-id="${d.id}" onclick="openEditDeviceModal('${d.id}')">✏️ تعديل</button>
                <button class="btn btn-secondary btn-table" style="background:rgba(14,165,233,0.15);border-color:rgba(14,165,233,0.4);color:var(--accent-cyan);" onclick="openAddDocModal('${d.id}')">📎 إضافة مستند</button>
              </div>
            </div>
          `;
          actionsTdHtml = `<td rowspan="${batchGroupSize}" style="vertical-align: middle; text-align: center;">${actionsContent}</td>`;
        } else {
          actionsTdHtml = '';
        }
      } else {
        const docsHtml = getDeviceDocumentsHtml(d.contract_images, d.id);
        const actionsContent = `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${docsHtml ? `<div style="display: flex; gap: 3px; flex-wrap: wrap;">${docsHtml}</div>` : ''}
            <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 2px;">
              <button type="button" class="btn btn-secondary btn-table btn-edit-device" data-action="edit-device" data-id="${d.id}" onclick="openEditDeviceModal('${d.id}')">✏️ تعديل</button>
              <button class="btn btn-secondary btn-table" style="background:rgba(14,165,233,0.15);border-color:rgba(14,165,233,0.4);color:var(--accent-cyan);" onclick="openAddDocModal('${d.id}')">📎 إضافة مستند</button>
            </div>
          </div>
        `;
        actionsTdHtml = `<td>${actionsContent}</td>`;
      }

      const outdoorSerial = getOutdoorSerial(d);
      const serialCellHtml = renderDeviceSerialsCell(d);

      const intakeDate = d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : null;
      const dispatchDate = (d.status !== 'متاح' && (d.installed_at || d.assigned_at)) 
        ? new Date(d.installed_at || d.assigned_at).toLocaleDateString('en-GB') 
        : null;

      let dateCellHtml = '<div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem;">';
      if (intakeDate) {
        dateCellHtml += `<div style="color: #f1c40f; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;" title="تاريخ الاستلام والتوريد للمخزن">📥 <span>${intakeDate}</span></div>`;
      }
      if (dispatchDate) {
        dateCellHtml += `<div style="color: #38bdf8; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;" title="تاريخ الصرف والتركيب">📦 <span>${dispatchDate}</span></div>`;
      } else if (d.status === 'متاح') {
        dateCellHtml += `<div style="color: var(--text-secondary); font-size: 0.72rem;">(بالمخزن)</div>`;
      }
      dateCellHtml += '</div>';

      tbodyHtml.push(`
        <tr ${trStyle} data-brand="${d.brand || ''}" data-capacity="${d.capacity || ''}" data-serial="${d.serial_number || ''}" data-outdoor-serial="${outdoorSerial}" data-customer="${validCustName}" data-supplier="${validSupName}" ${isBatchGroup ? `data-batch-group="${curBatch}"` : ''}>
          <td><strong>${d.brand || 'تكييف'}</strong></td>
          <td>${d.capacity || '—'}</td>
          <td>${serialCellHtml}</td>
          <td>
            <div style="font-weight: 600;">${(Number(d.cost_price) || 0).toLocaleString()} ج.م</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${supplierName}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${salePriceStr}</div>
            ${customerSubText}
          </td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>${techName}</td>
          <td style="${cellTraderStyle}">${traderDisplayContent}</td>
          <td>${dateCellHtml}</td>
          ${actionsTdHtml}
        </tr>
      `);
    } catch (rowErr) {
      console.error('Error rendering individual device row:', rowErr, sortedDevices[i]);
    }
  }

  tbody.innerHTML = tbodyHtml.join('');

  // Re-apply search filter if active
  const searchInput = document.getElementById('inventory-search');
  if (searchInput && searchInput.value.trim()) {
    filterInventoryTable(searchInput.value);
  }

  // Compile and Render Inventory Log Timeline
  const logTbody = document.querySelector('#inventory-log-table tbody');
  if (logTbody) {
    logTbody.innerHTML = '';
    const events = [];

    stateCache.devices.forEach(d => {
      if (d.serial_number && d.serial_number.startsWith('HIST-')) return;
      if (d.customer_name === 'مبيعات سابقة غير مسجلة') return;

      const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);

      // 1. Device Addition
      if (d.created_at) {
        const devImages = (d.contract_images && d.contract_images.length > 0) ? d.contract_images : getBatchDeviceImages(d);
        const intakeImages = devImages.filter(isIntakeDoc);
        let attachmentHtml = '_';
        if (intakeImages.length > 0) {
          attachmentHtml = `<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:4px;">${getDeviceDocumentsHtml(intakeImages, d.id, false)}</div>`;
        }

        const supplier = stateCache.suppliers.find(s => s.id === d.supplier_id);
        const supplierName = supplier ? supplier.name : '';
        let detailText = '';
        if (supplierName) {
          detailText = `المورد: <strong>${supplierName}</strong>`;
        }
        if (d.cost_price !== undefined && d.cost_price !== null && d.cost_price !== '') {
          const costVal = Number(d.cost_price) || 0;
          detailText += (detailText ? ' - ' : '') + `تكلفة الشراء: ${costVal.toLocaleString()} ج.م`;
        }
        if (!detailText) {
          detailText = 'إدخال جديد للمخزن';
        }

        events.push({
          date: new Date(d.created_at),
          type: 'إدخال للمخزن 📥',
          typeClass: 'badge badge-income',
          deviceInfo: `${d.brand} (${d.capacity}) - سيريال: ${d.serial_number}`,
          rawDetails: detailText,
          batchInfo: batchInfo,
          attachment: attachmentHtml
        });
      }

      // 2. Dispatch to Tech — only show if a technician was actually assigned
      if (d.technician_id && d.assigned_at && (d.status === 'جاري التركيب عهدة مع الفني' || d.status === 'تم التركيب')) {
        const tech = stateCache.technicians.find(t => t.id === d.technician_id);
        const techName = tech ? tech.name : 'فني';
        events.push({
          date: new Date(d.assigned_at),
          type: 'صرف عهدة 🔧',
          typeClass: 'badge badge-assigned',
          deviceInfo: `${d.brand} (${d.capacity}) - سيريال: ${d.serial_number}`,
          rawDetails: `الفني المسؤول: <strong>${techName}</strong>`,
          batchInfo: batchInfo,
          attachment: '_'
        });
      }

      // 3. Final Sale/Installation
      if (d.status === 'تم التركيب' && d.customer_name !== 'مبيعات سابقة غير مسجلة') {
        const devImages = (d.contract_images && d.contract_images.length > 0) ? d.contract_images : getBatchDeviceImages(d);
        const dispatchImages = devImages.filter(isDispatchDoc);
        let attachmentHtml = '_';
        if (dispatchImages.length > 0) {
          attachmentHtml = `<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:4px;">${getDeviceDocumentsHtml(dispatchImages, d.id, false)}</div>`;
        }

        const hasContractOrReport = d.contract_images && d.contract_images.some(img => 
          img.includes('__sales_contract__') || img.includes('__installation_report__')
        );
        let typeText = 'تركيب لعميل 👤';
        if (!d.customer_name && d.supplier_id && !hasContractOrReport) {
          typeText = 'صرف لتاجر 🤝';
        }

        const trader = stateCache.suppliers.find(s => s.id === d.supplier_id);
        const traderName = trader ? trader.name : '';
        const custName = d.customer_name || '';

        let detailText = '';
        if (traderName && custName) {
          detailText = `المورد: <strong>${traderName}</strong> | العميل المستلم: <strong>${custName}</strong> - سعر البيع: ${Number(d.sale_price || 0).toLocaleString()} ج.م`;
        } else if (custName) {
          detailText = `العميل المستلم: <strong>${custName}</strong> - سعر البيع: ${Number(d.sale_price || 0).toLocaleString()} ج.م`;
        } else if (traderName) {
          detailText = `التاجر المستلم: <strong>${traderName}</strong> - سعر البيع: ${Number(d.sale_price || 0).toLocaleString()} ج.م`;
        } else {
          detailText = `سعر البيع: ${Number(d.sale_price || 0).toLocaleString()} ج.م`;
        }

        events.push({
          date: new Date(d.installed_at || d.assigned_at || d.created_at),
          type: typeText,
          typeClass: 'badge badge-expense',
          deviceInfo: `${d.brand} (${d.capacity}) - سيريال: ${d.serial_number}`,
          rawDetails: detailText,
          batchInfo: batchInfo,
          attachment: attachmentHtml
        });
      }
    });

    // Sort events by date descending, keeping same batch items adjacent
    events.sort((a, b) => {
      const diff = b.date - a.date;
      if (Math.abs(diff) < 300000) {
        const batchA = a.batchInfo ? a.batchInfo.batchId : '';
        const batchB = b.batchInfo ? b.batchInfo.batchId : '';
        if (batchA && batchB && batchA === batchB) return 0;
      }
      return diff;
    });

    window.allInventoryLogEvents = events;
    const logSearchInput = document.getElementById('inventory-log-search');
    const currentQuery = logSearchInput ? logSearchInput.value.trim() : '';
    renderInventoryLogEvents(currentQuery);
  }

  // Restore active sub-tab view (Movements vs Devices)
  initInventorySubTab();
}

function renderInventoryLogEvents(query = '') {
  const logTbody = document.querySelector('#inventory-log-table tbody');
  if (!logTbody) return;

  const events = window.allInventoryLogEvents || [];
  const dateInput = document.getElementById('inventory-log-date-filter');
  const selectedDate = dateInput ? dateInput.value : '';
  updateDateFilterButtonStyles('inventory-log', selectedDate);

  const q = (query || '').toLowerCase().trim().replace(/كار/g, 'kar');

  let displayEvents = events;

  // 1. Filter by selected date if any
  if (selectedDate) {
    displayEvents = events.filter(evt => {
      const evtD = new Date(evt.date);
      const tzOffset = evtD.getTimezoneOffset();
      const localEvtDate = new Date(evtD.getTime() - (tzOffset * 60 * 1000)).toISOString().split('T')[0];
      return localEvtDate === selectedDate;
    });
  }

  // 2. Filter by search query if any
  if (q) {
    displayEvents = displayEvents.filter(evt => {
      const searchBlob = `${evt.deviceInfo} ${evt.rawDetails} ${evt.type} ${evt.batchInfo?.batchId || ''} ${evt.batchInfo?.totalAmount || ''}`.toLowerCase().replace(/كار/g, 'kar');
      return searchBlob.includes(q);
    });
  } else if (!selectedDate) {
    displayEvents = displayEvents.slice(0, 50);
  }

  if (displayEvents.length === 0) {
    const emptyMsg = q 
      ? `🔍 لا توجد تحركات مطابقة لكلمة البحث: <strong>"${query}"</strong> في تاريخ (${getFormattedDateLabel(selectedDate)})`
      : `لا توجد تحركات أو تغييرات مسجلة بالمخزن في تاريخ (${getFormattedDateLabel(selectedDate)}).`;
    logTbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-secondary);">${emptyMsg}</td></tr>`;
    return;
  }

  const logRowsHtml = [];

  for (let i = 0; i < displayEvents.length; i++) {
    const evt = displayEvents[i];
    const dateStr = evt.date.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + evt.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const batchId = evt.batchInfo ? evt.batchInfo.batchId : null;
    const prevBatch = (i > 0 && displayEvents[i - 1].batchInfo) ? displayEvents[i - 1].batchInfo.batchId : null;
    const nextBatch = (i < displayEvents.length - 1 && displayEvents[i + 1].batchInfo) ? displayEvents[i + 1].batchInfo.batchId : null;

    const isBatchGroup = batchId && (prevBatch === batchId || nextBatch === batchId);
    const isBatchFirstRow = isBatchGroup && (prevBatch !== batchId);
    const isBatchLastRow = isBatchGroup && (nextBatch !== batchId);

    let logBatchSize = 1;
    if (isBatchGroup) {
      let k = i;
      while (k < displayEvents.length && displayEvents[k].batchInfo && displayEvents[k].batchInfo.batchId === batchId) {
        k++;
      }
      logBatchSize = k - i;
    }

    let detailsHtml = evt.rawDetails || '';
    let detailsTdStyle = '';
    let attachmentTdHtml = '';

    let receiptNumHtml = '<span style="color: var(--text-secondary);">-</span>';
    if (evt.batchInfo && evt.batchInfo.batchId) {
      receiptNumHtml = `<button class="badge" onclick="openBatchDetailModal('${evt.batchInfo.batchId}')" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.45); padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(168, 85, 247, 0.15);">🏷️ #${evt.batchInfo.batchId}</button>`;
    } else if (evt.attachment && evt.attachment !== '_') {
      receiptNumHtml = `<span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;">إذن فردي 📄</span>`;
    }

    if (isBatchGroup) {
      const barTop = isBatchFirstRow ? '6px' : '0';
      const barBottom = isBatchLastRow ? '6px' : '0';
      let barRadius = '0';
      if (isBatchFirstRow && isBatchLastRow) {
        barRadius = '4px';
      } else if (isBatchFirstRow) {
        barRadius = '4px 4px 0 0';
      } else if (isBatchLastRow) {
        barRadius = '0 0 4px 4px';
      }

      detailsTdStyle = 'position: relative; padding-right: 14px;';
      const batchBarHtml = `<div style="position: absolute; right: 0; top: ${barTop}; bottom: ${barBottom}; width: 4px; background: #a855f7; border-radius: ${barRadius}; box-shadow: 0 0 6px rgba(168, 85, 247, 0.4);"></div>`;

      if (isBatchLastRow && evt.batchInfo) {
        const b = evt.batchInfo;
        detailsHtml += `
          <div style="margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openBatchDetailModal('${b.batchId}')" style="padding: 3px 12px; font-size: 0.8rem; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(168, 85, 247, 0.2);">
              <i class='bx bx-link' style="font-size: 1rem;"></i> 🔗 إذن مجمع (#${b.batchId}) - إجمالي: ${b.totalAmount} ج.م (${b.count} أجهزة)
            </button>
          </div>
        `;
      }

      detailsHtml = batchBarHtml + detailsHtml;

      if (isBatchFirstRow) {
        attachmentTdHtml = `<td rowspan="${logBatchSize}" style="vertical-align: middle; text-align: center; white-space: nowrap;">${evt.attachment}</td>`;
      } else {
        attachmentTdHtml = '';
      }
    } else {
      if (evt.batchInfo) {
        const b = evt.batchInfo;
        detailsHtml += `
          <div style="margin-top: 4px;">
            <button class="btn btn-secondary btn-sm" onclick="openBatchDetailModal('${b.batchId}')" style="padding: 2px 10px; font-size: 0.78rem; background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px;">
              📦 إذن مجمع (#${b.batchId}) - إجمالي العملية: ${b.totalAmount} ج.م (${b.count} أجهزة)
            </button>
          </div>
        `;
      }
      attachmentTdHtml = `<td style="white-space: nowrap;">${evt.attachment}</td>`;
    }

    const logTrStyle = isBatchLastRow ? 'style="border-bottom: 2px solid rgba(168, 85, 247, 0.35);"' : '';

    logRowsHtml.push(`
      <tr ${logTrStyle} ${isBatchGroup ? `data-batch-group="${batchId}"` : ''}>
        <td><span style="color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</span></td>
        <td><span class="${evt.typeClass}">${evt.type}</span></td>
        <td>${receiptNumHtml}</td>
        <td><strong>${evt.deviceInfo}</strong></td>
        <td style="${detailsTdStyle}">${detailsHtml}</td>
        ${attachmentTdHtml}
      </tr>
    `);
  }

  logTbody.innerHTML = logRowsHtml.join('');
}

function filterInventoryLogTable(query) {
  renderInventoryLogEvents(query);
}
window.filterInventoryLogTable = filterInventoryLogTable;
window.renderInventoryLogEvents = renderInventoryLogEvents;

// --- BATCH TRANSACTION DETAILS MODAL & HELPER ---
function getBatchInfoFromText(text, devId = null) {
  if (!text && devId && stateCache.supplier_transactions) {
    const tx = stateCache.supplier_transactions.find(t => t.device_id === devId && t.transaction_type === 'شراء' && t.notes && t.notes.includes('#REC-'));
    if (tx) text = tx.notes;
  }
  if (!text || typeof text !== 'string') {
    if (devId && stateCache.supplier_transactions) {
      const tx = stateCache.supplier_transactions.find(t => t.device_id === devId && t.transaction_type === 'شراء' && t.notes && t.notes.includes('#REC-'));
      if (tx) text = tx.notes;
      else return null;
    } else return null;
  }
  
  const match = text.match(/#(REC-\d+|DISP-\d+)/);
  if (!match) return null;

  const batchId = match[1];

  const batchDevs = (stateCache.devices || []).filter(d => {
    const dTxt = `${d.installment_notes || ''} ${d.notes || ''}`;
    if (dTxt.includes(batchId)) return true;
    const tx = (stateCache.supplier_transactions || []).find(t => t.device_id === d.id && t.transaction_type === 'شراء' && t.notes && t.notes.includes(batchId));
    return !!tx;
  });

  const realCount = batchDevs.length > 0 ? batchDevs.length : 1;
  let realTotal = 0;
  if (batchDevs.length > 0) {
    const isDisp = batchId.startsWith('DISP-');
    batchDevs.forEach(bd => {
      realTotal += isDisp ? Number(bd.sale_price || 0) : Number(bd.cost_price || 0);
    });
  }

  let fallbackTotalStr = '';
  const textTotalMatch = text.match(/إجمالي(?: الإذن| الصرف)?: ([\d,]+) ج\.م/);
  if (textTotalMatch) fallbackTotalStr = textTotalMatch[1];

  return {
    batchId: batchId,
    count: realCount,
    totalAmount: realTotal > 0 ? realTotal.toLocaleString() : (fallbackTotalStr || '0')
  };
}

function openBatchDetailModal(batchId) {
  document.getElementById('batch-modal-id').innerText = `#${batchId}`;

  // Find all devices matching this batchId (via notes, installment_notes, or supplier_transactions)
  const matchingDevices = (stateCache.devices || []).filter(d => {
    const textStr = `${d.notes || ''} ${d.customer_name || ''} ${d.installment_notes || ''}`;
    if (textStr.includes(batchId)) return true;
    const tx = (stateCache.supplier_transactions || []).find(t => t.device_id === d.id && t.transaction_type === 'شراء' && t.notes && t.notes.includes(batchId));
    return !!tx;
  });

  document.getElementById('batch-modal-count').innerText = `${matchingDevices.length} أجهزة`;

  let totalCost = 0;
  let totalSale = 0;
  matchingDevices.forEach(d => {
    totalCost += Number(d.cost_price || 0);
    totalSale += Number(d.sale_price || 0);
  });

  const displayTotal = totalSale > 0 ? totalSale : totalCost;
  document.getElementById('batch-modal-total').innerText = `${displayTotal.toLocaleString()} ج.م`;

  const tbody = document.querySelector('#batch-detail-table tbody');
  tbody.innerHTML = '';

  if (matchingDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-secondary);">لا توجد تفاصيل أجهزة مسجلة لهذا الإذن المجمع.</td></tr>';
  } else {
    // Gather all document images across all devices in this batch
    const batchAllImages = [];
    matchingDevices.forEach(md => {
      (md.contract_images || []).forEach(img => {
        if (!batchAllImages.includes(img)) batchAllImages.push(img);
      });
    });

    const rows = matchingDevices.map((d, idx) => {
      const supplier = (stateCache.suppliers || []).find(s => s.id === d.supplier_id);
      const supplierName = supplier ? supplier.name : (d.supplier_name || 'غير محدد');
      const partyStr = d.status === 'متاح' ? `المورد: <strong>${supplierName}</strong>` : `العميل/التاجر المستلم: <strong>${d.customer_name || '_'}</strong>`;
      const priceStr = d.status === 'متاح' 
        ? `<span style="color:var(--warning);">تكلفة: ${d.cost_price ? Number(d.cost_price).toLocaleString() + ' ج.م' : '—'}</span>`
        : `<span style="color:var(--success);">سعر البيع: ${d.sale_price ? Number(d.sale_price).toLocaleString() + ' ج.م' : '—'}</span>`;

      const docsHtml = getDeviceDocumentsHtml(batchAllImages, d.id, false);

      const isLastRow = idx === matchingDevices.length - 1;
      const attachCellStyle = isLastRow ? '' : 'border-bottom: none;';
      const cellDocs = isLastRow ? docsHtml : '';

      return `
        <tr>
          <td style="font-size: 0.8rem; color: var(--text-secondary); vertical-align: middle;">${idx + 1}</td>
          <td style="font-size: 0.88rem; font-weight: 700; vertical-align: middle;">${d.brand} (${d.capacity})</td>
          <td style="vertical-align: middle;">${renderDeviceSerialsCell(d)}</td>
          <td style="font-size: 0.88rem; vertical-align: middle;">${partyStr}</td>
          <td style="font-size: 0.88rem; font-weight: 600; white-space: nowrap; vertical-align: middle;">${priceStr}</td>
          <td style="${attachCellStyle} vertical-align: middle;"><div style="display: flex; gap: 4px; flex-wrap: wrap;">${cellDocs || (isLastRow ? '<span style="color:var(--text-secondary); font-size:0.8rem;">لا توجد مرفقات</span>' : '')}</div></td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;
  }

  openModal('batch-detail-modal');
}
window.openBatchDetailModal = openBatchDetailModal;

// ⏪ RESTORE BACKUP SNAPSHOT FUNCTION
async function restoreBackupSnapshot() {
  const confirmed = confirm('⚠️ هل أنت متأكد من رغبتك في استعادة نقطة الحفظ الفعلية (وضع اليوم بكل الأجهزة والمرفقات والأسعار)؟\n\nسيعود السيستم فوراً للوضع الحالي 100% بدون فقدان أي بيانات أو صور.');
  if (!confirmed) return;

  try {
    alert('⏳ جاري جلب وتنشيط كافة البيانات والمرفقات من نقطة الحفظ...');
    await initApp();
    alert('✅ تم استعادة الوضع الحالي وإعادة مزامنة كافة الأجهزة والمرفقات بنجاح!');
  } catch (err) {
    alert('❌ حدث خطأ أثناء الاستعادة: ' + err.message);
  }
}
window.restoreBackupSnapshot = restoreBackupSnapshot;

// ⏪ REVERSE DEVICE DISPATCH — undoes a sale/dispatch atomically in one click
async function reverseDeviceDispatch(deviceId, deviceLabel) {
  const confirmed = confirm(
    `⏪ استرداد العملية بالكامل\n\n` +
    `الجهاز: ${deviceLabel}\n\n` +
    `سيتم تلقائياً:\n` +
    `✅ إرجاع الجهاز للمخزن كـ "متاح"\n` +
    `✅ حذف حركة الخزنة المرتبطة بالبيع\n` +
    `✅ حذف معاملة كشف الحساب المرتبطة\n\n` +
    `هل أنت متأكد من التراجع؟`
  );
  if (!confirmed) return;

  try {
    // Step 1: Reset device back to available
    const { error: devErr } = await supabase
      .from('devices')
      .update({
        status: 'متاح',
        supplier_id: null,
        technician_id: null,
        customer_name: null,
        customer_phone: null,
        customer_address: null,
        sale_price: 0,
        amount_paid: 0,
        amount_remaining: 0,
        assigned_at: null,
        installed_at: null,
        contract_images: []
      })
      .eq('id', deviceId);
    if (devErr) throw new Error('فشل إرجاع الجهاز: ' + devErr.message);

    // Step 2: Delete cash_flow entries linked to this device (by device serial in description)
    const dev = stateCache.devices.find(d => d.id === deviceId);
    if (dev) {
      await supabase
        .from('cash_flow')
        .delete()
        .ilike('description', `%${dev.serial_number}%`);
    }

    // Step 3: Delete supplier_transactions linked to this device_id
    await supabase
      .from('supplier_transactions')
      .delete()
      .eq('device_id', deviceId);

    // Refresh everything
    await initApp();
    alert('✅ تم استرداد العملية بالكامل بنجاح!\nالجهاز رجع للمخزن والحسابات اتعدلت تلقائياً.');
  } catch (err) {
    alert('❌ فشل الاسترداد: ' + err.message);
  }
}
window.reverseDeviceDispatch = reverseDeviceDispatch;

// 💳 AUTO-UPDATE LIQUIDITY — increments the correct Financial Center account when payment received
async function autoUpdateLiquidity(paymentMethod, amount) {
  try {
    // Financial data is stored in bot_sessions with chat_id=999999
    const { data: rows, error } = await supabase
      .from('bot_sessions')
      .select('*')
      .eq('chat_id', 999999)
      .maybeSingle();
    if (error || !rows || !rows.data) return;

    const finData = rows.data;
    const liquidity = finData.liquidity || {};

    const cleanMethod = String(paymentMethod || '').trim();
    const lower = cleanMethod.toLowerCase();

    let finalKey = null;
    if (lower.includes('محفظة')) {
      finalKey = 'محفظة بنك مصر';
    } else if (lower.includes('بيزنيس') || lower.includes('شركة') || lower.includes('شركات')) {
      finalKey = 'حساب بنك مصر بيزنيس (الشركة)';
    } else if (lower.includes('إنستا') || lower.includes('انستا') || lower.includes('بنك') || lower.includes('تحويل') || lower.includes('شخصي') || lower.includes('insta')) {
      finalKey = 'حساب بنك مصر شخصي (والدي)';
    } else if (lower.includes('فودافون')) {
      finalKey = 'فودافون كاش';
    } else {
      finalKey = 'خزنة الشركة';
    }

    liquidity[finalKey] = Number(liquidity[finalKey] || 0) + amount;

    // Save back to bot_sessions
    finData.liquidity = liquidity;
    await supabase
      .from('bot_sessions')
      .update({ data: finData, updated_at: new Date().toISOString() })
      .eq('chat_id', 999999);

  } catch (e) {
    console.warn('autoUpdateLiquidity failed silently:', e.message);
  }
}

// 🔀 Toggle split payment second row
function toggleSplitPayment(section) {
  const el = document.getElementById(`dispatch-${section}-split-section`);
  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
    // Clear values when hiding
    const paid2 = document.getElementById(`dispatch-${section}-paid2`);
    if (paid2) paid2.value = '';
  }
}
window.toggleSplitPayment = toggleSplitPayment;

function filterInventoryTable(query) {
  const rows = document.querySelectorAll('#inventory-table tbody tr');
  const q = query.trim().toLowerCase().replace(/كار/g, 'kar');
  
  rows.forEach(row => {
    const brand = (row.getAttribute('data-brand') || '').toLowerCase().replace(/كار/g, 'kar');
    const capacity = (row.getAttribute('data-capacity') || '').toLowerCase().replace(/كار/g, 'kar');
    const serial = (row.getAttribute('data-serial') || '').toLowerCase().replace(/كار/g, 'kar');
    const outdoorSerial = (row.getAttribute('data-outdoor-serial') || '').toLowerCase().replace(/كار/g, 'kar');
    const customer = (row.getAttribute('data-customer') || '').toLowerCase().replace(/كار/g, 'kar');
    const supplier = (row.getAttribute('data-supplier') || '').toLowerCase().replace(/كار/g, 'kar');
    const rowText = row.textContent.toLowerCase().replace(/كار/g, 'kar');
    
    if (
      brand.includes(q) || 
      capacity.includes(q) || 
      serial.includes(q) || 
      outdoorSerial.includes(q) || 
      customer.includes(q) || 
      supplier.includes(q) ||
      rowText.includes(q)
    ) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  // Also filter inventory log timeline rows
  const logRows = document.querySelectorAll('#inventory-log-table tbody tr');
  logRows.forEach(row => {
    const text = row.textContent.toLowerCase().replace(/كار/g, 'kar');
    if (!q || text.includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// --- 3. SUPPLIERS PAGE RENDERING ---
async function renderSuppliersTab() {
  const container = document.getElementById('suppliers-list');
  container.innerHTML = '';

  if (stateCache.suppliers.length === 0) {
    container.innerHTML = '<p class="info-text">لا يوجد موردين أو تجار مسجلين بالنظام.</p>';
    return;
  }

  // Load all supplier transactions in a single batch query (Optimization)
  const { data: allTxs } = await supabase
    .from('supplier_transactions')
    .select('supplier_id, transaction_type, amount');

  for (const sup of stateCache.suppliers) {
    // Filter in-memory
    const txs = allTxs ? allTxs.filter(t => t.supplier_id === sup.id) : [];

    let purchased = 0;
    let sold = 0;
    let paid = 0;
    let collected = 0;

    txs.forEach(t => {
      if (t.transaction_type === 'شراء') purchased += Number(t.amount);
      if (t.transaction_type === 'بيع') sold += Number(t.amount);
      if (t.transaction_type === 'دفع') paid += Number(t.amount);
      if (t.transaction_type === 'تحصيل') collected += Number(t.amount);
    });

    // Net balance calculation: We owe them (Purchased + Collected) - We paid or they bought (Paid + Sold)
    const netBalance = (purchased + collected) - (paid + sold);

    let balanceHtml = '';
    const formulaTooltip = 'معادلة الحساب = (مشترياتنا منه + محصل منه) - (مسدد له + مبيعاتنا له)';
    if (netBalance > 0) {
      balanceHtml = `<p style="color: var(--danger); display: flex; align-items: center; gap: 6px;">
        المتبقي له علينا: <strong>${netBalance.toLocaleString()} ج.م</strong>
        <span class="tooltip-icon" title="${formulaTooltip}" style="cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;" onclick="alert('${formulaTooltip}')">ℹ</span>
      </p>`;
    } else if (netBalance < 0) {
      balanceHtml = `<p style="color: var(--success); display: flex; align-items: center; gap: 6px;">
        المتبقي لنا عليه: <strong>${Math.abs(netBalance).toLocaleString()} ج.م</strong>
        <span class="tooltip-icon" title="${formulaTooltip}" style="cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;" onclick="alert('${formulaTooltip}')">ℹ</span>
      </p>`;
    } else {
      balanceHtml = `<p style="color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
        الحساب متزن: <strong>0 ج.م</strong>
        <span class="tooltip-icon" title="${formulaTooltip}" style="cursor: pointer; background: rgba(255,255,255,0.1); border-radius: 50%; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;" onclick="alert('${formulaTooltip}')">ℹ</span>
      </p>`;
    }

    container.innerHTML += `
      <div class="supplier-card" style="border: 1px solid rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; background: rgba(255,255,255,0.02); margin-bottom: 15px;">
        <h4 style="margin: 0 0 10px 0;">🤝 ${sup.name}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem; margin-bottom: 10px;">
          <div>مشترياتنا منه: <strong>${purchased.toLocaleString()} ج.م</strong></div>
          <div>مبيعاتنا له: <strong>${sold.toLocaleString()} ج.م</strong></div>
          <div>مسدد له: <strong>${paid.toLocaleString()} ج.م</strong></div>
          <div>محصل منه: <strong>${collected.toLocaleString()} ج.م</strong></div>
        </div>
        ${balanceHtml}
        <div class="actions" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-table" onclick="openPaySupplierModal('${sup.id}', '${sup.name}')">💸 سداد دفعة له</button>
          <button class="btn btn-primary btn-table" onclick="openCollectTraderModal('${sup.id}', '${sup.name}', ${Math.max(0, -netBalance)})">📥 تحصيل دفعة منه</button>
          <button class="btn btn-secondary btn-table" onclick="openAddSupplierTxModal('${sup.id}', '${sup.name}')">➕ حركة حساب</button>
          <button class="btn btn-secondary btn-table" style="background: rgba(255,255,255,0.05);" onclick="openSupplierStatement('${sup.id}', '${sup.name}')">🧾 كشف حساب تفصيلي</button>
        </div>
      </div>
    `;
  }

  // Render recent supplier transactions log at the bottom
  const txTableBody = document.querySelector('#recent-suppliers-tx-table tbody');
  if (txTableBody) {
    txTableBody.innerHTML = '<tr><td colspan="5" class="text-center">جاري تحميل سجل العمليات الأخير...</td></tr>';
    try {
      const { data: recentTxs, error } = await supabase
        .from('supplier_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      txTableBody.innerHTML = '';
      if (!recentTxs || recentTxs.length === 0) {
        txTableBody.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد حركات مسجلة مؤخراً.</td></tr>';
      } else {
        recentTxs.forEach(tx => {
          const sup = stateCache.suppliers.find(s => s.id === tx.supplier_id);
          const supName = sup ? sup.name : 'مورد/تاجر غير معروف';
          
          let typeText = tx.transaction_type;
          let typeClass = 'badge badge-assigned';
          if (tx.transaction_type === 'شراء') { typeText = 'شراء أجهزة 📦'; typeClass = 'badge badge-expense'; }
          else if (tx.transaction_type === 'دفع') { typeText = 'سداد لمورد 💸'; typeClass = 'badge badge-expense'; }
          else if (tx.transaction_type === 'بيع') { typeText = 'بيع لتاجر 🤝'; typeClass = 'badge badge-income'; }
          else if (tx.transaction_type === 'تحصيل') { typeText = 'تحصيل من تاجر 📥'; typeClass = 'badge badge-income'; }

          const dateObj = new Date(tx.created_at);
          const dateStr = dateObj.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

          txTableBody.innerHTML += `
            <tr>
              <td><strong>${supName}</strong></td>
              <td><span class="${typeClass}">${typeText}</span></td>
              <td style="font-weight: 600;">${tx.amount.toLocaleString()} ج.م</td>
              <td>${tx.notes || '_'}</td>
              <td style="color: var(--text-secondary); font-size: 0.8rem;">${dateStr}</td>
            </tr>
          `;
        });
      }
    } catch (err) {
      console.error('Failed to load recent supplier tx log:', err);
      txTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: var(--danger);">فشل تحميل سجل العمليات.</td></tr>';
    }
  }
}

// --- 4. CUSTOMERS PAGE RENDERING ---
function renderCustomersTab() {
  const tbody = document.querySelector('#customers-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchQuery = document.getElementById('customers-search')?.value.trim().toLowerCase() || '';

  const customersList = [];

  // 1. Gather from Devices (Direct Sales)
  stateCache.devices.forEach(d => {
    if (!d.customer_name) return;

    // Filter out trader sales (where customer_name matches or includes a supplier name)
    const isTraderSale = stateCache.suppliers.some(s => 
      d.customer_name && (d.customer_name === s.name || d.customer_name.startsWith(s.name + ' ') || d.customer_name.includes('(' + s.name + ')'))
    );
    if (isTraderSale || d.customer_name === 'مبيعات سابقة غير مسجلة') return;

    // Parse installation date
    const dateVal = d.installed_at || d.created_at;
    let dateStr = 'غير محدد';
    if (dateVal) {
      const parsedDate = new Date(dateVal);
      if (!isNaN(parsedDate.getTime())) {
        dateStr = parsedDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
      }
    }

    // Extract clean address and tech team
    let cleanAddress = d.customer_address || '_';
    let rawTechTeam = 'غير محدد';
    if (d.customer_address && d.customer_address.includes('| طقم التركيب:')) {
      const parts = d.customer_address.split('| طقم التركيب:');
      cleanAddress = parts[0].trim();
      rawTechTeam = parts[1].trim();
    } else if (d.technician_id) {
      const tech = stateCache.technicians.find(t => t.id === d.technician_id);
      if (tech) {
        rawTechTeam = tech.name;
      }
    }

    let leadTech = '';
    let assistant = '';
    let driver = '';
    
    if (d.technician_id) {
      const tech = stateCache.technicians.find(t => t.id === d.technician_id);
      if (tech) leadTech = tech.name;
    }
    if (d.assistant_id) {
      const tech = stateCache.technicians.find(t => t.id === d.assistant_id);
      if (tech) assistant = tech.name;
    }
    if (d.driver_id) {
      const tech = stateCache.technicians.find(t => t.id === d.driver_id);
      if (tech) driver = tech.name;
    }

    const techTeamObj = { leadTech, assistant, driver, rawText: rawTechTeam };

    customersList.push({
      id: d.id,
      name: d.customer_name,
      phone: d.customer_phone || '_',
      address: cleanAddress,
      device_details: `${d.brand} (${d.capacity})`,
      serial: d.serial_number,
      date_str: dateStr,
      tech_team: techTeamObj,
      sale_price: Number(d.sale_price || 0),
      amount_paid: Number(d.amount_paid || 0),
      amount_remaining: Number(d.amount_remaining || 0),
      installment_monthly: d.installment_monthly ? Number(d.installment_monthly) : null,
      installment_months: d.installment_months ? Number(d.installment_months) : null,
      installment_notes: d.installment_notes || null,
      created_time: d.created_at ? new Date(d.created_at).getTime() : 0,
      type: 'device_sale'
    });
  });

  // 2. Gather from Cash Flow (Job Orders/Maintenance)
  stateCache.cashFlow.forEach(c => {
    if (c.type === 'إيراد' && c.description.includes('العميل:') && c.description.includes('تليفون:')) {
      const desc = c.description;
      const matchName = desc.match(/العميل:\s*([^|]+)/);
      const matchPhone = desc.match(/تليفون:\s*([^|]+)/);
      const matchAddress = desc.match(/عنوان:\s*([^|]+)/);
      const matchNotes = desc.match(/البيان:\s*([^|\[__ATTACHMENT__]+)/);

      if (matchName) {
        const name = matchName[1].trim();
        const phone = matchPhone ? matchPhone[1].trim() : '_';
        const address = matchAddress ? matchAddress[1].trim() : '_';
        
        let notes = 'صيانة / تركيب خارجي';
        if (matchNotes) {
          notes = matchNotes[1].trim();
        } else {
          // Fallback parsing
          const parts = desc.split('|').map(p => p.trim());
          const notesPart = parts.find(p => p.startsWith('البيان:') || p.startsWith('وصف:'));
          if (notesPart) {
            notes = notesPart.split(':')[1]?.trim() || notes;
          }
        }
        
        // Clean notes from metadata
        notes = notes.split('__ATTACHMENT__')[0].split('[الفني:')[0].split('[المساعد:')[0].split('[السائق:')[0].trim();

        // Parse date
        const dateVal = c.date || c.created_at;
        let dateStr = 'غير محدد';
        if (dateVal) {
          const parsedDate = new Date(dateVal);
          if (!isNaN(parsedDate.getTime())) {
            dateStr = parsedDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
          }
        }

        // Extract technician from cash flow description
        let leadTech = '';
        let assistant = '';
        let driver = '';
        
        const matchTech = desc.match(/\[الفني:\s*([^\]]+)\]/);
        const matchAssistant = desc.match(/\[المساعد:\s*([^\]]+)\]/);
        const matchDriver = desc.match(/\[السائق:\s*([^\]]+)\]/);
        
        if (matchTech) leadTech = matchTech[1].trim();
        if (matchAssistant) assistant = matchAssistant[1].trim();
        if (matchDriver) driver = matchDriver[1].trim();

        let rawTechTeam = 'غير محدد';
        if (!leadTech && !assistant && !driver) {
          rawTechTeam = 'غير محدد';
        }

        const techTeamObj = { leadTech, assistant, driver, rawText: rawTechTeam };

        customersList.push({
          id: c.id,
          name: name,
          phone: phone,
          address: address,
          device_details: notes,
          serial: 'أمر شغل 🔧',
          date_str: dateStr,
          tech_team: techTeamObj,
          sale_price: Number(c.amount || 0),
          amount_paid: Number(c.amount || 0),
          amount_remaining: 0,
          created_time: c.created_at ? new Date(c.created_at).getTime() : 0,
          type: 'maintenance'
        });
      }
    }
  });

  // Sort customersList:
  // 1. Remaining balance > 0 goes first
  // 2. Otherwise sort by newest (created_time descending)
  customersList.sort((a, b) => {
    const hasRemainingA = a.amount_remaining > 0 ? 1 : 0;
    const hasRemainingB = b.amount_remaining > 0 ? 1 : 0;
    
    if (hasRemainingA !== hasRemainingB) {
      return hasRemainingB - hasRemainingA; // unpaid goes first
    }
    
    return b.created_time - a.created_time; // newest first
  });

  // 3. Filter by Search Query (Name or Phone)
  const filteredList = customersList.filter(cust => {
    if (!searchQuery) return true;
    const nameMatch = cust.name.toLowerCase().includes(searchQuery);
    const phoneMatch = cust.phone.toLowerCase().includes(searchQuery);
    return nameMatch || phoneMatch;
  });

  // 4. Render Table Rows
  if (filteredList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--text-secondary);">لا توجد نتائج مطابقة للبحث أو لا يوجد عملاء مسجلين حالياً.</td></tr>';
    return;
  }

  const rowsHtml = [];
  filteredList.forEach(cust => {
    let actionHtml = '';
    let remainingStyle = '';

    if (cust.type === 'device_sale') {
      if (cust.amount_remaining > 0) {
        actionHtml = `<button class="btn btn-primary btn-table" onclick="openCollectPaymentModal('${cust.id}', '${cust.name.replace(/'/g, "\\'")}', ${cust.amount_remaining})">💵 تحصيل قسط</button>`;
        remainingStyle = 'color: var(--warning); font-weight: 700;';
      } else {
        actionHtml = `<span class="badge badge-success" style="background: rgba(16, 185, 129, 0.12); color: var(--success); padding: 4px 8px; border-radius: 4px; font-weight: 600;">✅ مدفوع بالكامل</span>`;
        remainingStyle = 'color: var(--text-secondary);';
      }
    } else {
      // Maintenance / Job Order
      actionHtml = `<span class="badge badge-info" style="background: rgba(14, 165, 233, 0.12); color: var(--accent-cyan); padding: 4px 8px; border-radius: 4px; font-weight: 600;">🛠️ صيانة/تركيب خارجي</span>`;
      remainingStyle = 'color: var(--text-secondary);';
    }

    const safeName = encodeURIComponent(cust.name || '');
    const safePhone = encodeURIComponent(cust.phone || '');
    const safeAddress = encodeURIComponent(cust.address || '');

    const editBtnHtml = `<button type="button" class="btn btn-secondary btn-table btn-edit-customer" data-action="edit-customer" data-type="${cust.type}" data-id="${cust.id}" data-name="${safeName}" data-phone="${safePhone}" data-address="${safeAddress}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.78rem; cursor: pointer; transition: background 0.2s;" onclick="openEditCustomerModal('${cust.type}', '${cust.id}', '${safeName}', '${safePhone}', '${safeAddress}')"><i class='bx bx-edit'></i> تعديل</button>`;

    const salePriceFormatted = cust.sale_price > 0 ? `${cust.sale_price.toLocaleString()} ج.م` : '_';
    const amountPaidFormatted = cust.amount_paid > 0 ? `${cust.amount_paid.toLocaleString()} ج.م` : '_';
    const amountRemainingFormatted = cust.amount_remaining > 0 ? `${cust.amount_remaining.toLocaleString()} ج.م` : '0 ج.م';

    rowsHtml.push(`
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${cust.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 4px;">
            <i class='bx bx-phone' style="font-size: 0.9rem;"></i>
            <span>${cust.phone}</span>
          </div>
        </td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.4; max-width: 250px;">${cust.address}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${cust.device_details}</div>
          <div style="margin-top: 4px;">
            <code style="font-size: 0.75rem; background: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">${cust.serial}</code>
          </div>
        </td>
        <td>
          <div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 500;">${cust.date_str}</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 5px; display: flex; flex-direction: column; gap: 3px; line-height: 1.3;">
            ${cust.tech_team.leadTech ? `<div style="display:flex; align-items:center; gap:4px;"><i class='bx bx-wrench' style='font-size:0.8rem; color:var(--accent-cyan);'></i> <span>فني: ${cust.tech_team.leadTech}</span></div>` : ''}
            ${cust.tech_team.assistant ? `<div style="display:flex; align-items:center; gap:4px;"><i class='bx bx-group' style='font-size:0.8rem; color:var(--text-secondary);'></i> <span>مساعد: ${cust.tech_team.assistant}</span></div>` : ''}
            ${cust.tech_team.driver ? `<div style="display:flex; align-items:center; gap:4px;"><i class='bx bx-car' style='font-size:0.8rem; color:var(--success);'></i> <span>سائق: ${cust.tech_team.driver}</span></div>` : ''}
            ${(!cust.tech_team.leadTech && !cust.tech_team.assistant && !cust.tech_team.driver) ? `<div style="display:flex; align-items:center; gap:4px;"><i class='bx bx-wrench' style='font-size:0.85rem;'></i> <span>${cust.tech_team.rawText}</span></div>` : ''}
          </div>
        </td>
        <td>
          <div style="${remainingStyle} font-size: 0.9rem;">
            <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:normal;">المتبقي:</span> ${amountRemainingFormatted}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
            المدفوع: ${amountPaidFormatted} / ${salePriceFormatted}
          </div>
          ${cust.type === 'device_sale' && (cust.installment_monthly || cust.installment_months || cust.installment_notes) ? `
            <div style="font-size: 0.75rem; color: var(--warning); margin-top: 5px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 5px; display: flex; flex-direction: column; gap: 2px;">
              ${cust.installment_monthly ? `<div>🪙 القسط: <strong>${cust.installment_monthly.toLocaleString()} ج.م</strong> / شهرياً</div>` : ''}
              ${cust.installment_months ? `<div>📅 المدة: <strong>${cust.installment_months} أشهر</strong></div>` : ''}
              ${cust.installment_notes ? `<div style="color:var(--text-secondary); font-style:italic;">📝 ${cust.installment_notes}</div>` : ''}
            </div>
          ` : ''}
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">
            ${actionHtml}
            ${editBtnHtml}
          </div>
        </td>
      </tr>
    `);
  });

  tbody.innerHTML = rowsHtml.join('');
}

// --- CUSTOMER AUTOCOMPLETE & EDIT FUNCTIONS ---

function getUniqueCustomers() {
  const map = new Map();

  // 1. From devices (Direct sales)
  if (stateCache.devices) {
    stateCache.devices.forEach(d => {
      if (!d.customer_name) return;

      const isTrader = stateCache.suppliers.some(s =>
        d.customer_name && (d.customer_name === s.name || d.customer_name.startsWith(s.name + ' ') || d.customer_name.includes('(' + s.name + ')'))
      );
      if (isTrader || d.customer_name === 'مبيعات سابقة غير مسجلة') return;

      let cleanAddress = d.customer_address || '';
      if (cleanAddress.includes('| طقم التركيب:')) {
        cleanAddress = cleanAddress.split('| طقم التركيب:')[0].trim();
      }

      const nameTrimmed = d.customer_name.trim();
      const key = nameTrimmed.toLowerCase();
      const phoneTrimmed = (d.customer_phone && d.customer_phone !== '_') ? d.customer_phone.trim() : '';
      const addressTrimmed = (cleanAddress && cleanAddress !== '_') ? cleanAddress.trim() : '';

      if (!map.has(key)) {
        map.set(key, {
          name: nameTrimmed,
          phone: phoneTrimmed,
          address: addressTrimmed
        });
      } else {
        const existing = map.get(key);
        if (!existing.phone && phoneTrimmed) existing.phone = phoneTrimmed;
        if (!existing.address && addressTrimmed) existing.address = addressTrimmed;
      }
    });
  }

  // 2. From cashFlow (Job orders / Maintenance)
  if (stateCache.cashFlow) {
    stateCache.cashFlow.forEach(c => {
      if (c.type === 'إيراد' && c.description && c.description.includes('العميل:') && c.description.includes('تليفون:')) {
        const desc = c.description;
        const matchName = desc.match(/العميل:\s*([^|]+)/);
        const matchPhone = desc.match(/تليفون:\s*([^|]+)/);
        const matchAddress = desc.match(/عنوان:\s*([^|]+)/);

        if (matchName) {
          const name = matchName[1].trim();
          const phone = matchPhone ? matchPhone[1].trim() : '';
          const address = matchAddress ? matchAddress[1].trim() : '';

          const key = name.toLowerCase();
          const phoneClean = (phone && phone !== '_') ? phone : '';
          const addressClean = (address && address !== '_') ? address : '';

          if (!map.has(key)) {
            map.set(key, {
              name: name,
              phone: phoneClean,
              address: addressClean
            });
          } else {
            const existing = map.get(key);
            if (!existing.phone && phoneClean) existing.phone = phoneClean;
            if (!existing.address && addressClean) existing.address = addressClean;
          }
        }
      }
    });
  }

  return Array.from(map.values());
}

function setupCustomerAutocomplete(nameInputId, phoneInputId, addressInputId) {
  const nameInput = document.getElementById(nameInputId);
  const phoneInput = document.getElementById(phoneInputId);
  const addressInput = document.getElementById(addressInputId);

  if (!nameInput) return;
  if (nameInput.dataset.autocompleteBound) return;
  nameInput.dataset.autocompleteBound = 'true';

  const container = nameInput.closest('.autocomplete-container') || nameInput.parentElement;
  container.style.position = 'relative';

  let dropdown = container.querySelector('.autocomplete-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';
    container.appendChild(dropdown);
  }

  const hideDropdown = () => {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  };

  const renderDropdown = (matches) => {
    if (!matches || matches.length === 0) {
      hideDropdown();
      return;
    }

    dropdown.innerHTML = '';
    matches.slice(0, 8).forEach(cust => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';

      const nameEl = document.createElement('div');
      nameEl.className = 'autocomplete-name';
      nameEl.innerText = cust.name;

      const detailsEl = document.createElement('div');
      detailsEl.className = 'autocomplete-details';
      detailsEl.innerHTML = `
        ${cust.phone ? `<span><i class='bx bx-phone'></i> ${cust.phone}</span>` : ''}
        ${cust.address ? `<span><i class='bx bx-map'></i> ${cust.address}</span>` : ''}
      `;

      item.appendChild(nameEl);
      if (cust.phone || cust.address) {
        item.appendChild(detailsEl);
      }

      item.addEventListener('mousedown', (evt) => {
        evt.preventDefault();
        nameInput.value = cust.name;
        if (phoneInput && cust.phone) {
          phoneInput.value = cust.phone;
          phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (addressInput && cust.address) {
          addressInput.value = cust.address;
          addressInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        hideDropdown();
      });

      dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
  };

  nameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const customers = getUniqueCustomers();
    if (!val) {
      renderDropdown(customers);
      return;
    }

    const matches = customers.filter(c =>
      c.name.toLowerCase().includes(val) || (c.phone && c.phone.includes(val))
    );
    renderDropdown(matches);
  });

  nameInput.addEventListener('focus', () => {
    const val = nameInput.value.trim().toLowerCase();
    const customers = getUniqueCustomers();
    const matches = val 
      ? customers.filter(c => c.name.toLowerCase().includes(val) || (c.phone && c.phone.includes(val)))
      : customers;
    renderDropdown(matches);
  });

  nameInput.addEventListener('change', () => {
    const val = nameInput.value.trim().toLowerCase();
    if (!val) return;
    const customers = getUniqueCustomers();
    const matched = customers.find(c => c.name.toLowerCase() === val);
    if (matched) {
      if (phoneInput && matched.phone && !phoneInput.value.trim()) {
        phoneInput.value = matched.phone;
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (addressInput && matched.address && !addressInput.value.trim()) {
        addressInput.value = matched.address;
        addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  nameInput.addEventListener('blur', () => {
    setTimeout(hideDropdown, 200);
  });
}

function openEditCustomerModal(typeArg, targetIdArg, encName, encPhone, encAddress) {
  console.log('✏️ [openEditCustomerModal] Triggered with args:', { typeArg, targetIdArg, encName, encPhone, encAddress });
  try {
    let type = typeArg || '';
    let targetId = targetIdArg || '';
    if (type && type.includes('%')) { try { type = decodeURIComponent(type); } catch(e){} }
    if (targetId && targetId.includes('%')) { try { targetId = decodeURIComponent(targetId); } catch(e){} }

    let name = '';
    let phone = '';
    let address = '';

    if (encName) {
      try { name = decodeURIComponent(encName); } catch(e) { name = encName; }
      try { phone = decodeURIComponent(encPhone || ''); } catch(e) { phone = encPhone || ''; }
      try { address = decodeURIComponent(encAddress || ''); } catch(e) { address = encAddress || ''; }
    }
    
    if (!name) {
      if (type === 'device_sale') {
        let dev = (stateCache.devices || []).find(d => String(d.id) === String(targetId));
        if (!dev) {
          dev = (stateCache.devices || []).find(d => d.customer_name && d.customer_name.trim() === String(targetId).trim());
        }
        if (dev) {
          name = dev.customer_name || '';
          phone = dev.customer_phone || '';
          let cleanAddress = dev.customer_address || '';
          if (cleanAddress.includes('| طقم التركيب:')) {
            cleanAddress = cleanAddress.split('| طقم التركيب:')[0].trim();
          }
          address = cleanAddress;
        }
      } else if (type === 'maintenance') {
        const c = (stateCache.cashFlow || []).find(item => String(item.id) === String(targetId));
        if (c && c.description) {
          const desc = c.description;
          const matchName = desc.match(/العميل:\s*([^|]+)/);
          const matchPhone = desc.match(/تليفون:\s*([^|]+)/);
          const matchAddress = desc.match(/عنوان:\s*([^|]+)/);
          if (matchName) name = matchName[1].trim();
          if (matchPhone) phone = matchPhone[1].trim();
          if (matchAddress) address = matchAddress[1].trim();
        }
      }
    }

    console.log('📝 [openEditCustomerModal] Resolved customer details:', { name, phone, address, type, targetId });

    const typeEl = document.getElementById('edit-customer-type');
    const targetIdEl = document.getElementById('edit-customer-target-id');
    const oldNameEl = document.getElementById('edit-customer-old-name');
    const oldPhoneEl = document.getElementById('edit-customer-old-phone');
    const oldAddressEl = document.getElementById('edit-customer-old-address');
    const nameEl = document.getElementById('edit-customer-name');
    const phoneEl = document.getElementById('edit-customer-phone');
    const addressEl = document.getElementById('edit-customer-address');

    if (typeEl) typeEl.value = type;
    if (targetIdEl) targetIdEl.value = targetId;
    if (oldNameEl) oldNameEl.value = name;
    if (oldPhoneEl) oldPhoneEl.value = phone;
    if (oldAddressEl) oldAddressEl.value = address;

    if (nameEl) nameEl.value = name;
    if (phoneEl) phoneEl.value = (phone === '_' ? '' : phone);
    if (addressEl) addressEl.value = (address === '_' ? '' : address);

    openModal('edit-customer-modal');
  } catch (err) {
    console.error('❌ [openEditCustomerModal] Error:', err);
    alert('❌ حدث خطأ عند فتح نافذة تعديل العميل: ' + (err.message || err));
  }
}

async function handleEditCustomerSubmit(e) {
  e.preventDefault();

  const type = document.getElementById('edit-customer-type').value;
  const targetId = document.getElementById('edit-customer-target-id').value;
  const oldName = document.getElementById('edit-customer-old-name').value;

  const newName = document.getElementById('edit-customer-name').value.trim();
  const newPhone = document.getElementById('edit-customer-phone').value.trim();
  const newAddress = document.getElementById('edit-customer-address').value.trim();

  if (!newName) {
    alert('⚠️ يرجى إدخال اسم العميل!');
    return;
  }

  try {
    if (type === 'device_sale') {
      const updateData = {
        customer_name: newName,
        customer_phone: newPhone || null,
        customer_address: newAddress || null
      };

      // 1. Update target device
      const { error: devErr } = await supabase
        .from('devices')
        .update(updateData)
        .eq('id', targetId);

      if (devErr) throw devErr;

      // 2. Update any other devices under the customer name
      if (oldName) {
        await supabase
          .from('devices')
          .update(updateData)
          .eq('customer_name', oldName);
      }
    } else if (type === 'maintenance') {
      const cashEntry = stateCache.cashFlow.find(c => c.id === targetId);
      if (cashEntry) {
        let desc = cashEntry.description;
        if (oldName && desc.includes(`العميل: ${oldName}`)) {
          desc = desc.replace(`العميل: ${oldName}`, `العميل: ${newName}`);
        } else {
          desc = desc.replace(/العميل:\s*[^|]+/, `العميل: ${newName}`);
        }

        if (newPhone) {
          if (desc.includes('تليفون:')) {
            desc = desc.replace(/تليفون:\s*([^|]+)/, `تليفون: ${newPhone}`);
          }
        }
        if (newAddress) {
          if (desc.includes('عنوان:')) {
            desc = desc.replace(/عنوان:\s*([^|]+)/, `عنوان: ${newAddress}`);
          }
        }

        const { error: cfErr } = await supabase
          .from('cash_flow')
          .update({ description: desc })
          .eq('id', targetId);

        if (cfErr) throw cfErr;
      }
    }

    closeModal('edit-customer-modal');
    await refreshAllData();
    renderCustomersTab();
    alert('✅ تم تعديل بيانات العميل بنجاح!');
  } catch (err) {
    console.error('Failed to update customer details:', err);
    alert('❌ حدث خطأ أثناء تعديل بيانات العميل: ' + (err.message || err));
  }
}

function renderCashflowTab() {
  // Update Stats Cards in Cash Flow page
  const data = stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} };
  const CASH_KEYWORDS = ['خزنة'];
  let cashTotal = 0;
  let elecTotal = 0;
  
  if (data.liquidity) {
    Object.entries(data.liquidity).forEach(([name, val]) => {
      const isCash = CASH_KEYWORDS.some(kw => name.includes(kw));
      if (isCash) cashTotal += Number(val || 0);
      else elecTotal += Number(val || 0);
    });
  }
  let grandTotal = cashTotal + elecTotal;

  updateEyeIcon('treasury-eye-icon', window.hideTreasuryState);

  const cashOnlyEl = document.getElementById('cashflow-stat-cash-only');
  const elecOnlyEl = document.getElementById('cashflow-stat-elec-only');
  const totalEl = document.getElementById('cashflow-stat-total');

  if (cashOnlyEl) cashOnlyEl.innerText = window.hideTreasuryState ? '•••••• ج.م' : `${cashTotal.toLocaleString('ar-EG')} ج.م`;
  if (elecOnlyEl) elecOnlyEl.innerText = window.hideTreasuryState ? '•••••• ج.م' : `${elecTotal.toLocaleString('ar-EG')} ج.م`;
  if (totalEl) totalEl.innerText = window.hideTreasuryState ? '•••••• ج.م' : `${grandTotal.toLocaleString('ar-EG')} ج.م`;

  const dateInput = document.getElementById('cashflow-date-filter');
  const selectedDate = dateInput ? dateInput.value : '';
  updateDateFilterButtonStyles('cashflow', selectedDate);

  const searchInput = document.getElementById('cashflow-search');
  const rawQuery = searchInput ? searchInput.value.trim() : '';

  let filteredCashFlow = stateCache.cashFlow || [];
  if (selectedDate) {
    filteredCashFlow = filteredCashFlow.filter(c => {
      if (c.date && c.date === selectedDate) return true;
      const dateVal = c.date || c.created_at;
      if (!dateVal) return false;
      const cDate = new Date(dateVal);
      if (isNaN(cDate.getTime())) return false;
      
      const offset = cDate.getTimezoneOffset();
      const localCDate = new Date(cDate.getTime() - (offset * 60 * 1000));
      const cDateStr = localCDate.toISOString().split('T')[0];
      return cDateStr === selectedDate;
    });
  } else {
    filteredCashFlow = [...filteredCashFlow].sort((a,b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
  }

  if (rawQuery) {
    const normalize = str => (str || '').toString().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[,\u060C]/g, '').trim();
    const queryTokens = normalize(rawQuery).split(/\s+/).filter(Boolean);

    filteredCashFlow = filteredCashFlow.filter(c => {
      const combinedText = normalize(`${c.type || ''} ${c.amount || ''} ${c.description || ''} ${c.date || ''} ${c.created_at || ''}`);
      return queryTokens.every(tok => combinedText.includes(tok));
    });
  }

  const tbody = document.querySelector('#cashflow-all-table tbody');
  tbody.innerHTML = '';

  if (filteredCashFlow.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد حركات مالية مسجلة لهذا التاريخ.</td></tr>';
    return;
  }

  const tbodyHtml = [];

  filteredCashFlow.forEach(c => {
    const typeClass = c.type === 'إيراد' ? 'badge badge-income' : 'badge badge-expense';
    let date = '';
    if (c.date && typeof c.date === 'string' && c.date.length === 10) {
      const parts = c.date.split('-');
      date = `${parts[0]}/${parts[1]}/${parts[2]}`;
    } else {
      date = new Date(c.created_at).toLocaleDateString('ar-EG');
    }
    
    // Parse description and check for attachment link
    let displayDesc = c.description || '';
    let attachmentHtml = '';
    
    if (displayDesc.includes('__ATTACHMENT__')) {
      const parts = displayDesc.split('__ATTACHMENT__');
      displayDesc = parts[0].trim();
      const imgUrl = parts[1].trim();
      if (imgUrl) {
        const dt = getDocType(imgUrl);
        attachmentHtml = `<button type="button" class="btn btn-secondary btn-table" style="background: var(--warning-color); padding: 4px 8px; font-size: 0.8rem; font-weight: 600; margin-left: 5px;" onclick="viewDocument('${imgUrl}', '${dt.label.replace(/'/g, "\\'")}')">📄 عرض المرفق</button>`;
      }
    } else {
      attachmentHtml = `<button type="button" class="btn btn-secondary btn-table" style="background: var(--accent-cyan); padding: 4px 8px; font-size: 0.8rem; font-weight: 600; margin-left: 5px;" onclick="triggerInlineAttachment('${c.id}')">📎 إرفاق</button>`;
    }

    tbodyHtml.push(`
      <tr>
        <td><span class="${typeClass}">${c.type}</span></td>
        <td><strong>${c.amount.toLocaleString()} ج.م</strong></td>
        <td>${displayDesc}</td>
        <td>${date}</td>
        <td>
          <div style="display: flex; gap: 5px; justify-content: center; align-items: center;">
            ${attachmentHtml}
            <button class="btn btn-primary btn-table" style="background: var(--accent-cyan); border-color: var(--accent-cyan);" onclick="openEditCashFlowModal('${c.id}')">✏️ تعديل</button>
            <button class="btn btn-danger btn-table" onclick="deleteCashFlowInline('${c.id}')">🗑️ حذف</button>
          </div>
        </td>
      </tr>
    `);
  });

  tbody.innerHTML = tbodyHtml.join('');
}

let currentAttachCashFlowId = null;

function triggerInlineAttachment(id) {
  currentAttachCashFlowId = id;
  const fileInput = document.getElementById('cashflow-inline-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

async function compressImageClientSide(file, maxWidth = 1400, quality = 0.8) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function handleInlineFileSelection(event) {
  if (!currentAttachCashFlowId) return;
  const file = event.target.files[0];
  if (!file) return;

  const cashEntry = stateCache.cashFlow.find(c => c.id === currentAttachCashFlowId);
  if (!cashEntry) return;

  const confirmMsg = `هل تريد إرفاق ملف "${file.name}" للحركة:\n"${cashEntry.description}" بقيمة ${cashEntry.amount.toLocaleString()} ج.م؟`;
  if (!confirm(confirmMsg)) return;

  try {
    const descLower = (cashEntry.description || '').toLowerCase();
    let marker = '__general_doc__';
    if (descLower.includes('سداد') || descLower.includes('دفعة') || descLower.includes('استلام') || descLower.includes('تحصيل')) {
      marker = '__cash_receipt__';
    }

    // Compress client-side to save bandwidth & storage
    const uploadFile = await compressImageClientSide(file);

    // Generate a completely safe, ASCII-only storage key — ignore the original filename entirely
    // This prevents ANY Arabic/special chars from leaking into the Supabase storage key
    const rawExt = uploadFile.name.includes('.') ? uploadFile.name.split('.').pop() : '';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fileName = `cash_flow/${uniqueId}${marker}.${safeExt}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('contracts')
      .upload(fileName, uploadFile, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from('contracts')
      .getPublicUrl(fileName);

    const newDescription = `${cashEntry.description.trim()} __ATTACHMENT__${publicUrl}`;
    const { error: dbErr } = await supabase
      .from('cash_flow')
      .update({ description: newDescription })
      .eq('id', currentAttachCashFlowId);
    if (dbErr) throw dbErr;

    alert('✅ تم رفع وإرفاق المستند بنجاح!');
    
    await refreshAllData();
    renderCashflowTab();
  } catch (err) {
    console.error('Error attaching file:', err);
    alert('❌ حدث خطأ أثناء إرفاق الملف: ' + err.message);
  } finally {
    currentAttachCashFlowId = null;
  }
}

window.triggerInlineAttachment = triggerInlineAttachment;
window.handleInlineFileSelection = handleInlineFileSelection;

// --- 6. HR & SALARIES PAGE RENDERING ---
// Helper to parse employee combined name
function parseEmployeeName(fullName) {
  if (!fullName) return { name: '', role: 'موظف' };
  const parts = fullName.split(' | ');
  return {
    name: parts[0] || '',
    role: parts[1] || 'فني'
  };
}

function getEmployeeDisplayName(t) {
  if (!t) return '';
  const parsed = parseEmployeeName(t.name);
  return `${parsed.name} (${parsed.role})`;
}

// --- 6. HR & SALARIES PAGE RENDERING ---
async function renderHRTab() {
  updateEyeIcon('salaries-eye-icon', window.hideSalariesState);
  // Render technicians table
  const tbodyTech = document.querySelector('#tech-list-table tbody');
  tbodyTech.innerHTML = '';
  if (stateCache.technicians.length === 0) {
    tbodyTech.innerHTML = '<tr><td colspan="5" class="text-center">لا يوجد موظفين مسجلين.</td></tr>';
  } else {
    const tbodyTechHtml = [];
    stateCache.technicians.forEach(t => {
      const parsed = parseEmployeeName(t.name);
      const date = new Date(t.created_at).toLocaleDateString('ar-EG');
      const salaryStr = window.hideSalariesState ? '••••••' : `${t.monthly_salary.toLocaleString()} ج.م`;
      tbodyTechHtml.push(`
        <tr>
          <td><strong>${parsed.name}</strong></td>
          <td><span class="badge badge-assigned">${parsed.role}</span></td>
          <td>${salaryStr}</td>
          <td>${date}</td>
          <td>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-table" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);" onclick="openTechnicianWorkHistoryModal('${t.id}', '${parsed.name.replace(/'/g, "\\'")}')">🚚 سجل الشغل (النزول)</button>
              <button class="btn btn-secondary btn-table" onclick="openEditEmployeeModal('${t.id}', '${parsed.name.replace(/'/g, "\\'")}', '${parsed.role.replace(/'/g, "\\'")}', ${t.monthly_salary})">✏️ تعديل</button>
              <button class="btn btn-danger btn-table" onclick="deleteEmployee('${t.id}', '${parsed.name.replace(/'/g, "\\'")}')">🗑️ حذف</button>
            </div>
          </td>
        </tr>
      `);
    });
    tbodyTech.innerHTML = tbodyTechHtml.join('');
  }

  // Render daily attendance
  const attDateInput = document.getElementById('attendance-date-filter');
  if (attDateInput && !attDateInput.value) {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    attDateInput.value = localDate.toISOString().split('T')[0];
  }
  const selectedAttDate = attDateInput ? attDateInput.value : new Date().toISOString().split('T')[0];

  const attDateText = document.getElementById('attendance-date-text');
  if (attDateText) {
    attDateText.innerText = getFormattedDateLabel(selectedAttDate);
  }

  const { data: attendance } = await supabase.from('attendance').select('*').eq('date', selectedAttDate);
  
  const tbodyAtt = document.querySelector('#attendance-table tbody');
  tbodyAtt.innerHTML = '';

  if (stateCache.technicians.length === 0) {
    tbodyAtt.innerHTML = '<tr><td colspan="3" class="text-center">لا توجد بيانات.</td></tr>';
  } else {
    const tbodyAttHtml = [];
    stateCache.technicians.forEach(t => {
      const parsed = parseEmployeeName(t.name);
      const attRecord = attendance ? attendance.find(a => a.technician_id === t.id) : null;
      const status = attRecord ? attRecord.status : '';
      
      const arrivalTime = attRecord && attRecord.arrival_time ? attRecord.arrival_time.slice(0, 5) : '';

      const dropdownHtml = `
        <select id="status-${t.id}" class="form-control" style="width: auto; display: inline-block; padding: 4px 8px; font-size: 0.9rem;" onchange="saveAttendanceInline('${t.id}', this.value, document.getElementById('time-${t.id}').value)">
          <option value="" ${status === '' ? 'selected' : ''}>لم يتم التسجيل ⚪</option>
          <option value="حاضر" ${status === 'حاضر' ? 'selected' : ''}>حاضر ✅</option>
          <option value="غائب" ${status === 'غائب' ? 'selected' : ''}>غائب ❌</option>
          <option value="تأخير" ${status === 'تأخير' ? 'selected' : ''}>تأخير ⚠️</option>
        </select>
      `;

      const timeHtml = `
        <input type="time" id="time-${t.id}" class="form-control" style="width: auto; display: inline-block; padding: 4px 8px; font-size: 0.9rem;" value="${arrivalTime}" placeholder="--:--" onchange="saveAttendanceInline('${t.id}', document.getElementById('status-${t.id}').value, this.value)">
      `;

      tbodyAttHtml.push(`
        <tr>
          <td><strong>${parsed.name} (${parsed.role})</strong></td>
          <td>${dropdownHtml}</td>
          <td>${timeHtml}</td>
        </tr>
      `);
    });
    tbodyAtt.innerHTML = tbodyAttHtml.join('');
  }

  // Trigger monthly salary calculations for active month in dropdown
  const monthSelect = document.getElementById('salary-month-select');
  calculateAndRenderSalaryReport(monthSelect.value);
}

async function calculateAndRenderSalaryReport(monthStr) {
  const tbody = document.querySelector('#salary-report-table tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center">⏳ جاري حساب التسويات والرواتب...</td></tr>';

  if (stateCache.technicians.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">لا يوجد موظفين مسجلين لحساب رواتبهم.</td></tr>';
    return;
  }

  const [year, month] = monthStr.split('-').map(Number);
  const startDate = `${monthStr}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Get current rates configuration inputs
  const rateMainTech = Number(document.getElementById('rate-main-tech')?.value || 50);
  const rateAssistant = Number(document.getElementById('rate-assistant')?.value || 20);
  const rateDriver = Number(document.getElementById('rate-driver')?.value || 10);
  const rateJobOrderPct = Number(document.getElementById('rate-job-order-pct')?.value || 10);
  const rateJobOrderAssistantPct = Number(document.getElementById('rate-job-order-assistant-pct')?.value || 5);
  const rateJobOrderDriverPct = Number(document.getElementById('rate-job-order-driver-pct')?.value || 2);

  const tbodyHtml = [];

  for (const t of stateCache.technicians) {
    const parsed = parseEmployeeName(t.name);
    // Fetch count of attendance status
    const { data: att } = await supabase
      .from('attendance')
      .select('status')
      .eq('technician_id', t.id)
      .gte('date', startDate)
      .lte('date', endDate);

    // Fetch advances
    const { data: adv } = await supabase
      .from('salary_advances')
      .select('amount')
      .eq('technician_id', t.id)
      .gte('date', startDate)
      .lte('date', endDate);

    let absences = 0;
    let delays = 0;
    if (att) {
      att.forEach(a => {
        if (a.status === 'غائب') absences++;
        if (a.status === 'تأخير') delays++;
      });
    }

    let advancesTotal = 0;
    if (adv) {
      adv.forEach(ad => {
        advancesTotal += Number(ad.amount);
      });
    }

    // --- COMMISSIONS & RATES CALCULATIONS ---
    let commissionsTotal = 0;

    // 1. Devices Installations (Main Tech, Assistant, Driver roles)
    stateCache.devices.forEach(d => {
      if (d.status === 'تم التركيب') {
        const dateVal = d.installed_at || d.assigned_at || d.created_at;
        if (dateVal) {
          const pDate = new Date(dateVal);
          if (!isNaN(pDate.getTime()) && pDate.getFullYear() === year && (pDate.getMonth() + 1) === month) {
            if (d.technician_id === t.id) {
              commissionsTotal += rateMainTech;
            } else if (d.assistant_id === t.id) {
              commissionsTotal += rateAssistant;
            } else if (d.driver_id === t.id) {
              commissionsTotal += rateDriver;
            }
          }
        }
      }
    });

    // 2. Job Orders (الصيانة والتركيبات الخارجية)
    stateCache.cashFlow.forEach(c => {
      const dateVal = c.date || c.created_at;
      if (dateVal) {
        const pDate = new Date(dateVal);
        if (!isNaN(pDate.getTime()) && pDate.getFullYear() === year && (pDate.getMonth() + 1) === month) {
          const jobAmount = Number(c.amount || 0);
          if (c.description && c.description.includes(`[الفني: ${parsed.name}`)) {
            commissionsTotal += Math.round(jobAmount * (rateJobOrderPct / 100));
          } else if (c.description && c.description.includes(`[المساعد: ${parsed.name}`)) {
            commissionsTotal += Math.round(jobAmount * (rateJobOrderAssistantPct / 100));
          } else if (c.description && c.description.includes(`[السائق: ${parsed.name}`)) {
            commissionsTotal += Math.round(jobAmount * (rateJobOrderDriverPct / 100));
          }
        }
      }
    });

    const absenceDeduction = Math.round((t.monthly_salary / 30) * absences);
    const delayDeduction = Math.round((t.monthly_salary / 60) * delays);
    // Net Salary includes Commissions
    const netSalary = Math.max(0, t.monthly_salary + commissionsTotal - absenceDeduction - delayDeduction - advancesTotal);

    // Check if salary is already paid this month
    const isPaid = (stateCache.cashFlow || []).some(cf => 
      cf.type === 'مصروف' && 
      cf.description.includes(`صرف راتب الموظف: ${parsed.name}`) && 
      cf.description.includes(`لشهر: ${monthStr}`)
    );

    let actionHtml = '';
    if (isPaid) {
      actionHtml = `<span class="badge badge-installed">تم الصرف ✅</span>`;
    } else {
      actionHtml = `<button class="btn btn-primary btn-table" style="background:var(--accent-cyan); color:white;" onclick="openPaySalaryModal('${t.id}', '${parsed.name.replace(/'/g, "\\'")}', ${netSalary}, '${monthStr}')">💸 صرف الراتب</button>`;
    }

    tbodyHtml.push(`
      <tr>
        <td><strong>${parsed.name} (${parsed.role})</strong></td>
        <td>${t.monthly_salary.toLocaleString()} ج.م</td>
        <td>
          <span style="color: var(--accent); font-weight: 700;">${commissionsTotal.toLocaleString()} ج.م</span>
          <button class="btn btn-secondary btn-table" style="padding: 2px 6px; font-size: 0.72rem; margin-right: 6px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);" onclick="viewCommissionsDetail('${t.id}', '${parsed.name.replace(/'/g, "\\'")}', '${monthStr}')">🔍 تفاصيل</button>
        </td>
        <td>
          ${absences} أيام (${absenceDeduction.toLocaleString()} ج.م)
          <button class="btn btn-secondary btn-table" style="padding: 2px 6px; font-size: 0.72rem; margin-right: 4px; background: rgba(14,165,233,0.12); color: var(--accent-cyan); border: 1px solid rgba(14,165,233,0.3);" onclick="openEmployeeAttendanceCalendar('${t.id}', '${parsed.name.replace(/'/g, "\\'")}', '${monthStr}')">🗓️ التقويم</button>
        </td>
        <td>${delays} مرات (${delayDeduction.toLocaleString()} ج.م)</td>
        <td style="color: var(--danger); font-weight: 700;">${advancesTotal.toLocaleString()} ج.م</td>
        <td style="color: var(--success); font-weight: 700;">${netSalary.toLocaleString()} ج.م</td>
        <td>
          <div style="display:flex; gap: 4px; flex-wrap:wrap;">
            ${actionHtml}
            <button class="btn btn-secondary btn-table" style="padding: 3px 6px; font-size: 0.78rem; background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4);" onclick="openTechnicianWorkHistoryModal('${t.id}', '${parsed.name.replace(/'/g, "\\'")}')">🚚 سجل الشغل</button>
            <button class="btn btn-secondary btn-table" style="padding: 3px 6px; font-size: 0.78rem; background: rgba(14,165,233,0.12); color: var(--accent-cyan); border: 1px solid rgba(14,165,233,0.3);" onclick="openEmployeeAttendanceCalendar('${t.id}', '${parsed.name.replace(/'/g, "\\'")}', '${monthStr}')">🗓️ سجل الحضور</button>
          </div>
        </td>
      </tr>
    `);
  }

  tbody.innerHTML = tbodyHtml.join('');
}

async function viewCommissionsDetail(techId, techName, monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  
  // Get current rates inputs
  const rateMainTech = Number(document.getElementById('rate-main-tech')?.value || 50);
  const rateAssistant = Number(document.getElementById('rate-assistant')?.value || 20);
  const rateDriver = Number(document.getElementById('rate-driver')?.value || 10);
  const rateJobOrderPct = Number(document.getElementById('rate-job-order-pct')?.value || 10);
  const rateJobOrderAssistantPct = Number(document.getElementById('rate-job-order-assistant-pct')?.value || 5);
  const rateJobOrderDriverPct = Number(document.getElementById('rate-job-order-driver-pct')?.value || 2);

  // Set header details
  document.getElementById('comm-detail-name').innerText = techName;
  document.getElementById('comm-detail-month').innerText = `${year} / ${month}`;

  // Find employee name to match in job orders
  const t = stateCache.technicians.find(x => x.id === techId);
  if (!t) return;
  const parsed = parseEmployeeName(t.name);

  // 1. Gather installations
  const instTableBody = document.querySelector('#comm-detail-installations-table tbody');
  instTableBody.innerHTML = '';
  let instHtml = '';
  let instTotal = 0;

  stateCache.devices.forEach(d => {
    if (d.status === 'تم التركيب') {
      const dateVal = d.installed_at || d.assigned_at || d.created_at;
      if (dateVal) {
        const pDate = new Date(dateVal);
        if (!isNaN(pDate.getTime()) && pDate.getFullYear() === year && (pDate.getMonth() + 1) === month) {
          const formattedDate = pDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
          const customerName = d.customer_name || 'غير معروف';
          if (d.technician_id === techId) {
            instHtml += `
              <tr>
                <td>${formattedDate}</td>
                <td><strong>${d.serial_number}</strong></td>
                <td>${customerName}</td>
                <td>${d.brand} (${d.capacity})</td>
                <td><span class="badge badge-installed">فني مسؤول</span></td>
                <td style="color:var(--success); font-weight:700;">+${rateMainTech} ج.م</td>
              </tr>
            `;
            instTotal += rateMainTech;
          } else if (d.assistant_id === techId) {
            instHtml += `
              <tr>
                <td>${formattedDate}</td>
                <td><strong>${d.serial_number}</strong></td>
                <td>${customerName}</td>
                <td>${d.brand} (${d.capacity})</td>
                <td><span class="badge badge-assigned">مساعد</span></td>
                <td style="color:var(--success); font-weight:700;">+${rateAssistant} ج.م</td>
              </tr>
            `;
            instTotal += rateAssistant;
          } else if (d.driver_id === techId) {
            instHtml += `
              <tr>
                <td>${formattedDate}</td>
                <td><strong>${d.serial_number}</strong></td>
                <td>${customerName}</td>
                <td>${d.brand} (${d.capacity})</td>
                <td><span class="badge badge-in_stock">سائق</span></td>
                <td style="color:var(--success); font-weight:700;">+${rateDriver} ج.م</td>
              </tr>
            `;
            instTotal += rateDriver;
          }
        }
      }
    }
  });

  if (!instHtml) {
    instHtml = '<tr><td colspan="6" class="text-center text-muted">لا توجد عمليات تركيب مسجلة للموظف هذا الشهر.</td></tr>';
  }
  instTableBody.innerHTML = instHtml;

  // 2. Gather job orders
  const jobsTableBody = document.querySelector('#comm-detail-jobs-table tbody');
  jobsTableBody.innerHTML = '';
  let jobsHtml = '';
  let jobsTotal = 0;

  stateCache.cashFlow.forEach(c => {
    const dateVal = c.date || c.created_at;
    if (dateVal) {
      const pDate = new Date(dateVal);
      if (!isNaN(pDate.getTime()) && pDate.getFullYear() === year && (pDate.getMonth() + 1) === month) {
        const formattedDate = pDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
        const jobAmount = Number(c.amount || 0);
        let jobComm = 0;
        let roleLabel = '';
        let pctLabel = '';
        
        if (c.description && c.description.includes(`[الفني: ${parsed.name}`)) {
          jobComm = Math.round(jobAmount * (rateJobOrderPct / 100));
          roleLabel = 'فني مسؤول';
          pctLabel = `${rateJobOrderPct}%`;
        } else if (c.description && c.description.includes(`[المساعد: ${parsed.name}`)) {
          jobComm = Math.round(jobAmount * (rateJobOrderAssistantPct / 100));
          roleLabel = 'مساعد';
          pctLabel = `${rateJobOrderAssistantPct}%`;
        } else if (c.description && c.description.includes(`[السائق: ${parsed.name}`)) {
          jobComm = Math.round(jobAmount * (rateJobOrderDriverPct / 100));
          roleLabel = 'سائق';
          pctLabel = `${rateJobOrderDriverPct}%`;
        }
        
        if (jobComm > 0) {
          const cleanDesc = c.description.split('[الفني:')[0].split('[المساعد:')[0].split('[السائق:')[0].trim();
          jobsHtml += `
            <tr>
              <td>${formattedDate}</td>
              <td>${cleanDesc} <span class="badge badge-assigned" style="font-size:0.7rem; margin-right:4px;">${roleLabel}</span></td>
              <td>${jobAmount.toLocaleString()} ج.م</td>
              <td>${pctLabel}</td>
              <td style="color:var(--success); font-weight:700;">+${jobComm.toLocaleString()} ج.م</td>
            </tr>
          `;
          jobsTotal += jobComm;
        }
      }
    }
  });

  if (!jobsHtml) {
    jobsHtml = '<tr><td colspan="5" class="text-center text-muted">لا توجد أوامر شغل مسجلة للموظف هذا الشهر.</td></tr>';
  }
  jobsTableBody.innerHTML = jobsHtml;

  // Set total sum
  const grandTotal = instTotal + jobsTotal;
  document.getElementById('comm-detail-total-amount').innerText = grandTotal.toLocaleString();

  // Open modal
  openModal('view-commissions-modal');
}

const DOC_TYPES = [
  { marker: '__delivery_note__',        label: '📦 إذن صرف مخزن',       icon: '📦', bg: '#e74c3c', color: '#e74c3c' },
  { marker: '__intake_receipt__',       label: '📥 إذن استلام وتوريد',   icon: '📥', bg: '#f1c40f', color: '#f1c40f' },
  { marker: '__contract__',            label: '📑 عقد بيع وتوريد',      icon: '📑', bg: '#3498db', color: '#3498db' },
  { marker: '__installation_report__', label: '🛠️ محضر تركيب وتسليم',  icon: '🛠️', bg: '#2ecc71', color: '#2ecc71' },
  { marker: '__tax_invoice__',         label: '🧾 فاتورة ضريبية',      icon: '🧾', bg: '#e67e22', color: '#e67e22' },
  { marker: '__cash_receipt__',        label: '💳 فاتورة / إيصال دفع',  icon: '💳', bg: '#9b59b6', color: '#9b59b6' },
  { marker: '__general_doc__',         label: '📄 مستند عام',          icon: '📄', bg: '#7f8c8d', color: '#7f8c8d' }
];

const ALL_LEGACY_MARKERS = [
  '__contract__', '__sales_contract__',
  '__installation_report__', '__job_order__',
  '__delivery_note__',
  '__delivery_receipt__', '__intake_receipt__',
  '__tax_invoice__',
  '__cash_receipt__',
  '__general_doc__', '__receipt__',
  '__unknown__'
];

function getDocType(url) {
  if (!url) return { marker: '__general_doc__', label: '📄 مستند عام', bg: '#7f8c8d', color: '#7f8c8d', icon: '📄' };
  
  // Extract ONLY the filename from the URL to avoid matching bucket name '/public/contracts/'
  const filename = decodeURIComponent(String(url).split('?')[0].split('/').pop()).toLowerCase();

  // 1. Exact marker matches
  if (filename.includes('__delivery_note__')) {
    return DOC_TYPES[0]; // 📦 إذن صرف مخزن
  }
  if (filename.includes('__intake_receipt__') || filename.includes('__delivery_receipt__')) {
    return DOC_TYPES[1]; // 📥 إذن استلام وتوريد
  }
  if (filename.includes('__contract__') || filename.includes('__sales_contract__')) {
    return DOC_TYPES[2]; // 📑 عقد بيع وتوريد
  }
  if (filename.includes('__installation_report__') || filename.includes('__job_order__')) {
    return DOC_TYPES[3]; // 🛠️ محضر تركيب وتسليم
  }
  if (filename.includes('__tax_invoice__')) {
    return DOC_TYPES[4]; // 🧾 فاتورة ضريبية
  }
  if (filename.includes('__cash_receipt__')) {
    return DOC_TYPES[5]; // 💳 فاتورة / إيصال دفع
  }
  if (filename.includes('__general_doc__')) {
    return DOC_TYPES[6]; // 📄 مستند عام
  }

  // 2. Keyword fallback on the filename ONLY
  if (filename.includes('صرف') || filename.includes('delivery_note')) {
    return DOC_TYPES[0]; // 📦 إذن صرف مخزن
  }
  if (filename.includes('استلام') || filename.includes('توريد') || filename.includes('intake') || filename.includes('delivery_receipt')) {
    return DOC_TYPES[1]; // 📥 إذن استلام وتوريد
  }
  if (filename.includes('تركيب') || filename.includes('محضر') || filename.includes('install') || filename.includes('job_order')) {
    return DOC_TYPES[3]; // 🛠️ محضر تركيب وتسليم
  }
  if (filename.includes('عقد') || filename.includes('contract')) {
    return DOC_TYPES[2]; // 📑 عقد بيع وتوريد
  }
  if (filename.includes('ضريبية') || filename.includes('ضريبيه') || filename.includes('tax')) {
    return DOC_TYPES[4]; // 🧾 فاتورة ضريبية
  }
  if (filename.includes('فاتورة') || filename.includes('إيصال') || filename.includes('ايصال') || filename.includes('cash_receipt') || filename.includes('receipt') || filename.includes('invoice')) {
    return DOC_TYPES[5]; // 💳 فاتورة / إيصال دفع
  }

  return DOC_TYPES[6]; // 📄 مستند عام
}

function isDispatchDoc(url) {
  if (!url) return false;
  const fn = decodeURIComponent(String(url).split('?')[0].split('/').pop()).toLowerCase();
  return fn.includes('__delivery_note__') || 
         fn.includes('__sales_contract__') || 
         fn.includes('__contract__') || 
         fn.includes('__installation_report__') || 
         fn.includes('__job_order__') || 
         fn.includes('__tax_invoice__') || 
         fn.includes('__cash_receipt__') ||
         fn.includes('صرف') || fn.includes('عقد') || fn.includes('تركيب') || fn.includes('فاتورة') || fn.includes('invoice');
}

function isIntakeDoc(url) {
  if (!url) return false;
  const fn = decodeURIComponent(String(url).split('?')[0].split('/').pop()).toLowerCase();
  if (fn.includes('__intake_receipt__') || fn.includes('__delivery_receipt__') || fn.includes('استلام') || fn.includes('توريد') || fn.includes('intake')) {
    return true;
  }
  return !isDispatchDoc(url);
}

// --- SMART PERSISTENT CLIENT IMAGE CACHE ---
const DOCS_CACHE_NAME = 'futureair-documents-cache-v1';

async function getCachedDocImageUrl(url) {
  if (!url || !('caches' in window) || !url.startsWith('https://')) return url;
  try {
    const cache = await caches.open(DOCS_CACHE_NAME);
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
    // Fetch in background and store permanently
    fetch(url, { mode: 'cors' }).then(res => {
      if (res && res.ok) cache.put(url, res);
    }).catch(() => {});
    return url;
  } catch (e) {
    return url;
  }
}

function cacheDocImageOnLoad(imgEl, originalUrl) {
  if (!('caches' in window) || !originalUrl || !originalUrl.startsWith('https://')) return;
  caches.open(DOCS_CACHE_NAME).then(cache => {
    cache.match(originalUrl).then(match => {
      if (!match) {
        fetch(originalUrl, { mode: 'cors' }).then(res => {
          if (res && res.ok) cache.put(originalUrl, res);
        }).catch(() => {});
      }
    });
  }).catch(() => {});
}

// --- PAGINATED CONTRACTS & DOCUMENTS GALLERY ---
let allCachedContractItems = [];
let visibleContractsCount = 24;
let activeDocFilter = 'all';

function isMarkerMatch(itemMarker, filterMarker) {
  if (!filterMarker || filterMarker === 'all') return true;
  if (itemMarker === filterMarker) return true;
  if ((filterMarker === '__sales_contract__' || filterMarker === '__contract__') && (itemMarker === '__contract__' || itemMarker === '__sales_contract__')) return true;
  if ((filterMarker === '__job_order__' || filterMarker === '__installation_report__') && (itemMarker === '__installation_report__' || itemMarker === '__job_order__')) return true;
  if ((filterMarker === '__delivery_receipt__' || filterMarker === '__intake_receipt__') && (itemMarker === '__intake_receipt__' || itemMarker === '__delivery_receipt__')) return true;
  return false;
}

function renderContractsTab() {
  prebuildRecipientCache();
  const items = [];

  // 1. Collect attachments from Devices
  stateCache.devices.forEach(d => {
    if (d.contract_images && d.contract_images.length > 0) {
      const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
      const batchId = batchInfo ? batchInfo.batchId : null;

      d.contract_images.forEach(imgUrl => {
        const dt = getDocType(imgUrl);
        const docDate = d.installed_at || d.assigned_at || d.created_at;
        items.push({
          imgUrl: imgUrl,
          dt: dt,
          title: resolveRecipientName(d),
          serial: d.serial_number,
          date: docDate ? new Date(docDate) : null,
          batchId: batchId
        });
      });
    }
  });

  // 2. Collect attachments from Cash Flow records
  stateCache.cashFlow.forEach(c => {
    if (c.description && c.description.includes('__ATTACHMENT__')) {
      const parts = c.description.split('__ATTACHMENT__');
      const imgUrl = parts[1] ? parts[1].trim() : '';
      if (imgUrl) {
        const dt = getDocType(imgUrl);
        const cleanDesc = parts[0].trim();
        items.push({
          imgUrl: imgUrl,
          dt: dt,
          title: cleanDesc || 'معاملة خزنة يدوية',
          serial: 'غير مرتبط بجهاز',
          date: c.created_at ? new Date(c.created_at) : null,
          batchId: null
        });
      }
    }
  });

  // Sort items by date descending
  items.sort((a, b) => {
    const da = a.date ? a.date.getTime() : 0;
    const db = b.date ? b.date.getTime() : 0;
    return db - da;
  });

  allCachedContractItems = items;
  visibleContractsCount = 24;
  activeDocFilter = 'all';

  // Reset active filter chip UI
  document.querySelectorAll('.doc-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });

  renderFilteredContractsGallery();
}

function filterContracts(marker) {
  activeDocFilter = marker;
  visibleContractsCount = 24;

  // Update active chip UI
  document.querySelectorAll('.doc-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === marker);
  });

  renderFilteredContractsGallery();
}

function loadMoreContracts() {
  visibleContractsCount += 24;
  renderFilteredContractsGallery(true);
}

function renderFilteredContractsGallery(isAppend = false) {
  const container = document.getElementById('contracts-gallery-list');
  if (!container) return;

  const searchInput = document.getElementById('contracts-search');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const normalizedQuery = query.replace(/كار/g, 'kar').toUpperCase();

  // Filter items in memory
  const filtered = allCachedContractItems.filter(item => {
    // 1. Check marker match
    if (!isMarkerMatch(item.dt.marker, activeDocFilter)) return false;

    // 2. Check search query
    if (query) {
      const titleText = (item.title || '').toLowerCase();
      const serialText = (item.serial || '').toLowerCase();
      const normalizedCardText = (titleText + ' ' + serialText).replace(/كار/g, 'kar').toUpperCase();
      if (!normalizedCardText.includes(normalizedQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="info-text" style="grid-column: 1 / -1; text-align:center; padding: 40px 0;">لا توجد مستندات تطابق خيارات التصفية والبحث.</p>';
    return;
  }

  // Determine items to show: if search is active show up to 60, otherwise show visibleContractsCount
  const maxToShow = query ? Math.max(visibleContractsCount, 60) : visibleContractsCount;
  const itemsToShow = filtered.slice(0, maxToShow);
  const hasMore = filtered.length > itemsToShow.length;

  container.innerHTML = '';

  itemsToShow.forEach(item => {
    const dateStr = item.date ? item.date.toLocaleDateString('ar-EG') : 'غير محدد';
    const el = document.createElement('div');
    el.className = 'contract-item';
    el.dataset.marker = item.dt.marker;
    
    if (item.batchId) {
      el.style.cssText = `
        position: relative;
        border-top: 4px solid ${item.dt.bg};
        border-right: 4px solid #a855f7;
        border-left: 1px solid rgba(168, 85, 247, 0.4);
        border-bottom: 1px solid rgba(168, 85, 247, 0.4);
        background: linear-gradient(160deg, rgba(168, 85, 247, 0.12), rgba(15, 23, 42, 0.9));
        box-shadow: 0 8px 24px rgba(168, 85, 247, 0.25);
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
      `;
    } else {
      el.style.cssText = `position:relative; border-top:4px solid ${item.dt.bg}; cursor:pointer; border-radius: 8px;`;
    }

    el.onclick = () => viewDocument(item.imgUrl, item.dt.label);

    const batchBannerHtml = item.batchId ? `
      <div style="margin-top: 6px; padding: 4px 8px; background: rgba(168, 85, 247, 0.25); color: #e9d5ff; border: 1px solid rgba(168, 85, 247, 0.5); border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
        🔗 إذن عملية مجمعة (#${item.batchId})
      </div>
    ` : '';

    el.innerHTML = `
      <span style="position:absolute;top:8px;right:8px;background:${item.dt.bg};color:white;padding:2px 8px;font-size:0.72rem;font-weight:600;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.2);z-index:2;">${item.dt.label}</span>
      <img class="contract-thumb" src="${item.imgUrl}" alt="${item.dt.label}" loading="lazy" onload="cacheDocImageOnLoad(this, '${item.imgUrl}')">
      <p style="margin:10px 0 4px;font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.title}">${item.title}</p>
      <span style="font-size:0.8rem;color:var(--text-muted);">${item.serial !== 'غير مرتبط بجهاز' ? 'سريال: ' + item.serial : item.serial}</span><br>
      <span style="font-size:0.78rem;color:var(--text-muted);">🗓️ ${dateStr}</span>
      ${batchBannerHtml}
    `;

    // Try loading immediately from persistent client cache (zero network request)
    if ('caches' in window && item.imgUrl && item.imgUrl.startsWith('https://')) {
      caches.open(DOCS_CACHE_NAME).then(c => c.match(item.imgUrl)).then(res => {
        if (res) {
          res.blob().then(blob => {
            const imgTag = el.querySelector('img.contract-thumb');
            if (imgTag) imgTag.src = URL.createObjectURL(blob);
          });
        }
      }).catch(() => {});
    }

    container.appendChild(el);
  });

  // Render "Load More" pagination button if more items remain
  if (hasMore) {
    const remaining = filtered.length - itemsToShow.length;
    const loadMoreDiv = document.createElement('div');
    loadMoreDiv.id = 'load-more-contracts-wrapper';
    loadMoreDiv.style.cssText = 'grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; padding: 24px 0 16px; width: 100%;';
    loadMoreDiv.innerHTML = `
      <button type="button" class="btn" onclick="loadMoreContracts()" style="display: inline-flex; align-items: center; gap: 10px; font-weight: 700; padding: 12px 28px; border-radius: 12px; font-size: 0.95rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.3)); border: 1px solid rgba(59, 130, 246, 0.5); color: #93c5fd; cursor: pointer; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.2); transition: all 0.2s;">
        <span>📥 عرض 24 مستنداً إضافياً</span>
        <span style="background: rgba(255,255,255,0.18); padding: 3px 10px; border-radius: 20px; font-size: 0.8rem; color: #fff;">متبقي ${remaining}</span>
      </button>
    `;
    container.appendChild(loadMoreDiv);
  }
}

window.loadMoreContracts = loadMoreContracts;
window.filterContracts = filterContracts;


// --- MODAL UTILITIES ---
function openModal(modalId) {
  console.log('🔓 [openModal] Opening modal:', modalId);
  const modalEl = document.getElementById(modalId);
  if (!modalEl) {
    console.error('❌ [openModal] Modal element NOT found in DOM:', modalId);
    alert('❌ لم يتم العثور على عنصر النافذة المنبثقة في الصفحة: ' + modalId);
    return;
  }
  if (modalId === 'add-cash-modal') {
    document.getElementById('add-cash-form').reset();
    const helpDiv = document.getElementById('cash-type-help');
    if (helpDiv) {
      helpDiv.innerHTML = '';
      helpDiv.classList.add('hidden');
    }
    // Populate technicians, assistants, and drivers selects dynamically
    const techSelect = document.getElementById('cash-tech-select');
    const assistantSelect = document.getElementById('cash-assistant-select');
    const driverSelect = document.getElementById('cash-driver-select');
    
    if (techSelect) {
      techSelect.innerHTML = '<option value="">-- بدون فني --</option>';
      stateCache.technicians.forEach(t => {
        techSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
      });
    }
    if (assistantSelect) {
      assistantSelect.innerHTML = '<option value="">-- بدون مساعد --</option>';
      stateCache.technicians.forEach(t => {
        assistantSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
      });
    }
    if (driverSelect) {
      driverSelect.innerHTML = '<option value="">-- بدون سائق --</option>';
      stateCache.technicians.forEach(t => {
        driverSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
      });
    }
  }
  modalEl.classList.add('active');
  modalEl.style.setProperty('display', 'flex', 'important');
  modalEl.style.setProperty('z-index', '999999', 'important');
  modalEl.style.setProperty('opacity', '1', 'important');
  modalEl.style.setProperty('visibility', 'visible', 'important');
  modalEl.style.setProperty('pointer-events', 'auto', 'important');

  // Focus the window & modal for Telegram Desktop WebView on PC
  try {
    window.focus();
  } catch (e) {}

  // Initialize Flatpickr date pickers inside this modal
  if (typeof initAllDatePickers === 'function') {
    setTimeout(() => {
      initAllDatePickers(modalEl);
    }, 40);
  }
}

function closeModal(modalId) {
  console.log('🔒 [closeModal] Closing modal:', modalId);
  const modalEl = document.getElementById(modalId);
  if (modalEl) {
    modalEl.classList.remove('active');
    modalEl.style.setProperty('display', 'none', 'important');
  }
  if (modalId === 'dispatch-device-modal' && typeof resetDispatchForm === 'function') {
    resetDispatchForm();
  }
}

function getBatchDeviceImages(device) {
  if (!device) return [];
  const txt = `${device.installment_notes || ''} ${device.notes || ''}`;
  const match = txt.match(/#(REC-\d+|DISP-\d+)/);
  if (!match) return device.contract_images || [];
  
  const batchId = match[1];
  const seen = new Set();
  const allImages = [];
  (stateCache.devices || []).forEach(d => {
    const dTxt = `${d.installment_notes || ''} ${d.notes || ''}`;
    if (dTxt.includes('#' + batchId) && d.contract_images) {
      d.contract_images.forEach(img => {
        if (!img) return;
        const clean = String(img).split('?')[0].trim();
        if (!seen.has(clean)) {
          seen.add(clean);
          allImages.push(img);
        }
      });
    }
  });
  return allImages.length > 0 ? allImages : (device.contract_images || []);
}

function getDeviceDocumentsHtml(contractImages, deviceId, showDelete = true) {
  if (!contractImages || contractImages.length === 0) return '';
  const seen = new Set();
  const uniqueImages = [];
  (contractImages || []).forEach(url => {
    if (!url) return;
    const cleanUrl = String(url).split('?')[0].trim();
    if (!seen.has(cleanUrl)) {
      seen.add(cleanUrl);
      uniqueImages.push(url);
    }
  });

  return uniqueImages.map((url) => {
    if (!url) return '';
    const dt = getDocType(url);
    const safeUrl = String(url).replace(/'/g, "\\'");
    const dtLabel = (dt && dt.label) ? String(dt.label).replace(/'/g, "\\'") : 'مستند';
    const dtBg = (dt && dt.bg) ? dt.bg : 'var(--accent)';
    
    if (showDelete && deviceId) {
      const safeDevId = String(deviceId).replace(/'/g, "\\'");
      return `
        <span style="display:inline-flex; align-items:center; gap:2px; margin-bottom:2px;">
          <button type="button" class="btn btn-secondary btn-table" style="background:${dtBg};color:white;padding:4px 8px;font-size:0.8rem;font-weight:600;border-radius:4px 0 0 4px;border-right:1px solid rgba(0,0,0,0.2);" onclick="viewDocument('${safeUrl}', '${dtLabel}')">${dt.label}</button>
          <button type="button" title="حذف هذا المستند فقط" style="background:rgba(231,76,60,0.25);border:none;color:#e74c3c;cursor:pointer;padding:4px 6px;font-size:0.85rem;border-radius:0 4px 4px 0;line-height:1;" onclick="deleteDeviceDocument('${safeDevId}', '${safeUrl}', '${dtLabel}')">✕</button>
        </span>`;
    } else {
      return `
        <span style="display:inline-flex; align-items:center; gap:2px; margin-bottom:2px;">
          <button type="button" class="btn btn-secondary btn-table" style="background:${dtBg};color:white;padding:4px 8px;font-size:0.8rem;font-weight:600;border-radius:4px;" onclick="viewDocument('${safeUrl}', '${dtLabel}')">${dt.label}</button>
        </span>`;
    }
  }).filter(Boolean).join(' ');
}

async function deleteDeviceDocument(deviceId, docUrl, docLabel) {
  if (!confirm(`⚠️ هل أنت متأكد من حذف مستند "${docLabel}" من هذا الجهاز فقط؟\n\n📌 تنبيه هام:\n- لن يتم حذف الجهاز.\n- لن يتم مسح حركة الجهاز في المخزن أو سجل المبيعات.\n- سيتم فقط إزالة هذا المرفق المحدد.`)) return;

  const device = stateCache.devices.find(d => d.id === deviceId);
  if (!device) { alert('الجهاز غير موجود!'); return; }

  // Check if device belongs to a batch
  const txt = `${device.installment_notes || ''} ${device.notes || ''}`;
  const match = txt.match(/#(REC-\d+|DISP-\d+)/);
  const batchId = match ? match[1] : null;
  const cleanDocUrl = String(docUrl).split('?')[0];

  try {
    if (batchId) {
      // If batch, remove the document from all devices belonging to this batch
      const batchDevices = (stateCache.devices || []).filter(d => {
        const dTxt = `${d.installment_notes || ''} ${d.notes || ''}`;
        return dTxt.includes('#' + batchId);
      });
      for (const bDev of batchDevices) {
        const bImages = (bDev.contract_images || []).filter(u => u && String(u).split('?')[0] !== cleanDocUrl);
        const { error } = await supabase
          .from('devices')
          .update({ contract_images: bImages })
          .eq('id', bDev.id);
        if (error) throw error;
        bDev.contract_images = bImages;
      }
    } else {
      const newImages = (device.contract_images || []).filter(u => u && String(u).split('?')[0] !== cleanDocUrl);
      const { error } = await supabase
        .from('devices')
        .update({ contract_images: newImages })
        .eq('id', deviceId);
      if (error) throw error;
      device.contract_images = newImages;
    }

    await initApp();
    alert('✅ تم حذف المرفق بنجاح دون المساس بالجهاز أو حركته بالمخزن!');
  } catch (err) {
    alert('❌ حدث خطأ أثناء حذف المستند: ' + err.message);
  }
}
window.deleteDeviceDocument = deleteDeviceDocument;


function prebuildRecipientCache() {
  const map = new Map();
  (stateCache.cashFlow || []).forEach(c => {
    if (!c.description) return;
    let extractedName = null;
    if (c.description.includes('للتاجر:')) {
      const parts = c.description.split('للتاجر:');
      if (parts[1]) {
        extractedName = parts[1].split('(سيريال:')[0].split('|')[0].trim();
      }
    } else if (c.description.includes('العميل:')) {
      const parts = c.description.split('العميل:');
      if (parts[1]) {
        extractedName = parts[1].split('-')[0].split('|')[0].trim();
      }
    }
    
    if (extractedName) {
      const normalizedDesc = c.description.replace(/كار/g, 'KAR').toUpperCase();
      const match = normalizedDesc.match(/DEV-KAR-\d+/);
      if (match) {
        map.set(match[0], extractedName);
      }
    }
  });
  window.cashFlowRecipientCache = map;
}

function resolveRecipientName(device, docTypeMarker = null) {
  if (!device) return 'تاجر/عميل';
  
  if (docTypeMarker === '__delivery_receipt__' || (typeof docTypeMarker === 'string' && docTypeMarker.includes('delivery_receipt'))) {
    if (device.supplier_id) {
      const trader = (stateCache.suppliers || []).find(s => s.id === device.supplier_id);
      if (trader) return trader.name;
    }
    return 'المورد / التاجر';
  }
  
  let recipientName = (device.customer_name && device.customer_name !== 'مبيعات سابقة غير مسجلة') ? device.customer_name : '';
  if (!recipientName || recipientName === 'غير محدد') {
    if (device.supplier_id) {
      const trader = (stateCache.suppliers || []).find(s => s.id === device.supplier_id);
      recipientName = trader ? trader.name : 'تاجر';
    }
  }

  // Look up in cache first for O(1) performance
  const normSerial = device.serial_number ? device.serial_number.replace(/كار/g, 'KAR').toUpperCase() : '';
  if (normSerial && window.cashFlowRecipientCache && window.cashFlowRecipientCache.has(normSerial)) {
    return window.cashFlowRecipientCache.get(normSerial);
  }

  // Fallback to O(N) search if cache is not prebuilt
  const matchSerialInText = (text, serial) => {
    if (!text || !serial) return false;
    const normalizedText = text.replace(/كار/g, 'KAR').toUpperCase();
    const normalizedSerial = serial.replace(/كار/g, 'KAR').toUpperCase();
    return normalizedText.includes(normalizedSerial);
  };

  const serialMatch = (stateCache.cashFlow || []).find(c => c.description && matchSerialInText(c.description, device.serial_number));
  if (serialMatch && serialMatch.description) {
    const desc = serialMatch.description;
    if (desc.includes('للتاجر:')) {
      const parts = desc.split('للتاجر:');
      if (parts[1]) {
        const extracted = parts[1].split('(سيريال:')[0].split('|')[0].trim();
        if (extracted) recipientName = extracted;
      }
    } else if (desc.includes('العميل:')) {
      const parts = desc.split('العميل:');
      if (parts[1]) {
        const extracted = parts[1].split('-')[0].split('|')[0].trim();
        if (extracted) recipientName = extracted;
      }
    }
  }

  return recipientName || 'تاجر/عميل';
}

let currentPreviewUrl = '';

function viewDocument(imgUrl, docTypeLabel) {
  currentPreviewUrl = imgUrl;
  
  const dt = getDocType(imgUrl);
  const docType = {
    label: dt.label,
    icon: dt.icon || '📄',
    color: dt.color || dt.bg || 'var(--accent)'
  };

  let recipient = 'غير مرتبط بجهاز / غير محدد';
  let deviceName = 'غير مرتبط بجهاز';
  let serialNumber = 'غير مرتبط بجهاز';
  let financialInfo = 'غير متوفر';
  let metaInfo = 'غير متوفر';

  // 1. Scan devices to find who owns this image URL in contract_images
  let device = (stateCache.devices || []).find(d => d.contract_images && d.contract_images.includes(imgUrl));
  
  // 2. Scan cashFlow to find who owns this image URL in description
  let cashEntry = null;
  if (!device) {
    cashEntry = (stateCache.cashFlow || []).find(c => c.description && c.description.includes(imgUrl));
  }

  // 3. Scan supplier_transactions to find who owns this image URL in notes
  let txEntry = null;
  if (!device && !cashEntry) {
    txEntry = ((currentSupplierStatementData && currentSupplierStatementData.transactions) || stateCache.supplier_transactions || []).find(t => t.notes && t.notes.includes(imgUrl));
  }

  try {
    if (cashEntry) {
      let displayDesc = cashEntry.description.split('__ATTACHMENT__')[0].trim();
      recipient = 'الشركة (الخزنة)';
      deviceName = 'معاملة خزنة يدوية';
      serialNumber = 'غير مرتبط بجهاز';
      financialInfo = `نوع المعاملة: ${cashEntry.type} | القيمة: ${cashEntry.amount.toLocaleString()} ج.م`;
      metaInfo = `${new Date(cashEntry.created_at).toLocaleDateString('ar-EG')}`;
    } else if (txEntry) {
      const sup = (stateCache.suppliers || []).find(s => s.id === txEntry.supplier_id);
      const supName = sup ? sup.name : (currentSupplierStatementData.supplierName || 'تاجر / مورد');
      recipient = supName;
      deviceName = `معاملة كشف حساب (${txEntry.transaction_type})`;
      serialNumber = 'غير مرتبط بجهاز';
      financialInfo = `نوع المعاملة: ${txEntry.transaction_type} | القيمة: ${Number(txEntry.amount || 0).toLocaleString()} ج.م`;
      metaInfo = `${new Date(txEntry.created_at).toLocaleDateString('ar-EG')}`;
    } else if (device) {
      recipient = resolveRecipientName(device, dt.marker);

      const isDeliveryReceipt = dt.marker === '__delivery_receipt__' || (imgUrl && imgUrl.includes('delivery_receipts'));
      if (isDeliveryReceipt) {
        if (device.supplier_id) {
          const sup = (stateCache.suppliers || []).find(s => s.id === device.supplier_id);
          if (sup) recipient = sup.name;
        }
        deviceName = `${device.brand} (${device.capacity})`;
        serialNumber = device.serial_number;
        financialInfo = `تكلفة الشراء من المورد: ${(device.cost_price || 0).toLocaleString()} ج.م`;
      } else {
        const batchInfo = getBatchInfoFromText(device.installment_notes || device.notes, device.id);
        if (batchInfo) {
          const batchDevs = (stateCache.devices || []).filter(d => `${d.installment_notes || ''} ${d.notes || ''}`.includes(batchInfo.batchId));
          if (batchDevs.length > 0) {
            deviceName = `أجهزة مجمعة (${batchDevs.length} أجهزة): ` + batchDevs.map(bd => `${bd.brand} (${bd.capacity})`).join(' + ');
            serialNumber = batchDevs.map(bd => bd.serial_number).join(' / ');

            let totalSale = 0;
            let totalPaid = 0;
            let totalRemaining = 0;
            batchDevs.forEach(bd => {
              totalSale += Number(bd.sale_price || bd.cost_price || 0);
              totalPaid += Number(bd.amount_paid || (bd.status !== 'متاح' ? bd.sale_price : 0) || 0);
              totalRemaining += Number(bd.amount_remaining || 0);
            });
            financialInfo = `إجمالي الإذن المجمع: ${totalSale.toLocaleString()} ج.م | المدفوع: ${totalPaid.toLocaleString()} ج.م | المتبقي: ${totalRemaining.toLocaleString()} ج.م`;
          } else {
            deviceName = `${device.brand} (${device.capacity})`;
            serialNumber = device.serial_number;
            if (device.status === 'تم التركيب' || device.status === 'صرف لتاجر') {
              financialInfo = `سعر البيع: ${(device.sale_price || 0).toLocaleString()} ج.م | المدفوع: ${(device.amount_paid || 0).toLocaleString()} ج.م | المتبقي: ${(device.amount_remaining || 0).toLocaleString()} ج.م`;
            } else {
              financialInfo = `تكلفة الشراء: ${(device.cost_price || 0).toLocaleString()} ج.م (${device.status})`;
            }
          }
        } else {
          deviceName = `${device.brand} (${device.capacity})`;
          serialNumber = device.serial_number;
          if (device.status === 'تم التركيب' || device.status === 'صرف لتاجر') {
            financialInfo = `سعر البيع: ${(device.sale_price || 0).toLocaleString()} ج.م | المدفوع: ${(device.amount_paid || 0).toLocaleString()} ج.م | المتبقي: ${(device.amount_remaining || 0).toLocaleString()} ج.م`;
          } else {
            financialInfo = `تكلفة الشراء: ${(device.cost_price || 0).toLocaleString()} ج.م (${device.status})`;
          }
        }
      }

      const docDate = device.installed_at || device.assigned_at || device.created_at;
      if (docDate) {
        metaInfo = `${new Date(docDate).toLocaleDateString('ar-EG')}`;
      }
    } else {
      // Fallback folder-based check if not in memory arrays
      const pathParts = new URL(imgUrl).pathname.split('/');
      const deviceIdSeg = pathParts[pathParts.length - 2];
      if (deviceIdSeg && deviceIdSeg !== 'cash_flow' && deviceIdSeg !== 'delivery_receipts') {
        const fallbackDev = (stateCache.devices || []).find(d => d.id === deviceIdSeg);
        if (fallbackDev) {
          deviceName = `${fallbackDev.brand} (${fallbackDev.capacity})`;
          serialNumber = fallbackDev.serial_number;
          recipient = (fallbackDev.customer_name && fallbackDev.customer_name !== 'مبيعات سابقة غير مسجلة') ? fallbackDev.customer_name : 'غير محدد';
          financialInfo = `تكلفة الشراء: ${(fallbackDev.cost_price || 0).toLocaleString()} ج.م`;
          metaInfo = `${new Date(fallbackDev.created_at).toLocaleDateString('ar-EG')}`;
        }
      }
    }
  } catch (_) {}

  let docTitle = '';
  if (cashEntry) {
    docTitle = cashEntry.description.split('__ATTACHMENT__')[0].trim();
  } else if (txEntry) {
    docTitle = (txEntry.notes || '').split('__ATTACHMENT__')[0].trim();
  } else if (device) {
    docTitle = resolveRecipientName(device, dt.marker);
  }

  // Fill details with smart cache fallback
  const previewImgEl = document.getElementById('preview-image-element');
  previewImgEl.src = imgUrl;
  if ('caches' in window && imgUrl && imgUrl.startsWith('https://')) {
    caches.open(DOCS_CACHE_NAME).then(c => c.match(imgUrl)).then(res => {
      if (res) {
        res.blob().then(blob => {
          previewImgEl.src = URL.createObjectURL(blob);
        });
      }
    }).catch(() => {});
  }
  document.getElementById('preview-doc-type').textContent = docType.label;
  document.getElementById('preview-doc-type').style.color = docType.color;
  document.getElementById('preview-doc-icon').textContent = docType.icon;
  document.getElementById('preview-doc-title').textContent = docTitle || '';
  document.getElementById('preview-doc-meta').textContent = metaInfo ? `🗓️ تاريخ العملية: ${metaInfo}` : '';
  
  document.getElementById('preview-detail-recipient').textContent = recipient;
  document.getElementById('preview-detail-device').textContent = deviceName;
  const devOutdoor = device ? getOutdoorSerial(device) : '';
  const serialDisplay = devOutdoor ? `${serialNumber} (كباس: ${devOutdoor})` : serialNumber;
  document.getElementById('preview-detail-serial').textContent = serialDisplay;
  document.getElementById('preview-detail-financial').textContent = financialInfo;
  
  // Populate Batch Details if document belongs to a batch
  const batchRow = document.getElementById('preview-batch-row');
  if (device) {
    const batchInfo = getBatchInfoFromText(device.installment_notes || device.notes, device.id);
    if (batchInfo && batchRow) {
      batchRow.style.display = 'block';
      document.getElementById('preview-batch-id').innerText = '#' + batchInfo.batchId;

      const batchDevs = (stateCache.devices || []).filter(d => `${d.installment_notes || ''} ${d.notes || ''}`.includes(batchInfo.batchId));
      
      const devListHtml = batchDevs.map(bd => {
        const priceVal = bd.status === 'متاح' 
          ? (bd.cost_price ? Number(bd.cost_price).toLocaleString() + ' ج.م (تكلفة)' : '—')
          : (bd.sale_price ? Number(bd.sale_price).toLocaleString() + ' ج.م (سعر بيع)' : (bd.cost_price ? Number(bd.cost_price).toLocaleString() + ' ج.م (تكلفة)' : '—'));
        const bdOutdoor = getOutdoorSerial(bd);

        return `
          <div style="margin-top: 5px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.25);">
            <div>
              ▫️ <strong>${bd.brand} (${bd.capacity})</strong> — فانة: <code style="color:var(--accent-cyan); font-weight:700;">${bd.serial_number}</code>${bdOutdoor ? ` ┃ كباس: <code style="color:#f59e0b; font-weight:700;">${bdOutdoor}</code>` : ''}
              ${bd.customer_name ? `<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">العميل/الاستلام: ${bd.customer_name}</div>` : ''}
            </div>
            <div style="font-weight: 700; color: #c084fc; font-size: 0.9rem; white-space: nowrap; padding-right: 8px;">
              ${priceVal}
            </div>
          </div>
        `;
      }).join('');
      document.getElementById('preview-batch-devices-list').innerHTML = devListHtml || '—';

      let totalCost = 0;
      let totalSale = 0;
      batchDevs.forEach(bd => {
        totalCost += Number(bd.cost_price || 0);
        totalSale += Number(bd.sale_price || 0);
      });
      const totalDisplay = totalSale > 0 ? totalSale : totalCost;
      const labelStr = totalSale > 0 ? 'إجمالي قيمة الإذن المجمع (سعر البيع)' : 'إجمالي تكلفة الإذن المجمع';
      document.getElementById('preview-batch-financial-summary').innerHTML = `💰 <strong>${labelStr}:</strong> ${totalDisplay.toLocaleString()} ج.م (${batchDevs.length} أجهزة)`;
    } else if (batchRow) {
      batchRow.style.display = 'none';
    }
  } else if (batchRow) {
    batchRow.style.display = 'none';
  }

  document.getElementById('preview-open-link').href = imgUrl;
  document.getElementById('preview-download-link').href = imgUrl;

  // Populate select dropdown
  const select = document.getElementById('preview-change-type-select');
  select.innerHTML = '';
  DOC_TYPES.forEach(t => {
    const isSelected = (dt.marker === t.marker) ? 'selected' : '';
    select.innerHTML += `<option value="${t.marker}" ${isSelected}>${t.label}</option>`;
  });

  openModal('photo-preview-modal');
}

async function changeDocumentType() {
  const select = document.getElementById('preview-change-type-select');
  const newMarker = select.value;
  const oldUrl = currentPreviewUrl;
  const currentDt = getDocType(oldUrl);

  if (currentDt.marker === newMarker) {
    alert('⚠️ المستند مصنف بالفعل تحت هذا النوع!');
    return;
  }

  const btn = document.getElementById('preview-change-type-btn');
  const originalText = btn.textContent;
  btn.textContent = 'جاري الحفظ...';
  btn.disabled = true;

  try {
    // Look up owners by URL scanning
    const matchingDevices = (stateCache.devices || []).filter(d => d.contract_images && d.contract_images.includes(oldUrl));
    const matchingCashFlows = (stateCache.cashFlow || []).filter(c => c.description && c.description.includes(oldUrl));

    // Extract path in contracts bucket
    let oldPath = '';
    if (oldUrl.includes('/public/contracts/')) {
      oldPath = oldUrl.split('/public/contracts/')[1];
    } else if (oldUrl.includes('/contracts/')) {
      oldPath = oldUrl.split('/contracts/')[1];
    } else {
      const urlObj = new URL(oldUrl);
      const parts = urlObj.pathname.split('/');
      const cIdx = parts.indexOf('contracts');
      oldPath = cIdx !== -1 ? parts.slice(cIdx + 1).join('/') : `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }

    if (!oldPath) throw new Error('تعذر تحديد مسار الملف في التخزين');

    const pathParts = oldPath.split('/');
    const originalFilename = pathParts[pathParts.length - 1];
    const folderName = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : (matchingDevices[0]?.id || 'cash_flow');

    // Extract extension and clean base name
    const extIndex = originalFilename.lastIndexOf('.');
    const ext = extIndex !== -1 ? originalFilename.substring(extIndex) : '.jpg';
    let baseName = extIndex !== -1 ? originalFilename.substring(0, extIndex) : originalFilename;

    // Strip all known markers
    ALL_LEGACY_MARKERS.forEach(m => {
      baseName = baseName.split(m).join('');
    });
    baseName = baseName.replace(/__\w+__/, '').trim();

    // Generate guaranteed unique filename with random salt to avoid any storage collision
    const uniqueStamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cleanBase = baseName.replace(/^\d+_/, '').replace(/_[a-z0-9]{4,6}$/, '') || 'doc';
    const newFilename = `${uniqueStamp}_${cleanBase}${newMarker}${ext}`;
    const newPath = `${folderName}/${newFilename}`;

    const decodedOldPath = decodeURIComponent(oldPath);
    const decodedNewPath = decodeURIComponent(newPath);

    if (decodedOldPath === decodedNewPath) {
      alert('⚠️ المستند مصنف بهذا التصنيف بالفعل!');
      return;
    }

    // 1. Move or Copy file in Supabase Storage
    const { error: moveErr } = await supabase.storage
      .from('contracts')
      .move(decodedOldPath, decodedNewPath);

    if (moveErr) {
      // Fallback: Copy and then delete old
      const { error: copyErr } = await supabase.storage
        .from('contracts')
        .copy(decodedOldPath, decodedNewPath);
      if (copyErr) throw copyErr;
      await supabase.storage.from('contracts').remove([decodedOldPath]).catch(() => {});
    }

    // 2. Get new public url
    const { data: { publicUrl } } = supabase.storage
      .from('contracts')
      .getPublicUrl(decodedNewPath);

    // 3. Update Database References for Devices
    for (const dev of matchingDevices) {
      const nextImages = (dev.contract_images || []).map(url => url === oldUrl ? publicUrl : url);
      await supabase
        .from('devices')
        .update({ contract_images: nextImages })
        .eq('id', dev.id);
    }

    // 4. Update Database References for Cash Flow
    for (const cash of matchingCashFlows) {
      const newDescription = (cash.description || '').split(oldUrl).join(publicUrl);
      await supabase
        .from('cash_flow')
        .update({ description: newDescription })
        .eq('id', cash.id);
    }

    // 5. Reinitialize local cache & tab display
    closeModal('photo-preview-modal');
    await initApp();
    
    // 6. Re-open with new details
    viewDocument(publicUrl);
    alert('✅ تم تعديل تصنيف المستند بنجاح وتحديث كافة السجلات!');
  } catch (err) {
    alert('خطأ أثناء تغيير تصنيف المستند: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function openPaySupplierModal(supplierId, name) {
  document.getElementById('pay-supplier-id').value = supplierId;
  document.getElementById('pay-supplier-name').value = name;
  document.getElementById('pay-supplier-amount').value = '';
  const dateInput = document.getElementById('pay-supplier-date');
  if (dateInput) {
    dateInput.value = new Date().toLocaleDateString('en-CA');
  }
  const receiptInput = document.getElementById('pay-supplier-receipt');
  if (receiptInput) {
    receiptInput.value = '';
  }
  openModal('pay-supplier-modal');
}

function openCollectPaymentModal(deviceId, customerName, remaining) {
  const dev = stateCache.devices.find(d => d.id === deviceId);
  document.getElementById('collect-device-id').value = deviceId;
  document.getElementById('collect-customer-name').value = customerName;
  document.getElementById('collect-amount-remaining').value = `${remaining.toLocaleString()} ج.م`;
  
  if (dev && dev.installment_monthly && dev.installment_monthly > 0) {
    document.getElementById('collect-amount').value = dev.installment_monthly;
  } else {
    document.getElementById('collect-amount').value = '';
  }
  
  openModal('collect-payment-modal');
}

// --- FORM ACTIONS IMPLEMENTATIONS (WRITE OPS) ---

function toggleCashCustomerFields() {
  const cashType = document.getElementById('cash-type').value;
  const section = document.getElementById('cash-customer-section');
  if (!section) return;
  const nameInput = document.getElementById('cash-customer-name');
  const phoneInput = document.getElementById('cash-customer-phone');
  const addressInput = document.getElementById('cash-customer-address');

  const techId = document.getElementById('cash-tech-select')?.value || '';
  const assistantId = document.getElementById('cash-assistant-select')?.value || '';
  const driverId = document.getElementById('cash-driver-select')?.value || '';

  const isJobOrder = (techId !== '' || assistantId !== '' || driverId !== '');

  // Automatically update the document type dropdown to match
  const attachmentTypeSelect = document.getElementById('cash-attachment-type');
  if (attachmentTypeSelect) {
    if (isJobOrder) {
      attachmentTypeSelect.value = 'job_order';
    } else if (attachmentTypeSelect.value === 'job_order') {
      attachmentTypeSelect.value = 'general';
    }
  }

  if (cashType === 'إيراد' && isJobOrder) {
    section.classList.remove('hidden');
    nameInput.required = true;
    phoneInput.required = true;
    addressInput.required = true;
  } else {
    section.classList.add('hidden');
    nameInput.required = false;
    phoneInput.required = false;
    addressInput.required = false;
  }
}
window.toggleCashCustomerFields = toggleCashCustomerFields;

async function handleAddCashFlow(e) {
  e.preventDefault();
  const type = document.getElementById('cash-type').value;
  const amount = Number(document.getElementById('cash-amount').value);
  const rawDescription = document.getElementById('cash-desc').value;
  const paymentMethod = document.getElementById('cash-payment-method').value;
  const attachmentType = document.getElementById('cash-attachment-type').value;
  const editId = document.getElementById('cash-edit-id').value;

  try {
    let attachmentUrl = '';
    const fileInput = document.getElementById('cash-attachment-file');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      
      // Determine file marker based on attachment type
      let marker = '__general_doc__';
      if (attachmentType === 'job_order') {
        marker = '__job_order__';
      } else if (attachmentType === 'cash_receipt') {
        marker = '__cash_receipt__';
      }

      const rawExt1 = file.name.includes('.') ? file.name.split('.').pop() : '';
      const safeExt1 = rawExt1.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
      const uniqueId1 = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const fileName = `cash_flow/${uniqueId1}${marker}.${safeExt1}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(fileName, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName);
      attachmentUrl = publicUrl;
    }

    // Resolve employee names
    const leadTechId = document.getElementById('cash-tech-select').value;
    const assistantId = document.getElementById('cash-assistant-select').value;
    const driverId = document.getElementById('cash-driver-select').value;
    
    let leadTechName = '';
    let assistantName = '';
    let driverName = '';
    
    if (leadTechId) {
      const tech = stateCache.technicians.find(t => t.id === leadTechId);
      if (tech) leadTechName = tech.name;
    }
    if (assistantId) {
      const tech = stateCache.technicians.find(t => t.id === assistantId);
      if (tech) assistantName = tech.name;
    }
    if (driverId) {
      const tech = stateCache.technicians.find(t => t.id === driverId);
      if (tech) driverName = tech.name;
    }

    let description = '';
    if (type === 'إيراد' && attachmentType === 'job_order') {
      const custName = document.getElementById('cash-customer-name').value.trim();
      const custPhone = document.getElementById('cash-customer-phone').value.trim();
      const custAddress = document.getElementById('cash-customer-address').value.trim();
      description = `العميل: ${custName} | تليفون: ${custPhone} | عنوان: ${custAddress} | البيان: ${rawDescription}`;
    } else {
      description = rawDescription;
    }

    if (leadTechName) description += ` [الفني: ${leadTechName}]`;
    if (assistantName) description += ` [المساعد: ${assistantName}]`;
    if (driverName) description += ` [السائق: ${driverName}]`;
    
    description += ` | ${paymentMethod}`;

    if (attachmentUrl) {
      description += ` __ATTACHMENT__${attachmentUrl}`;
    } else if (editId) {
      // Keep original attachment if editing and no new file was uploaded
      const originalEntry = stateCache.cashFlow.find(x => x.id === editId);
      if (originalEntry && originalEntry.description.includes('__ATTACHMENT__')) {
        const parts = originalEntry.description.split('__ATTACHMENT__');
        if (parts[1]) {
          description += ` __ATTACHMENT__${parts[1].trim()}`;
        }
      }
    }

    if (editId) {
      // 1. Fetch original entry to reverse old liquidity
      const originalEntry = stateCache.cashFlow.find(x => x.id === editId);
      if (originalEntry) {
        const oldAmount = Number(originalEntry.amount);
        const oldMethod = getPaymentMethodFromDesc(originalEntry.description) || 'خزنة';
        const oldFactor = originalEntry.type === 'إيراد' ? 1 : -1;
        await autoUpdateLiquidity(oldMethod, oldAmount * oldFactor * -1);

        // Sync linked supplier transaction if this cash flow was a supplier payment or collection
        try {
          const cfTime = new Date(originalEntry.created_at).getTime();
          const minTime = new Date(cfTime - 120000).toISOString();
          const maxTime = new Date(cfTime + 120000).toISOString();

          const { data: stMatches } = await supabase
            .from('supplier_transactions')
            .select('*')
            .gte('created_at', minTime)
            .lte('created_at', maxTime);

          if (stMatches && stMatches.length > 0) {
            let targetSt = stMatches.find(st => Number(st.amount) === oldAmount);
            if (stMatches.length > 1) {
              const matchedBySup = stMatches.find(st => {
                const sup = (stateCache.suppliers || []).find(s => s.id === st.supplier_id);
                return sup && (originalEntry.description.includes(sup.name) || description.includes(sup.name));
              });
              if (matchedBySup) targetSt = matchedBySup;
            }

            if (targetSt) {
              let updatedNotes = targetSt.notes || '';
              if (updatedNotes.includes('طريقة:')) {
                updatedNotes = updatedNotes.replace(/طريقة:\s*[^|]+/, `طريقة: ${paymentMethod}`);
              }
              await supabase
                .from('supplier_transactions')
                .update({
                  amount: amount,
                  notes: updatedNotes
                })
                .eq('id', targetSt.id);
            }
          }
        } catch (syncErr) {
          console.warn('Failed to sync supplier transaction on cash flow edit:', syncErr);
        }
      }
      
      // 2. Update cash flow in database
      const { error } = await supabase
        .from('cash_flow')
        .update({ type, amount, description })
        .eq('id', editId);
      if (error) throw error;
      
      // 3. Apply new liquidity
      const newFactor = type === 'إيراد' ? 1 : -1;
      await autoUpdateLiquidity(paymentMethod, amount * newFactor);
    } else {
      // Mode is ADD
      const { error } = await supabase.from('cash_flow').insert({ type, amount, description });
      if (error) throw error;
      
      const factor = (type === 'إيراد') ? 1 : -1;
      await autoUpdateLiquidity(paymentMethod, amount * factor);
    }

    closeModal('add-cash-modal');
    e.target.reset();
    toggleCashCustomerFields();
    await initApp();
  } catch (err) {
    alert('Failed to save transaction: ' + err.message);
  }
}

async function handleAddTechnician(e) {
  e.preventDefault();
  const name = document.getElementById('tech-name').value.trim();
  const role = document.getElementById('tech-role').value.trim();
  const monthly_salary = Number(document.getElementById('tech-salary').value);

  try {
    const combinedName = `${name} | ${role}`;
    const { error } = await supabase.from('technicians').insert({ name: combinedName, monthly_salary });
    if (error) throw error;

    closeModal('add-tech-modal');
    e.target.reset();
    await initApp();
  } catch (err) {
    alert('Failed to save technician/employee: ' + err.message);
  }
}

async function handlePaySupplierSubmit(e) {
  e.preventDefault();
  const supplierId = document.getElementById('pay-supplier-id').value;
  const supplierName = document.getElementById('pay-supplier-name').value;
  const amount = Number(document.getElementById('pay-supplier-amount').value);
  const paymentMethod = document.getElementById('pay-supplier-method').value;
  const payDate = document.getElementById('pay-supplier-date')?.value || new Date().toLocaleDateString('en-CA');
  const receiptInput = document.getElementById('pay-supplier-receipt');

  try {
    let attachmentUrl = '';
    if (receiptInput && receiptInput.files && receiptInput.files[0]) {
      attachmentUrl = await uploadAttachmentFile(receiptInput.files[0], 'cash_flow', '__cash_receipt__');
    }

    const txCreatedAt = getIsoTimestampForDate(payDate);
    const txNotes = `دفعة سداد نقدية مسجلة من لوحة التحكم | طريقة: ${paymentMethod}${attachmentUrl ? ` __ATTACHMENT__${attachmentUrl}` : ''}`;
    const cfDesc = `سداد دفعة نقدية للمورد: ${supplierName} | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}${attachmentUrl ? ` __ATTACHMENT__${attachmentUrl}` : ''}`;

    // 1. Insert supplier transaction
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: amount,
        notes: txNotes,
        created_at: txCreatedAt
      });
    if (txErr) throw txErr;

    // 2. Log Cash Flow Expense
    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'مصروف',
        amount: amount,
        description: cfDesc,
        date: payDate,
        created_at: txCreatedAt
      });
    if (cashErr) throw cashErr;

    // 3. Deduct from Financial Center liquidity
    await autoUpdateLiquidity(paymentMethod, -amount);

    closeModal('pay-supplier-modal');
    await initApp();
    alert('✅ تم سداد الدفعة وتسجيل المرفق وتحديث الخزنة بنجاح!');
  } catch (err) {
    alert('Failed to record supplier payment: ' + err.message);
  }
}

async function handleCollectPaymentSubmit(e) {
  e.preventDefault();
  const deviceId = document.getElementById('collect-device-id').value;
  const customerName = document.getElementById('collect-customer-name').value;
  const amount = Number(document.getElementById('collect-amount').value);
  const paymentMethod = document.getElementById('collect-payment-method').value;

  try {
    const device = stateCache.devices.find(d => d.id === deviceId);
    if (!device) throw new Error('Device not found');

    const newPaid = Number(device.amount_paid) + amount;
    const newRemaining = Number(device.amount_remaining) - amount;

    if (newRemaining < 0) {
      alert('⚠️ لا يمكن تحصيل مبلغ أكبر من المتبقي على العميل!');
      return;
    }

    // Optional: Upload cash receipt image
    let receiptUrl = '';
    const receiptInput = document.getElementById('collect-receipt-image');
    if (receiptInput && receiptInput.files && receiptInput.files[0]) {
      const file = receiptInput.files[0];
      const rawExt2 = file.name.includes('.') ? file.name.split('.').pop() : '';
      const safeExt2 = rawExt2.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
      const uniqueId2 = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const fileName = `${deviceId}/${uniqueId2}__cash_receipt__.${safeExt2}`;
      const { error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(fileName, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName);
      receiptUrl = publicUrl;
    }

    // Build updated contract_images
    const nextImages = device.contract_images ? [...device.contract_images] : [];
    if (receiptUrl) nextImages.push(receiptUrl);

    // 1. Update Device amounts and images
    const updateFields = {
      amount_paid: newPaid,
      amount_remaining: newRemaining,
      contract_images: nextImages
    };

    const { error: devErr } = await supabase
      .from('devices')
      .update(updateFields)
      .eq('id', deviceId);
    if (devErr) throw devErr;

    // 2. Log Cash Flow Income
    const description = `تحصيل قسط/دفعة من العميل: ${customerName} - جهاز S/N: ${device.serial_number} | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}`;
    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({ type: 'إيراد', amount, description });
    if (cashErr) throw cashErr;

    // 3. Auto-update Financial Center liquidity
    await autoUpdateLiquidity(paymentMethod, amount);

    closeModal('collect-payment-modal');
    await initApp();
  } catch (err) {
    alert('Failed to collect payment: ' + err.message);
  }
}

// --- POPULATE DROPDOWNS ---
function populateSalaryMonthDropdown() {
  const select = document.getElementById('salary-month-select');
  if (!select) return;
  select.innerHTML = '';

  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    select.innerHTML += `<option value="${monthStr}">شهر ${monthStr}</option>`;
  }
}

// --- EMPLOYEE MONTHLY ATTENDANCE CALENDAR MODAL & LOGIC ---
let currentCalendarEmployee = {
  id: null,
  name: '',
  salary: 0
};

async function openEmployeeAttendanceCalendar(techId, techName, monthStr) {
  const tech = (stateCache.technicians || []).find(t => t.id === techId);
  currentCalendarEmployee = {
    id: techId,
    name: techName,
    salary: tech ? Number(tech.monthly_salary || 0) : 0
  };

  document.getElementById('calendar-employee-name-title').innerText = `🗓️ كشف تقويم الحضور والغياب: ${techName}`;
  const monthPicker = document.getElementById('calendar-month-picker');
  if (monthPicker) {
    if (!monthStr) {
      const now = new Date();
      monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    monthPicker.value = monthStr;
  }

  openModal('employee-monthly-attendance-modal');
  await renderEmployeeAttendanceCalendar();
}
window.openEmployeeAttendanceCalendar = openEmployeeAttendanceCalendar;

async function renderEmployeeAttendanceCalendar() {
  const grid = document.getElementById('attendance-calendar-grid');
  if (!grid) return;
  grid.innerHTML = '<p class="info-text" style="grid-column: 1/-1; text-align: center; padding: 20px;">⏳ جاري جلب وتجهيز تقويم الحضور والغياب...</p>';

  const monthStr = document.getElementById('calendar-month-picker')?.value;
  if (!monthStr || !currentCalendarEmployee.id) return;

  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  const { data: attList, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('technician_id', currentCalendarEmployee.id)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) {
    grid.innerHTML = `<p class="info-text" style="grid-column: 1/-1; color: var(--danger); text-align: center; padding: 20px;">فشل جلب البيانات: ${error.message}</p>`;
    return;
  }

  const attMap = {};
  (attList || []).forEach(a => {
    attMap[a.date] = a;
  });

  let presentCount = 0;
  let absentCount = 0;
  let delayCount = 0;

  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  let calendarHtml = '';

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${monthStr}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, day);
    const dayName = dayNames[dateObj.getDay()];
    const isFriday = dateObj.getDay() === 5;

    const attRecord = attMap[dayStr];
    const status = attRecord ? attRecord.status : (isFriday ? 'إجازة' : 'حاضر');
    const arrivalTime = attRecord && attRecord.arrival_time ? attRecord.arrival_time.slice(0, 5) : (isFriday ? '' : '10:00');

    if (status === 'حاضر') presentCount++;
    else if (status === 'غائب') absentCount++;
    else if (status === 'تأخير') delayCount++;

    let cardBg = 'rgba(255,255,255,0.02)';
    let cardBorder = 'rgba(255,255,255,0.06)';
    let badgeClass = 'badge badge-income';
    let statusLabel = 'حاضر ✅';

    if (status === 'غائب') {
      cardBg = 'rgba(239, 68, 68, 0.08)';
      cardBorder = 'rgba(239, 68, 68, 0.25)';
      badgeClass = 'badge badge-expense';
      statusLabel = 'غائب ❌';
    } else if (status === 'تأخير') {
      cardBg = 'rgba(245, 158, 11, 0.08)';
      cardBorder = 'rgba(245, 158, 11, 0.25)';
      badgeClass = 'badge badge-assigned';
      statusLabel = 'تأخير ⚠️';
    } else if (status === 'إجازة' || isFriday) {
      cardBg = 'rgba(14, 165, 233, 0.04)';
      cardBorder = 'rgba(14, 165, 233, 0.15)';
      badgeClass = 'badge';
      statusLabel = 'إجازة 🔵';
    }

    calendarHtml += `
      <div style="background: ${cardBg}; border: 1px solid ${cardBorder}; padding: 10px; border-radius: 8px; text-align: center; position: relative;">
        <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 2px;">${dayName}</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${day} ${monthStr.split('-')[1]}</div>
        <span class="${badgeClass}" style="font-size: 0.78rem; display: inline-block; margin-bottom: 6px;">${statusLabel}</span>
        
        ${status !== 'غائب' && status !== 'إجازة' ? `<div style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 600;">🕒 ${arrivalTime || '10:00'}</div>` : '<div style="height: 18px;"></div>'}

        <select onchange="updateCalendarDayStatus('${currentCalendarEmployee.id}', '${dayStr}', this.value)" style="margin-top: 6px; font-size: 0.72rem; padding: 2px 4px; background: rgba(0,0,0,0.3); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; width: 100%;">
          <option value="حاضر" ${status === 'حاضر' ? 'selected' : ''}>حاضر ✅</option>
          <option value="غائب" ${status === 'غائب' ? 'selected' : ''}>غائب ❌</option>
          <option value="تأخير" ${status === 'تأخير' ? 'selected' : ''}>تأخير ⚠️</option>
        </select>
      </div>
    `;
  }

  grid.innerHTML = calendarHtml;

  // Fetch advances for this employee in this month
  const { data: advList } = await supabase
    .from('salary_advances')
    .select('*')
    .eq('technician_id', currentCalendarEmployee.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  let advancesTotal = 0;
  const advSummaryContainer = document.getElementById('advances-summary-container');

  if (advList && advList.length > 0) {
    advList.forEach(a => {
      advancesTotal += Number(a.amount || 0);
    });

    if (advSummaryContainer) {
      advSummaryContainer.innerHTML = `
        <div style="margin-bottom: 15px; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 8px; padding: 10px 14px;">
          <h4 style="margin: 0 0 8px 0; color: #c084fc; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
            💸 تفاصيل السلف المأخوذة خلال الشهر (${advList.length} سلفة | إجمالي: ${advancesTotal.toLocaleString()} ج.م):
          </h4>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${advList.map(a => {
              const dStr = a.date ? new Date(a.date).toLocaleDateString('ar-EG') : '—';
              return `<div style="background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; color: var(--text-primary); border: 1px solid rgba(255,255,255,0.08);">📅 <strong>${dStr}</strong>: ${Number(a.amount).toLocaleString()} ج.م ${a.notes ? `<span style="color:var(--text-secondary);">(${a.notes})</span>` : ''}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }
  } else {
    if (advSummaryContainer) advSummaryContainer.innerHTML = '';
  }

  // Update Top Stats
  const dailyRate = currentCalendarEmployee.salary / 30;
  const totalDeduction = Math.round((dailyRate * absentCount) + ((dailyRate / 2) * delayCount));
  const combinedTotal = totalDeduction + advancesTotal;

  document.getElementById('calendar-stat-present').innerText = `${presentCount} أيام`;
  document.getElementById('calendar-stat-absent').innerText = `${absentCount} أيام`;
  document.getElementById('calendar-stat-delays').innerText = `${delayCount} مرات`;
  document.getElementById('calendar-stat-deduction').innerText = `${totalDeduction.toLocaleString()} ج.م`;
  
  const advStatEl = document.getElementById('calendar-stat-advances');
  if (advStatEl) advStatEl.innerText = `${advancesTotal.toLocaleString()} ج.م`;
  
  const totStatEl = document.getElementById('calendar-stat-total-deductions');
  if (totStatEl) totStatEl.innerText = `${combinedTotal.toLocaleString()} ج.م`;
}
window.renderEmployeeAttendanceCalendar = renderEmployeeAttendanceCalendar;

async function updateCalendarDayStatus(techId, dateStr, newStatus) {
  try {
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('technician_id', techId)
      .eq('date', dateStr);

    if (existing && existing.length > 0) {
      await supabase
        .from('attendance')
        .update({ status: newStatus })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('attendance')
        .insert({
          technician_id: techId,
          date: dateStr,
          status: newStatus,
          arrival_time: newStatus === 'تأخير' ? '10:45' : '10:00'
        });
    }

    await renderEmployeeAttendanceCalendar();
    await renderHRTab();
  } catch (err) {
    alert('فشل تحديث اليوم: ' + err.message);
  }
}
window.updateCalendarDayStatus = updateCalendarDayStatus;

function printEmployeeMonthlyAttendance() {
  const empName = currentCalendarEmployee.name || 'الموظف';
  const monthVal = document.getElementById('calendar-month-picker')?.value || '';
  const presentText = document.getElementById('calendar-stat-present')?.innerText || '0';
  const absentText = document.getElementById('calendar-stat-absent')?.innerText || '0';
  const delaysText = document.getElementById('calendar-stat-delays')?.innerText || '0';
  const deductionText = document.getElementById('calendar-stat-deduction')?.innerText || '0 ج.م';
  const advancesText = document.getElementById('calendar-stat-advances')?.innerText || '0 ج.م';
  const totalDeductionsText = document.getElementById('calendar-stat-total-deductions')?.innerText || '0 ج.م';

  const advContainer = document.getElementById('advances-summary-container')?.innerHTML || '';
  const gridHtml = document.getElementById('attendance-calendar-grid')?.innerHTML || '';

  const printWin = window.open('', '_blank');
  if (!printWin) {
    alert('يرجى السماح بالنوافذ المنبثقة للتمكن من طباعة الكشف.');
    return;
  }

  printWin.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف تقويم الحضور والغياب والسلف - ${empName}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #000; direction: rtl; }
        .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 18px; text-align: center; }
        .stat-box { border: 1px solid #ccc; padding: 8px; border-radius: 6px; background: #f9fafb; }
        .stat-box small { display: block; font-size: 0.72rem; color: #4b5563; margin-bottom: 2px; }
        .stat-box strong { font-size: 1.05rem; color: #111; }
        .adv-box { border: 1px dashed #8b5cf6; background: #f5f3ff; padding: 10px; border-radius: 6px; margin-bottom: 18px; }
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .calendar-grid select { display: none !important; }
        .calendar-grid > div { border: 1px solid #e5e7eb; padding: 6px; border-radius: 6px; text-align: center; background: #fff !important; color: #111 !important; }
        .calendar-grid span { border: 1px solid #ccc; padding: 1px 4px; border-radius: 4px; font-size: 0.7rem; display: inline-block; margin-bottom: 2px; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin: 0 0 4px 0;">🏢 شركة فيوتشر إير تكييف وتبريد</h2>
        <h3 style="margin: 0; color: #374151;">📅 كشف الحضور والغياب والسلف للموظف: <u>${empName}</u> (شهر ${monthVal})</h3>
      </div>

      <div class="stats-grid">
        <div class="stat-box"><small>أيام الحضور</small><strong>${presentText}</strong></div>
        <div class="stat-box"><small>أيام الغياب</small><strong style="color:#dc2626;">${absentText}</strong></div>
        <div class="stat-box"><small>مرات التأخير</small><strong style="color:#d97706;">${delaysText}</strong></div>
        <div class="stat-box"><small>خصم غياب/تأخير</small><strong>${deductionText}</strong></div>
        <div class="stat-box"><small>إجمالي السلف</small><strong style="color:#7c3aed;">${advancesText}</strong></div>
        <div class="stat-box"><small>صافي الخصومات + السلف</small><strong style="color:#dc2626;">${totalDeductionsText}</strong></div>
      </div>

      ${advContainer ? `<div class="adv-box">${advContainer}</div>` : ''}

      <h4 style="margin: 0 0 8px 0;">📆 تقويم الشهر التفصيلي:</h4>
      <div class="calendar-grid">
        ${gridHtml}
      </div>

      <div style="margin-top: 30px; display: flex; justify-content: space-between; font-weight: bold; font-size: 0.9rem; padding: 0 20px;">
        <div>توقيع الموظف: ........................</div>
        <div>توقيع الحسابات / المدير: ........................</div>
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}
window.printEmployeeMonthlyAttendance = printEmployeeMonthlyAttendance;

async function openTechnicianWorkHistoryModal(techId, techName) {
  const t = (stateCache.technicians || []).find(x => x.id === techId);
  const displayName = t ? parseEmployeeName(t.name).name : techName;

  document.getElementById('tech-work-history-name').innerText = displayName;
  
  const tbody = document.querySelector('#tech-work-history-table tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px;">⏳ جاري جلب سجل نزول الشغل والزيارات...</td></tr>';
  openModal('technician-work-history-modal');

  const jobs = [];
  const uniqueDays = new Set();

  (stateCache.devices || []).forEach(d => {
    if (d.serial_number && d.serial_number.startsWith('HIST-')) return;
    
    let isAssigned = false;
    let roleText = '';
    let roleBadgeClass = 'badge badge-assigned';

    if (d.technician_id === techId) {
      isAssigned = true;
      roleText = 'فني رئيسي 👤';
      roleBadgeClass = 'badge badge-income';
    } else if (d.assistant_id === techId) {
      isAssigned = true;
      roleText = 'مساعد فني 🤝';
      roleBadgeClass = 'badge badge-assigned';
    } else if (d.driver_id === techId) {
      isAssigned = true;
      roleText = 'سائق 🚚';
      roleBadgeClass = 'badge';
    }

    if (isAssigned) {
      const jobDateVal = d.installed_at || d.assigned_at || d.created_at;
      const dObj = jobDateVal ? new Date(jobDateVal) : new Date();
      
      const dayName = dObj.toLocaleDateString('ar-EG', { weekday: 'long' });
      const fullDateStr = dObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
      const timeStr = dObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const dateKey = `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;
      
      uniqueDays.add(dateKey);

      const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
      
      jobs.push({
        dateObj: dObj,
        dayName: dayName,
        fullDateStr: fullDateStr,
        timeStr: timeStr,
        roleText: roleText,
        roleBadgeClass: roleBadgeClass,
        deviceInfo: `${d.brand} (${d.capacity}) - سيريال: ${d.serial_number}`,
        recipient: resolveRecipientName(d),
        status: d.status,
        batchInfo: batchInfo
      });
    }
  });

  // Sort jobs descending by date
  jobs.sort((a, b) => b.dateObj - a.dateObj);

  document.getElementById('tech-work-history-days-count').innerText = `${uniqueDays.size} يوماً`;
  document.getElementById('tech-work-history-jobs-count').innerText = `${jobs.length} عملية`;

  if (jobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--text-secondary);">لا توجد زيارات أو عمليات مسجلة لهذا الفني حتى الآن.</td></tr>';
  } else {
    const rowsHtml = jobs.map((j, idx) => {
      const batchBtnHtml = j.batchInfo ? `
        <div style="margin-top: 2px;">
          <button class="btn btn-secondary btn-sm" onclick="closeModal('technician-work-history-modal'); openBatchDetailModal('${j.batchInfo.batchId}')" style="padding: 2px 6px; font-size: 0.75rem; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 8px;">
            🔗 إذن مجمع (#${j.batchInfo.batchId})
          </button>
        </div>` : '';

      return `
        <tr>
          <td style="font-size: 0.8rem; color: var(--text-secondary);">${idx + 1}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${j.dayName}، ${j.fullDateStr}</div>
            <div style="font-size: 0.78rem; color: var(--accent-cyan);">🕒 ${j.timeStr}</div>
          </td>
          <td><span class="${j.roleBadgeClass}" style="font-size: 0.78rem;">${j.roleText}</span></td>
          <td style="font-size: 0.88rem;"><strong>${j.deviceInfo}</strong></td>
          <td style="font-size: 0.88rem; font-weight: 600;">${j.recipient}</td>
          <td>
            <span class="badge ${j.status === 'تم التركيب' ? 'badge-installed' : 'badge-assigned'}" style="font-size: 0.78rem;">${j.status}</span>
            ${batchBtnHtml}
          </td>
        </tr>
      `;
    }).join('');
    tbody.innerHTML = rowsHtml;
  }
}
window.openTechnicianWorkHistoryModal = openTechnicianWorkHistoryModal;

// --- ADD DEVICE MODAL & SUBMIT (BULK & DIVERSE SUPPORT) ---
function openAddDeviceModal() {
  document.getElementById('add-device-form').reset();
  const select = document.getElementById('dev-supplier-select');
  select.innerHTML = '<option value="">-- اختر المورد --</option>';
  
  // Populate existing suppliers
  stateCache.suppliers.forEach(s => {
    select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });
  select.innerHTML += `<option value="NEW">➕ مورد جديد...</option>`;
  
  document.getElementById('dev-supplier-new').classList.add('hidden');
  document.getElementById('dev-supplier-new').required = false;
  document.getElementById('dev-supplier-custom-name-group').classList.add('hidden');
  document.getElementById('dev-supplier-custom-name').value = '';
  
  // Reset bulk devices table
  const tbody = document.getElementById('bulk-devices-tbody');
  tbody.innerHTML = '';
  
  // Insert 1 default row to start with
  addBulkDeviceRow();
  
  document.getElementById('dev-cash-amount').value = '0';
  document.getElementById('dev-payment-method').selectedIndex = 0;
  document.getElementById('dev-bulk-total-badge').textContent = '0 ج.م';
  
  openModal('add-device-modal');
}

function handleScannerKey(e, inputEl) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const row = inputEl.closest('tr');
    const costInput = row.querySelector('.row-cost');
    if (costInput && (!costInput.value || Number(costInput.value) === 0)) {
      costInput.focus();
    } else {
      addBulkDeviceRow();
      const tbody = document.getElementById('bulk-devices-tbody');
      const lastRow = tbody.querySelector('.bulk-device-row:last-child');
      if (lastRow) {
        const firstSerial = lastRow.querySelector('.row-serial');
        if (firstSerial) firstSerial.focus();
      }
    }
  }
}
window.handleScannerKey = handleScannerKey;

function addBulkDeviceRow() {
  const tbody = document.getElementById('bulk-devices-tbody');
  const tr = document.createElement('tr');
  tr.className = 'bulk-device-row';
  
  tr.innerHTML = `
    <td style="padding: 8px 10px;">
      <select class="form-control row-brand" required style="font-size: 0.85rem; padding: 4px 8px; height: 34px;">
        <option value="" disabled selected>-- اختر الماركة والموديل --</option>
        <optgroup label="كاريير (Carrier)">
          <option value="كاريير بارد عادي">كاريير بارد عادي</option>
          <option value="كاريير بارد انفرتر">كاريير بارد انفرتر</option>
          <option value="كاريير بارد ساخن عادي">كاريير بارد ساخن عادي</option>
          <option value="كاريير بارد ساخن انفرتر">كاريير بارد ساخن انفرتر</option>
          <option value="كاريير كونسيلد">كاريير كونسيلد</option>
        </optgroup>
        <optgroup label="ميديا (Midea)">
          <option value="ميديا بارد عادي">ميديا بارد عادي</option>
          <option value="ميديا بارد انفرتر">ميديا بارد انفرتر</option>
          <option value="ميديا بارد ساخن عادي">ميديا بارد ساخن عادي</option>
          <option value="ميديا بارد ساخن انفرتر">ميديا بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="شارب (Sharp)">
          <option value="شارب بارد عادي">شارب بارد عادي</option>
          <option value="شارب بارد انفرتر">شارب بارد انفرتر</option>
          <option value="شارب بارد ساخن عادي">شارب بارد ساخن عادي</option>
          <option value="شارب بارد ساخن انفرتر">شارب بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="تورنيدو (Tornado)">
          <option value="تورنيدو بارد عادي">تورنيدو بارد عادي</option>
          <option value="تورنيدو بارد انفرتر">تورنيدو بارد انفرتر</option>
          <option value="تورنيدو بارد ساخن عادي">تورنيدو بارد ساخن عادي</option>
          <option value="تورنيدو بارد ساخن انفرتر">تورنيدو بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="ال جي (LG)">
          <option value="ال جي بارد عادي">ال جي بارد عادي</option>
          <option value="ال جي بارد انفرتر">ال جي بارد انفرتر</option>
          <option value="ال جي بارد ساخن عادي">ال جي بارد ساخن عادي</option>
          <option value="ال جي بارد ساخن انفرتر">ال جي بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="فريش (Fresh)">
          <option value="فريش بارد عادي">فريش بارد عادي</option>
          <option value="فريش بارد انفرتر">فريش بارد انفرتر</option>
          <option value="فريش بارد ساخن عادي">فريش بارد ساخن عادي</option>
          <option value="فريش بارد ساخن انفرتر">فريش بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="هاير (Haier)">
          <option value="هاير بارد عادي">هاير بارد عادي</option>
          <option value="هاير بارد انفرتر">هاير بارد انفرتر</option>
          <option value="هاير بارد ساخن عادي">هاير بارد ساخن عادي</option>
          <option value="هاير بارد ساخن انفرتر">هاير بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="جري (Gree)">
          <option value="جري بارد عادي">جري بارد عادي</option>
          <option value="جري بارد انفرتر">جري بارد انفرتر</option>
          <option value="جري بارد ساخن عادي">جري بارد ساخن عادي</option>
          <option value="جري بارد ساخن انفرتر">جري بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="سامسونج (Samsung)">
          <option value="سامسونج بارد عادي">سامسونج بارد عادي</option>
          <option value="سامسونج بارد انفرتر">سامسونج بارد انفرتر</option>
          <option value="سامسونج بارد ساخن عادي">سامسونج بارد ساخن عادي</option>
          <option value="سامسونج بارد ساخن انفرتر">سامسونج بارد ساخن انفرتر</option>
        </optgroup>
        <optgroup label="يونيون اير (Unionaire)">
          <option value="يونيون اير بارد عادي">يونيون اير بارد عادي</option>
          <option value="يونيون اير بارد انفرتر">يونيون اير بارد انفرتر</option>
          <option value="يونيون اير بارد ساخن عادي">يونيون اير بارد ساخن عادي</option>
          <option value="يونيون اير بارد ساخن انفرتر">يونيون اير بارد ساخن انفرتر</option>
        </optgroup>
      </select>
    </td>
    <td style="padding: 8px 10px;">
      <select class="form-control row-capacity" required style="font-size: 0.85rem; padding: 4px 8px; height: 34px;">
        <option value="" disabled selected>-- القدرة --</option>
        <option value="1.5-حصان">1.5 حصان</option>
        <option value="2.25-حصان">2.25 حصان</option>
        <option value="3-حصان">3 حصان</option>
        <option value="4-حصان">4 حصان</option>
        <option value="5-حصان">5 حصان</option>
      </select>
    </td>
    <td style="padding: 8px 10px;">
      <input type="text" class="form-control row-serial" placeholder="🧊 سيريال الفانة (داخلي)" required style="font-size: 0.85rem; padding: 4px 8px; height: 34px; font-family: monospace;" onkeydown="handleScannerKey(event, this)">
    </td>
    <td style="padding: 8px 10px;">
      <input type="text" class="form-control row-outdoor-serial" placeholder="🔥 سيريال الكباس (خارجي)" style="font-size: 0.85rem; padding: 4px 8px; height: 34px; font-family: monospace;" onkeydown="handleScannerKey(event, this)">
    </td>
    <td style="padding: 8px 10px;">
      <input type="number" class="form-control row-cost" placeholder="أدخل التكلفة" required min="0" oninput="recalculateBulkTotal()" style="font-size: 0.85rem; padding: 4px 8px; height: 34px;">
    </td>
    <td style="padding: 8px 10px; text-align: center; vertical-align: middle;">
      <button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px;" onclick="removeBulkDeviceRow(this)">🗑️</button>
    </td>
  `;
  tbody.appendChild(tr);
  recalculateBulkTotal();
}

function removeBulkDeviceRow(btn) {
  const tbody = document.getElementById('bulk-devices-tbody');
  const rows = tbody.querySelectorAll('.bulk-device-row');
  if (rows.length <= 1) {
    alert('⚠️ يجب إدخال جهاز واحد على الأقل في القائمة!');
    return;
  }
  btn.closest('tr').remove();
  recalculateBulkTotal();
}

function recalculateBulkTotal() {
  let total = 0;
  const costInputs = document.querySelectorAll('.bulk-device-row .row-cost');
  costInputs.forEach(input => {
    total += Number(input.value || 0);
  });
  
  const badge = document.getElementById('dev-bulk-total-badge');
  if (badge) {
    badge.textContent = total.toLocaleString() + ' ج.م';
  }
  return total;
}

function payFullBulkAmount() {
  const total = recalculateBulkTotal();
  document.getElementById('dev-cash-amount').value = total;
}

async function handleAddDeviceSubmit(e) {
  e.preventDefault();
  const supplierSelect = document.getElementById('dev-supplier-select').value;
  const supplierNewName = document.getElementById('dev-supplier-new').value.trim();
  const customSupplierName = document.getElementById('dev-supplier-custom-name').value.trim();

  // Read all device rows from table
  const rows = document.querySelectorAll('.bulk-device-row');
  const devicesData = [];
  const serials = [];

  for (const row of rows) {
    const brand = row.querySelector('.row-brand').value;
    const capacity = row.querySelector('.row-capacity').value;
    const serial = row.querySelector('.row-serial').value.trim();
    const outdoorSerial = row.querySelector('.row-outdoor-serial')?.value?.trim() || null;
    const cost = Number(row.querySelector('.row-cost').value);

    if (!brand || !capacity || !serial || isNaN(cost)) {
      alert('⚠️ يرجى التأكد من ملء جميع حقول الأجهزة المدرجة!');
      return;
    }
    
    devicesData.push({ brand, capacity, serial, outdoorSerial, cost });
    serials.push(serial);
  }

  // Check for duplicate serials inside the form itself
  const internalDup = serials.filter((item, index) => serials.indexOf(item) !== index);
  if (internalDup.length > 0) {
    alert(`⚠️ تكرار في السيريالات المدخلة بالجدول:\n${[...new Set(internalDup)].join('\n')}\nيرجى تصحيحها.`);
    return;
  }

  // Check database duplicates
  const dbDup = serials.filter(s => stateCache.devices.find(d => d.serial_number === s));
  if (dbDup.length > 0) {
    alert(`⚠️ السيريالات التالية مسجلة بالفعل في المخزن سابقاً:\n${dbDup.join('\n')}\nيرجى إزالتها أو تصحيحها.`);
    return;
  }

  const submitBtn = document.getElementById('add-device-submit-btn');
  if (submitBtn) { 
    submitBtn.disabled = true; 
    submitBtn.textContent = `⏳ جاري حفظ ${devicesData.length} أجهزة...`; 
  }

  try {
    // 1. Resolve Supplier
    let supplierId = supplierSelect;
    let supplierName = '';
    if (supplierSelect === 'NEW') {
      if (!supplierNewName) { alert('يرجى كتابة اسم المورد الجديد'); return; }
      const { data: newSup, error: supErr } = await supabase
        .from('suppliers').insert({ name: supplierNewName }).select('id, name').single();
      if (supErr) throw supErr;
      supplierId = newSup.id;
      supplierName = newSup.name;
    } else {
      const selectedSup = stateCache.suppliers.find(s => s.id === supplierId);
      supplierName = selectedSup ? selectedSup.name : '';
    }

    // 2. Upload Delivery Receipt ONCE
    let sharedReceiptUrl = null;
    const receiveNoteInput = document.getElementById('dev-receive-note');
    if (receiveNoteInput && receiveNoteInput.files && receiveNoteInput.files[0]) {
      const file = receiveNoteInput.files[0];
      const rawExt = file.name.includes('.') ? file.name.split('.').pop() : '';
      const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
      const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const fileName = `delivery_receipts/${uniqueId}__delivery_receipt__.${safeExt}`;
      const { error: uploadErr } = await supabase.storage.from('contracts').upload(fileName, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('contracts').getPublicUrl(fileName);
      sharedReceiptUrl = publicUrl;
    }

    const totalCashPaid = Number(document.getElementById('dev-cash-amount').value || 0);
    const paymentMethod = document.getElementById('dev-payment-method').value;

    const resolvedSupplierNameCombined = customSupplierName ? `${supplierName} (${customSupplierName})` : null;

    // 3. Resolve Custom Date or Current Time for Intake
    const customDateVal = document.getElementById('dev-custom-date')?.value;
    const resolvedIntakeIsoDate = customDateVal ? new Date(customDateVal + 'T12:00:00').toISOString() : new Date().toISOString();

    // 4. Generate Batch ID for multi-device intake
    const isBulk = devicesData.length > 1;
    const batchId = `REC-${Date.now().toString().slice(-6)}`;
    const totalBatchCost = devicesData.reduce((sum, d) => sum + Number(d.cost || 0), 0);
    const batchTag = isBulk ? `[إذن استلام مجمع #${batchId} | عدد ${devicesData.length} أجهزة | إجمالي الإذن: ${totalBatchCost.toLocaleString()} ج.م]` : '';

    // 5. Loop over and insert devices
    let addedCount = 0;
    for (const devInfo of devicesData) {
      const contractImages = sharedReceiptUrl ? [sharedReceiptUrl] : [];

      const devPayload = { 
        brand: devInfo.brand, 
        capacity: devInfo.capacity, 
        serial_number: devInfo.serial, 
        outdoor_serial: devInfo.outdoorSerial || null,
        supplier_id: supplierId, 
        customer_name: resolvedSupplierNameCombined,
        cost_price: devInfo.cost, 
        status: 'متاح', 
        created_at: resolvedIntakeIsoDate,
        contract_images: contractImages,
        installment_notes: batchTag ? (devInfo.outdoorSerial ? `${batchTag} [سيريال كباس: ${devInfo.outdoorSerial}]` : batchTag) : (devInfo.outdoorSerial ? `[سيريال كباس: ${devInfo.outdoorSerial}]` : null)
      };

      let { data: insertedDev, error: devErr } = await supabase.from('devices').insert(devPayload).select('id').single();
      if (devErr) {
        if (devErr.message && devErr.message.includes('outdoor_serial')) {
          delete devPayload.outdoor_serial;
          const retryRes = await supabase.from('devices').insert(devPayload).select('id').single();
          if (retryRes.error) throw retryRes.error;
          insertedDev = retryRes.data;
        } else {
          throw devErr;
        }
      }

      // Supplier Purchase Transaction
      const fullNotes = `شراء تكييف ${devInfo.brand} (${devInfo.capacity}) - سيريال الجهاز: ${devInfo.serial}${devInfo.outdoorSerial ? ` / كباس: ${devInfo.outdoorSerial}` : ''}${batchTag ? ` ${batchTag}` : ''}${customSupplierName ? ` (المورد: ${customSupplierName})` : ''}`;
      await supabase.from('supplier_transactions').insert({
        supplier_id: supplierId,
        device_id: insertedDev.id,
        transaction_type: 'شراء',
        amount: devInfo.cost,
        notes: fullNotes,
        created_at: resolvedIntakeIsoDate
      });

      addedCount++;
    }

    // 4. Handle supplier cash payment if checked/entered
    if (totalCashPaid > 0) {
      const dispSupplierLabel = customSupplierName ? `${supplierName} (${customSupplierName})` : supplierName;
      
      // Create Supplier Transaction for payment
      await supabase.from('supplier_transactions').insert({
        supplier_id: supplierId,
        transaction_type: 'دفع',
        amount: totalCashPaid,
        notes: `سداد قيمة إذن استلام يحتوي على ${devicesData.length} أجهزة | طريقة الدفع: ${paymentMethod}${customSupplierName ? ` (المورد: ${customSupplierName})` : ''}`
      });

      // Log cash flow expense
      await supabase.from('cash_flow').insert({
        type: 'مصروف',
        amount: totalCashPaid,
        description: `سداد دفعة للمورد: ${dispSupplierLabel} لشراء أجهزة إذن استلام سيريالات: ${devicesData.map(d=>d.serial).join(', ')} | طريقة: ${paymentMethod}`
      });

      // Deduct from company safe/liquidity
      await autoUpdateLiquidity(paymentMethod, -totalCashPaid);
    }

    // Auto-reset form inputs completely
    document.getElementById('add-device-form').reset();
    const tbody = document.getElementById('bulk-devices-tbody');
    if (tbody) tbody.innerHTML = '';
    const customDateInput = document.getElementById('dev-custom-date');
    if (customDateInput) customDateInput.value = '';
    const receiveNote = document.getElementById('dev-receive-note');
    if (receiveNote) receiveNote.value = '';

    closeModal('add-device-modal');
    await initApp();
    alert(`✅ تم إدخال ${addedCount} أجهزة للمخزن بنجاح وتحديث حساب المورد والخزنة!`);
  } catch (err) {
    alert('❌ حدث خطأ أثناء إدخال الأجهزة: ' + err.message);
  } finally {
    if (submitBtn) { 
      submitBtn.disabled = false; 
      submitBtn.textContent = '💾 حفظ كل الأجهزة في المخزن'; 
    }
  }
}

// Expose functions globally
window.openAddDeviceModal = openAddDeviceModal;
window.addBulkDeviceRow = addBulkDeviceRow;
window.removeBulkDeviceRow = removeBulkDeviceRow;
window.recalculateBulkTotal = recalculateBulkTotal;
window.payFullBulkAmount = payFullBulkAmount;
window.handleAddDeviceSubmit = handleAddDeviceSubmit;


// --- STOCKTAKE SUMMARY RENDERING ---
function renderStocktake() {
  updateEyeIcon('stock-counts-eye-icon', window.hideStockCountsState);
  populateModelHistoryDropdown();
  const grid = document.getElementById('stocktake-summary-grid');
  grid.innerHTML = '';

  const availableDevices = stateCache.devices.filter(d => d.status === 'متاح');
  if (availableDevices.length === 0) {
    grid.innerHTML = '<p class="info-text" style="grid-column: 1/-1;">لا توجد أجهزة متاحة في المخزن حالياً.</p>';
    return;
  }

  // Group by brand and capacity
  const stock = {};
  availableDevices.forEach(d => {
    const key = `${d.brand} (${d.capacity})`;
    stock[key] = (stock[key] || 0) + 1;
  });

  // Render cards
  Object.keys(stock).forEach(key => {
    const countStr = window.hideStockCountsState ? '••' : stock[key];
    const safeKey = key.replace(/'/g, "\\'");
    grid.innerHTML += `
      <div class="card stocktake-card" onclick="openStocktakeDetailModal('${safeKey}')" title="انقر لعرض تفاصيل أجهزة ${safeKey} وإذونات الاستلام والمستندات" style="background: rgba(255, 255, 255, 0.03); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.15); cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease; position: relative;">
        <h4 style="margin: 0 0 10px 0; font-size: 1.1rem; color: var(--text-primary); font-weight: 600;">${key}</h4>
        <div style="font-size: 1.8rem; font-weight: 700; color: var(--success);">${countStr} <span style="font-size: 1rem; font-weight: 400; color: var(--text-secondary);">أجهزة</span></div>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 10px; font-size: 0.8rem; padding: 4px 10px; background: rgba(14,165,233,0.12); border: 1px solid rgba(14,165,233,0.3); color: var(--accent-cyan); width: 100%; border-radius: 6px; pointer-events: none;">
          🔍 عرض تفاصيل الأجهزة وإذوناتها
        </button>
      </div>
    `;
  });
}

function openStocktakeDetailModal(key) {
  const availableDevices = (stateCache.devices || []).filter(d => d.status === 'متاح');
  const matchingDevices = availableDevices.filter(d => `${d.brand} (${d.capacity})` === key);

  document.getElementById('stocktake-detail-title').innerText = `📦 تفاصيل الأجهزة المتاحة بالمخزن`;
  document.getElementById('stocktake-detail-model-name').innerText = key;
  document.getElementById('stocktake-detail-count').innerText = `${matchingDevices.length} أجهزة`;

  const tbody = document.querySelector('#stocktake-detail-table tbody');
  tbody.innerHTML = '';

  if (matchingDevices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: var(--text-secondary);">لا توجد أجهزة متاحة تحت هذا الموديل حالياً.</td></tr>';
  } else {
    const rows = matchingDevices.map((d, idx) => {
      const supplier = (stateCache.suppliers || []).find(s => s.id === d.supplier_id);
      const supplierName = supplier ? supplier.name : (d.supplier_name || 'غير محدد');
      
      const createdDate = d.created_at || d.assigned_at;
      const dateStr = createdDate && !isNaN(new Date(createdDate).getTime())
        ? new Date(createdDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' })
        : 'غير محدد';

      const costPrice = d.cost_price ? `${Number(d.cost_price).toLocaleString()} ج.م` : '—';
      let docsHtml = getDeviceDocumentsHtml(d.contract_images, d.id, false);
      const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
      if (batchInfo) {
        docsHtml += `<div style="margin-top: 4px;"><button class="btn btn-secondary btn-sm" onclick="closeModal('stocktake-detail-modal'); openBatchDetailModal('${batchInfo.batchId}')" style="padding: 2px 6px; font-size: 0.75rem; background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3);">📦 إذن مجمع (#${batchInfo.batchId}) - إجمالي: ${batchInfo.totalAmount} ج.م (${batchInfo.count} أجهزة)</button></div>`;
      }
      const docsCell = docsHtml ? `<div style="display: flex; flex-direction: column; gap: 4px;">${docsHtml}</div>` : '<span style="color: var(--text-secondary); font-size: 0.82rem;">لا توجد مرفقات</span>';

      return `
        <tr>
          <td style="font-size: 0.8rem; color: var(--text-secondary); vertical-align: middle;">${idx + 1}</td>
          <td style="vertical-align: middle;">${renderDeviceSerialsCell(d)}</td>
          <td style="font-size: 0.88rem; font-weight: 600; vertical-align: middle;">${supplierName}</td>
          <td style="font-size: 0.83rem; white-space: nowrap; vertical-align: middle;">${dateStr}</td>
          <td style="font-size: 0.88rem; font-weight: 600; color: var(--warning); vertical-align: middle;">${costPrice}</td>
          <td style="vertical-align: middle;">${docsCell}</td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-table" style="padding: 3px 8px; font-size: 0.8rem;" onclick="closeModal('stocktake-detail-modal'); openEditDeviceModal('${d.id}');">✏️ تعديل</button>
              <button class="btn btn-secondary btn-table" style="padding: 3px 8px; font-size: 0.8rem; background:rgba(14,165,233,0.15);border-color:rgba(14,165,233,0.4);color:var(--accent-cyan);" onclick="closeModal('stocktake-detail-modal'); openAddDocModal('${d.id}');">📎 إذن/مستند</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    tbody.innerHTML = rows;
  }

  openModal('stocktake-detail-modal');
}
window.openStocktakeDetailModal = openStocktakeDetailModal;

// --- COLLECT TRADER PAYMENT MODAL & SUBMIT ---
function openCollectTraderModal(supplierId, supplierName, debt) {
  document.getElementById('collect-trader-id').value = supplierId;
  document.getElementById('collect-trader-name').value = supplierName;
  document.getElementById('collect-trader-debt').value = `${debt.toLocaleString()} ج.م`;
  document.getElementById('collect-trader-amount').value = '';
  const dateInput = document.getElementById('collect-trader-date');
  if (dateInput) {
    dateInput.value = new Date().toLocaleDateString('en-CA');
  }
  const receiptInput = document.getElementById('collect-trader-receipt');
  if (receiptInput) {
    receiptInput.value = '';
  }
  openModal('collect-trader-modal');
}

async function handleCollectTraderSubmit(e) {
  e.preventDefault();
  const supplierId = document.getElementById('collect-trader-id').value;
  const supplierName = document.getElementById('collect-trader-name').value;
  const amount = Number(document.getElementById('collect-trader-amount').value);
  const paymentMethod = document.getElementById('collect-trader-method').value;
  const collectDate = document.getElementById('collect-trader-date')?.value || new Date().toLocaleDateString('en-CA');
  const receiptInput = document.getElementById('collect-trader-receipt');

  if (amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح أكبر من الصفر');
    return;
  }

  try {
    let attachmentUrl = '';
    if (receiptInput && receiptInput.files && receiptInput.files[0]) {
      attachmentUrl = await uploadAttachmentFile(receiptInput.files[0], 'cash_flow', '__cash_receipt__');
    }

    const txCreatedAt = getIsoTimestampForDate(collectDate);
    const txNotes = `تحصيل دفعة نقدية من حساب التاجر (مدخل من الويب) | طريقة: ${paymentMethod}${attachmentUrl ? ` __ATTACHMENT__${attachmentUrl}` : ''}`;
    const cfDesc = `تحصيل دفعة حساب من التاجر/المورد: ${supplierName} | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}${attachmentUrl ? ` __ATTACHMENT__${attachmentUrl}` : ''}`;

    // 1. Insert 'تحصيل' transaction
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: 'تحصيل',
        amount: amount,
        notes: txNotes,
        created_at: txCreatedAt
      });
    if (txErr) throw txErr;

    // 2. Insert into cash flow
    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'إيراد',
        amount: amount,
        description: cfDesc,
        date: collectDate,
        created_at: txCreatedAt
      });
    if (cashErr) throw cashErr;

    // 3. Auto-update Financial Center liquidity
    await autoUpdateLiquidity(paymentMethod, amount);

    closeModal('collect-trader-modal');
    await initApp();
    alert('✅ تم تسجيل التحصيل وتحديث أرصدة الحسابات بنجاح!');
  } catch (err) {
    alert('Failed to record collection: ' + err.message);
  }
}

// --- SUPPLIER DETAILED STATEMENT MODAL ---
let currentSupplierStatementData = {
  supplierId: null,
  supplierName: '',
  transactions: []
};

function resetStatementDates() {
  const fromEl = document.getElementById('statement-date-from');
  if (fromEl) fromEl.value = '';
  const toEl = document.getElementById('statement-date-to');
  if (toEl) toEl.value = '';
  filterSupplierStatementTable();
}

async function openSupplierStatement(supplierId, supplierName) {
  currentSupplierStatementData.supplierId = supplierId;
  currentSupplierStatementData.supplierName = supplierName;
  
  document.getElementById('statement-supplier-title').innerText = `🧾 كشف الحساب التفصيلي: ${supplierName}`;
  const tbody = document.querySelector('#statement-table tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">⏳ جاري تحميل وتدقيق البيانات...</td></tr>';

  const searchInput = document.getElementById('statement-search-input');
  if (searchInput) searchInput.value = '';
  const typeFilter = document.getElementById('statement-type-filter');
  if (typeFilter) typeFilter.value = 'all';
  const fromEl = document.getElementById('statement-date-from');
  if (fromEl) fromEl.value = '';
  const toEl = document.getElementById('statement-date-to');
  if (toEl) toEl.value = '';

  openModal('supplier-statement-modal');

  try {
    const { data: txs, error } = await supabase
      .from('supplier_transactions')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    currentSupplierStatementData.transactions = txs || [];
    renderCurrentSupplierStatement();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color: var(--danger);">فشل تحميل كشف الحساب: ${err.message}</td></tr>`;
  }
}

function renderCurrentSupplierStatement() {
  const { supplierId, supplierName, transactions } = currentSupplierStatementData;
  const sortOrder = document.getElementById('statement-sort-order')?.value || 'desc';

  let purchased = 0;
  let sold = 0;
  let paid = 0;
  let collected = 0;

  const chronTxs = [...transactions].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  let runningBalance = 0;
  const processedTxs = chronTxs.map((t, idx) => {
    const amt = Number(t.amount || 0);
    let credit = 0;
    let debit = 0;

    if (t.transaction_type === 'شراء') {
      purchased += amt;
      credit = amt;
      runningBalance += amt;
    } else if (t.transaction_type === 'تحصيل') {
      collected += amt;
      credit = amt;
      runningBalance += amt;
    } else if (t.transaction_type === 'بيع') {
      sold += amt;
      debit = amt;
      runningBalance -= amt;
    } else if (t.transaction_type === 'دفع') {
      paid += amt;
      debit = amt;
      runningBalance -= amt;
    }

    return {
      ...t,
      indexNum: idx + 1,
      credit,
      debit,
      runningBalance
    };
  });

  let displayTxs = [...processedTxs];
  if (sortOrder === 'desc') {
    displayTxs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else {
    displayTxs.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }

  window.currentProcessedStatementTxs = displayTxs;
  filterSupplierStatementTable();
}

function filterSupplierStatementTable() {
  const tbody = document.querySelector('#statement-table tbody');
  const searchVal = (document.getElementById('statement-search-input')?.value || '').trim().toLowerCase().replace(/كار/g, 'kar');
  const typeVal = document.getElementById('statement-type-filter')?.value || 'all';
  const dateFromVal = document.getElementById('statement-date-from')?.value || '';
  const dateToVal = document.getElementById('statement-date-to')?.value || '';
  const sortOrder = document.getElementById('statement-sort-order')?.value || 'desc';

  const allTxs = window.currentProcessedStatementTxs || [];

  let fromTime = null;
  if (dateFromVal) {
    fromTime = new Date(`${dateFromVal}T00:00:00`).getTime();
  }

  let toTime = null;
  if (dateToVal) {
    toTime = new Date(`${dateToVal}T23:59:59.999`).getTime();
  }

  // Opening Balance prior to fromTime
  let openingBalance = 0;
  if (fromTime) {
    allTxs.forEach(t => {
      const tTime = new Date(t.created_at || 0).getTime();
      if (tTime < fromTime) {
        if (t.transaction_type === 'شراء' || t.transaction_type === 'تحصيل') {
          openingBalance += Number(t.amount || 0);
        } else if (t.transaction_type === 'بيع' || t.transaction_type === 'دفع') {
          openingBalance -= Number(t.amount || 0);
        }
      }
    });
  }

  let purchased = 0, sold = 0, paid = 0, collected = 0;

  const filtered = allTxs.filter(t => {
    const tTime = new Date(t.created_at || 0).getTime();
    if (fromTime && tTime < fromTime) return false;
    if (toTime && tTime > toTime) return false;

    if (typeVal !== 'all' && t.transaction_type !== typeVal) return false;

    if (searchVal) {
      const dev = t.device_id ? stateCache.devices.find(d => d.id === t.device_id) : null;
      const serial = dev ? (dev.serial_number || '').toLowerCase().replace(/كار/g, 'kar') : '';
      const brand = dev ? (dev.brand || '').toLowerCase().replace(/كار/g, 'kar') : '';
      const notes = (t.notes || '').toLowerCase().replace(/كار/g, 'kar');
      const type = (t.transaction_type || '').toLowerCase();
      const amountStr = (t.amount || '').toString();

      const match = serial.includes(searchVal) || brand.includes(searchVal) || notes.includes(searchVal) || type.includes(searchVal) || amountStr.includes(searchVal);
      if (!match) return false;
    }

    const amt = Number(t.amount || 0);
    if (t.transaction_type === 'شراء') purchased += amt;
    else if (t.transaction_type === 'تحصيل') collected += amt;
    else if (t.transaction_type === 'بيع') sold += amt;
    else if (t.transaction_type === 'دفع') paid += amt;

    return true;
  });

  // Summary Card Updates
  const purchasedEl = document.getElementById('statement-purchased');
  if (purchasedEl) purchasedEl.innerText = `${purchased.toLocaleString('ar-EG')} ج.م`;
  const soldEl = document.getElementById('statement-sold');
  if (soldEl) soldEl.innerText = `${sold.toLocaleString('ar-EG')} ج.م`;
  const paidEl = document.getElementById('statement-paid');
  if (paidEl) paidEl.innerText = `${paid.toLocaleString('ar-EG')} ج.م`;
  const collectedEl = document.getElementById('statement-collected');
  if (collectedEl) collectedEl.innerText = `${collected.toLocaleString('ar-EG')} ج.م`;

  // Net Balance for filtered period
  const endNetBalance = (purchased + collected) - (paid + sold);

  const netBalanceEl = document.getElementById('statement-net-balance');
  const netBadgeEl = document.getElementById('statement-net-status-badge');
  const netBannerEl = document.getElementById('statement-net-banner');

  if (netBalanceEl && netBadgeEl && netBannerEl) {
    if (endNetBalance > 0) {
      netBalanceEl.innerText = `${endNetBalance.toLocaleString('ar-EG')} ج.م`;
      netBalanceEl.style.color = '#10b981';
      netBadgeEl.innerText = 'مستحق له (مكفول للمورد)';
      netBadgeEl.className = 'badge badge-income';
      netBannerEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else if (endNetBalance < 0) {
      netBalanceEl.innerText = `${Math.abs(endNetBalance).toLocaleString('ar-EG')} ج.م`;
      netBalanceEl.style.color = '#ef4444';
      netBadgeEl.innerText = 'مستحق عليه (للشركة)';
      netBadgeEl.className = 'badge badge-expense';
      netBannerEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    } else {
      netBalanceEl.innerText = '0 ج.م';
      netBalanceEl.style.color = 'var(--text-primary)';
      netBadgeEl.innerText = 'الحساب متزن ⚖️';
      netBadgeEl.className = 'badge badge-assigned';
      netBannerEl.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    }
  }

  const infoEl = document.getElementById('statement-count-info');
  if (infoEl) infoEl.innerText = `عدد المعاملات المعروضة: ${filtered.length} من أصل ${allTxs.length}`;

  window.activeFilteredStatementTxs = filtered;
  window.activeOpeningBalance = openingBalance;
  window.activeDateFromVal = dateFromVal;
  window.activeDateToVal = dateToVal;

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="color: var(--text-secondary); padding: 25px;">لا توجد معاملات مسجلة في هذه الفترة أو التصفية الحالية.</td></tr>';
    return;
  }

  const htmlRows = [];

  filtered.forEach(t => {
    const cDate = new Date(t.created_at);
    const dateStr = !isNaN(cDate.getTime()) 
      ? cDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' })
      : '_';

    let typeBadge = '';
    if (t.transaction_type === 'شراء') {
      typeBadge = '<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">📥 شراء بضاعة</span>';
    } else if (t.transaction_type === 'بيع') {
      typeBadge = '<span class="badge badge-success" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">📤 بيع تجاري</span>';
    } else if (t.transaction_type === 'دفع') {
      typeBadge = '<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: var(--accent-cyan); border: 1px solid rgba(14, 165, 233, 0.3);">💸 سداد نقدي</span>';
    } else if (t.transaction_type === 'تحصيل') {
      typeBadge = '<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3);">💵 تحصيل نقدي</span>';
    }

    let rawNotes = t.notes || '—';
    let detailsHtml = formatDescriptionWithAttachment(rawNotes);
    if (t.device_id) {
      const dev = stateCache.devices.find(d => d.id === t.device_id);
      if (dev) {
        let devDocsHtml = '';
        if (dev.contract_images && dev.contract_images.length > 0 && !rawNotes.includes('__ATTACHMENT__')) {
          const firstDoc = dev.contract_images[0];
          const dt = typeof getDocType === 'function' ? getDocType(firstDoc) : { label: 'مستند' };
          devDocsHtml = ` <button type="button" class="btn btn-secondary btn-table" style="background: rgba(14, 165, 233, 0.15); color: var(--accent-cyan); border: 1px solid rgba(14, 165, 233, 0.4); padding: 2px 7px; font-size: 0.72rem; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; margin-right: 4px;" onclick="viewDocument('${firstDoc}', '${(dt.label || 'مستند').replace(/'/g, "\\'")}')">📄 مستند الجهاز (${dev.contract_images.length})</button>`;
        }
        const devBadge = `<div style="margin-top:2px;"><span style="font-weight:600; color:var(--text-primary);">${dev.brand} (${dev.capacity})</span> <code style="font-size:0.78rem; color:var(--accent);">${dev.serial_number}</code>${devDocsHtml}</div>`;
        detailsHtml = detailsHtml === '—' || !detailsHtml ? devBadge : `${detailsHtml} ${devBadge}`;
      }
    }

    const amtVal = Number(t.amount || 0);
    let purchasedCell = '—', paidCell = '—', soldCell = '—', collectedCell = '—';
    if (t.transaction_type === 'شراء') purchasedCell = `<strong style="color: #f59e0b;">${amtVal.toLocaleString('ar-EG')}</strong>`;
    if (t.transaction_type === 'دفع') paidCell = `<strong style="color: #10b981;">${amtVal.toLocaleString('ar-EG')}</strong>`;
    if (t.transaction_type === 'بيع') soldCell = `<strong style="color: #0ea5e9;">${amtVal.toLocaleString('ar-EG')}</strong>`;
    if (t.transaction_type === 'تحصيل') collectedCell = `<strong style="color: #a855f7;">${amtVal.toLocaleString('ar-EG')}</strong>`;

    const balVal = t.runningBalance;
    const balColor = balVal > 0 ? '#10b981' : (balVal < 0 ? '#ef4444' : 'var(--text-primary)');
    const balTag = balVal > 0 ? '<small style="font-size:0.7rem; color:#10b981; margin-right:3px;">(له)</small>' : (balVal < 0 ? '<small style="font-size:0.7rem; color:#ef4444; margin-right:3px;">(عليه)</small>' : '');
    const runningBalHtml = `<strong>${Math.abs(balVal).toLocaleString('ar-EG')} ج.م</strong> ${balTag}`;

    htmlRows.push(`
      <tr>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${t.indexNum}</td>
        <td style="font-size: 0.85rem; white-space: nowrap;">${dateStr}</td>
        <td>${typeBadge}</td>
        <td>${purchasedCell}</td>
        <td>${paidCell}</td>
        <td>${soldCell}</td>
        <td>${collectedCell}</td>
        <td style="font-weight: 600; color: ${balColor}; font-size: 0.88rem; white-space: nowrap;">${runningBalHtml}</td>
        <td style="font-size: 0.85rem; max-width: 250px; word-break: break-word;">${detailsHtml}</td>
      </tr>
    `);
  });

  tbody.innerHTML = htmlRows.join('');
}

function printSupplierStatement(autoDownloadPdf = false) {
  const { supplierName } = currentSupplierStatementData;
  const txs = window.activeFilteredStatementTxs || window.currentProcessedStatementTxs || [];
  const openingBalance = window.activeOpeningBalance || 0;
  const dateFromVal = window.activeDateFromVal || '';
  const dateToVal = window.activeDateToVal || '';

  if (!supplierName) {
    alert('لا توجد بيانات للطباعة حالياً.');
    return;
  }

  const printWindow = window.open('', '_blank');
  const nowStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  let periodText = 'كشف حساب تفصيلي شامل كافة المعاملات التاريخية';
  if (dateFromVal && dateToVal) {
    periodText = `فترة الكشف: من ${dateFromVal} إلى ${dateToVal}`;
  } else if (dateFromVal) {
    periodText = `فترة الكشف: من تاريخ ${dateFromVal} حتى اليوم`;
  } else if (dateToVal) {
    periodText = `فترة الكشف: حتى تاريخ ${dateToVal}`;
  }

  let purchased = 0, sold = 0, paid = 0, collected = 0;
  txs.forEach(t => {
    if (t.transaction_type === 'شراء') purchased += Number(t.amount || 0);
    if (t.transaction_type === 'بيع') sold += Number(t.amount || 0);
    if (t.transaction_type === 'دفع') paid += Number(t.amount || 0);
    if (t.transaction_type === 'تحصيل') collected += Number(t.amount || 0);
  });

  const periodNet = (purchased + collected) - (paid + sold);
  const netStatus = periodNet > 0 
    ? `مستحق للمورد: ${periodNet.toLocaleString('ar-EG')} ج.م` 
    : (periodNet < 0 ? `مستحق للشركة: ${Math.abs(periodNet).toLocaleString('ar-EG')} ج.م` : 'الحساب متزن');

  let rowsHtml = '';

  rowsHtml += txs.map((t, idx) => {
    const cDate = new Date(t.created_at);
    const dateStr = !isNaN(cDate.getTime()) ? cDate.toLocaleDateString('ar-EG') + ' ' + cDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '_';
    
    let detailsText = (t.notes || '—').split('__ATTACHMENT__')[0].trim();
    if (t.device_id) {
      const dev = stateCache.devices.find(d => d.id === t.device_id);
      if (dev) {
        const devStr = `${dev.brand} (${dev.capacity}) - سيريال: ${dev.serial_number}`;
        detailsText = detailsText === '—' || !detailsText ? devStr : `${detailsText} (${devStr})`;
      }
    }

    const amtVal = Number(t.amount || 0);
    let pCell = '—', sCell = '—', mCell = '—', cCell = '—';
    if (t.transaction_type === 'شراء') pCell = `<strong style="color: #b45309;">${amtVal.toLocaleString('ar-EG')} ج.م</strong>`;
    if (t.transaction_type === 'دفع') sCell = `<strong style="color: #047857;">${amtVal.toLocaleString('ar-EG')} ج.م</strong>`;
    if (t.transaction_type === 'بيع') mCell = `<strong style="color: #0284c7;">${amtVal.toLocaleString('ar-EG')} ج.م</strong>`;
    if (t.transaction_type === 'تحصيل') cCell = `<strong style="color: #7e22ce;">${amtVal.toLocaleString('ar-EG')} ج.م</strong>`;

    const balTag = t.runningBalance > 0 ? 'له' : (t.runningBalance < 0 ? 'عليه' : '');
    const balStr = `${Math.abs(t.runningBalance).toLocaleString('ar-EG')} ج.م ${balTag}`;

    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${dateStr}</td>
        <td>${t.transaction_type}</td>
        <td>${pCell}</td>
        <td>${sCell}</td>
        <td>${mCell}</td>
        <td>${cCell}</td>
        <td style="font-weight: bold;">${balStr}</td>
        <td>${detailsText}</td>
      </tr>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب: ${supplierName}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1f2937; margin: 0; background: #f8fafc; }
        #printable-area { background: #ffffff; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 12px; }
        .header h1 { margin: 0; font-size: 20px; color: #111827; }
        .header h2 { margin: 4px 0 0; font-size: 16px; color: #1e40af; }
        .header p { margin: 4px 0 0; color: #6b7280; font-size: 12px; }
        .period-badge { display: inline-block; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 3px 10px; border-radius: 16px; font-size: 12px; font-weight: bold; margin-top: 6px; }
        .summary-box { display: flex; justify-content: space-around; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; text-align: center; }
        .summary-box div { font-size: 12px; }
        .summary-box strong { font-size: 14px; display: block; margin-top: 2px; }
        .net-box { text-align: center; font-size: 14.5px; font-weight: bold; padding: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; margin-bottom: 12px; color: #1e40af; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
        th { background: #f1f5f9; font-weight: bold; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        tr:nth-child(even) { background: #f9fafb; }
        .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; page-break-inside: avoid !important; break-inside: avoid !important; }
        .summary-box, .net-box, .header { page-break-inside: avoid !important; break-inside: avoid !important; }
        
        /* PDF & PRINT OVERRIDES */
        @media print {
          .no-print { display: none !important; }
          body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          #printable-area { padding: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          @page { size: A4 portrait; margin: 8mm; }
        }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head>
    <body>
      <!-- Action Toolbar -->
      <div class="no-print" style="position: sticky; top: 0; background: #0f172a; color: #fff; padding: 12px 25px; margin: -20px -20px 20px -20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 9999;">
        <div style="font-weight: 700; font-size: 14.5px; display: flex; align-items: center; gap: 8px;">
          <span>📄</span> <span>كشف حساب - خيارات التصدير والطباعة</span>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button onclick="downloadPDF()" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 13.5px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16,185,129,0.3);">
            📥 تنزيل كملف PDF
          </button>
          <button onclick="window.print()" style="background: #0ea5e9; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13.5px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            🖨️ طباعة
          </button>
          <button onclick="window.close()" style="background: rgba(255,255,255,0.12); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); padding: 8px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;">
            ✖ إغلاق النافذة
          </button>
        </div>
      </div>

      <div id="printable-area">
        <div class="header">
          <h1 style="margin: 0; font-size: 20px; color: #111827;">
            <span>فيوتشر إير بلس</span>
            <span style="font-size: 15px; color: #1e40af; font-family: 'Segoe UI', Arial, sans-serif; direction: ltr; display: inline-block; margin-right: 6px;">(FutureAir Pro)</span>
          </h1>
          <h2>كشف حساب تفصيلي: ${supplierName}</h2>
          <div class="period-badge">${periodText}</div>
          <p>تاريخ استخراج الكشف: ${nowStr}</p>
        </div>

        <div class="net-box">الرصيد الصافي المتبقي: ${netStatus}</div>

        <div class="summary-box">
          <div>إجمالي المشتريات (له):<br><strong>${purchased.toLocaleString('ar-EG')} ج.م</strong></div>
          <div>إجمالي السداد (مسدد له):<br><strong>${paid.toLocaleString('ar-EG')} ج.م</strong></div>
          <div>إجمالي المبيعات (عليه):<br><strong>${sold.toLocaleString('ar-EG')} ج.م</strong></div>
          <div>إجمالي التحصيل (محصل منه):<br><strong>${collected.toLocaleString('ar-EG')} ج.م</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ والوقت</th>
              <th>نوع المعاملة</th>
              <th style="color: #b45309;">مشترياتنا منه</th>
              <th style="color: #047857;">سدادنا له</th>
              <th style="color: #0284c7;">مبيعاتنا له</th>
              <th style="color: #7e22ce;">محصل منه</th>
              <th>الرصيد التراكمي</th>
              <th>البيان والتفاصيل</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>توقيع الحسابات: ....................</div>
          <div>اعتماد التاجر/المورد: ....................</div>
        </div>
      </div>

      <script>
        function downloadPDF() {
          const element = document.getElementById('printable-area');
          const opt = {
            margin: [8, 8, 8, 8],
            filename: 'كشف_حساب_${supplierName.replace(/\s+/g, '_')}.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
          };
          if (window.html2pdf) {
            html2pdf().set(opt).from(element).save();
          } else {
            window.print();
          }
        }

        window.onload = function() {
          setTimeout(function() {
            if (${autoDownloadPdf}) {
              downloadPDF();
            } else {
              window.print();
            }
          }, 300);
        }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// ==========================================
// 🚀 NEW ERP CONTROL PANEL FUNCTIONS
// ==========================================

// --- DISPATCH DEVICE FLOW ---
function toggleDispatchInputs() {
  const actionType = document.getElementById('dispatch-action-type')?.value;
  
  // Hide all sections initially
  document.querySelectorAll('.dispatch-section').forEach(s => s.classList.add('hidden'));
  const teamSection = document.getElementById('dispatch-team-section');
  if (teamSection) teamSection.classList.add('hidden');
  
  // Reset ALL required attributes so hidden inputs NEVER block form validation
  const traderSelect = document.getElementById('dispatch-trader-select');
  const traderPrice = document.getElementById('dispatch-trader-price');
  const traderPaid = document.getElementById('dispatch-trader-paid');

  const custName = document.getElementById('dispatch-customer-name');
  const custPhone = document.getElementById('dispatch-customer-phone');
  const custAddress = document.getElementById('dispatch-customer-address');
  const custPrice = document.getElementById('dispatch-customer-price');
  const custPaid = document.getElementById('dispatch-customer-paid');

  const techSelect = document.getElementById('dispatch-technician-select');
  const techSelect2 = document.getElementById('dispatch-technician2-select');
  const driverSelect = document.getElementById('dispatch-driver-select');
  const assistantSelect = document.getElementById('dispatch-assistant-select');

  if (traderSelect) traderSelect.required = false;
  if (traderPrice) traderPrice.required = false;
  if (traderPaid) traderPaid.required = false;

  if (custName) custName.required = false;
  if (custPhone) custPhone.required = false;
  if (custAddress) custAddress.required = false;
  if (custPrice) custPrice.required = false;
  if (custPaid) custPaid.required = false;

  if (techSelect) techSelect.required = false;
  if (techSelect2) techSelect2.required = false;
  if (driverSelect) driverSelect.required = false;
  if (assistantSelect) assistantSelect.required = false;
  
  const helpDiv = document.getElementById('dispatch-type-help');
  let helpText = '';

  if (actionType === 'trader') {
    const traderSection = document.getElementById('dispatch-trader-section');
    if (traderSection) traderSection.classList.remove('hidden');
    if (traderSelect) traderSelect.required = true;
    if (traderPrice) traderPrice.required = true;
    if (traderPaid) traderPaid.required = true;
    
    // Show delivery team section
    if (teamSection) teamSection.classList.remove('hidden');
    
    helpText = '💡 <strong>بيع لتاجر/مورد (سعر تجاري):</strong> بتبيع الجهاز بسعر الجملة لتاجر أو مورد آخر. الحركة دي بتسجل مبيعات على التاجر وبتقلل ديننا ليه دفترياً، وبيخرج الجهاز من المخزن الفعلي.';
  } else if (actionType === 'customer') {
    const customerSection = document.getElementById('dispatch-customer-section');
    if (customerSection) customerSection.classList.remove('hidden');
    if (custName) custName.required = true;
    if (custPhone) custPhone.required = true;
    if (custAddress) custAddress.required = true;
    if (custPrice) custPrice.required = true;
    if (custPaid) custPaid.required = true;
    
    // Show delivery team section
    if (teamSection) teamSection.classList.remove('hidden');
    
    helpText = '💡 <strong>بيع مباشر لعميل (سداد كامل القيمة):</strong> بتبيع جهاز لعميل نهائي مع سداد قيمته بالكامل كاش أو تحويل. بتسجل بياناته وسعر البيع والمبلغ المدفوع بالكامل، والجهاز بيتحول لـ "تم التركيب"، ويتم إضافة الإيراد بالكامل لحسابات الشركة تلقائياً.';
  }

  if (helpDiv) {
    helpDiv.innerHTML = helpText;
    helpDiv.classList.toggle('hidden', !helpText);
  }
}

function getOutdoorSerial(d) {
  if (!d) return '';
  if (d.outdoor_serial && String(d.outdoor_serial).trim().length > 0) return String(d.outdoor_serial).trim();
  if (d.outdoor_serial_number && String(d.outdoor_serial_number).trim().length > 0) return String(d.outdoor_serial_number).trim();
  const notesStr = `${d.installment_notes || ''} ${d.notes || ''}`;
  const match = notesStr.match(/\[(?:سيريال كباس|الوحدة الخارجية):\s*([^\]]+)\]/i);
  return match ? match[1].trim() : '';
}
window.getOutdoorSerial = getOutdoorSerial;
window.getOutdoorSerialFromDevice = getOutdoorSerial;

function renderDeviceSerialsCell(d) {
  if (!d) return '<code>-</code>';
  const indoor = d.serial_number || 'غير مسجل';
  const outdoor = getOutdoorSerial(d);

  return `
    <div style="display: flex; flex-direction: column; gap: 3px; font-size: 0.82rem;">
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 0.7rem; color: var(--accent-cyan); font-weight: 700; background: rgba(14, 165, 233, 0.12); padding: 1px 5px; border-radius: 4px; white-space: nowrap;">🧊 فانة:</span>
        <code style="font-weight: 700; color: var(--text-primary); font-size: 0.85rem;">${indoor}</code>
      </div>
      ${outdoor ? `
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 0.7rem; color: #f59e0b; font-weight: 700; background: rgba(245, 158, 11, 0.12); padding: 1px 5px; border-radius: 4px; white-space: nowrap;">🔥 كباس:</span>
        <code style="font-weight: 700; color: #f59e0b; font-size: 0.85rem;">${outdoor}</code>
      </div>
      ` : `
      <div style="display: flex; align-items: center; gap: 4px; opacity: 0.55;">
        <span style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; background: rgba(255, 255, 255, 0.05); padding: 1px 5px; border-radius: 4px; white-space: nowrap;">🔥 كباس:</span>
        <span style="font-size: 0.78rem; color: var(--text-secondary);">-</span>
      </div>
      `}
    </div>
  `;
}
window.renderDeviceSerialsCell = renderDeviceSerialsCell;

function loadDispatchTeamDropdowns() {
  const techSelect = document.getElementById('dispatch-technician-select');
  const techSelect2 = document.getElementById('dispatch-technician2-select');
  const driverSelect = document.getElementById('dispatch-driver-select');
  const assistantSelect = document.getElementById('dispatch-assistant-select');
  
  const techList = stateCache.technicians || [];

  // 1. Technician 1 (Optional)
  if (techSelect) {
    techSelect.innerHTML = '<option value="">-- بدون فني أول --</option>';
    techList.forEach(t => {
      techSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
  }

  // 2. Technician 2 (Optional)
  if (techSelect2) {
    techSelect2.innerHTML = '<option value="">-- بدون فني ثاني --</option>';
    techList.forEach(t => {
      techSelect2.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
  }
  
  // 3. Driver (Optional)
  if (driverSelect) {
    driverSelect.innerHTML = '<option value="">-- بدون سائق --</option>';
    techList.forEach(t => {
      driverSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
  }
  
  // 4. Assistant (Optional)
  if (assistantSelect) {
    assistantSelect.innerHTML = '<option value="">-- بدون مساعد --</option>';
    techList.forEach(t => {
      assistantSelect.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
  }
}
window.loadDispatchTeamDropdowns = loadDispatchTeamDropdowns;

// --- DISPATCH CART & PICKER STATE ---
window.dispatchCart = [];

function resetDispatchForm() {
  const dispatchForm = document.getElementById('dispatch-device-form');
  if (dispatchForm) dispatchForm.reset();

  const fileInputIds = [
    'dispatch-installation-report',
    'dispatch-sales-contract',
    'dispatch-tax-invoice',
    'dispatch-delivery-note'
  ];
  fileInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const textInputIds = [
    'dispatch-device-id',
    'dispatch-action-type',
    'dispatch-custom-date',
    'dispatch-trader-select',
    'dispatch-trader-name-custom',
    'dispatch-trader-price',
    'dispatch-trader-paid',
    'dispatch-trader-paid2',
    'dispatch-customer-name',
    'dispatch-customer-phone',
    'dispatch-customer-address',
    'dispatch-customer-price',
    'dispatch-customer-paid',
    'dispatch-customer-paid2',
    'dispatch-customer-installment-monthly',
    'dispatch-customer-installment-months',
    'dispatch-customer-installment-notes',
    'dispatch-technician-select',
    'dispatch-technician2-select',
    'dispatch-driver-select',
    'dispatch-assistant-select'
  ];
  textInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.required = false;
    }
  });

  const pm1 = document.getElementById('dispatch-customer-payment-method');
  if (pm1) pm1.value = 'خزنة';
  const pm2 = document.getElementById('dispatch-customer-payment-method2');
  if (pm2) pm2.value = 'إنستا باي';

  const tpm1 = document.getElementById('dispatch-trader-payment-method');
  if (tpm1) tpm1.value = 'خزنة';
  const tpm2 = document.getElementById('dispatch-trader-payment-method2');
  if (tpm2) tpm2.value = 'إنستا باي';

  const traderSplit = document.getElementById('dispatch-trader-split-section');
  if (traderSplit) traderSplit.classList.add('hidden');
  const custSplit = document.getElementById('dispatch-customer-split-section');
  if (custSplit) custSplit.classList.add('hidden');

  // Close any open autocomplete suggestions
  document.querySelectorAll('.autocomplete-items').forEach(el => el.remove());

  // Clear Cart & Picker
  window.dispatchCart = [];
  renderDispatchCart();
  populateDispatchPickerBrands();

  toggleDispatchInputs();
}
window.resetDispatchForm = resetDispatchForm;

function populateDispatchPickerBrands() {
  const brandSelect = document.getElementById('dispatch-picker-brand');
  const capSelect = document.getElementById('dispatch-picker-capacity');
  const detailsDiv = document.getElementById('dispatch-picker-details');
  const totalBadge = document.getElementById('dispatch-total-available-badge');

  if (!brandSelect) return;

  const inCartIds = (window.dispatchCart || []).map(d => d.id);
  const availableDevs = (stateCache.devices || []).filter(d => d.status === 'متاح' && !inCartIds.includes(d.id));

  if (totalBadge) {
    totalBadge.textContent = `(إجمالي المتاح بالمخزن: ${availableDevs.length} جهاز)`;
  }

  const brands = [...new Set(availableDevs.map(d => d.brand).filter(Boolean))].sort();

  brandSelect.innerHTML = '<option value="">-- اختر نوع الجهاز --</option>';
  brands.forEach(b => {
    const count = availableDevs.filter(d => d.brand === b).length;
    brandSelect.innerHTML += `<option value="${b}">${b} (${count} متاح)</option>`;
  });

  if (capSelect) {
    capSelect.innerHTML = '<option value="">-- اختر نوع وماركة الجهاز أولاً --</option>';
    capSelect.disabled = false;
  }
  if (detailsDiv) {
    detailsDiv.classList.add('hidden');
  }
}
window.populateDispatchPickerBrands = populateDispatchPickerBrands;

function onDispatchPickerBrandChange() {
  const brandSelect = document.getElementById('dispatch-picker-brand');
  const capSelect = document.getElementById('dispatch-picker-capacity');
  const detailsDiv = document.getElementById('dispatch-picker-details');

  if (!brandSelect || !capSelect) return;

  const selectedBrand = brandSelect.value;
  if (!selectedBrand) {
    capSelect.innerHTML = '<option value="">-- اختر نوع وماركة الجهاز أولاً --</option>';
    capSelect.disabled = false;
    if (detailsDiv) detailsDiv.classList.add('hidden');
    return;
  }

  const inCartIds = (window.dispatchCart || []).map(d => d.id);
  const matchingDevs = (stateCache.devices || []).filter(d => d.status === 'متاح' && d.brand === selectedBrand && !inCartIds.includes(d.id));

  const capacities = [...new Set(matchingDevs.map(d => d.capacity).filter(Boolean))].sort();

  capSelect.innerHTML = '<option value="">-- اختر القدرة --</option>';
  capacities.forEach(c => {
    const count = matchingDevs.filter(d => d.capacity === c).length;
    capSelect.innerHTML += `<option value="${c}">${c} (${count} متاح)</option>`;
  });

  capSelect.disabled = false;
  if (detailsDiv) detailsDiv.classList.add('hidden');

  if (capacities.length === 1) {
    capSelect.value = capacities[0];
    onDispatchPickerCapacityChange();
  }
}
window.onDispatchPickerBrandChange = onDispatchPickerBrandChange;

function onDispatchPickerCapacityChange() {
  const brandSelect = document.getElementById('dispatch-picker-brand');
  const capSelect = document.getElementById('dispatch-picker-capacity');
  const detailsDiv = document.getElementById('dispatch-picker-details');
  const stockInfo = document.getElementById('dispatch-picker-stock-info');
  const qtyInput = document.getElementById('dispatch-picker-qty');
  const serialsList = document.getElementById('dispatch-picker-serials-list');

  if (!brandSelect || !capSelect || !detailsDiv) return;

  const selectedBrand = brandSelect.value;
  const selectedCap = capSelect.value;

  if (!selectedBrand) {
    if (typeof showToast === 'function') {
      showToast('⚠️ يرجى اختيار نوع وماركة الجهاز أولاً لعرض القدرات المتاحة', 'warning');
    }
    brandSelect.focus();
    brandSelect.style.borderColor = '#0ea5e9';
    setTimeout(() => { brandSelect.style.borderColor = ''; }, 1500);
    capSelect.value = '';
    detailsDiv.classList.add('hidden');
    return;
  }

  if (!selectedCap) {
    detailsDiv.classList.add('hidden');
    return;
  }

  const inCartIds = (window.dispatchCart || []).map(d => d.id);
  const matchingDevs = (stateCache.devices || []).filter(d => d.status === 'متاح' && d.brand === selectedBrand && d.capacity === selectedCap && !inCartIds.includes(d.id));

  if (matchingDevs.length === 0) {
    alert('⚠️ لا توجد أجهزة متبقية بالمخزن من هذا النوع والقدرة!');
    detailsDiv.classList.add('hidden');
    return;
  }

  stockInfo.innerHTML = `📦 المتاح بالمخزن من هذا الموديل: <strong>${matchingDevs.length} جهاز</strong>`;
  qtyInput.max = matchingDevs.length;
  qtyInput.value = 1;

  const fansList = document.getElementById('dispatch-picker-fans-list');
  const compsList = document.getElementById('dispatch-picker-comps-list');
  const fansCount = document.getElementById('dispatch-fans-selected-count');
  const compsCount = document.getElementById('dispatch-comps-selected-count');

  // Render Fan list
  if (fansList) {
    fansList.innerHTML = '';
    matchingDevs.forEach((d, idx) => {
      const isChecked = idx === 0;
      const originalOutdoor = getOutdoorSerial(d);
      fansList.innerHTML += `
        <label style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); padding: 6px 8px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; user-select: none; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
          <input type="checkbox" name="dispatch_picker_fan" value="${d.id}" data-serial="${d.serial_number}" ${isChecked ? 'checked' : ''} onchange="onDispatchPickerFanChange(this)" style="width: auto; margin: 0; cursor: pointer;">
          <div style="display: flex; flex-direction: column; overflow: hidden; line-height: 1.3;">
            <code style="font-family: monospace; color: var(--accent-cyan); font-weight: 700; font-size: 0.85rem;">${d.serial_number}</code>
            ${originalOutdoor ? `<span style="font-size: 0.68rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="الكباس المسجل معها عند التوريد: ${originalOutdoor}">(كباس التوريد: ${originalOutdoor})</span>` : ''}
          </div>
        </label>
      `;
    });
  }

  // Render Compressor list
  if (compsList) {
    compsList.innerHTML = '';
    matchingDevs.forEach((d, idx) => {
      const isChecked = idx === 0;
      const outdoor = getOutdoorSerial(d) || 'بدون سيريال';
      compsList.innerHTML += `
        <label style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); padding: 6px 8px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; user-select: none; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
          <input type="checkbox" name="dispatch_picker_comp" value="${d.id}" data-outdoor="${outdoor}" ${isChecked ? 'checked' : ''} onchange="onDispatchPickerCompChange(this)" style="width: auto; margin: 0; cursor: pointer;">
          <div style="display: flex; flex-direction: column; overflow: hidden; line-height: 1.3;">
            <code style="font-family: monospace; color: #f59e0b; font-weight: 700; font-size: 0.85rem;">${outdoor}</code>
            <span style="font-size: 0.68rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="جاء مع الفانة: ${d.serial_number}">(مع فانة: ${d.serial_number})</span>
          </div>
        </label>
      `;
    });
  }

  if (fansCount) fansCount.textContent = `(محدد: 1)`;
  if (compsCount) compsCount.textContent = `(محدد: 1)`;

  detailsDiv.classList.remove('hidden');
}
window.onDispatchPickerCapacityChange = onDispatchPickerCapacityChange;

function onDispatchPickerQtyChange() {
  const qtyInput = document.getElementById('dispatch-picker-qty');
  if (!qtyInput) return;

  let qty = parseInt(qtyInput.value) || 1;
  const max = parseInt(qtyInput.max) || 1;
  if (qty < 1) qty = 1;
  if (qty > max) qty = max;
  qtyInput.value = qty;

  const fanCheckboxes = document.querySelectorAll('input[name="dispatch_picker_fan"]');
  fanCheckboxes.forEach((cb, idx) => {
    cb.checked = idx < qty;
  });

  const compCheckboxes = document.querySelectorAll('input[name="dispatch_picker_comp"]');
  compCheckboxes.forEach((cb, idx) => {
    cb.checked = idx < qty;
  });

  const fansCount = document.getElementById('dispatch-fans-selected-count');
  const compsCount = document.getElementById('dispatch-comps-selected-count');
  if (fansCount) fansCount.textContent = `(محدد: ${qty})`;
  if (compsCount) compsCount.textContent = `(محدد: ${qty})`;
}
window.onDispatchPickerQtyChange = onDispatchPickerQtyChange;

function onDispatchPickerFanChange(clickedInput) {
  const qtyInput = document.getElementById('dispatch-picker-qty');
  const qty = parseInt(qtyInput?.value || 1);

  if (qty === 1 && clickedInput && clickedInput.checked) {
    const allFans = document.querySelectorAll('input[name="dispatch_picker_fan"]');
    allFans.forEach(cb => {
      if (cb !== clickedInput) cb.checked = false;
    });
  }

  const checkedFans = document.querySelectorAll('input[name="dispatch_picker_fan"]:checked');
  const fansCount = document.getElementById('dispatch-fans-selected-count');
  if (fansCount) fansCount.textContent = `(محدد: ${checkedFans.length})`;
  if (qtyInput && checkedFans.length > 0) {
    qtyInput.value = checkedFans.length;
  }
}
window.onDispatchPickerFanChange = onDispatchPickerFanChange;

function onDispatchPickerCompChange(clickedInput) {
  const qtyInput = document.getElementById('dispatch-picker-qty');
  const qty = parseInt(qtyInput?.value || 1);

  if (qty === 1 && clickedInput && clickedInput.checked) {
    const allComps = document.querySelectorAll('input[name="dispatch_picker_comp"]');
    allComps.forEach(cb => {
      if (cb !== clickedInput) cb.checked = false;
    });
  }

  const checkedComps = document.querySelectorAll('input[name="dispatch_picker_comp"]:checked');
  const compsCount = document.getElementById('dispatch-comps-selected-count');
  if (compsCount) compsCount.textContent = `(محدد: ${checkedComps.length})`;
}
window.onDispatchPickerCompChange = onDispatchPickerCompChange;

async function addSelectedDevicesToDispatchCart() {
  const checkedFans = Array.from(document.querySelectorAll('input[name="dispatch_picker_fan"]:checked'));
  const checkedComps = Array.from(document.querySelectorAll('input[name="dispatch_picker_comp"]:checked'));

  if (checkedFans.length === 0 || checkedComps.length === 0) {
    alert('⚠️ يرجى اختيار الفانة والكباس من القائمتين بالأعلى!');
    return;
  }

  if (checkedFans.length !== checkedComps.length) {
    alert(`⚠️ يجب أن يكون عدد الفانات متطابقاً مع عدد الكباسات!\n\nلقد حددت: (${checkedFans.length}) فانة مقابل (${checkedComps.length}) كباس.\nيرجى تحديد كباس لكل فانة.`);
    return;
  }

  const addBtn = document.querySelector('button[onclick="addSelectedDevicesToDispatchCart()"]');
  if (addBtn) {
    addBtn.disabled = true;
    addBtn.innerHTML = '<span>⏳ جاري التحقق والإضافة...</span>';
  }

  try {
    // Process each chosen pair (Fan i + Comp i)
    for (let i = 0; i < checkedFans.length; i++) {
      const fanDevId = checkedFans[i].value;
      const compSourceDevId = checkedComps[i].value;
      const selectedOutdoor = checkedComps[i].getAttribute('data-outdoor');

      const fanDev = (stateCache.devices || []).find(d => d.id === fanDevId);
      const compDev = (stateCache.devices || []).find(d => d.id === compSourceDevId);

      if (!fanDev) continue;

      // Check if Fan and Compressor were originally paired
      if (compDev && fanDevId !== compSourceDevId) {
        // They were swapped!
        // fanDev gets compDev's outdoor serial
        // compDev gets fanDev's original outdoor serial
        const originalFanOutdoor = getOutdoorSerial(fanDev);
        const originalCompOutdoor = selectedOutdoor;

        console.log(`🔄 Swapping serials: Fan ${fanDev.serial_number} gets Comp ${originalCompOutdoor}, while Device ${compDev.serial_number} gets Comp ${originalFanOutdoor}`);

        // Clean & prepare notes
        const cleanFanNotes = (fanDev.installment_notes || fanDev.notes || '')
          .replace(/\[سيريال كباس:\s*[^\]]+\]/gi, '')
          .replace(/\[الوحدة الخارجية:\s*[^\]]+\]/gi, '')
          .trim();
        const newFanNotes = [
          cleanFanNotes,
          originalCompOutdoor ? `[سيريال كباس: ${originalCompOutdoor}]` : '',
          `[تم تبديل الكباس عند الصرف مع كباس جهاز ${compDev.serial_number}]`
        ].filter(Boolean).join(' ');

        const cleanCompNotes = (compDev.installment_notes || compDev.notes || '')
          .replace(/\[سيريال كباس:\s*[^\]]+\]/gi, '')
          .replace(/\[الوحدة الخارجية:\s*[^\]]+\]/gi, '')
          .trim();
        const newCompNotes = [
          cleanCompNotes,
          originalFanOutdoor ? `[سيريال كباس: ${originalFanOutdoor}]` : '',
          `[تم تبديل الكباس عند الصرف مع كباس جهاز ${fanDev.serial_number}]`
        ].filter(Boolean).join(' ');

        // Update DB
        await supabase.from('devices').update({
          outdoor_serial: originalCompOutdoor,
          installment_notes: newFanNotes
        }).eq('id', fanDev.id);

        await supabase.from('devices').update({
          outdoor_serial: originalFanOutdoor,
          installment_notes: newCompNotes
        }).eq('id', compDev.id);

        // Update in-memory stateCache
        fanDev.outdoor_serial = originalCompOutdoor;
        fanDev.installment_notes = newFanNotes;
        compDev.outdoor_serial = originalFanOutdoor;
        compDev.installment_notes = newCompNotes;
      }

      // Add fanDev to dispatchCart if not already there
      if (!window.dispatchCart.some(c => c.id === fanDev.id)) {
        window.dispatchCart.push({ ...fanDev });
      }
    }

    renderDispatchCart();
    populateDispatchPickerBrands();
  } catch (err) {
    console.error('Error adding devices with custom serial pair:', err);
    alert('❌ حدث خطأ أثناء إضافة الأجهزة: ' + (err.message || err));
  } finally {
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.innerHTML = '<span>➕ إضافة هذا الجهاز إلى سلة الصرف</span>';
    }
  }
}
window.addSelectedDevicesToDispatchCart = addSelectedDevicesToDispatchCart;

function removeDeviceFromDispatchCart(deviceId) {
  window.dispatchCart = (window.dispatchCart || []).filter(d => d.id !== deviceId);
  renderDispatchCart();
  populateDispatchPickerBrands();
}
window.removeDeviceFromDispatchCart = removeDeviceFromDispatchCart;

function clearDispatchCart() {
  window.dispatchCart = [];
  renderDispatchCart();
  populateDispatchPickerBrands();
}
window.clearDispatchCart = clearDispatchCart;

function renderDispatchCart() {
  const cart = window.dispatchCart || [];
  const badge = document.getElementById('dispatch-cart-total-badge');
  const clearBtn = document.getElementById('dispatch-clear-cart-btn');
  const emptyMsg = document.getElementById('dispatch-cart-empty-msg');
  const tableWrap = document.getElementById('dispatch-cart-table-wrapper');
  const tbody = document.getElementById('dispatch-cart-table-body');

  if (badge) badge.textContent = `${cart.length} جهاز`;
  if (clearBtn) clearBtn.style.display = cart.length > 0 ? 'inline-block' : 'none';

  if (!tbody || !emptyMsg || !tableWrap) return;

  if (cart.length === 0) {
    emptyMsg.classList.remove('hidden');
    tableWrap.classList.add('hidden');
    tbody.innerHTML = '';
  } else {
    emptyMsg.classList.add('hidden');
    tableWrap.classList.remove('hidden');
    tbody.innerHTML = cart.map((d, idx) => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 6px 8px; font-weight: 600; color: var(--text-secondary); vertical-align: middle;">${idx + 1}</td>
        <td style="padding: 6px 8px; vertical-align: middle;">
          <strong style="color: var(--text-primary);">${d.brand}</strong>
          <span style="font-size: 0.78rem; color: var(--text-secondary);">(${d.capacity})</span>
        </td>
        <td style="padding: 6px 8px; vertical-align: middle;">
          ${renderDeviceSerialsCell(d)}
          <div style="margin-top: 5px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openSerialSwapModal('${d.id}')" style="font-size: 0.72rem; padding: 2px 8px; color: var(--accent-cyan); border-color: rgba(14,165,233,0.35); background: rgba(14,165,233,0.08); border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;" title="تعديل سيريال الفانة أو الكباس يدوياً">
              <span>✏️ تعديل السيريال</span>
            </button>
          </div>
        </td>
        <td style="padding: 6px 8px; text-align: center; vertical-align: middle;">
          <button type="button" class="btn btn-secondary btn-table" style="font-size: 0.75rem; padding: 2px 6px; color: #ef4444; border-color: rgba(239,68,68,0.3);" onclick="removeDeviceFromDispatchCart('${d.id}')" title="حذف من السلة">🗑️</button>
        </td>
      </tr>
    `).join('');
  }
}
window.renderDispatchCart = renderDispatchCart;

// --- MANUAL SERIAL EDIT MODAL FUNCTIONS ---
function openSerialSwapModal(deviceId) {
  const dev = (stateCache.devices || []).find(d => d.id === deviceId);
  if (!dev) {
    alert('⚠️ الجهاز غير موجود!');
    return;
  }

  document.getElementById('swap-device-id').value = dev.id;
  document.getElementById('swap-modal-device-name').textContent = `${dev.brand} (${dev.capacity})`;

  const currentIndoor = dev.serial_number || 'غير مسجل';
  const currentOutdoor = getOutdoorSerial(dev) || 'غير مسجل';

  document.getElementById('swap-modal-current-indoor').textContent = currentIndoor;
  document.getElementById('swap-modal-current-outdoor').textContent = currentOutdoor;

  document.getElementById('swap-modal-manual-indoor').value = dev.serial_number || '';
  document.getElementById('swap-modal-manual-outdoor').value = getOutdoorSerial(dev) || '';

  const modalEl = document.getElementById('serial-swap-modal');
  if (modalEl) {
    modalEl.style.setProperty('z-index', '1000005', 'important');
  }

  openModal('serial-swap-modal');
}
window.openSerialSwapModal = openSerialSwapModal;

async function confirmManualSerialUpdate() {
  const devId = document.getElementById('swap-device-id').value;
  const newIndoor = (document.getElementById('swap-modal-manual-indoor').value || '').trim();
  const newOutdoor = (document.getElementById('swap-modal-manual-outdoor').value || '').trim() || null;

  if (!newIndoor) {
    alert('⚠️ يجب إدخال سيريال الفانة!');
    return;
  }

  const dev = (stateCache.devices || []).find(d => d.id === devId);
  if (!dev) {
    alert('⚠️ تعذر العثور على الجهاز!');
    return;
  }

  // Check for conflicts
  // 1. Indoor duplicate
  const indoorConflict = (stateCache.devices || []).find(d => d.id !== devId && (d.serial_number || '').trim().toLowerCase() === newIndoor.toLowerCase());
  if (indoorConflict) {
    alert(`❌ سيريال الفانة (${newIndoor}) مسجل مسبقاً لجهاز آخر (${indoorConflict.brand} - حالة: ${indoorConflict.status})!`);
    return;
  }

  // 2. Outdoor conflict
  if (newOutdoor) {
    const outdoorConflict = (stateCache.devices || []).find(d => d.id !== devId && getOutdoorSerial(d).toLowerCase() === newOutdoor.toLowerCase());
    if (outdoorConflict) {
      if (outdoorConflict.status === 'متاح') {
        if (!confirm(`⚠️ تنبيه: سيريال الكباس (${newOutdoor}) مسجل حالياً مع جهاز آخر متاح بالمخزن (${outdoorConflict.brand} - فانة: ${outdoorConflict.serial_number}).\n\nهل أنت متأكد من تعيين هذا الكباس للجهاز الحالي؟`)) {
          return;
        }
      } else {
        alert(`❌ سيريال الكباس (${newOutdoor}) تم صرفه مسبقاً لعميل (${outdoorConflict.customer_name || 'سابق'}) ولا يمكن تكرار صرفه!`);
        return;
      }
    }
  }

  if (!confirm(`هل أنت متأكد من حفظ تعديل السيريالات؟\n- الفانة: ${newIndoor}\n- الكباس: ${newOutdoor || 'بدون'}`)) {
    return;
  }

  const saveBtn = document.getElementById('btn-confirm-manual-swap');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ جاري الحفظ...';
  }

  try {
    const cleanNotes = (dev.installment_notes || dev.notes || '')
      .replace(/\[سيريال كباس:\s*[^\]]+\]/gi, '')
      .replace(/\[الوحدة الخارجية:\s*[^\]]+\]/gi, '')
      .trim();
    const newNotes = [
      cleanNotes,
      newOutdoor ? `[سيريال كباس: ${newOutdoor}]` : '',
      `[تم تعديل السيريال يدوياً بتاريخ ${new Date().toLocaleDateString('en-GB')}]`
    ].filter(Boolean).join(' ');

    const { error } = await supabase.from('devices').update({
      serial_number: newIndoor,
      outdoor_serial: newOutdoor,
      installment_notes: newNotes
    }).eq('id', dev.id);
    if (error) throw error;

    dev.serial_number = newIndoor;
    dev.outdoor_serial = newOutdoor;
    dev.installment_notes = newNotes;

    if (window.dispatchCart) {
      const cartIdx = window.dispatchCart.findIndex(d => d.id === dev.id);
      if (cartIdx !== -1) window.dispatchCart[cartIdx] = { ...dev };
    }

    renderDispatchCart();
    populateDispatchPickerBrands();
    const capSelect = document.getElementById('dispatch-picker-capacity');
    if (capSelect && capSelect.value) {
      onDispatchPickerCapacityChange();
    }

    closeModal('serial-swap-modal');
    alert('✅ تم تعديل وحفظ سيريالات الجهاز بنجاح!');
  } catch (err) {
    alert('❌ حدث خطأ أثناء الحفظ: ' + (err.message || err));
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 حفظ التعديل للسيريالات';
    }
  }
}
window.confirmManualSerialUpdate = confirmManualSerialUpdate;

function openDispatchModal(deviceId) {
  resetDispatchForm();

  if (deviceId) {
    const dev = (stateCache.devices || []).find(d => d.id === deviceId && d.status === 'متاح');
    if (dev) {
      window.dispatchCart = [dev];
    }
  }

  renderDispatchCart();
  populateDispatchPickerBrands();

  const helpDiv = document.getElementById('dispatch-type-help');
  if (helpDiv) {
    helpDiv.innerHTML = '';
    helpDiv.classList.add('hidden');
  }

  // Load team dropdowns
  loadDispatchTeamDropdowns();

  // Load Suppliers / Traders
  const traderSelect = document.getElementById('dispatch-trader-select');
  if (traderSelect) {
    traderSelect.innerHTML = '<option value="">-- اختر التاجر --</option>';
    (stateCache.suppliers || []).forEach(s => {
      traderSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
  }

  document.getElementById('dispatch-action-type').value = '';
  toggleDispatchInputs();
  openModal('dispatch-device-modal');
}

function openDispatchDeviceModalGeneral() {
  resetDispatchForm();

  renderDispatchCart();
  populateDispatchPickerBrands();

  const helpDiv = document.getElementById('dispatch-type-help');
  if (helpDiv) {
    helpDiv.innerHTML = '';
    helpDiv.classList.add('hidden');
  }

  // Load team dropdowns
  loadDispatchTeamDropdowns();

  // Load Suppliers / Traders
  const traderSelect = document.getElementById('dispatch-trader-select');
  if (traderSelect) {
    traderSelect.innerHTML = '<option value="">-- اختر التاجر --</option>';
    (stateCache.suppliers || []).forEach(s => {
      traderSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
  }

  document.getElementById('dispatch-action-type').value = '';
  toggleDispatchInputs();
  openModal('dispatch-device-modal');
}

// Expose globally
window.openDispatchModal = openDispatchModal;
window.openDispatchDeviceModalGeneral = openDispatchDeviceModalGeneral;

function updateCashTypeHelp() {
  const cashType = document.getElementById('cash-type').value;
  const helpDiv = document.getElementById('cash-type-help');
  if (!helpDiv) return;

  let text = '';
  if (cashType === 'إيراد') {
    text = '💡 <strong>إيراد (مداخيل الخزنة):</strong> لإدخال أي مبالغ نقدية تدخل الخزنة مباشرة وبشكل مستقل (مثل إيرادات الصيانة، أو أرباح خارجية). الحركة دي بتزود سيولة الخزنة الفعلية بالموقع.';
  } else if (cashType === 'مصروف') {
    text = '💡 <strong>مصروف (تكاليف الخزنة):</strong> لتسجيل أي كاش يخرج يدوياً من درج الخزنة (مثل إيجار المعرض، فاتورة الكهرباء، الشاي والضيافة، مصروفات النثرية). الحركة دي بتنقص سيولة الخزنة الفعلية.';
  }

  helpDiv.innerHTML = text;
  helpDiv.classList.toggle('hidden', !text);
}

async function handleDispatchDeviceSubmit(e) {
  e.preventDefault();
  window.showSecondTechColWarning = false;
  window.showInstallmentColWarning = false;
  
  if (!window.dispatchCart || window.dispatchCart.length === 0) {
    alert('⚠️ يجب اختيار وإضافة جهاز واحد على الأقل إلى سلة الصرف قبل الحفظ!');
    return;
  }
  const selectedDevices = [...window.dispatchCart];
  const deviceIds = selectedDevices.map(d => d.id);
  const actionType = document.getElementById('dispatch-action-type').value;

  if (selectedDevices.length > 1) {
    const devListStr = selectedDevices.map((d, i) => {
      const out = getOutdoorSerial(d);
      return `${i + 1}. ${d.brand} (${d.capacity}) - فانة: ${d.serial_number}${out ? ` | كباس: ${out}` : ''}`;
    }).join('\n');
    const confirmMsg = `⚠️ تنبيه هام: أنت محدد عدد (${selectedDevices.length}) أجهزة في السلة للصرف معاً في نفس العملية:\n\n${devListStr}\n\nهل أنت متأكد من صرف هذه الأجهزة جميعها معاً لنفس العميل/التاجر؟`;
    if (!confirm(confirmMsg)) {
      return;
    }
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ جاري تنفيذ الصرف...';
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const primaryDeviceId = deviceIds[0];

    // Upload separate documents if available
    let uploadedUrls = [];
    const docsToUpload = [
      { id: 'dispatch-installation-report', marker: '__installation_report__' },
      { id: 'dispatch-sales-contract', marker: '__sales_contract__' },
      { id: 'dispatch-tax-invoice', marker: '__tax_invoice__' },
      { id: 'dispatch-delivery-note', marker: '__delivery_note__' }
    ];

    for (const doc of docsToUpload) {
      const fileInput = document.getElementById(doc.id);
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        // Use UUID-based safe filename
        const rawExt = file.name.includes('.') ? file.name.split('.').pop() : '';
        const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
        const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const fileName = `${primaryDeviceId}/${uniqueId}${doc.marker}.${safeExt}`;
        
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('contracts')
          .upload(fileName, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: { publicUrl } } = supabase.storage
          .from('contracts')
          .getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
    }

    // Read Delivery Team details
    const technicianId = document.getElementById('dispatch-technician-select').value || null;
    const secondTechnicianId = document.getElementById('dispatch-technician2-select').value || null;
    const driverId = document.getElementById('dispatch-driver-select').value || null;
    const assistantId = document.getElementById('dispatch-assistant-select').value || null;

    const isBulkDispatch = selectedDevices.length > 1;
    const dispatchBatchId = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;
    const totalDispatchPrice = actionType === 'trader' 
      ? Number(document.getElementById('dispatch-trader-price')?.value || 0)
      : Number(document.getElementById('dispatch-customer-price')?.value || 0);
    const dispatchBatchTag = isBulkDispatch ? `[إذن صرف مجمع #${dispatchBatchId} | عدد ${selectedDevices.length} أجهزة | إجمالي الصرف: ${totalDispatchPrice.toLocaleString()} ج.م]` : '';

    if (actionType === 'trader') {
      const traderId = document.getElementById('dispatch-trader-select').value;
      const price = Number(document.getElementById('dispatch-trader-price').value);
      const paid = Number(document.getElementById('dispatch-trader-paid').value);
      const paid2 = Number(document.getElementById('dispatch-trader-paid2')?.value || 0);
      const totalPaid = paid + paid2;
      const remaining = price - totalPaid;

      const trader = stateCache.suppliers.find(s => s.id === traderId);
      let traderName = trader ? trader.name : '';
      const customTraderName = document.getElementById('dispatch-trader-name-custom').value.trim();
      const paymentMethod = document.getElementById('dispatch-trader-payment-method').value;
      
      if (customTraderName) {
        traderName = `${traderName} (${customTraderName})`;
      }

      // Distribute amounts proportionally
      let distributedPrice = 0;
      let distributedPaid = 0;
      let distributedPaid2 = 0;

      for (let i = 0; i < selectedDevices.length; i++) {
        const dev = selectedDevices[i];
        const isLast = i === selectedDevices.length - 1;

        const devPrice = isLast ? (price - distributedPrice) : Math.round(price / selectedDevices.length);
        const devPaid = isLast ? (paid - distributedPaid) : Math.round(paid / selectedDevices.length);
        const devPaid2 = isLast ? (paid2 - distributedPaid2) : Math.round(paid2 / selectedDevices.length);

        distributedPrice += devPrice;
        distributedPaid += devPaid;
        distributedPaid2 += devPaid2;

        const devTotalPaid = devPaid + devPaid2;
        const devRemaining = devPrice - devTotalPaid;

        const nextContractImages = dev.contract_images ? [...dev.contract_images, ...uploadedUrls] : uploadedUrls;

        // 0. Resolve Dispatch Date
        const customDispatchDateVal = document.getElementById('dispatch-custom-date')?.value;
        const resolvedDispatchIsoDate = customDispatchDateVal ? new Date(customDispatchDateVal + 'T12:00:00').toISOString() : new Date().toISOString();

        // 1. Update device status
        const devPayload = {
          status: 'تم التركيب',
          customer_name: traderName,
          sale_price: devPrice,
          amount_paid: devTotalPaid,
          amount_remaining: devRemaining,
          technician_id: technicianId,
          second_technician_id: secondTechnicianId,
          driver_id: driverId,
          assistant_id: assistantId,
          installed_at: resolvedDispatchIsoDate,
          assigned_at: resolvedDispatchIsoDate,
          contract_images: nextContractImages,
          installment_notes: dispatchBatchTag || dev.installment_notes || null
        };

        let { error: devErr } = await supabase
          .from('devices')
          .update(devPayload)
          .eq('id', dev.id);

        if (devErr) {
          if (devErr.code === '42703' || (devErr.message && devErr.message.includes('second_technician_id'))) {
            console.warn('second_technician_id column not found in database. Retrying without it...');
            delete devPayload.second_technician_id;
            const retry = await supabase
              .from('devices')
              .update(devPayload)
              .eq('id', dev.id);
            if (retry.error) throw retry.error;
            window.showSecondTechColWarning = true;
          } else {
            throw devErr;
          }
        }

        const devOut = typeof getOutdoorSerial === 'function' ? getOutdoorSerial(dev) : '';
        const devSerialStr = devOut ? `سيريال فانة: ${dev.serial_number} / كباس: ${devOut}` : `سيريال: ${dev.serial_number}`;

        // 2. Log Trader Sale transaction
        const { error: txErr } = await supabase
          .from('supplier_transactions')
          .insert({
            supplier_id: traderId,
            device_id: dev.id,
            transaction_type: 'بيع',
            amount: devPrice,
            notes: `بيع تكييف بسعر تجاري ${dev.brand} (${dev.capacity}) - ${devSerialStr}${customTraderName ? ` - التاجر الفعلي: ${customTraderName}` : ''}`,
            created_at: resolvedDispatchIsoDate
          });
        if (txErr) throw txErr;
      }

      const serialsSummaryStr = selectedDevices.map(d => {
        const out = typeof getOutdoorSerial === 'function' ? getOutdoorSerial(d) : '';
        return out ? `${d.serial_number} (كباس: ${out})` : d.serial_number;
      }).join(', ');

      // 3. Log Trader payment received (total)
      if (paid > 0) {
        const { error: collectErr } = await supabase
          .from('supplier_transactions')
          .insert({
            supplier_id: traderId,
            transaction_type: 'تحصيل',
            amount: paid,
            notes: `تحصيل دفعة مقدمة بيع عدد ${selectedDevices.length} أجهزة للتاجر${customTraderName ? ` (${customTraderName})` : ''} | طريقة: ${paymentMethod}`
          });
        if (collectErr) throw collectErr;

        // Log cash flow with payment method
        await supabase.from('cash_flow').insert({
          type: 'إيراد',
          amount: paid,
          description: `تحصيل دفعة بيع أجهزة للتاجر: ${traderName} (سيريالات: ${serialsSummaryStr}) | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}`
        });

        // Auto-update Financial Center liquidity balance
        await autoUpdateLiquidity(paymentMethod, paid);
      }

      // Process second split payment if provided (total)
      const paymentMethod2 = document.getElementById('dispatch-trader-payment-method2')?.value;
      if (paid2 > 0 && paymentMethod2) {
        const { error: collectErr2 } = await supabase
          .from('supplier_transactions')
          .insert({
            supplier_id: traderId,
            transaction_type: 'تحصيل',
            amount: paid2,
            notes: `تحصيل دفعة ثانية بيع عدد ${selectedDevices.length} أجهزة للتاجر${customTraderName ? ` (${customTraderName})` : ''} | طريقة: ${paymentMethod2}`
          });
        if (collectErr2) throw collectErr2;

        await supabase.from('cash_flow').insert({
          type: 'إيراد',
          amount: paid2,
          description: `دفعة ثانية - بيع أجهزة للتاجر: ${traderName} (سيريالات: ${serialsSummaryStr}) | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod2)}`
        });
        await autoUpdateLiquidity(paymentMethod2, paid2);
      }

      alert(`✅ تم بيع وصرف عدد ${selectedDevices.length} أجهزة للتاجر (${traderName}) بنجاح وتحديث الحسابات المتبادلة!`);
    } 
    else if (actionType === 'customer') {
      const custName = document.getElementById('dispatch-customer-name').value.trim();
      const custPhone = document.getElementById('dispatch-customer-phone').value.trim();
      const custAddress = document.getElementById('dispatch-customer-address').value.trim();
      const price = Number(document.getElementById('dispatch-customer-price').value);
      const paid = Number(document.getElementById('dispatch-customer-paid').value);
      
      const paid2 = Number(document.getElementById('dispatch-customer-paid2')?.value || 0);
      const totalPaid = paid + paid2;
      const remaining = price - totalPaid;
      
      if (totalPaid > price) {
        alert(`⚠️ المبلغ المدفوع (${totalPaid.toLocaleString()} ج.م) لا يمكن أن يكون أكبر من سعر البيع (${price.toLocaleString()} ج.م)!`);
        return;
      }
      
      const paymentMethod = document.getElementById('dispatch-customer-payment-method').value;

      const instMonthly = Number(document.getElementById('dispatch-customer-installment-monthly')?.value || 0);
      const instMonths = Number(document.getElementById('dispatch-customer-installment-months')?.value || 0);
      const instNotes = document.getElementById('dispatch-customer-installment-notes')?.value.trim() || '';

      // Distribute total price across devices
      let distributedPrice = 0;
      let distributedPaid = 0;
      let distributedPaid2 = 0;
      let distributedInst = 0;

      for (let i = 0; i < selectedDevices.length; i++) {
        const dev = selectedDevices[i];
        const isLast = i === selectedDevices.length - 1;

        const devPrice = isLast ? (price - distributedPrice) : Math.round(price / selectedDevices.length);
        const devPaid = isLast ? (paid - distributedPaid) : Math.round(paid / selectedDevices.length);
        const devPaid2 = isLast ? (paid2 - distributedPaid2) : Math.round(paid2 / selectedDevices.length);
        const devInst = isLast ? (instMonthly - distributedInst) : Math.round(instMonthly / selectedDevices.length);

        distributedPrice += devPrice;
        distributedPaid += devPaid;
        distributedPaid2 += devPaid2;
        distributedInst += devInst;

        const devTotalPaid = devPaid + devPaid2;
        const devRemaining = devPrice - devTotalPaid;

        const nextContractImages = dev.contract_images ? [...dev.contract_images, ...uploadedUrls] : uploadedUrls;

        // 1. Update device details
        const devPayload = {
          status: 'تم التركيب',
          customer_name: custName,
          customer_phone: custPhone,
          customer_address: custAddress,
          sale_price: devPrice,
          amount_paid: devTotalPaid,
          amount_remaining: devRemaining,
          technician_id: technicianId,
          second_technician_id: secondTechnicianId,
          driver_id: driverId,
          assistant_id: assistantId,
          installed_at: new Date().toISOString(),
          assigned_at: new Date().toISOString(),
          contract_images: nextContractImages,
          installment_monthly: devInst > 0 ? devInst : null,
          installment_months: instMonths > 0 ? instMonths : null,
          installment_notes: [
            dispatchBatchTag,
            (dev.installment_notes || '').replace(/\[إذن صرف مجمع #[^\]]+\]/g, '').trim(),
            instNotes
          ].filter(Boolean).join(' ') || null
        };

        let { error: devErr } = await supabase
          .from('devices')
          .update(devPayload)
          .eq('id', dev.id);

        if (devErr) {
          if (devErr.code === '42703' || (devErr.message && (devErr.message.includes('second_technician_id') || devErr.message.includes('installment_')))) {
            console.warn('New columns not found in database. Retrying without them...');
            delete devPayload.second_technician_id;
            delete devPayload.installment_monthly;
            delete devPayload.installment_months;
            delete devPayload.installment_notes;
            
            const retry = await supabase
              .from('devices')
              .update(devPayload)
              .eq('id', dev.id);
            if (retry.error) throw retry.error;
            window.showInstallmentColWarning = true;
          } else {
            throw devErr;
          }
        }
      }

      const customerSerialsSummaryStr = selectedDevices.map(d => {
        const out = typeof getOutdoorSerial === 'function' ? getOutdoorSerial(d) : '';
        return out ? `${d.serial_number} (كباس: ${out})` : d.serial_number;
      }).join(', ');

      // 2. Log Cash Flow with payment method (total)
      if (paid > 0) {
        const { error: cashErr } = await supabase
          .from('cash_flow')
          .insert({
            type: 'إيراد',
            amount: paid,
            description: `بيع عدد ${selectedDevices.length} أجهزة للعميل: ${custName} (سيريالات: ${customerSerialsSummaryStr}) | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}`
          });
        if (cashErr) throw cashErr;

        // Auto-update Financial Center liquidity balance
        await autoUpdateLiquidity(paymentMethod, paid);
      }

      // Process second split payment if provided (total)
      const paymentMethod2 = document.getElementById('dispatch-customer-payment-method2')?.value;
      if (paid2 > 0 && paymentMethod2) {
        await supabase.from('cash_flow').insert({
          type: 'إيراد',
          amount: paid2,
          description: `دفعة ثانية - بيع أجهزة للعميل: ${custName} (سيريالات: ${customerSerialsSummaryStr}) | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod2)}`
        });
        await autoUpdateLiquidity(paymentMethod2, paid2);
      }

      alert(`✅ تم بيع وتركيب عدد ${selectedDevices.length} أجهزة للعميل (${custName}) بنجاح وتحديث الحسابات والخزنة!`);
    }

    // Auto-reset dispatch form completely
    resetDispatchForm();

    closeModal('dispatch-device-modal');
    await initApp();

    if (window.showSecondTechColWarning || window.showInstallmentColWarning) {
      alert('⚠️ تنبيه هام: تم حفظ العملية بنجاح، ولكن يرجى تشغيل كود التحديث الأخير في ملف alter_schema.sql داخل SQL Editor في لوحة التحكم لتفعيل حفظ الأقساط والفني الإضافي بشكل دائم.');
    }
  } catch (err) {
    alert('⚠️ حدث خطأ أثناء تنفيذ الصرف: ' + (err.message || err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'حفظ وتنفيذ الصرف';
    }
  }
}

// Helper to convert ISO string to date input format (YYYY-MM-DD)
function toDateInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = num => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDatetimeLocal(isoStr) {
  return toDateInput(isoStr);
}
window.toDatetimeLocal = toDatetimeLocal;
window.toDateInput = toDateInput;

// --- GLOBAL BATCH HELPERS FOR DEVICE EDITING ---
function getBatchIdFromDevice(dev) {
  if (!dev) return null;
  const txt = `${dev.installment_notes || ''} ${dev.notes || ''}`;
  const match = txt.match(/#(REC-\d+|DISP-\d+)/);
  if (match) return match[1];

  if (dev.id && stateCache.supplier_transactions) {
    const tx = stateCache.supplier_transactions.find(t => t.device_id === dev.id && t.transaction_type === 'شراء' && t.notes && t.notes.includes('#REC-'));
    if (tx) {
      const txMatch = tx.notes.match(/#(REC-\d+)/);
      if (txMatch) return txMatch[1];
    }
  }

  return null;
}
window.getBatchIdFromDevice = getBatchIdFromDevice;

function getBatchDevices(dev) {
  if (!dev) return [dev];
  const batchId = getBatchIdFromDevice(dev);
  if (!batchId) return [dev];

  const batchDevs = (stateCache.devices || []).filter(d => {
    const bId = getBatchIdFromDevice(d);
    return bId === batchId;
  });

  return batchDevs.length > 0 ? batchDevs : [dev];
}
window.getBatchDevices = getBatchDevices;

window.currentEditingBatch = null;

function saveCurrentFormToBatchDraft() {
  if (!window.currentEditingBatch || !window.currentEditingBatch.currentDeviceId) return;
  const devId = window.currentEditingBatch.currentDeviceId;
  const currentDraft = window.currentEditingBatch.drafts[devId] || {};

  const brand = document.getElementById('edit-dev-brand')?.value.trim() || '';
  const capacity = document.getElementById('edit-dev-capacity')?.value.trim() || '';
  const serial = document.getElementById('edit-dev-serial')?.value.trim() || '';
  const outdoorSerial = document.getElementById('edit-dev-outdoor-serial')?.value.trim() || '';
  const cost = Number(document.getElementById('edit-dev-cost')?.value || 0);
  const sale = Number(document.getElementById('edit-dev-sale')?.value || 0);
  const paid = Number(document.getElementById('edit-dev-paid')?.value || 0);
  const status = document.getElementById('edit-dev-status')?.value || 'متاح';
  const paymentMethod = document.getElementById('edit-dev-payment-method')?.value || 'خزنة';
  const instMonthly = Number(document.getElementById('edit-dev-installment-monthly')?.value || 0);
  const instMonths = Number(document.getElementById('edit-dev-installment-months')?.value || 0);
  const instNotes = document.getElementById('edit-dev-installment-notes')?.value.trim() || '';
  const createdAtVal = document.getElementById('edit-dev-created-at')?.value || '';
  const installedAtVal = document.getElementById('edit-dev-installed-at')?.value || '';
  const editTechVal = document.getElementById('edit-dev-technician')?.value || null;
  const editDriverVal = document.getElementById('edit-dev-driver')?.value || null;
  const editAssistantVal = document.getElementById('edit-dev-assistant')?.value || null;
  const isCash = document.getElementById('edit-dev-is-cash')?.checked || false;
  const cashAmount = Number(document.getElementById('edit-dev-cash-amount')?.value || 0);
  const cashflowId = document.getElementById('edit-dev-cashflow-id')?.value || '';
  const paymentMethodCustomer = document.getElementById('edit-dev-payment-method-customer')?.value || 'خزنة';

  const customerName = document.getElementById('edit-dev-customer-name')?.value.trim() || null;
  const customerPhone = document.getElementById('edit-dev-customer-phone')?.value.trim() || null;
  const customerAddress = document.getElementById('edit-dev-customer-address')?.value.trim() || null;

  window.currentEditingBatch.drafts[devId] = {
    ...currentDraft,
    id: devId,
    brand,
    capacity,
    serial_number: serial,
    outdoor_serial: outdoorSerial,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_address: customerAddress,
    cost_price: cost,
    sale_price: sale,
    amount_paid: paid,
    status,
    paymentMethod,
    paymentMethodCustomer,
    cashflow_id: cashflowId,
    installment_monthly: instMonthly,
    installment_months: instMonths,
    installment_notes_input: instNotes,
    created_at_input: createdAtVal,
    installed_at_input: installedAtVal,
    technician_id: editTechVal,
    driver_id: editDriverVal,
    assistant_id: editAssistantVal,
    isCash,
    cashAmount,
    _isDraftSaved: true
  };

  // Sync customer details uniformly across all batch drafts so switching tabs preserves the customer
  if (window.currentEditingBatch.drafts) {
    Object.keys(window.currentEditingBatch.drafts).forEach(dId => {
      window.currentEditingBatch.drafts[dId].customer_name = customerName;
      window.currentEditingBatch.drafts[dId].customer_phone = customerPhone;
      window.currentEditingBatch.drafts[dId].customer_address = customerAddress;
    });
  }
}

function renderBatchEditTabs() {
  const container = document.getElementById('edit-dev-batch-container');
  if (!container) return;

  if (!window.currentEditingBatch || !window.currentEditingBatch.devices || window.currentEditingBatch.devices.length <= 1) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const titleEl = document.getElementById('edit-dev-batch-title');
  if (titleEl) {
    titleEl.textContent = `أجهزة الإذن المجمع (#${window.currentEditingBatch.batchId}) - عدد ${window.currentEditingBatch.devices.length} أجهزة`;
  }

  const tabsEl = document.getElementById('edit-dev-batch-tabs');
  if (!tabsEl) return;

  const currentId = window.currentEditingBatch.currentDeviceId;

  tabsEl.innerHTML = window.currentEditingBatch.devices.map((d, index) => {
    const isActive = String(d.id) === String(currentId);
    const draft = window.currentEditingBatch.drafts[d.id] || d;
    const cap = draft.capacity || d.capacity || '';
    const serial = draft.serial_number || d.serial_number || '';
    const brand = draft.brand || d.brand || '';
    
    return `
      <button type="button" 
              class="btn btn-sm" 
              onclick="switchBatchDeviceEdit('${d.id}')" 
              style="padding: 6px 12px; font-size: 0.8rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; ${
                isActive 
                  ? 'background: #a855f7; border: 1px solid #a855f7; color: #ffffff; box-shadow: 0 0 10px rgba(168,85,247,0.4);' 
                  : 'background: rgba(255,255,255,0.06); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.15);'
              }">
        📱 جهاز ${index + 1}: ${brand} (${cap}) ${serial ? `- ${serial}` : ''}
      </button>
    `;
  }).join('');
}

async function switchBatchDeviceEdit(targetDeviceId) {
  saveCurrentFormToBatchDraft();
  window.currentEditingBatch.currentDeviceId = targetDeviceId;
  renderBatchEditTabs();

  const dev = (stateCache.devices || []).find(d => String(d.id) === String(targetDeviceId));
  if (dev) {
    await populateEditDeviceForm(dev);
  }
}
async function populateEditDeviceForm(dev) {
  const draft = (window.currentEditingBatch && window.currentEditingBatch.drafts) ? window.currentEditingBatch.drafts[dev.id] : null;

  const editIdEl = document.getElementById('edit-device-id');
  const brandEl = document.getElementById('edit-dev-brand');
  const capEl = document.getElementById('edit-dev-capacity');
  const serialEl = document.getElementById('edit-dev-serial');
  const costEl = document.getElementById('edit-dev-cost');
  const saleEl = document.getElementById('edit-dev-sale');
  const paidEl = document.getElementById('edit-dev-paid');

  const targetBrand = draft?.brand !== undefined ? draft.brand : (dev.brand || '');
  const targetCap = draft?.capacity !== undefined ? draft.capacity : (dev.capacity || '');

  if (editIdEl) editIdEl.value = dev.id;

  if (brandEl) {
    brandEl.value = targetBrand;
    if (targetBrand && brandEl.value !== targetBrand) {
      const opt = document.createElement('option');
      opt.value = targetBrand;
      opt.textContent = targetBrand;
      brandEl.appendChild(opt);
      brandEl.value = targetBrand;
    }
  }

  if (capEl) {
    let normalizedCap = targetCap;
    if (normalizedCap && !normalizedCap.includes('-') && normalizedCap.includes(' ')) {
      normalizedCap = normalizedCap.replace(' ', '-');
    }
    capEl.value = normalizedCap;
    if (normalizedCap && capEl.value !== normalizedCap) {
      capEl.value = targetCap;
      if (capEl.value !== targetCap) {
        const opt = document.createElement('option');
        opt.value = targetCap;
        opt.textContent = targetCap;
        capEl.appendChild(opt);
        capEl.value = targetCap;
      }
    }
  }

  const outdoorSerialEl = document.getElementById('edit-dev-outdoor-serial');
  if (serialEl) serialEl.value = draft?.serial_number !== undefined ? draft.serial_number : (dev.serial_number || '');
  if (outdoorSerialEl) outdoorSerialEl.value = draft?.outdoor_serial !== undefined ? draft.outdoor_serial : (getOutdoorSerial(dev) || '');
  if (costEl) costEl.value = draft?.cost_price !== undefined ? draft.cost_price : (dev.cost_price || 0);
  if (saleEl) saleEl.value = draft?.sale_price !== undefined ? draft.sale_price : (dev.sale_price || 0);
  if (paidEl) paidEl.value = draft?.amount_paid !== undefined ? draft.amount_paid : (dev.amount_paid || 0);

  // Populate customer inputs
  const custNameEl = document.getElementById('edit-dev-customer-name');
  const custPhoneEl = document.getElementById('edit-dev-customer-phone');
  const custAddressEl = document.getElementById('edit-dev-customer-address');

  const targetCustName = draft?.customer_name !== undefined ? draft.customer_name : (dev.customer_name || '');
  const targetCustPhone = draft?.customer_phone !== undefined ? draft.customer_phone : (dev.customer_phone || '');
  const targetCustAddress = draft?.customer_address !== undefined ? draft.customer_address : (dev.customer_address || '');

  if (custNameEl) custNameEl.value = targetCustName;
  if (custPhoneEl) custPhoneEl.value = targetCustPhone;
  if (custAddressEl) custAddressEl.value = targetCustAddress;

  const batchCustNoteEl = document.getElementById('edit-dev-customer-batch-note');
  if (batchCustNoteEl) {
    const isBatch = window.currentEditingBatch && window.currentEditingBatch.devices && window.currentEditingBatch.devices.length > 1;
    batchCustNoteEl.classList.toggle('hidden', !isBatch);
  }

  // Populate transaction dates
  const createdAtInput = document.getElementById('edit-dev-created-at');
  if (createdAtInput) {
    createdAtInput.value = draft?.created_at_input !== undefined ? draft.created_at_input : toDateInput(dev.created_at);
  }

  const installedAtInput = document.getElementById('edit-dev-installed-at');
  if (installedAtInput) {
    installedAtInput.value = draft?.installed_at_input !== undefined ? draft.installed_at_input : toDateInput(dev.installed_at || dev.assigned_at);
  }

  const dispatchDateGrp = document.getElementById('edit-dev-dispatch-date-group');
  if (dispatchDateGrp) {
    dispatchDateGrp.classList.toggle('hidden', dev.status === 'متاح');
  }
  
  // Populate installment inputs
  const monthlyEl = document.getElementById('edit-dev-installment-monthly');
  const monthsEl = document.getElementById('edit-dev-installment-months');
  const notesEl = document.getElementById('edit-dev-installment-notes');

  if (monthlyEl) monthlyEl.value = draft?.installment_monthly !== undefined ? draft.installment_monthly : (dev.installment_monthly || '');
  if (monthsEl) monthsEl.value = draft?.installment_months !== undefined ? draft.installment_months : (dev.installment_months || '');
  if (notesEl) notesEl.value = draft?.installment_notes_input !== undefined ? draft.installment_notes_input : (dev.installment_notes || '');

  // Search for a linked cash flow transaction containing this device's serial number
  const serial = draft?.serial_number || dev.serial_number;
  const relatedCf = (stateCache.cashFlow || []).find(c => 
    c.description && serial && c.description.includes(serial)
  );

  const cfIdInput = document.getElementById('edit-dev-cashflow-id');
  const cfMethodSelect = document.getElementById('edit-dev-payment-method-customer');
  const cfHelp = document.getElementById('edit-dev-payment-method-help');

  if (relatedCf) {
    if (cfIdInput) cfIdInput.value = draft?.cashflow_id || relatedCf.id;
    const parsedMethod = draft?.paymentMethodCustomer || getPaymentMethodFromDesc(relatedCf.description) || 'خزنة';
    if (cfMethodSelect) cfMethodSelect.value = parsedMethod;
    if (cfHelp) {
      cfHelp.innerHTML = `ℹ️ تم العثور على حركة خزنة مرتبطة بالبيع بقيمة <strong>${relatedCf.amount.toLocaleString()} ج.م</strong>. أي تعديل في المبلغ أو طريقة الدفع هنا سيقوم بتعديل الحركة في الخزنة تلقائياً!`;
      cfHelp.style.color = '#3498db';
    }
  } else {
    if (cfIdInput) cfIdInput.value = draft?.cashflow_id || '';
    if (cfMethodSelect) cfMethodSelect.value = draft?.paymentMethodCustomer || 'خزنة';
    if (cfHelp) {
      cfHelp.innerHTML = `⚠️ لم يتم العثور على حركة خزنة مسجلة لهذا الجهاز (ربما تم استيراده تاريخياً أو تم حذفه يدويّاً).`;
      cfHelp.style.color = 'rgba(255,255,255,0.5)';
    }
  }

  // Map status
  const hasContractOrReport = dev.contract_images && dev.contract_images.some(img => 
    img.includes('__sales_contract__') || img.includes('__installation_report__')
  );
  const statusSelect = document.getElementById('edit-dev-status');
  if (statusSelect) {
    if (dev.status === 'تم التركيب' && dev.supplier_id && !hasContractOrReport) {
      statusSelect.value = 'صرف لتاجر';
    } else {
      statusSelect.value = dev.status || 'متاح';
    }
    statusSelect.disabled = true;
  }

  // Reset cash fields
  const cb = document.getElementById('edit-dev-is-cash');
  const grp = document.getElementById('edit-dev-paid-group');
  const section = document.getElementById('edit-dev-cash-section');
  
  if (cb) {
    cb.checked = draft?.isCash || false;
    cb.disabled = false;
  }
  if (grp) {
    grp.classList.toggle('hidden', !(draft?.isCash));
  }

  if (section) {
    section.style.opacity = '1';
    const label = section.querySelector('label');
    if (label) {
      label.style.cursor = 'pointer';
      label.innerHTML = `<input type="checkbox" id="edit-dev-is-cash" onchange="const g = document.getElementById('edit-dev-paid-group'); if(g) g.classList.toggle('hidden', !this.checked); if(this.checked) { const c = document.getElementById('edit-dev-cost'); const ca = document.getElementById('edit-dev-cash-amount'); if(c && ca) ca.value = c.value; }" style="width: auto;"> ⚡ تسجيل سداد قيمة هذا الجهاز كاش الآن للمورد`;
    }
  }

  try {
    const { data: payTx } = await supabase
      .from('supplier_transactions')
      .select('id, amount')
      .eq('device_id', dev.id)
      .eq('transaction_type', 'دفع')
      .maybeSingle();

    if (payTx) {
      const cbReal = document.getElementById('edit-dev-is-cash');
      if (cbReal) {
        cbReal.checked = true;
        cbReal.disabled = true;
      }
      if (section) {
        section.style.opacity = '0.7';
        const label = section.querySelector('label');
        if (label) {
          label.style.cursor = 'not-allowed';
          label.innerHTML = `<input type="checkbox" id="edit-dev-is-cash" checked disabled style="width: auto;"> ✅ تم سداد قيمة هذا الجهاز كاش للمورد (${payTx.amount.toLocaleString()} ج.م)`;
        }
      }
    }
  } catch (err) {
    console.error('Error checking device payment status:', err);
  }

  // Load and set delivery team in edit modal
  const editTech = document.getElementById('edit-dev-technician');
  const editDriver = document.getElementById('edit-dev-driver');
  const editAssistant = document.getElementById('edit-dev-assistant');

  const techList = stateCache.technicians || [];

  if (editTech) {
    editTech.innerHTML = '<option value="">-- غير محدد --</option>';
    techList.forEach(t => {
      editTech.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
    editTech.value = draft?.technician_id !== undefined ? (draft.technician_id || '') : (dev.technician_id || '');
  }

  if (editDriver) {
    editDriver.innerHTML = '<option value="">-- غير محدد --</option>';
    techList.forEach(t => {
      editDriver.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
    editDriver.value = draft?.driver_id !== undefined ? (draft.driver_id || '') : (dev.driver_id || '');
  }

  if (editAssistant) {
    editAssistant.innerHTML = '<option value="">-- غير محدد --</option>';
    techList.forEach(t => {
      editAssistant.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
    editAssistant.value = draft?.assistant_id !== undefined ? (draft.assistant_id || '') : (dev.assistant_id || '');
  }

  updateEditDeviceModalFields();
  attachEditDeviceSerialValidation();
}

// Helper: Check if a serial (indoor or outdoor) exists on any OTHER device
function checkSerialConflict(serial, currentDeviceId = null) {
  if (!serial) return null;
  const clean = String(serial).trim().toLowerCase();
  if (!clean) return null;

  const allDevices = stateCache.devices || [];
  for (const d of allDevices) {
    if (currentDeviceId && String(d.id) === String(currentDeviceId)) continue;

    const inSer = (d.serial_number || '').trim().toLowerCase();
    const outSer = (d.outdoor_serial || '').trim().toLowerCase();
    
    // Check note tag for compressor serial
    const noteOutMatch = (d.installment_notes || d.notes || '').match(/\[سيريال كباس:\s*([^\]]+)\]/i);
    const noteOutSer = noteOutMatch && noteOutMatch[1] ? noteOutMatch[1].trim().toLowerCase() : '';

    let conflictType = null;
    if (inSer === clean) {
      conflictType = 'سيريال فانة (وحدة داخلية)';
    } else if (outSer === clean || noteOutSer === clean) {
      conflictType = 'سيريال كباس (وحدة خارجية)';
    }

    if (conflictType) {
      let statusDesc = '';
      let customerName = d.customer_name || '';
      let reason = '';

      if (d.status === 'متاح') {
        reason = `مسجل حالياً في جهاز متاح بالمخزن (${d.brand || 'تكييف'} ${d.capacity || ''})`;
        statusDesc = `📦 متاح في المخزن`;
      } else if (d.customer_name) {
        reason = `تم صرفه وتركيبه مسبقاً للعميل`;
        statusDesc = `👤 العميل: "${d.customer_name}" (حالة الجهاز: ${d.status || 'تم التركيب'})`;
      } else if (d.supplier_id) {
        const supp = (stateCache.suppliers || []).find(s => s.id === d.supplier_id);
        const suppName = supp ? supp.name : 'تاجر';
        reason = `تم صرفه مسبقاً لتاجر`;
        statusDesc = `🤝 التاجر: "${suppName}" (حالة الجهاز: ${d.status || 'تم الصرف'})`;
      } else {
        reason = `مسجل في حركة سابقة بالنظام`;
        statusDesc = `الحالة: ${d.status || 'غير متاح'}`;
      }

      return {
        device: d,
        conflictType: conflictType,
        customerName: customerName,
        reason: reason,
        statusDesc: statusDesc,
        conflictingSerial: serial
      };
    }
  }
  return null;
}
window.checkSerialConflict = checkSerialConflict;

// Real-time live conflict warning in Edit Device Modal
function attachEditDeviceSerialValidation() {
  const serialInp = document.getElementById('edit-dev-serial');
  const outdoorInp = document.getElementById('edit-dev-outdoor-serial');
  const serialConflictBox = document.getElementById('edit-dev-serial-conflict');
  const outdoorConflictBox = document.getElementById('edit-dev-outdoor-serial-conflict');

  function validateIndoor() {
    if (!serialInp || !serialConflictBox) return true;
    const currentId = document.getElementById('edit-device-id')?.value;
    const val = serialInp.value.trim();
    if (!val) {
      serialConflictBox.classList.add('hidden');
      serialConflictBox.innerHTML = '';
      return true;
    }
    const conflict = checkSerialConflict(val, currentId);
    if (conflict) {
      serialConflictBox.classList.remove('hidden');
      const custText = conflict.customerName ? `<br>👤 <b>اسم العميل:</b> ${conflict.customerName}` : '';
      serialConflictBox.innerHTML = `⛔ <b>تحذير:</b> سيريال الفانة ده مسجل بالفعل في جهاز آخر (${conflict.conflictType})!<br>📌 <b>السبب:</b> ${conflict.reason}.${custText}<br>🔍 ${conflict.statusDesc}`;
      return false;
    } else {
      serialConflictBox.classList.add('hidden');
      serialConflictBox.innerHTML = '';
      return true;
    }
  }

  function validateOutdoor() {
    if (!outdoorInp || !outdoorConflictBox) return true;
    const currentId = document.getElementById('edit-device-id')?.value;
    const val = outdoorInp.value.trim();
    if (!val) {
      outdoorConflictBox.classList.add('hidden');
      outdoorConflictBox.innerHTML = '';
      return true;
    }
    const conflict = checkSerialConflict(val, currentId);
    if (conflict) {
      outdoorConflictBox.classList.remove('hidden');
      const custText = conflict.customerName ? `<br>👤 <b>اسم العميل:</b> ${conflict.customerName}` : '';
      outdoorConflictBox.innerHTML = `⛔ <b>تحذير:</b> سيريال الكباس ده مسجل بالفعل في جهاز آخر (${conflict.conflictType})!<br>📌 <b>السبب:</b> ${conflict.reason}.${custText}<br>🔍 ${conflict.statusDesc}`;
      return false;
    } else {
      outdoorConflictBox.classList.add('hidden');
      outdoorConflictBox.innerHTML = '';
      return true;
    }
  }

  if (serialInp && !serialInp.dataset.conflictBound) {
    serialInp.dataset.conflictBound = 'true';
    serialInp.addEventListener('input', validateIndoor);
    serialInp.addEventListener('blur', validateIndoor);
  }

  if (outdoorInp && !outdoorInp.dataset.conflictBound) {
    outdoorInp.dataset.conflictBound = 'true';
    outdoorInp.addEventListener('input', validateOutdoor);
    outdoorInp.addEventListener('blur', validateOutdoor);
  }

  validateIndoor();
  validateOutdoor();
}

async function openEditDeviceModal(deviceId) {
  try {
    const dev = (stateCache.devices || []).find(d => String(d.id) === String(deviceId));
    if (!dev) {
      alert('⚠️ لم يتم العثور على بيانات هذا الجهاز في الذاكرة!');
      return;
    }

    const batchDevs = getBatchDevices(dev);
    const batchId = getBatchIdFromDevice(dev);

    if (batchDevs.length > 1) {
      window.currentEditingBatch = {
        batchId: batchId,
        devices: batchDevs,
        currentDeviceId: dev.id,
        drafts: {}
      };

      batchDevs.forEach(d => {
        window.currentEditingBatch.drafts[d.id] = { ...d };
      });

      renderBatchEditTabs();
    } else {
      window.currentEditingBatch = null;
      renderBatchEditTabs();
    }

    await populateEditDeviceForm(dev);
    openModal('edit-device-modal');
  } catch (err) {
    console.error('Error in openEditDeviceModal:', err);
    alert('❌ حدث خطأ عند فتح نافذة تعديل الجهاز: ' + (err.message || err));
  }
}

function updateEditDeviceModalFields() {
  const statusSelect = document.getElementById('edit-dev-status');
  if (!statusSelect) return;
  const status = statusSelect.value;
  const saleGroup = document.getElementById('edit-dev-sale-group');
  const paidGroup = document.getElementById('edit-dev-paid-customer-group');
  const pmGroup = document.getElementById('edit-dev-payment-method-group');
  const teamSection = document.getElementById('edit-dev-team-section');
  const customerSection = document.getElementById('edit-dev-customer-section');
  
  const saleLabel = document.getElementById('edit-dev-sale-label');
  const paidLabel = document.getElementById('edit-dev-paid-label');
  const custNameVal = document.getElementById('edit-dev-customer-name')?.value?.trim();

  if (status === 'متاح') {
    if (saleGroup) saleGroup.classList.add('hidden');
    if (paidGroup) paidGroup.classList.add('hidden');
    if (pmGroup) pmGroup.classList.add('hidden');
    if (teamSection) teamSection.classList.add('hidden');
    if (customerSection) customerSection.classList.toggle('hidden', !custNameVal);
  } else if (status === 'جاري التركيب عهدة مع الفني') {
    if (saleGroup) saleGroup.classList.add('hidden');
    if (paidGroup) paidGroup.classList.add('hidden');
    if (pmGroup) pmGroup.classList.add('hidden');
    if (teamSection) teamSection.classList.remove('hidden');
    if (customerSection) customerSection.classList.remove('hidden');
  } else if (status === 'تم التركيب') {
    if (saleGroup) saleGroup.classList.remove('hidden');
    if (paidGroup) paidGroup.classList.remove('hidden');
    if (pmGroup) pmGroup.classList.remove('hidden');
    if (teamSection) teamSection.classList.remove('hidden');
    if (customerSection) customerSection.classList.remove('hidden');
    if (saleLabel) saleLabel.innerHTML = 'سعر البيع للعميل (ج.م):';
    if (paidLabel) paidLabel.innerHTML = 'المبلغ المدفوع من العميل (ج.م):';
  } else if (status === 'صرف لتاجر') {
    if (saleGroup) saleGroup.classList.remove('hidden');
    if (paidGroup) paidGroup.classList.remove('hidden');
    if (pmGroup) pmGroup.classList.remove('hidden');
    if (teamSection) teamSection.classList.remove('hidden');
    if (customerSection) customerSection.classList.remove('hidden');
    if (saleLabel) saleLabel.innerHTML = 'سعر البيع للتاجر (ج.م):';
    if (paidLabel) paidLabel.innerHTML = 'المبلغ المحصل من التاجر (ج.م):';
  }
}
window.updateEditDeviceModalFields = updateEditDeviceModalFields;

async function saveSingleDeviceItem(devData) {
  const id = devData.id;
  const brand = (devData.brand || '').trim();
  const capacity = (devData.capacity || '').trim();
  const serial = (devData.serial_number || '').trim();
  const cost = Number(devData.cost_price || 0);
  const sale = Number(devData.sale_price || 0);
  const paid = Number(devData.amount_paid || 0);
  const status = devData.status || 'متاح';
  const remaining = sale - paid;
  const paymentMethod = devData.paymentMethod || 'خزنة';

  const instMonthly = Number(devData.installment_monthly || 0);
  const instMonths = Number(devData.installment_months || 0);
  const instNotes = (devData.installment_notes_input !== undefined ? devData.installment_notes_input : (devData.installment_notes || '')).trim();

  const createdAtVal = devData.created_at_input !== undefined ? devData.created_at_input : (devData.created_at ? toDateInput(devData.created_at) : '');
  const installedAtVal = devData.installed_at_input !== undefined ? devData.installed_at_input : (devData.installed_at ? toDateInput(devData.installed_at) : '');

  let dbStatus = status;
  if (status === 'صرف لتاجر') {
    dbStatus = 'تم التركيب';
  }

  const editTechVal = devData.technician_id || null;
  const editDriverVal = devData.driver_id || null;
  const editAssistantVal = devData.assistant_id || null;

  const originalDev = (stateCache.devices || []).find(d => String(d.id) === String(id));
  const outdoorSerialVal = devData.outdoor_serial !== undefined 
    ? (devData.outdoor_serial ? String(devData.outdoor_serial).trim() : null)
    : (getOutdoorSerial(originalDev) || null);

  // 🔒 Strict Duplicate Serial Guard: Prevent assigning a serial already used in another device
  if (serial) {
    const conflictIndoor = checkSerialConflict(serial, id);
    if (conflictIndoor) {
      const custInfo = conflictIndoor.customerName ? `\n👤 اسم العميل: ${conflictIndoor.customerName}` : '';
      const alertMsg = `⛔ مينفعش تكتب سيريال الفانة ده (${serial})!\n\n📌 السبب: ${conflictIndoor.reason} (${conflictIndoor.conflictType}).\n🔍 تفاصيل الجهاز المسجل:\n${conflictIndoor.statusDesc}${custInfo}\n\n⚠️ يرجى التأكد من كتابة سيريال صحيح وغير مكرر.`;
      alert(alertMsg);
      throw new Error(`سيريال الفانة (${serial}) مكرر ومسجل مسبقاً: ${conflictIndoor.statusDesc}`);
    }
  }

  if (outdoorSerialVal) {
    const conflictOutdoor = checkSerialConflict(outdoorSerialVal, id);
    if (conflictOutdoor) {
      const custInfo = conflictOutdoor.customerName ? `\n👤 اسم العميل: ${conflictOutdoor.customerName}` : '';
      const alertMsg = `⛔ مينفعش تكتب سيريال الكباس ده (${outdoorSerialVal})!\n\n📌 السبب: ${conflictOutdoor.reason} (${conflictOutdoor.conflictType}).\n🔍 تفاصيل الجهاز المسجل:\n${conflictOutdoor.statusDesc}${custInfo}\n\n⚠️ يرجى التأكد من كتابة سيريال صحيح وغير مكرر.`;
      alert(alertMsg);
      throw new Error(`سيريال الكباس (${outdoorSerialVal}) مكرر ومسجل مسبقاً: ${conflictOutdoor.statusDesc}`);
    }
  }

  const cleanPrevNotes = (originalDev?.installment_notes || originalDev?.notes || '')
    .replace(/\[سيريال كباس:\s*[^\]]+\]/gi, '')
    .replace(/\[الوحدة الخارجية:\s*[^\]]+\]/gi, '')
    .trim();

  const finalNotesCombined = [
    cleanPrevNotes,
    outdoorSerialVal ? `[سيريال كباس: ${outdoorSerialVal}]` : '',
    instNotes
  ].filter(Boolean).join(' ') || null;

  const updateData = {
    brand: brand,
    capacity: capacity,
    serial_number: serial,
    cost_price: cost,
    sale_price: sale,
    amount_paid: paid,
    amount_remaining: remaining,
    status: dbStatus,
    technician_id: editTechVal,
    driver_id: editDriverVal,
    assistant_id: editAssistantVal,
    installment_monthly: instMonthly > 0 ? instMonthly : null,
    installment_months: instMonths > 0 ? instMonths : null,
    installment_notes: finalNotesCombined
  };
  if (outdoorSerialVal) {
    updateData.outdoor_serial = outdoorSerialVal;
  }

  if (devData.customer_name !== undefined) {
    updateData.customer_name = devData.customer_name ? String(devData.customer_name).trim() : null;
  }
  if (devData.customer_phone !== undefined) {
    updateData.customer_phone = devData.customer_phone ? String(devData.customer_phone).trim() : null;
  }
  if (devData.customer_address !== undefined) {
    updateData.customer_address = devData.customer_address ? String(devData.customer_address).trim() : null;
  }

  if (createdAtVal) {
    updateData.created_at = new Date(createdAtVal.includes('T') ? createdAtVal : `${createdAtVal}T12:00:00`).toISOString();
  }
  if (installedAtVal && dbStatus !== 'متاح') {
    const isoInstalled = new Date(installedAtVal.includes('T') ? installedAtVal : `${installedAtVal}T12:00:00`).toISOString();
    updateData.installed_at = isoInstalled;
    updateData.assigned_at = isoInstalled;
  }

  if (dbStatus === 'متاح' && originalDev && originalDev.status !== 'متاح' && !originalDev.customer_name) {
    const isTraderSale = originalDev.status === 'تم التركيب' && originalDev.supplier_id;
    if (isTraderSale) {
      updateData.supplier_id = null;
    }
    
    updateData.technician_id = null;
    updateData.customer_name = null;
    updateData.customer_phone = null;
    updateData.customer_address = null;
    updateData.sale_price = 0;
    updateData.amount_paid = 0;
    updateData.amount_remaining = 0;
    updateData.installment_monthly = null;
    updateData.installment_months = null;
    updateData.installment_notes = null;
    updateData.assigned_at = null;
    updateData.installed_at = null;

    const originalImages = originalDev.contract_images || [];
    updateData.contract_images = originalImages.filter(img => 
      img.includes('__delivery_receipt__') || img.includes('__general_doc__')
    );
  }

  const isNewlyPaid = devData.isCash && devData.cashAmount > 0;
  const cashAmount = Number(devData.cashAmount || 0);

  const supplierId = originalDev ? originalDev.supplier_id : null;
  const supplier = supplierId ? stateCache.suppliers.find(s => s.id === supplierId) : null;
  const supplierName = supplier ? supplier.name : 'المورد';

  // Sync purchase price changes to supplier transactions & cash flow if paid cash
  const isCostChanged = originalDev && originalDev.cost_price !== cost;
  if (isCostChanged && supplierId) {
    // 1. Sync 'شراء' transaction
    const { data: purchaseTxs } = await supabase
      .from('supplier_transactions')
      .select('id, notes')
      .eq('supplier_id', supplierId)
      .eq('transaction_type', 'شراء');

    const matchingPurchaseTx = purchaseTxs ? purchaseTxs.find(t => 
      t.device_id === id || 
      (originalDev.serial_number && t.notes.includes(originalDev.serial_number))
    ) : null;

    if (matchingPurchaseTx) {
      await supabase
        .from('supplier_transactions')
        .update({ 
          amount: cost,
          notes: `شراء تكييف ${brand} (${capacity}) - سيريال: ${serial}${originalDev.customer_name ? ` (المورد: ${originalDev.customer_name})` : ''}`
        })
        .eq('id', matchingPurchaseTx.id);
    }

    // 2. Sync 'دفع' transaction & cash flow if it was paid cash
    const { data: paymentTxs } = await supabase
      .from('supplier_transactions')
      .select('id, notes')
      .eq('supplier_id', supplierId)
      .eq('transaction_type', 'دفع');

    const matchingPaymentTx = paymentTxs ? paymentTxs.find(t => 
      t.device_id === id || 
      (originalDev.serial_number && t.notes.includes(originalDev.serial_number))
    ) : null;

    if (matchingPaymentTx) {
      await supabase
        .from('supplier_transactions')
        .update({ 
          amount: cost,
          notes: `سداد قيمة جهاز ${brand} كاش S/N: ${serial} | طريقة: ${paymentMethod} (تم تحديثه من تعديل الجهاز)`
        })
        .eq('id', matchingPaymentTx.id);

      const { data: cashFlowRecords } = await supabase
        .from('cash_flow')
        .select('id, description')
        .eq('type', 'مصروف');

      const matchingCashFlow = cashFlowRecords ? cashFlowRecords.find(c => 
        originalDev.serial_number && c.description.includes(originalDev.serial_number)
      ) : null;

      if (matchingCashFlow) {
        await supabase
          .from('cash_flow')
          .update({ 
            amount: cost,
            description: `سداد كاش فوري للمورد: ${supplierName} لشراء تكييف S/N: ${serial} | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}`
          })
          .eq('id', matchingCashFlow.id);

        const diff = cost - originalDev.cost_price;
        if (diff !== 0) {
          await autoUpdateLiquidity(paymentMethod, -diff);
        }
      }
    }
  }

  if (isNewlyPaid && cashAmount > 0) {
    if (supplierId) {
      await supabase.from('supplier_transactions').insert({
        supplier_id: supplierId,
        device_id: id,
        transaction_type: 'دفع',
        amount: cashAmount,
        notes: `سداد قيمة جهاز ${brand} كاش S/N: ${serial} | طريقة: ${paymentMethod} (تم تحديثه من تعديل الجهاز)`
      });

      await supabase.from('cash_flow').insert({
        type: 'مصروف',
        amount: cashAmount,
        description: `سداد كاش فوري للمورد: ${supplierName} لشراء تكييف S/N: ${serial} | طريقة الدفع: ${getPaymentMethodDisplayWithCategory(paymentMethod)}`
      });

      await autoUpdateLiquidity(paymentMethod, -cashAmount);
    }
  }

  // Sync linked customer cash flow transaction if present
  const cashFlowId = devData.cashflow_id || '';
  const newPaymentMethodCustomer = devData.paymentMethodCustomer || 'خزنة';
  if (cashFlowId) {
    const c = (stateCache.cashFlow || []).find(x => x.id === cashFlowId);
    if (c) {
      const oldAmount = Number(c.amount || 0);
      const oldMethod = getPaymentMethodFromDesc(c.description) || 'خزنة';
      
      if (oldAmount !== paid || oldMethod !== newPaymentMethodCustomer) {
        const oldFactor = c.type === 'إيراد' ? -1 : 1;
        await autoUpdateLiquidity(oldMethod, oldAmount * oldFactor);
        
        const newFactor = c.type === 'إيراد' ? 1 : -1;
        await autoUpdateLiquidity(newPaymentMethodCustomer, paid * newFactor);
        
        let cleanDesc = c.description.split('__ATTACHMENT__')[0].trim();
        const oldCustName = originalDev?.customer_name;
        const newCustName = updateData.customer_name;
        if (oldCustName && newCustName && cleanDesc.includes(oldCustName)) {
          cleanDesc = cleanDesc.replaceAll(oldCustName, newCustName);
        }
        const parts = cleanDesc.split('|').map(p => p.trim());
        if (parts.length > 0) {
          parts[parts.length - 1] = `طريقة الدفع: ${getPaymentMethodDisplayWithCategory(newPaymentMethodCustomer)}`;
          cleanDesc = parts.join(' | ');
        }
        
        if (c.description.includes('__ATTACHMENT__')) {
          const attachUrl = c.description.split('__ATTACHMENT__')[1];
          cleanDesc += ` __ATTACHMENT__${attachUrl}`;
        }
        
        await supabase
          .from('cash_flow')
          .update({
            amount: paid,
            description: cleanDesc
          })
          .eq('id', cashFlowId);
      }
    }
  }

  // Sync customer name in related cash_flow transactions if changed
  const oldCustName = originalDev?.customer_name;
  const newCustName = updateData.customer_name;
  if (oldCustName && newCustName && oldCustName !== newCustName) {
    try {
      const relatedCfs = (stateCache.cashFlow || []).filter(c => 
        c.description && c.description.includes(oldCustName) && (
          (serial && c.description.includes(serial)) || (cashFlowId && c.id === cashFlowId)
        )
      );
      for (const cf of relatedCfs) {
        const updatedDesc = cf.description.replaceAll(oldCustName, newCustName);
        if (updatedDesc !== cf.description) {
          await supabase.from('cash_flow').update({ description: updatedDesc }).eq('id', cf.id);
          cf.description = updatedDesc;
        }
      }
    } catch (cfErr) {
      console.warn('Error syncing customer name to cash_flow:', cfErr);
    }
  }

  let { error } = await supabase
    .from('devices')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.warn('Initial device update retry:', error);
    const errStr = (error.message || '').toLowerCase();
    
    delete updateData.outdoor_serial;
    if (errStr.includes('second_technician_id')) delete updateData.second_technician_id;
    if (errStr.includes('installment_monthly')) delete updateData.installment_monthly;
    if (errStr.includes('installment_months')) delete updateData.installment_months;
    delete updateData.notes;

    const retry = await supabase
      .from('devices')
      .update(updateData)
      .eq('id', id);
      
    if (retry.error) {
      console.warn('Second retry with core columns:', retry.error);
      const safeData = {
        brand: brand,
        capacity: capacity,
        serial_number: serial,
        cost_price: cost,
        sale_price: sale,
        amount_paid: paid,
        amount_remaining: remaining,
        status: dbStatus,
        technician_id: editTechVal,
        driver_id: editDriverVal,
        assistant_id: editAssistantVal,
        installment_notes: finalNotesCombined,
        customer_name: updateData.customer_name,
        customer_phone: updateData.customer_phone,
        customer_address: updateData.customer_address
      };
      const finalRetry = await supabase.from('devices').update(safeData).eq('id', id);
      if (finalRetry.error) throw finalRetry.error;
    }
  }
}

async function handleEditDeviceSubmit(e) {
  e.preventDefault();
  saveCurrentFormToBatchDraft();

  try {
    const currentCustName = document.getElementById('edit-dev-customer-name')?.value.trim() || null;
    const currentCustPhone = document.getElementById('edit-dev-customer-phone')?.value.trim() || null;
    const currentCustAddress = document.getElementById('edit-dev-customer-address')?.value.trim() || null;

    if (window.currentEditingBatch && window.currentEditingBatch.devices && window.currentEditingBatch.devices.length > 1) {
      const devsToSave = window.currentEditingBatch.devices;
      for (const d of devsToSave) {
        const devData = window.currentEditingBatch.drafts[d.id] || d;
        devData.customer_name = currentCustName;
        devData.customer_phone = currentCustPhone;
        devData.customer_address = currentCustAddress;
        await saveSingleDeviceItem(devData);
      }
      closeModal('edit-device-modal');
      await initApp();
      if (window.showInstallmentColWarning) {
        alert('⚠️ تنبيه هام: تم حفظ التعديلات بنجاح، ولكن يرجى تشغيل كود التحديث الأخير في ملف alter_schema.sql لتفعيل حفظ تفاصيل الأقساط بشكل دائم.');
      }
      alert('✅ تم تحديث بيانات جميع أجهزة الإذن المجمع بنجاح!');
    } else {
      const id = document.getElementById('edit-device-id').value;
      const dev = (stateCache.devices || []).find(d => String(d.id) === String(id));
      const draft = window.currentEditingBatch?.drafts[id] || {};

      const singleDevData = {
        ...dev,
        ...draft,
        id: id,
        brand: document.getElementById('edit-dev-brand').value.trim(),
        capacity: document.getElementById('edit-dev-capacity').value.trim(),
        serial_number: document.getElementById('edit-dev-serial').value.trim(),
        outdoor_serial: document.getElementById('edit-dev-outdoor-serial')?.value.trim() || null,
        customer_name: currentCustName,
        customer_phone: currentCustPhone,
        customer_address: currentCustAddress,
        cost_price: Number(document.getElementById('edit-dev-cost').value),
        sale_price: Number(document.getElementById('edit-dev-sale').value),
        amount_paid: Number(document.getElementById('edit-dev-paid').value),
        status: document.getElementById('edit-dev-status').value,
        paymentMethod: document.getElementById('edit-dev-payment-method')?.value || 'خزنة',
        paymentMethodCustomer: document.getElementById('edit-dev-payment-method-customer')?.value || 'خزنة',
        cashflow_id: document.getElementById('edit-dev-cashflow-id')?.value || '',
        installment_monthly: Number(document.getElementById('edit-dev-installment-monthly')?.value || 0),
        installment_months: Number(document.getElementById('edit-dev-installment-months')?.value || 0),
        installment_notes_input: document.getElementById('edit-dev-installment-notes')?.value.trim() || '',
        created_at_input: document.getElementById('edit-dev-created-at')?.value || '',
        installed_at_input: document.getElementById('edit-dev-installed-at')?.value || '',
        technician_id: document.getElementById('edit-dev-technician')?.value || null,
        driver_id: document.getElementById('edit-dev-driver')?.value || null,
        assistant_id: document.getElementById('edit-dev-assistant')?.value || null,
        isCash: document.getElementById('edit-dev-is-cash')?.checked || false,
        cashAmount: Number(document.getElementById('edit-dev-cash-amount')?.value || 0)
      };

      await saveSingleDeviceItem(singleDevData);
      closeModal('edit-device-modal');
      await initApp();
      if (window.showInstallmentColWarning) {
        alert('⚠️ تنبيه هام: تم حفظ التعديلات بنجاح، ولكن يرجى تشغيل كود التحديث الأخير في ملف alter_schema.sql لتفعيل حفظ تفاصيل الأقساط بشكل دائم.');
      }
      alert('✅ تم تحديث بيانات الجهاز بنجاح!');
    }
  } catch (err) {
    alert('Failed to update device: ' + err.message);
  }
}

async function deleteDeviceAction() {
  const id = document.getElementById('edit-device-id').value;
  const dev = (stateCache.devices || []).find(d => String(d.id) === String(id));
  const devDesc = dev ? `${dev.brand || ''} (${dev.capacity || ''}) - S/N: ${dev.serial_number || ''}` : `جهاز #${id}`;

  if (!confirm(`⚠️ هل أنت متأكد من حذف هذا الجهاز (${devDesc}) تماماً من المخزن؟ لا يمكن التراجع عن هذا الإجراء.`)) return;

  const btn = document.querySelector('#edit-device-modal .btn-danger');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ جاري الحذف...`;
  }

  try {
    const { error } = await supabase.from('devices').delete().eq('id', id);
    if (error) throw error;

    if (window.currentEditingBatch && window.currentEditingBatch.devices && window.currentEditingBatch.devices.length > 1) {
      window.currentEditingBatch.devices = window.currentEditingBatch.devices.filter(d => String(d.id) !== String(id));
      delete window.currentEditingBatch.drafts[id];
      stateCache.devices = (stateCache.devices || []).filter(d => String(d.id) !== String(id));

      if (window.currentEditingBatch.devices.length > 0) {
        const nextDev = window.currentEditingBatch.devices[0];
        window.currentEditingBatch.currentDeviceId = nextDev.id;
        renderBatchEditTabs();
        await populateEditDeviceForm(nextDev);
        alert('✅ تم حذف الجهاز من الإذن المجمع. يمكنك مواصلة تعديل باقي الأجهزة.');
        return;
      }
    }

    closeModal('edit-device-modal');
    await initApp();
    alert('✅ تم حذف الجهاز بنجاح من المخزن.');
  } catch (err) {
    alert('Failed to delete device: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// --- ADD SUPPLIER FLOW ---
async function handleAddSupplierSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-supplier-name').value.trim();

  try {
    const { error } = await supabase.from('suppliers').insert({ name: name });
    if (error) throw error;

    closeModal('add-supplier-modal');
    await initApp();
    alert('✅ تم إضافة المورد الجديد بنجاح!');
  } catch (err) {
    alert('Failed to add supplier: ' + err.message);
  }
}

// --- ADD SUPPLIER TRANSACTION ---
function openAddSupplierTxModal(supplierId, name) {
  document.getElementById('tx-supplier-id').value = supplierId;
  document.getElementById('tx-supplier-name').value = name;
  document.getElementById('tx-type').value = '';
  const dateInput = document.getElementById('tx-date');
  if (dateInput) {
    dateInput.value = new Date().toLocaleDateString('en-CA');
  }
  const attachInput = document.getElementById('tx-attachment');
  if (attachInput) {
    attachInput.value = '';
  }
  const helpDiv = document.getElementById('tx-type-help');
  if (helpDiv) {
    helpDiv.innerHTML = '';
    helpDiv.classList.add('hidden');
  }
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-notes').value = '';
  openModal('add-supplier-tx-modal');
}

function updateTxTypeHelp() {
  const txType = document.getElementById('tx-type').value;
  const helpDiv = document.getElementById('tx-type-help');
  if (!helpDiv) return;

  let text = '';
  if (txType === 'شراء') {
    text = '💡 <strong>شراء أجهزة منه (دين علينا له):</strong> اختار ده لو اشتريت منه بضاعة بالآجل (على الحساب). الحركة دي هتزود الفلوس اللي عليك للمورد في الدفاتر، ومفيش أي كاش هيخرج من درج الخزنة.';
  } else if (txType === 'دفع') {
    text = '💡 <strong>دفع مالي له (سداد دفعة حساب):</strong> بتاع التسويات والورق! اختاره لو المورد نزلك خصم، أو ريبيت سنوي، أو رجعتله بضاعة (مرتجع)، أو عملتوا مقاصة. الحركة دي بتقلل دينك للمورد دفترياً من غير ما تلمس درج الخزنة الحقيقي.';
  } else if (txType === 'بيع') {
    text = '💡 <strong>بيع أجهزة له بسعر تجاري (دين لنا عليه):</strong> اختار ده لو المورد نفسه اشترى منك أجهزة بالآجل (على الحساب). الحركة دي بتسجل البضاعة اللي خرجت وبتثبت إن ليك فلوس عنده بره.';
  } else if (txType === 'تحصيل') {
    text = '💡 <strong>تحصيل مالي منه (دفعة حساب لنا):</strong> اختار ده لو فيه تسوية ورقية أو مقاصة دفترياً جاية لصالحك أنت وبتزود فلوسك عنده، من غير ما تستلم كاش في إيدك في درج الخزنة.';
  } else if (txType === 'ريبيت') {
    text = '💡 <strong>تسوية ريبيت / خصم ممنوح (دفترياً):</strong> بتاع التسويات والورق! اختاره لو المورد نزلك خصم، أو ريبيت سنوي، أو رجعتله بضاعة (مرتجع)، أو عملتوا مقاصة. الحركة دي بتقلل دينك للمورد دفترياً <strong>من غير ما تلمس درج الخزنة الحقيقي</strong> وبدون تسجيل أي مصروف يدوياً.';
  }

  helpDiv.innerHTML = text;
  helpDiv.classList.toggle('hidden', !text);
}

async function handleAddSupplierTxSubmit(e) {
  e.preventDefault();
  const supplierId = document.getElementById('tx-supplier-id').value;
  const supplierName = document.getElementById('tx-supplier-name').value;
  const txType = document.getElementById('tx-type').value;
  const amount = Number(document.getElementById('tx-amount').value);
  const notes = document.getElementById('tx-notes').value.trim();
  const txDate = document.getElementById('tx-date')?.value || new Date().toLocaleDateString('en-CA');
  const attachInput = document.getElementById('tx-attachment');

  // Map rebate option to 'دفع' for database compliance, while keeping notes distinct
  const finalType = txType === 'ريبيت' ? 'دفع' : txType;
  let finalNotes = txType === 'ريبيت' ? `🎁 [تسوية ريبيت/خصم]: ${notes}` : notes;

  try {
    let attachmentUrl = '';
    if (attachInput && attachInput.files && attachInput.files[0]) {
      attachmentUrl = await uploadAttachmentFile(attachInput.files[0], 'cash_flow', '__general_doc__');
    }

    if (attachmentUrl) {
      finalNotes += ` __ATTACHMENT__${attachmentUrl}`;
    }

    const txCreatedAt = getIsoTimestampForDate(txDate);

    // 1. Insert supplier transaction (purely book-keeping ledger adjustment)
    const { error: txErr } = await supabase
      .from('supplier_transactions')
      .insert({
        supplier_id: supplierId,
        transaction_type: finalType,
        amount: amount,
        notes: finalNotes,
        created_at: txCreatedAt
      });
    if (txErr) throw txErr;

    closeModal('add-supplier-tx-modal');
    await initApp();
    alert('✅ تم تسجيل الحركة وتحديث حساب المورد دفترياً بنجاح!');
  } catch (err) {
    alert('Failed to record supplier transaction: ' + err.message);
  }
}

// --- ADD SALARY ADVANCE FLOW ---
function openAddAdvanceModal() {
  const select = document.getElementById('advance-tech-select');
  select.innerHTML = '<option value="">-- اختر الموظف --</option>';
  stateCache.technicians.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
  });

  document.getElementById('advance-amount').value = '';
  document.getElementById('advance-notes').value = '';
  openModal('add-advance-modal');
}

async function handleAddAdvanceSubmit(e) {
  e.preventDefault();
  const techId = document.getElementById('advance-tech-select').value;
  const amount = Number(document.getElementById('advance-amount').value);
  const notes = document.getElementById('advance-notes').value.trim();

  const tech = stateCache.technicians.find(t => t.id === techId);
  const techName = tech ? tech.name : '';

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Insert advance
    const { error: advErr } = await supabase
      .from('salary_advances')
      .insert({
        technician_id: techId,
        amount: amount,
        date: today,
        notes: notes
      });
    if (advErr) throw advErr;

    // 2. Log cash flow expense
    const { error: cashErr } = await supabase
      .from('cash_flow')
      .insert({
        type: 'مصروف',
        amount: amount,
        description: `سلفة نقدية للفني: ${techName} (${notes})`
      });
    if (cashErr) throw cashErr;

    closeModal('add-advance-modal');
    await initApp();
    alert('✅ تم تسجيل السلفة بنجاح وخصمها من الخزنة!');
  } catch (err) {
    alert('Failed to record advance: ' + err.message);
  }
}

// --- INLINE ATTENDANCE SAVE ---
async function saveAttendanceInline(techId, status, timeVal) {
  const attDateInput = document.getElementById('attendance-date-filter');
  const targetDate = attDateInput && attDateInput.value ? attDateInput.value : new Date().toISOString().split('T')[0];

  try {
    if (!status && timeVal) {
      status = 'حاضر';
    }

    if (!status) {
      // Clear attendance record
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('technician_id', techId)
        .eq('date', targetDate);
      if (error) throw error;
    } else {
      let formattedTime = null;
      if (timeVal && (status === 'حاضر' || status === 'تأخير')) {
        formattedTime = `${timeVal}:00`;
      } else if (status === 'حاضر' || status === 'تأخير') {
        const now = new Date();
        formattedTime = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'Africa/Cairo' });
      }

      const payload = {
        technician_id: techId,
        date: targetDate,
        status: status,
        arrival_time: formattedTime
      };

      let { error } = await supabase
        .from('attendance')
        .upsert(payload, { onConflict: 'technician_id,date' });
      
      if (error) {
        // Fallback: If column does not exist (error 42703 or message contains arrival_time), retry without arrival_time
        if (error.code === '42703' || (error.message && error.message.includes('arrival_time'))) {
          console.warn('arrival_time column not found in database. Retrying without it...');
          delete payload.arrival_time;
          const retryResult = await supabase
            .from('attendance')
            .upsert(payload, { onConflict: 'technician_id,date' });
          if (retryResult.error) throw retryResult.error;
        } else {
          throw error;
        }
      }
    }

    await initApp();
  } catch (err) {
    alert('Failed to update attendance: ' + err.message);
  }
}

function getPaymentMethodDisplayWithCategory(method) {
  if (method === 'خزنة') return 'كاش (خزنة الشركة)';
  if (method === 'فودافون كاش') return 'إلكتروني (فودافون كاش)';
  if (method === 'إنستا باي') return 'إلكتروني (إنستا باي - شخصي لوالدي)';
  if (method === 'بنك') return 'إلكتروني (تحويل بنكي - شخصي لوالدي)';
  if (method === 'حساب الشركة') return 'إلكتروني (حساب بيزنيس الشركة)';
  if (method === 'محفظة بنك مصر') return 'إلكتروني (محفظة بنك مصر)';
  return method;
}

function getPaymentMethodFromDesc(desc) {
  if (!desc) return null;
  const cleanDesc = desc.split('__ATTACHMENT__')[0].trim();
  const parts = cleanDesc.split('|').map(p => p.trim());
  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1];
    
    if (lastPart.includes('خزنة')) return 'خزنة';
    if (lastPart.includes('فودافون كاش') || lastPart.includes('فودافون')) return 'فودافون كاش';
    if (lastPart.includes('إنستا باي') || lastPart.includes('انستا باي') || lastPart.includes('InstaPay')) return 'إنستا باي';
    if (lastPart.includes('تحويل بنكي') || lastPart.includes('بنك') || lastPart.includes('البنك')) {
      if (lastPart.includes('بيزنيس') || lastPart.includes('الشركة') || lastPart.includes('حساب الشركة')) {
        return 'حساب الشركة';
      }
      return 'بنك';
    }
    if (lastPart.includes('محفظة بنك مصر') || lastPart.includes('محفظة')) return 'محفظة بنك مصر';

    const validMethods = ['خزنة', 'فودافون كاش', 'إنستا باي', 'انستا باي', 'بنك', 'محفظة بنك مصر', 'حساب الشركة'];
    const method = validMethods.find(m => lastPart === m || lastPart.includes(m));
    if (method) return method;
  }
  return null;
}

async function deleteCashFlowInline(id) {
  if (!confirm('⚠️ هل أنت متأكد من حذف حركة اليومية هذه وتصفيتها من الخزنة؟')) return;

  try {
    // 1. Fetch cash flow details before deleting to reverse wallet liquidity
    const { data: c, error: fetchErr } = await supabase
      .from('cash_flow')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    
    if (c) {
      const paymentMethod = getPaymentMethodFromDesc(c.description);
      if (paymentMethod) {
        // If it was income (إيراد), we subtract the amount to reverse it
        // If it was expense (مصروف), we add the amount back to reverse it
        const factor = c.type === 'إيراد' ? -1 : 1;
        const reverseAmount = Number(c.amount) * factor;
        await autoUpdateLiquidity(paymentMethod, reverseAmount);
      }

      // Also delete linked supplier transaction if exists
      try {
        const cfTime = new Date(c.created_at).getTime();
        const minTime = new Date(cfTime - 120000).toISOString();
        const maxTime = new Date(cfTime + 120000).toISOString();

        const { data: stMatches } = await supabase
          .from('supplier_transactions')
          .select('*')
          .gte('created_at', minTime)
          .lte('created_at', maxTime);

        if (stMatches && stMatches.length > 0) {
          let targetSt = stMatches.find(st => Number(st.amount) === Number(c.amount));
          if (stMatches.length > 1) {
            const matchedBySup = stMatches.find(st => {
              const sup = (stateCache.suppliers || []).find(s => s.id === st.supplier_id);
              return sup && c.description.includes(sup.name);
            });
            if (matchedBySup) targetSt = matchedBySup;
          }
          if (targetSt) {
            await supabase.from('supplier_transactions').delete().eq('id', targetSt.id);
          }
        }
      } catch (stDelErr) {
        console.warn('Failed to delete linked supplier transaction:', stDelErr);
      }
    }

    // 2. Delete the record
    const { error } = await supabase.from('cash_flow').delete().eq('id', id);
    if (error) throw error;

    await initApp();
    alert('✅ تم حذف حركة الخزنة وإعادة توازن رصيد الخزنة بنجاح!');
  } catch (err) {
    alert('Failed to delete cash flow entry: ' + err.message);
  }
}

async function deleteSupplierTransactionInline(txId, supplierId, supplierName) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذه المعاملة التاريخية وتصفيتها من كشف حساب المورد والسجلات؟')) return;

  try {
    // 1. Fetch transaction details before deleting
    const { data: tx } = await supabase.from('supplier_transactions').select('*').eq('id', txId).single();
    
    if (tx && supplierName) {
      // Find matching cash_flow entry if created around same time
      const txTime = new Date(tx.created_at).getTime();
      const minTime = new Date(txTime - 120000).toISOString();
      const maxTime = new Date(txTime + 120000).toISOString();

      const { data: cfList } = await supabase
        .from('cash_flow')
        .select('*')
        .eq('amount', tx.amount)
        .gte('created_at', minTime)
        .lte('created_at', maxTime);

      if (cfList && cfList.length > 0) {
        const matchingCf = cfList.find(cf => (cf.description || '').includes(supplierName) || (cf.description || '').includes(tx.notes));
        if (matchingCf) {
          const pm = getPaymentMethodFromDesc(matchingCf.description);
          if (pm) {
            const factor = matchingCf.type === 'إيراد' ? -1 : 1;
            await autoUpdateLiquidity(pm, Number(matchingCf.amount) * factor);
          }
          await supabase.from('cash_flow').delete().eq('id', matchingCf.id);
        }
      }
    }

    // 2. Delete transaction from supplier_transactions
    const { error } = await supabase.from('supplier_transactions').delete().eq('id', txId);
    if (error) throw error;

    // Refresh modal list & app state
    await openSupplierStatement(supplierId, supplierName);
    await initApp();
    alert('✅ تم حذف المعاملة وتحديث رصيد المورد والخزنة بنجاح!');
  } catch (err) {
    alert('فشل حذف المعاملة: ' + err.message);
  }
}

// =========================================================================
// 8. FINANCIAL CENTER & ACCOUNTS TAB FUNCTIONS
// =========================================================================
function renderFinancialTab() {
  const data = stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} };
  
  // ── Classify liquidity into cash vs electronic ──
  const CASH_KEYWORDS = ['خزنة'];
  const cashLiquidity = {};
  const electronicLiquidity = {};
  
  if (data.liquidity) {
    Object.entries(data.liquidity).forEach(([name, val]) => {
      const isCash = CASH_KEYWORDS.some(kw => name.includes(kw));
      if (isCash) cashLiquidity[name] = val;
      else electronicLiquidity[name] = val;
    });
  }

  let cashTotal = Object.values(cashLiquidity).reduce((s, v) => s + Number(v || 0), 0);
  let elecTotal = Object.values(electronicLiquidity).reduce((s, v) => s + Number(v || 0), 0);
  let totalLiquidity = cashTotal + elecTotal;
  
  let totalReceivables = 0;
  if (data.receivables) {
    Object.values(data.receivables).forEach(val => totalReceivables += Number(val || 0));
  }
  
  let totalPayables = 0;
  if (data.payables) {
    Object.values(data.payables).forEach(val => totalPayables += Number(val || 0));
  }
  
  const netWorth = totalLiquidity + totalReceivables - totalPayables;
  
  // Update Stats Cards
  document.getElementById('fin-cash-only').innerText = window.hideTreasuryState ? '•••••• ج.م' : `${cashTotal.toLocaleString('ar-EG')} ج.م`;
  document.getElementById('fin-elec-only').innerText = window.hideTreasuryState ? '•••••• ج.م' : `${elecTotal.toLocaleString('ar-EG')} ج.م`;
  document.getElementById('fin-total-receivables').innerText = window.hideTreasuryState ? '•••••• ج.م' : `${totalReceivables.toLocaleString('ar-EG')} ج.م`;
  document.getElementById('fin-total-payables').innerText = window.hideTreasuryState ? '•••••• ج.م' : `${totalPayables.toLocaleString('ar-EG')} ج.م`;
  
  const netWorthEl = document.getElementById('fin-net-worth');
  if (netWorthEl) {
    netWorthEl.innerText = window.hideTreasuryState ? '•••••• ج.م' : `${netWorth.toLocaleString('ar-EG')} ج.م`;
    netWorthEl.style.color = netWorth >= 0 ? 'var(--success)' : 'var(--danger)';
  }
  
  // ── Render split liquidity table ──
  const tbody = document.getElementById('fin-liquidity-table');
  tbody.innerHTML = '';
  
  const renderGroup = (label, emoji, groupObj, subTotal, borderColor) => {
    // Group header row
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <td colspan="3" style="background: rgba(255,255,255,0.04); padding: 8px 12px; font-weight: 700; color: ${borderColor}; font-size: 0.85rem; border-right: 3px solid ${borderColor};">
        ${emoji} ${label} &nbsp;<span style="font-weight:400; opacity:0.7;">(${subTotal.toLocaleString('ar-EG')} ج.م)</span>
      </td>`;
    tbody.appendChild(headerRow);
    
    if (!groupObj || Object.keys(groupObj).length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="3" style="text-align:center; color:var(--text-secondary); font-size:0.85rem; padding:8px;">لا توجد بنود</td>`;
      tbody.appendChild(emptyRow);
      return;
    }
    
    Object.entries(groupObj).forEach(([name, amount]) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${name}</td>
        <td style="font-weight:600;">${Number(amount).toLocaleString('ar-EG')} ج.م</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:8px; justify-content:center;">
            <button type="button" class="btn btn-primary" style="padding:4px 8px;font-size:0.8rem;" onclick="openEditFinancialItemModal('liquidity','${name.replace(/'/g,"\\'")}',${amount})">
              <i class='bx bx-edit-alt'></i>
            </button>
            <button type="button" class="btn btn-danger" style="padding:4px 8px;font-size:0.8rem;" onclick="deleteFinancialItem('liquidity','${name.replace(/'/g,"\\'")}')">
              <i class='bx bx-trash'></i>
            </button>
          </div>
        </td>`;
      tbody.appendChild(row);
    });
  };

  renderGroup('سيولة الخزنة النقدية', '💵', cashLiquidity, cashTotal, 'var(--success)');
  renderGroup('السيولة الإلكترونية والبنكية', '💳', electronicLiquidity, elecTotal, 'var(--success)');
  
  // Render other tables normally
  renderFinTable('fin-receivables-table', data.receivables, 'receivables');
  renderFinTable('fin-payables-table', data.payables, 'payables');

  // Update dashboard cash stats
  const safeCashEl = document.getElementById('stat-safe-cash');
  if (safeCashEl) {
    safeCashEl.setAttribute('data-value', `${cashTotal.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-safe-cash');
  }
  const digitalCashEl = document.getElementById('stat-digital-cash');
  if (digitalCashEl) {
    digitalCashEl.setAttribute('data-value', `${elecTotal.toLocaleString('ar-EG')} ج.م`);
    renderStatValue('stat-digital-cash');
  }
}

function renderFinTable(tableId, obj, category) {
  const tbody = document.getElementById(tableId);
  tbody.innerHTML = '';
  
  if (!obj || Object.keys(obj).length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary);">لا توجد بنود مسجلة</td></tr>';
    return;
  }
  
  Object.entries(obj).forEach(([name, amount]) => {
    const row = document.createElement('tr');
    
    // Account name
    const tdName = document.createElement('td');
    tdName.innerText = name;
    row.appendChild(tdName);
    
    // Amount
    const tdAmount = document.createElement('td');
    tdAmount.style.fontWeight = '600';
    tdAmount.innerText = `${Number(amount).toLocaleString('ar-EG')} ج.م`;
    row.appendChild(tdAmount);
    
    // Actions
    const tdActions = document.createElement('td');
    tdActions.style.textAlign = 'center';
    
    let quickActionHtml = '';
    if (category === 'receivables') {
      quickActionHtml = `
        <button type="button" class="btn btn-success" style="padding: 4px 8px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; background: var(--success); border-color: var(--success);" onclick="openRecordFinancialTxModal('COLLECT', '${name.replace(/'/g, "\\'")}')">
          <i class='bx bx-plus-circle'></i> تحصيل
        </button>
      `;
    } else if (category === 'payables') {
      quickActionHtml = `
        <button type="button" class="btn btn-warning" style="padding: 4px 8px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; color: white; background: var(--accent); border-color: var(--accent);" onclick="openRecordFinancialTxModal('PAY', '${name.replace(/'/g, "\\'")}')">
          <i class='bx bx-minus-circle'></i> تسديد
        </button>
      `;
    }
    
    tdActions.innerHTML = `
      <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
        ${quickActionHtml}
        <button type="button" class="btn btn-primary" style="padding: 4px 8px; font-size: 0.8rem; display: inline-flex; align-items: center;" onclick="openEditFinancialItemModal('${category}', '${name.replace(/'/g, "\\'")}', ${amount})">
          <i class='bx bx-edit-alt'></i>
        </button>
        <button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem; display: inline-flex; align-items: center;" onclick="deleteFinancialItem('${category}', '${name.replace(/'/g, "\\'")}')">
          <i class='bx bx-trash'></i>
        </button>
      </div>
    `;
    row.appendChild(tdActions);
    
    tbody.appendChild(row);
  });
}

function openAddFinancialItemModal() {
  document.getElementById('financial-modal-title').innerText = '➕ إضافة بند مالي جديد';
  document.getElementById('fin-item-mode').value = 'ADD';
  document.getElementById('fin-item-original-name').value = '';
  
  const categorySelect = document.getElementById('fin-item-category');
  categorySelect.value = '';
  categorySelect.disabled = false;
  
  document.getElementById('fin-item-name').value = '';
  document.getElementById('fin-item-amount').value = '';
  
  openModal('financial-item-modal');
}

function openEditFinancialItemModal(category, name, amount) {
  document.getElementById('financial-modal-title').innerText = '📝 تعديل قيمة البند المالي';
  document.getElementById('fin-item-mode').value = 'EDIT';
  document.getElementById('fin-item-original-name').value = name;
  
  const categorySelect = document.getElementById('fin-item-category');
  categorySelect.value = category;
  categorySelect.disabled = true; // Category cannot be changed during edit
  
  document.getElementById('fin-item-name').value = name;
  document.getElementById('fin-item-amount').value = amount;
  
  openModal('financial-item-modal');
}

async function handleFinancialItemSubmit(e) {
  e.preventDefault();
  
  const mode = document.getElementById('fin-item-mode').value;
  const originalName = document.getElementById('fin-item-original-name').value;
  const category = document.getElementById('fin-item-category').value;
  const name = document.getElementById('fin-item-name').value.trim();
  const amount = Number(document.getElementById('fin-item-amount').value);
  
  if (!category || !name || isNaN(amount)) return;
  
  // Clone current data
  const data = JSON.parse(JSON.stringify(stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} }));
  
  if (!data[category]) data[category] = {};
  
  if (mode === 'ADD') {
    if (data[category][name] !== undefined) {
      alert('⚠️ هذا الاسم مسجل بالفعل تحت هذا التصنيف! يرجى اختيار اسم آخر أو تعديل البند القائم.');
      return;
    }
    data[category][name] = amount;
  } else {
    // Mode is EDIT
    if (originalName !== name) {
      // Renamed
      delete data[category][originalName];
    }
    data[category][name] = amount;
  }
  
  // Save to database
  try {
    const { error } = await supabase
      .from('bot_sessions')
      .upsert({
        chat_id: 999999,
        state: 'financial_assets',
        data: data,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    
    closeModal('financial-item-modal');
    await refreshAllData();
    renderFinancialTab();
    alert('✅ تم حفظ التغييرات المالية وتحديث الأرصدة بنجاح!');
  } catch (err) {
    alert('Failed to save financial item: ' + err.message);
  }
}

async function deleteFinancialItem(category, name) {
  if (!confirm(`⚠️ هل أنت متأكد من حذف البند المالي "${name}" نهائياً من كشف الحسابات؟`)) return;
  
  // Clone current data
  const data = JSON.parse(JSON.stringify(stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} }));
  
  if (data[category] && data[category][name] !== undefined) {
    delete data[category][name];
  }
  
  // Save to database
  try {
    const { error } = await supabase
      .from('bot_sessions')
      .upsert({
        chat_id: 999999,
        state: 'financial_assets',
        data: data,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    
    await refreshAllData();
    renderFinancialTab();
    alert('✅ تم حذف البند المالي وتحديث الأرصدة بنجاح!');
  } catch (err) {
    alert('Failed to delete financial item: ' + err.message);
  }
}

function openRecordFinancialTxModal(preselectedType = 'COLLECT', preselectedPerson = '') {
  document.getElementById('fin-tx-type').value = preselectedType;
  updateFinTxPeopleOptions(preselectedPerson);
  
  document.getElementById('fin-tx-amount').value = '';
  document.getElementById('fin-tx-notes').value = '';
  
  openModal('record-financial-tx-modal');
}

function updateFinTxPeopleOptions(preselectedPerson = '') {
  const type = document.getElementById('fin-tx-type').value;
  const personSelect = document.getElementById('fin-tx-person');
  personSelect.innerHTML = '';
  
  const data = stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} };
  const source = type === 'COLLECT' ? data.receivables : data.payables;
  
  if (!source || Object.keys(source).length === 0) {
    personSelect.innerHTML = '<option value="">-- لا يوجد حسابات مسجلة --</option>';
  } else {
    Object.entries(source).forEach(([name, bal]) => {
      if (Number(bal) > 0) {
        personSelect.innerHTML += `<option value="${name}">${name} (${Number(bal).toLocaleString()} ج.م)</option>`;
      }
    });
  }
  
  if (preselectedPerson && source[preselectedPerson] !== undefined) {
    personSelect.value = preselectedPerson;
  }
  
  updateFinTxCurrentBalance();
}

function updateFinTxCurrentBalance() {
  const type = document.getElementById('fin-tx-type').value;
  const person = document.getElementById('fin-tx-person').value;
  
  const data = stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} };
  const source = type === 'COLLECT' ? data.receivables : data.payables;
  
  const currentBal = Number(source[person] || 0);
  document.getElementById('fin-tx-current-bal').value = `${currentBal.toLocaleString()} ج.م`;
  
  // Set default amount input to outstanding balance
  document.getElementById('fin-tx-amount').value = currentBal;
}

async function handleRecordFinancialTxSubmit(e) {
  e.preventDefault();
  
  const type = document.getElementById('fin-tx-type').value;
  const person = document.getElementById('fin-tx-person').value;
  const amount = Number(document.getElementById('fin-tx-amount').value);
  const wallet = document.getElementById('fin-tx-wallet').value;
  const notes = document.getElementById('fin-tx-notes').value.trim();
  
  if (!person || isNaN(amount) || amount <= 0) {
    alert('⚠️ يرجى اختيار الحساب وإدخال قيمة صحيحة.');
    return;
  }
  
  const data = JSON.parse(JSON.stringify(stateCache.financialData || { liquidity: {}, receivables: {}, payables: {} }));
  const source = type === 'COLLECT' ? data.receivables : data.payables;
  
  const currentBal = Number(source[person] || 0);
  if (amount > currentBal) {
    if (!confirm(`⚠️ المبلغ المدخل (${amount.toLocaleString()} ج.م) أكبر من المستحق الحالي (${currentBal.toLocaleString()} ج.م). هل تريد الاستمرار وسيتم تصفير الحساب بالكامل؟`)) {
      return;
    }
  }
  
  // 1. Update the person's balance (Outstanding receivables/payables)
  if (type === 'COLLECT') {
    data.receivables[person] = Math.max(0, currentBal - amount);
  } else {
    data.payables[person] = Math.max(0, currentBal - amount);
  }
  
  // 2. Update liquidity/wallet balance
  const methodKeywordMap = {
    'خزنة':          'خزنة',
    'فودافون كاش':  'فودافون',
    'انستا باي':    'شخصي',
    'إنستا باي':    'شخصي',
    'بنك':          'شخصي',
    'حساب الشركة':  'بيزنيس',
    'محفظة بنك مصر': 'محفظة',
    'حساب بنك مصر شخصي (والدي)': 'شخصي',
    'حساب بنك مصر بيزنيس (الشركة)': 'بيزنيس'
  };
  
  const keyword = methodKeywordMap[wallet];
  if (!keyword) {
    alert('⚠️ خطأ في التعرف على المحفظة المحددة!');
    return;
  }
  
  const existingKey = Object.keys(data.liquidity).find(k => k.includes(keyword));
  if (!existingKey) {
    alert(`⚠️ لم يتم العثور على محفظة مسجلة تحتوي على كلمة "${keyword}"!`);
    return;
  }
  
  const factor = type === 'COLLECT' ? 1 : -1;
  data.liquidity[existingKey] = Number(data.liquidity[existingKey] || 0) + (amount * factor);
  
  // 3. Save updated financial data to bot_sessions (db)
  try {
    const { error: sessionErr } = await supabase
      .from('bot_sessions')
      .upsert({
        chat_id: 999999,
        state: 'financial_assets',
        data: data,
        updated_at: new Date().toISOString()
      });
      
    if (sessionErr) throw sessionErr;
    
    // 4. Save to cash_flow log table
    let cleanDesc = '';
    let cfType = '';
    
    if (type === 'COLLECT') {
      cfType = 'إيراد';
      cleanDesc = `تحصيل دفعة من حساب: ${person}${notes ? ` (${notes})` : ''} | ${wallet}`;
    } else {
      cfType = 'مصروف';
      cleanDesc = `سداد دفعة من الحساب لـ: ${person}${notes ? ` (${notes})` : ''} | ${wallet}`;
    }
    
    const { error: cfErr } = await supabase
      .from('cash_flow')
      .insert({
        type: cfType,
        amount: amount,
        description: cleanDesc,
        date: new Date().toISOString().split('T')[0]
      });
      
    if (cfErr) throw cfErr;
    
    // Success cleanup
    closeModal('record-financial-tx-modal');
    await refreshAllData();
    renderFinancialTab();
    alert('✅ تم تسجيل العملية بنجاح! تم تحديث رصيد الشخص، وتعديل الخزنة، وإدراج المعاملة في اليومية.');
  } catch (err) {
    alert('خطأ أثناء حفظ المعاملة: ' + err.message);
  }
}

// Expose globally
window.openAddFinancialItemModal = openAddFinancialItemModal;
window.openEditFinancialItemModal = openEditFinancialItemModal;
window.deleteFinancialItem = deleteFinancialItem;
window.handleFinancialItemSubmit = handleFinancialItemSubmit;
window.openRecordFinancialTxModal = openRecordFinancialTxModal;
window.updateFinTxPeopleOptions = updateFinTxPeopleOptions;
window.updateFinTxCurrentBalance = updateFinTxCurrentBalance;
window.handleRecordFinancialTxSubmit = handleRecordFinancialTxSubmit;
window.renderFinancialTab = renderFinancialTab;

function openAddCashModal() {
  document.getElementById('cash-modal-title').innerText = '➕ إضافة حركة مالية يدوية للخزنة';
  document.getElementById('cash-edit-id').value = '';
  openModal('add-cash-modal');
}

function openEditCashFlowModal(id) {
  const c = stateCache.cashFlow.find(x => x.id === id);
  if (!c) {
    alert('⚠️ المعاملة غير موجودة!');
    return;
  }
  
  // Set modal title & edit ID
  document.getElementById('cash-modal-title').innerText = '📝 تعديل حركة مالية في الخزنة';
  document.getElementById('cash-edit-id').value = id;
  
  // Populate basic inputs
  document.getElementById('cash-type').value = c.type;
  document.getElementById('cash-amount').value = c.amount;
  
  // Reset other fields first
  document.getElementById('cash-desc').value = '';
  document.getElementById('cash-tech-select').innerHTML = '<option value="">-- بدون فني --</option>';
  document.getElementById('cash-assistant-select').innerHTML = '<option value="">-- بدون مساعد --</option>';
  document.getElementById('cash-driver-select').innerHTML = '<option value="">-- بدون سائق --</option>';
  
  // Populate employee selects
  stateCache.technicians.forEach(t => {
    const disp = getEmployeeDisplayName(t);
    document.getElementById('cash-tech-select').innerHTML += `<option value="${t.id}">${disp}</option>`;
    document.getElementById('cash-assistant-select').innerHTML += `<option value="${t.id}">${disp}</option>`;
    document.getElementById('cash-driver-select').innerHTML += `<option value="${t.id}">${disp}</option>`;
  });
  
  // Parse description
  let rawDesc = c.description || '';
  
  // Remove attachment suffix
  if (rawDesc.includes('__ATTACHMENT__')) {
    rawDesc = rawDesc.split('__ATTACHMENT__')[0].trim();
  }
  
  // Extract payment method
  const paymentMethod = getPaymentMethodFromDesc(c.description) || 'خزنة';
  document.getElementById('cash-payment-method').value = paymentMethod;
  
  // Remove payment method suffix from description
  const suffix = ` | ${paymentMethod}`;
  if (rawDesc.endsWith(suffix)) {
    rawDesc = rawDesc.substring(0, rawDesc.length - suffix.length).trim();
  }
  
  // Extract employees from description
  let leadTechId = '';
  let assistantId = '';
  let driverId = '';
  
  const techMatch = rawDesc.match(/\[الفني:\s*([^\]]+)\]/);
  const assistantMatch = rawDesc.match(/\[المساعد:\s*([^\]]+)\]/);
  const driverMatch = rawDesc.match(/\[السائق:\s*([^\]]+)\]/);
  
  if (techMatch) {
    const name = techMatch[1].trim();
    const tech = stateCache.technicians.find(t => t.name === name);
    if (tech) leadTechId = tech.id;
    rawDesc = rawDesc.replace(techMatch[0], '').trim();
  }
  if (assistantMatch) {
    const name = assistantMatch[1].trim();
    const tech = stateCache.technicians.find(t => t.name === name);
    if (tech) assistantId = tech.id;
    rawDesc = rawDesc.replace(assistantMatch[0], '').trim();
  }
  if (driverMatch) {
    const name = driverMatch[1].trim();
    const tech = stateCache.technicians.find(t => t.name === name);
    if (tech) driverId = tech.id;
    rawDesc = rawDesc.replace(driverMatch[0], '').trim();
  }
  
  document.getElementById('cash-tech-select').value = leadTechId;
  document.getElementById('cash-assistant-select').value = assistantId;
  document.getElementById('cash-driver-select').value = driverId;
  
  // Check if it is a job order with customer details
  if (rawDesc.startsWith('العميل:')) {
    const customerMatch = rawDesc.match(/^العميل:\s*([^|]+)\|\s*تليفون:\s*([^|]+)\|\s*عنوان:\s*([^|]+)\|\s*البيان:\s*(.*)$/);
    if (customerMatch) {
      document.getElementById('cash-customer-name').value = customerMatch[1].trim();
      document.getElementById('cash-customer-phone').value = customerMatch[2].trim();
      document.getElementById('cash-customer-address').value = customerMatch[3].trim();
      document.getElementById('cash-desc').value = customerMatch[4].trim();
      document.getElementById('cash-attachment-type').value = 'job_order';
    } else {
      document.getElementById('cash-desc').value = rawDesc;
      document.getElementById('cash-attachment-type').value = 'general';
    }
  } else {
    document.getElementById('cash-desc').value = rawDesc;
    document.getElementById('cash-attachment-type').value = 'general';
  }
  
  // Trigger helper divs
  updateCashTypeHelp();
  toggleCashCustomerFields();
  
  // Open modal without triggering openModal reset
  document.getElementById('add-cash-modal').classList.add('active');
}

function getLocalTodayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

function getLocalOffsetDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const tzOffset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (tzOffset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

function getFormattedDateLabel(dateStr) {
  if (!dateStr) return '🌐 كل الأيام';
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  const todayStr = getLocalTodayStr();
  const yesterdayStr = getLocalOffsetDateStr(-1);
  const beforeYesterdayStr = getLocalOffsetDateStr(-2);
  
  const formattedDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' });
  
  if (dateStr === todayStr) {
    return `اليوم (${formattedDate})`;
  } else if (dateStr === yesterdayStr) {
    return `الأمس (${formattedDate})`;
  } else if (dateStr === beforeYesterdayStr) {
    return `قبل أمس (${formattedDate})`;
  } else {
    return formattedDate;
  }
}

function updateDateFilterButtonStyles(prefix, selectedDate) {
  const todayStr = getLocalTodayStr();
  const yesterdayStr = getLocalOffsetDateStr(-1);
  const dayBeforeStr = getLocalOffsetDateStr(-2);

  const btnAll = document.getElementById(`${prefix}-btn-all`);
  const btnToday = document.getElementById(`${prefix}-btn-today`);
  const btnYest = document.getElementById(`${prefix}-btn-yesterday`);
  const btnBefore = document.getElementById(`${prefix}-btn-daybefore`);
  const textEl = document.getElementById(`${prefix}-date-text`);

  const activeStyle = 'padding: 5px 10px; font-size: 0.82rem; font-weight: 700; background: #0284c7; border: 1px solid #38bdf8; border-radius: 6px; color: #ffffff; box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);';
  const normalStyle = 'padding: 5px 8px; font-size: 0.82rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text-primary);';

  if (btnAll) btnAll.style.cssText = !selectedDate ? activeStyle : normalStyle;
  if (btnToday) btnToday.style.cssText = (selectedDate === todayStr) ? activeStyle : normalStyle;
  if (btnYest) btnYest.style.cssText = (selectedDate === yesterdayStr) ? activeStyle : normalStyle;
  if (btnBefore) btnBefore.style.cssText = (selectedDate === dayBeforeStr) ? activeStyle : normalStyle;

  if (textEl) {
    if (!selectedDate) {
      textEl.textContent = '🌐 كل الأيام';
      textEl.style.color = '#38bdf8';
    } else {
      textEl.textContent = getFormattedDateLabel(selectedDate);
      textEl.style.color = 'var(--accent)';
    }
  }
}

function adjustCashflowDate(offset) {
  const dateInput = document.getElementById('cashflow-date-filter');
  let currentVal = dateInput ? dateInput.value : '';
  if (!currentVal) {
    currentVal = getLocalTodayStr();
  }
  const d = new Date(currentVal);
  d.setDate(d.getDate() + offset);
  const tzOffset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (tzOffset * 60 * 1000));
  if (dateInput) {
    dateInput.value = localDate.toISOString().split('T')[0];
  }
  renderCashflowTab();
}

function adjustAttendanceDate(offset) {
  const attDateInput = document.getElementById('attendance-date-filter');
  let currentVal = attDateInput ? attDateInput.value : '';
  if (!currentVal) {
    currentVal = getLocalTodayStr();
  }
  const d = new Date(currentVal);
  d.setDate(d.getDate() + offset);
  const tzOffset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (tzOffset * 60 * 1000));
  if (attDateInput) {
    attDateInput.value = localDate.toISOString().split('T')[0];
  }
  renderHRTab();
}

function setCashflowDateOffset(offset) {
  const dateInput = document.getElementById('cashflow-date-filter');
  if (dateInput) {
    dateInput.value = getLocalOffsetDateStr(offset);
  }
  renderCashflowTab();
}

function showAllCashflowDays() {
  const dateInput = document.getElementById('cashflow-date-filter');
  if (dateInput) {
    dateInput.value = '';
  }
  renderCashflowTab();
}

function adjustActivitiesDate(offset) {
  const dateInput = document.getElementById('activities-date-filter');
  let currentVal = dateInput ? dateInput.value : '';
  if (!currentVal) {
    currentVal = getLocalTodayStr();
  }
  const d = new Date(currentVal);
  d.setDate(d.getDate() + offset);
  const tzOffset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (tzOffset * 60 * 1000));
  if (dateInput) {
    dateInput.value = localDate.toISOString().split('T')[0];
  }
  renderOverviewTab();
}

function setActivitiesDateOffset(offset) {
  const dateInput = document.getElementById('activities-date-filter');
  if (dateInput) {
    dateInput.value = getLocalOffsetDateStr(offset);
  }
  renderOverviewTab();
}

function showAllActivitiesDays() {
  const dateInput = document.getElementById('activities-date-filter');
  if (dateInput) {
    dateInput.value = '';
  }
  renderOverviewTab();
}

function adjustInventoryLogDate(offset) {
  const dateInput = document.getElementById('inventory-log-date-filter');
  let currentVal = dateInput ? dateInput.value : '';
  if (!currentVal) {
    currentVal = getLocalTodayStr();
  }
  const d = new Date(currentVal);
  d.setDate(d.getDate() + offset);
  const tzOffset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (tzOffset * 60 * 1000));
  if (dateInput) {
    dateInput.value = localDate.toISOString().split('T')[0];
  }
  renderInventoryTab();
}

function setInventoryLogDateOffset(offset) {
  const dateInput = document.getElementById('inventory-log-date-filter');
  if (dateInput) {
    dateInput.value = getLocalOffsetDateStr(offset);
  }
  renderInventoryTab();
}

function showAllInventoryLogDays() {
  const dateInput = document.getElementById('inventory-log-date-filter');
  if (dateInput) {
    dateInput.value = '';
  }
  renderInventoryTab();
}

function switchInventorySubTab(tab) {
  const devCard = document.getElementById('inventory-devices-card');
  const movCard = document.getElementById('inventory-movements-card');
  const btnDev = document.getElementById('inventory-subtab-btn-devices');
  const btnMov = document.getElementById('inventory-subtab-btn-movements');

  if (!devCard || !movCard) return;

  const activeStyle = 'background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; font-weight: 700; border: 1px solid #38bdf8; box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35); padding: 8px 20px; border-radius: 8px; font-size: 0.92rem; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease;';
  const normalStyle = 'background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); font-weight: 600; border: 1px solid rgba(255, 255, 255, 0.12); padding: 8px 20px; border-radius: 8px; font-size: 0.92rem; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s ease;';

  if (tab === 'devices') {
    devCard.style.display = 'block';
    movCard.style.display = 'none';
    if (btnDev) btnDev.style.cssText = activeStyle;
    if (btnMov) btnMov.style.cssText = normalStyle;
    localStorage.setItem('inventory_subtab', 'devices');
  } else {
    devCard.style.display = 'none';
    movCard.style.display = 'block';
    if (btnMov) btnMov.style.cssText = activeStyle;
    if (btnDev) btnDev.style.cssText = normalStyle;
    localStorage.setItem('inventory_subtab', 'movements');
  }
}

function initInventorySubTab() {
  const saved = localStorage.getItem('inventory_subtab') || 'movements';
  switchInventorySubTab(saved);
}

// Expose globally
window.openAddCashModal = openAddCashModal;
window.openEditCashFlowModal = openEditCashFlowModal;
window.setCashflowDateOffset = setCashflowDateOffset;
window.adjustActivitiesDate = adjustActivitiesDate;
window.setActivitiesDateOffset = setActivitiesDateOffset;
window.showAllActivitiesDays = showAllActivitiesDays;
window.adjustInventoryLogDate = adjustInventoryLogDate;
window.setInventoryLogDateOffset = setInventoryLogDateOffset;
window.showAllInventoryLogDays = showAllInventoryLogDays;
window.switchInventorySubTab = switchInventorySubTab;

// 💻 Desktop / Mobile View Mode UI Synchronizer
function updateDesktopModeUI(isDesktop) {
  const btnText = document.getElementById('desktop-mode-text');
  const btnIcon = document.getElementById('desktop-mode-icon');
  const sideText = document.getElementById('sidebar-desktop-mode-text');
  const sideIcon = document.getElementById('sidebar-desktop-mode-icon');
  const topBtn = document.getElementById('toggle-desktop-mode-btn');

  if (isDesktop) {
    if (btnText) btnText.textContent = 'وضع الموبايل';
    if (btnIcon) btnIcon.textContent = '📱';
    if (topBtn) topBtn.title = 'تصغير النافذة والتبديل لوضع الموبايل';
    if (sideText) sideText.textContent = '📱 تصغير لوضع الموبايل';
    if (sideIcon) sideIcon.textContent = '📱';

    // 🖥️ On Desktop mode: Sidebar is ALWAYS permanently docked and visible
    document.body.classList.remove('sidebar-is-collapsed');
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.remove('sidebar-closed', 'open');
    }
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('show');
  } else {
    if (btnText) btnText.textContent = 'نسخة الكمبيوتر';
    if (btnIcon) btnIcon.textContent = '💻';
    if (topBtn) topBtn.title = 'تكبير النافذة والتبديل لنسخة الكمبيوتر';
    if (sideText) sideText.textContent = '💻 تكبير لشاشة الكمبيوتر';
    if (sideIcon) sideIcon.textContent = '💻';
  }
}
window.updateDesktopModeUI = updateDesktopModeUI;

// 💻 Desktop / Mobile View Mode Toggle (Shrink/Expand in Telegram Desktop)
function toggleDesktopMode() {
  const twa = window.Telegram?.WebApp;
  const isCurrentlyDesktop = document.body.classList.contains('force-desktop-mode');
  const viewportMeta = document.querySelector('meta[name="viewport"]');

  if (isCurrentlyDesktop) {
    // 📱 User clicks "وضع الموبايل":
    // 1. Remove force desktop layout
    document.body.classList.remove('force-desktop-mode');
    localStorage.removeItem('force_desktop_mode');
    updateDesktopModeUI(false);
    if (viewportMeta) viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    
    // 2. 🗗 Exit Fullscreen in Telegram Desktop so it shrinks into compact floating window and stays open!
    try {
      if (twa && typeof twa.exitFullscreen === 'function') {
        twa.exitFullscreen();
      }
    } catch (e) {
      console.warn('exitFullscreen notice:', e);
    }
  } else {
    // 💻 User clicks "نسخة الكمبيوتر":
    document.body.classList.add('force-desktop-mode');
    localStorage.setItem('force_desktop_mode', 'true');
    updateDesktopModeUI(true);
    if (viewportMeta) viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
    
    // ⛶ Expand / Fullscreen in Telegram Desktop
    try {
      if (twa) {
        if (typeof twa.expand === 'function') twa.expand();
        if (typeof twa.requestFullscreen === 'function') twa.requestFullscreen();
      }
    } catch (e) {
      console.warn('requestFullscreen notice:', e);
    }
  }
}
window.toggleDesktopMode = toggleDesktopMode;

function openDesktopOptionsModal() {
  let modal = document.getElementById('desktop-options-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'desktop-options-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0, 0, 0, 0.75)';
    modal.style.backdropFilter = 'blur(6px)';
    modal.style.zIndex = '999999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '15px';
    modal.style.boxSizing = 'border-box';
    modal.style.direction = 'rtl';
    modal.innerHTML = `
      <div style="background: #1e293b; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 16px; padding: 22px; max-width: 380px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.6); text-align: center; color: #fff;">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🖥️</div>
        <h3 style="margin: 0 0 8px; font-size: 1.15rem; font-weight: 800; color: #38bdf8;">خيارات نسخة الكمبيوتر</h3>
        <p style="margin: 0 0 18px; font-size: 0.88rem; color: #94a3b8; line-height: 1.5;">
          للحصول على أفضل وأشمل تجربة للوحة التحكم على شاشة الكمبيوتر بالكامل:
        </p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button type="button" onclick="openInExternalBrowser(); closeDesktopOptionsModal();" style="background: linear-gradient(135deg, #0284c7, #2563eb); border: none; color: #fff; padding: 12px 16px; border-radius: 10px; font-weight: 700; font-size: 0.92rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.35);">
            <i class='bx bx-globe' style="font-size: 1.2rem;"></i>
            <span>فتح في متصفح الكمبيوتر (Chrome / Edge)</span>
          </button>
          <button type="button" onclick="requestTelegramFullscreen(); closeDesktopOptionsModal();" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #e2e8f0; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <i class='bx bx-fullscreen' style="font-size: 1.2rem;"></i>
            <span>تكبير نافذة تليجرام للشاشة الكاملة</span>
          </button>
          <button type="button" onclick="closeDesktopOptionsModal()" style="background: none; border: none; color: #94a3b8; padding: 8px; font-size: 0.82rem; cursor: pointer; text-decoration: underline;">
            إغلاق والبقاء في التطبيق المصغر المتجاوب
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }
}
window.openDesktopOptionsModal = openDesktopOptionsModal;

function closeDesktopOptionsModal() {
  const modal = document.getElementById('desktop-options-modal');
  if (modal) modal.style.display = 'none';
}
window.closeDesktopOptionsModal = closeDesktopOptionsModal;

function requestTelegramFullscreen() {
  try {
    if (window.Telegram?.WebApp) {
      if (typeof window.Telegram.WebApp.requestFullscreen === 'function') {
        window.Telegram.WebApp.requestFullscreen();
      }
      if (typeof window.Telegram.WebApp.expand === 'function') {
        window.Telegram.WebApp.expand();
      }
    }
  } catch (e) {}
}
window.requestTelegramFullscreen = requestTelegramFullscreen;

function openInExternalBrowser() {
  const currentUrl = window.location.href;
  try {
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(currentUrl);
      return;
    }
  } catch (e) {
    console.warn('Telegram openLink notice:', e);
  }
  window.open(currentUrl, '_blank');
}
window.openInExternalBrowser = openInExternalBrowser;

function resetDisplayMode() {
  document.body.classList.remove('force-desktop-mode');
  localStorage.removeItem('force_desktop_mode');
  updateDesktopModeUI(false);
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta) viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  if (typeof toggleMobileSidebar === 'function') {
    toggleMobileSidebar(false);
  }
  try {
    if (window.Telegram?.WebApp && typeof window.Telegram.WebApp.exitFullscreen === 'function') {
      window.Telegram.WebApp.exitFullscreen();
    }
  } catch (e) {
    console.warn('exitFullscreen in resetDisplayMode notice:', e);
  }
}
window.resetDisplayMode = resetDisplayMode;

// 🛡️ Prevent Pull-to-Dismiss Gesture & Window Overscroll on Mobile (without blocking inputs, selects, or taps!)
let touchStartY = 0;
let touchStartX = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches && e.touches.length === 1) {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  // CRITICAL: NEVER block interactive form controls, dropdowns, inputs, flatpickr, or buttons!
  if (e.target && e.target.closest && e.target.closest('input, select, textarea, button, a, label, option, .form-control, .flatpickr-calendar, .flatpickr-input, .badge, [role="button"], [contenteditable]')) {
    return;
  }

  // Inside modals, do not prevent touchmove on user interactions
  if (e.target && e.target.closest && e.target.closest('.modal-content, .modal-body, .autocomplete-dropdown')) {
    return;
  }

  if (!e.touches || e.touches.length !== 1) return;
  const touchY = e.touches[0].clientY;
  const touchDiff = touchY - touchStartY;
  
  // Only handle meaningful vertical downward drags (> 15px), never micro-tremors from tapping
  if (touchDiff > 15) {
    const touchDiffX = Math.abs(e.touches[0].clientX - touchStartX);
    if (touchDiffX > touchDiff) return; // Horizontal swipe, allow

    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const activeScrollable = e.target.closest && e.target.closest('.main-content, .card-body, .tab-content, .sidebar');
    const containerScrollTop = activeScrollable ? activeScrollable.scrollTop : 0;
    
    if (scrollY <= 0 && containerScrollTop <= 0) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }
}, { passive: false });

// --- UNIFIED BATCH ROW HOVER HIGHLIGHT ---
document.addEventListener('mouseover', (e) => {
  const tr = e.target.closest('tr[data-batch-group]');
  if (tr) {
    const batchId = tr.dataset.batchGroup;
    if (batchId) {
      const table = tr.closest('table');
      if (table) {
        table.querySelectorAll(`tr[data-batch-group="${batchId}"]`).forEach(r => {
          r.classList.add('batch-hover-highlight');
        });
      }
    }
  }
});

document.addEventListener('mouseout', (e) => {
  const tr = e.target.closest('tr[data-batch-group]');
  if (tr) {
    const batchId = tr.dataset.batchGroup;
    if (batchId) {
      const table = tr.closest('table');
      if (table) {
        table.querySelectorAll(`tr[data-batch-group="${batchId}"]`).forEach(r => {
          r.classList.remove('batch-hover-highlight');
        });
      }
    }
  }
});

// Restore saved desktop mode preference on page load (with narrow screen safety)
document.addEventListener('DOMContentLoaded', () => {
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 
                         window.Telegram?.WebApp?.platform === 'android' || 
                         window.Telegram?.WebApp?.platform === 'ios';

  // 🛡️ CRITICAL RESCUE: If window is narrow (< 850px, e.g. Telegram Desktop popup or phone),
  // NEVER force broken 1200px desktop mode! Clean up any saved force_desktop_mode so user is never trapped.
  if (window.innerWidth < 850 || isMobileDevice) {
    document.body.classList.remove('force-desktop-mode');
    localStorage.removeItem('force_desktop_mode');
    updateDesktopModeUI(false);
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
  } else if (localStorage.getItem('force_desktop_mode') === 'true') {
    document.body.classList.add('force-desktop-mode');
    updateDesktopModeUI(true);
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
  } else {
    updateDesktopModeUI(false);
  }

  // 🖥️ Auto Fullscreen & Large Window on PC / Laptop ONLY (Never on Mobile!)
  if (!isMobileDevice && window.Telegram?.WebApp) {
    try {
      window.Telegram.WebApp.expand();
      if (typeof window.Telegram.WebApp.requestFullscreen === 'function') {
        window.Telegram.WebApp.requestFullscreen();
      }
    } catch (e) {}
  }

  // 🔄 Sync button state when Telegram fullscreen changes
  if (window.Telegram?.WebApp?.onEvent) {
    try {
      window.Telegram.WebApp.onEvent('fullscreenChanged', () => {
        const isFs = window.Telegram?.WebApp?.isFullscreen;
        if (typeof isFs === 'boolean') {
          if (isFs) {
            document.body.classList.add('force-desktop-mode');
            updateDesktopModeUI(true);
          } else {
            document.body.classList.remove('force-desktop-mode');
            updateDesktopModeUI(false);
          }
        }
      });
    } catch (e) {}
  }

  // On PC / desktop mode, sidebar is always open and docked.
  // On pure mobile mode, ensure mobile drawer starts closed.
  const isPCEnvironment = !isMobileDevice && (window.innerWidth >= 851 || document.body.classList.contains('force-desktop-mode'));
  if (isPCEnvironment) {
    document.body.classList.remove('sidebar-is-collapsed');
    const sb = document.querySelector('.sidebar');
    if (sb) sb.classList.remove('sidebar-closed', 'open');
  } else if (typeof toggleMobileSidebar === 'function') {
    toggleMobileSidebar(false);
  }

  // Initialize all date pickers with Arabic format (dd/mm/yyyy)
  if (typeof initAllDatePickers === 'function') {
    initAllDatePickers();
  }
});

window.showAllCashflowDays = showAllCashflowDays;
window.adjustCashflowDate = adjustCashflowDate;
window.adjustAttendanceDate = adjustAttendanceDate;

function openAllActivitiesModal() {
  const tbody = document.querySelector('#all-activities-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!window.allActivities || window.allActivities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">لا توجد نشاطات مسجلة</td></tr>';
  } else {
    window.allActivities.forEach(act => {
      const dateStr = act.date.toLocaleDateString('ar-EG', { month: 'numeric', day: 'numeric' }) + ' ' + act.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      tbody.innerHTML += `
        <tr>
          <td><strong>${act.section}</strong></td>
          <td><span class="${act.typeClass}">${act.type}</span></td>
          <td>${act.details}</td>
          <td style="font-weight: 600;">${act.value}</td>
          <td style="color: var(--text-secondary); font-size: 0.8rem;">${dateStr}</td>
        </tr>
      `;
    });
  }
  document.getElementById('activity-log-search').value = '';
  openModal('all-activities-modal');
}

function filterActivityLog(query) {
  const filter = query.toLowerCase().replace(/كار/g, 'kar');
  const rows = document.querySelectorAll('#all-activities-table tbody tr');
  
  rows.forEach(row => {
    const text = row.innerText.toLowerCase().replace(/كار/g, 'kar');
    if (text.includes(filter)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

window.openAllActivitiesModal = openAllActivitiesModal;
window.filterActivityLog = filterActivityLog;

// =========================================================================
// 10. RETROACTIVE DOCUMENT ATTACHMENT (Add doc to one or more devices)
// =========================================================================

function openAddDocModal(deviceId) {
  document.getElementById('add-doc-device-id').value = deviceId;
  document.getElementById('add-doc-file').value = '';
  document.getElementById('add-doc-type').selectedIndex = 0;

  // Build devices checklist — show active devices
  const listEl = document.getElementById('add-doc-devices-list');
  const allDevices = stateCache.devices.filter(d => d.customer_name !== 'مبيعات سابقة غير مسجلة' && !(d.serial_number && d.serial_number.startsWith('HIST-')));

  if (allDevices.length === 0) {
    listEl.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">لا توجد أجهزة مسجلة في المخزن.</p>';
  } else {
    listEl.innerHTML = allDevices.map(d => {
      const recipName = (d.customer_name && d.customer_name !== 'مبيعات سابقة غير مسجلة') ? d.customer_name : resolveRecipientName(d);
      const recipient = (d.status === 'متاح' || !recipName) ? '' : ` · ${recipName}`;
      const checked = d.id === deviceId ? 'checked' : '';
      return `
        <label style="display:flex; align-items:flex-start; gap:10px; padding:7px 6px; border-radius:6px; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background=''">
          <input type="checkbox" name="doc-device-cb" value="${d.id}" ${checked} style="margin-top:3px; width:16px; height:16px; cursor:pointer; accent-color:var(--accent);">
          <span style="font-size:0.9rem; line-height:1.4;">
            <strong>${d.brand} (${d.capacity})</strong>
            <span style="color:var(--text-secondary); font-size:0.8rem; display:block;">سيريال: ${d.serial_number} · ${d.status}${recipient}</span>
          </span>
        </label>`;
    }).join('');
  }

  openModal('add-doc-modal');
}

function toggleAllDocDevices() {
  const cbs = document.querySelectorAll('input[name="doc-device-cb"]');
  const allChecked = [...cbs].every(cb => cb.checked);
  cbs.forEach(cb => cb.checked = !allChecked);
}

async function handleAddDocSubmit(e) {
  e.preventDefault();
  const marker = document.getElementById('add-doc-type').value;
  const fileInput = document.getElementById('add-doc-file');
  const file = fileInput.files[0];

  if (!file) { alert('⚠️ يرجى اختيار ملف!'); return; }

  const selectedIds = [...document.querySelectorAll('input[name="doc-device-cb"]:checked')].map(cb => cb.value);
  if (selectedIds.length === 0) { alert('⚠️ يرجى تحديد جهاز واحد على الأقل!'); return; }

  try {
    // Upload file ONCE with a shared safe filename
    const rawExt = file.name.includes('.') ? file.name.split('.').pop() : '';
    const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'jpg';
    const sharedId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Use first device's id as folder, others will share the same URL
    const primaryDeviceId = selectedIds[0];
    const fileName = `${primaryDeviceId}/${sharedId}${marker}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from('contracts')
      .upload(fileName, file, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage
      .from('contracts')
      .getPublicUrl(fileName);

    // Expand selectedIds to automatically include all devices belonging to the same batchId
    const expandedIds = new Set(selectedIds);
    selectedIds.forEach(id => {
      const dev = stateCache.devices.find(d => d.id === id);
      if (dev) {
        const txt = `${dev.installment_notes || ''} ${dev.notes || ''}`;
        const match = txt.match(/#(REC-\d+|DISP-\d+)/);
        if (match) {
          const batchId = match[1];
          (stateCache.devices || []).forEach(d => {
            const dTxt = `${d.installment_notes || ''} ${d.notes || ''}`;
            if (dTxt.includes('#' + batchId)) {
              expandedIds.add(d.id);
            }
          });
        }
      }
    });
    const finalSelectedIds = Array.from(expandedIds);

    // Attach the same URL to ALL selected and batch-linked devices
    const updatePromises = finalSelectedIds.map(devId => {
      const device = stateCache.devices.find(d => d.id === devId);
      const currentImages = (device && device.contract_images) ? device.contract_images : [];
      const cleanNew = publicUrl.split('?')[0];
      const nextImages = currentImages.some(u => u && u.split('?')[0] === cleanNew)
        ? currentImages
        : [...currentImages, publicUrl];
      return supabase.from('devices').update({ contract_images: nextImages }).eq('id', devId);
    });

    const results = await Promise.all(updatePromises);
    const errors = results.filter(r => r.error).map(r => r.error.message);
    if (errors.length > 0) throw new Error(errors.join(', '));

    closeModal('add-doc-modal');
    await initApp();
    alert(`✅ تم رفع وإرفاق المستند لـ ${selectedIds.length} جهاز بنجاح!`);
  } catch (err) {
    alert('❌ حدث خطأ أثناء الرفع: ' + err.message);
  }
}

window.openAddDocModal = openAddDocModal;
window.toggleAllDocDevices = toggleAllDocDevices;
window.handleAddDocSubmit = handleAddDocSubmit;


// =========================================================================
// 9. EMPLOYEE MANAGEMENT FUNCTIONS (Edit, Delete, Pay Salary)
// =========================================================================

function openEditEmployeeModal(id, name, role, salary) {
  document.getElementById('edit-emp-id').value = id;
  document.getElementById('edit-emp-name').value = name;
  document.getElementById('edit-emp-role').value = role;
  document.getElementById('edit-emp-salary').value = salary;
  openModal('edit-employee-modal');
}

async function handleEditEmployeeSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-emp-id').value;
  const name = document.getElementById('edit-emp-name').value.trim();
  const role = document.getElementById('edit-emp-role').value.trim();
  const salary = Number(document.getElementById('edit-emp-salary').value);

  try {
    const combinedName = `${name} | ${role}`;
    const { error } = await supabase
      .from('technicians')
      .update({ name: combinedName, monthly_salary: salary })
      .eq('id', id);
    if (error) throw error;

    closeModal('edit-employee-modal');
    await initApp();
    alert('✅ تم حفظ تعديلات الموظف بنجاح!');
  } catch (err) {
    alert('Failed to update employee: ' + err.message);
  }
}

async function deleteEmployee(id, name) {
  if (!confirm(`⚠️ هل أنت متأكد من حذف الموظف "${name}"؟\nسيتم حذف جميع بيانات الحضور والسلف المرتبطة به!`)) return;

  try {
    // Delete related attendance records first
    await supabase.from('attendance').delete().eq('technician_id', id);
    // Delete related salary advances
    await supabase.from('salary_advances').delete().eq('technician_id', id);
    // Delete employee
    const { error } = await supabase.from('technicians').delete().eq('id', id);
    if (error) throw error;

    await initApp();
    alert('✅ تم حذف الموظف وجميع بياناته بنجاح!');
  } catch (err) {
    alert('Failed to delete employee: ' + err.message);
  }
}

function openPaySalaryModal(techId, empName, calcNet, monthStr) {
  document.getElementById('pay-sal-emp-id').value = techId;
  document.getElementById('pay-sal-month').value = monthStr;
  document.getElementById('pay-sal-emp-name').value = empName;
  // Format month display in Arabic
  const [yr, mo] = monthStr.split('-').map(Number);
  const monthNames = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  document.getElementById('pay-sal-display-month').value = `${monthNames[mo - 1]} ${yr}`;
  document.getElementById('pay-sal-calc-net').value = `${calcNet.toLocaleString()} ج.م`;
  document.getElementById('pay-sal-actual').value = calcNet;
  document.getElementById('pay-sal-notes').value = '';
  openModal('pay-salary-modal');
}

async function handlePaySalarySubmit(e) {
  e.preventDefault();
  const techId = document.getElementById('pay-sal-emp-id').value;
  const monthStr = document.getElementById('pay-sal-month').value;
  const empName = document.getElementById('pay-sal-emp-name').value;
  const actualAmount = Number(document.getElementById('pay-sal-actual').value);
  const payMethod = document.getElementById('pay-sal-method').value;
  const notes = document.getElementById('pay-sal-notes').value.trim();

  if (!actualAmount || actualAmount <= 0) {
    alert('⚠️ يجب إدخال مبلغ الراتب الفعلي!');
    return;
  }

  const [yr, mo] = monthStr.split('-').map(Number);
  const monthNames = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const monthLabel = `${monthNames[mo - 1]} ${yr}`;

  try {
    // Log cash flow expense
    const desc = `صرف راتب الموظف: ${empName} | لشهر: ${monthStr} (${monthLabel}) | طريقة الدفع: ${payMethod}${notes ? ' - ' + notes : ''}`;
    const { error: cashErr } = await supabase.from('cash_flow').insert({
      type: 'مصروف',
      amount: actualAmount,
      description: desc
    });
    if (cashErr) throw cashErr;

    // Update liquidity if paid from safe
    if (payMethod === 'خزنة') {
      await autoUpdateLiquidity('خزنة', -actualAmount);
    }

    closeModal('pay-salary-modal');
    await initApp();
    alert(`✅ تم صرف راتب ${empName} (${actualAmount.toLocaleString()} ج.م) بنجاح وتسجيله في اليومية!`);
  } catch (err) {
    alert('Failed to pay salary: ' + err.message);
  }
}

// Update dispatch dropdowns to use display names
function updateDispatchTechDropdowns() {
  ['dispatch-tech-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.innerHTML;
    sel.innerHTML = '<option value="">-- اختر الموظف --</option>';
    stateCache.technicians.forEach(t => {
      sel.innerHTML += `<option value="${t.id}">${getEmployeeDisplayName(t)}</option>`;
    });
  });
}

// Expose all new functions globally
window.openEditEmployeeModal = openEditEmployeeModal;
window.handleEditEmployeeSubmit = handleEditEmployeeSubmit;
window.deleteEmployee = deleteEmployee;
window.openPaySalaryModal = openPaySalaryModal;
window.handlePaySalarySubmit = handlePaySalarySubmit;
window.saveAttendanceInline = saveAttendanceInline;
window.viewCommissionsDetail = viewCommissionsDetail;

function startDigitalClock() {
  const clockEl = document.getElementById('digital-clock');
  const dateEl = document.getElementById('digital-date');
  if (!clockEl || !dateEl) return;

  function update() {
    const now = new Date();
    
    // Time format: HH:MM:SS AM/PM in Arabic/English style
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    clockEl.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
    
    // Date format: e.g. "الأربعاء، ١٥ يوليو ٢٠٢٦" (in Arabic locale)
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('ar-EG', options);
  }
  
  update();
  setInterval(update, 1000);
}
window.startDigitalClock = startDigitalClock;

function toggleMobileSidebar(isOpen) {
  const isDesktop = document.body.classList.contains('force-desktop-mode') || (window.innerWidth > 850 && !(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)));
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  // 🖥️ On PC / desktop version, sidebar is permanently docked and never hidden
  if (isDesktop) {
    sidebar.classList.remove('sidebar-closed', 'open');
    document.body.classList.remove('sidebar-is-collapsed');
    if (overlay) overlay.classList.remove('show');
    return;
  }

  if (isOpen === undefined) {
    isOpen = !sidebar.classList.contains('open');
  }

  if (isOpen) {
    sidebar.classList.add('open');
    sidebar.classList.remove('sidebar-closed');
    document.body.classList.remove('sidebar-is-collapsed');
    if (overlay) overlay.classList.add('show');
  } else {
    sidebar.classList.remove('open');
    sidebar.classList.add('sidebar-closed');
    document.body.classList.add('sidebar-is-collapsed');
    if (overlay) overlay.classList.remove('show');
  }
}
window.toggleMobileSidebar = toggleMobileSidebar;

// --- 📅 UNIFIED ARABIC DATE PICKER (DD/MM/YYYY) ---
function initAllDatePickers(rootContainer = document) {
  if (typeof flatpickr === 'undefined') {
    return;
  }

  const container = rootContainer && rootContainer.querySelectorAll ? rootContainer : document;
  const dateInputs = container.querySelectorAll('input[type="date"], input.flatpickr-custom');
  dateInputs.forEach(input => {
    if (input._flatpickr) return;

    const initialVal = input.value || input.getAttribute('value') || '';

    // Initialize Flatpickr with Arabic locale and Day/Month/Year display format
    try {
      flatpickr(input, {
        locale: (typeof flatpickr.l10ns !== 'undefined' && flatpickr.l10ns.ar) ? flatpickr.l10ns.ar : 'ar',
        dateFormat: 'Y-m-d', // Standard ISO internal value for database/queries
        altInput: true,
        altFormat: 'd/m/Y', // User sees DD/MM/YYYY (Day before Month)
        altInputClass: (input.className || 'form-control') + ' flatpickr-custom-alt',
        disableMobile: true, // Prevents mobile from falling back to native mm/dd/yyyy
        allowInput: true,
        defaultDate: initialVal || null,
        onChange: function(selectedDates, dateStr) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Hook .value setter with strict re-entrancy guard to eliminate ANY infinite recursion!
      if (!input._fpValuePatched) {
        input._fpValuePatched = true;
        const originalValueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (originalValueDesc) {
          let isSyncing = false;
          Object.defineProperty(input, 'value', {
            get() {
              return originalValueDesc.get.call(this);
            },
            set(newVal) {
              originalValueDesc.set.call(this, newVal);
              if (this._flatpickr && !isSyncing) {
                isSyncing = true;
                try {
                  if (newVal) {
                    this._flatpickr.setDate(newVal, false);
                  } else {
                    this._flatpickr.clear();
                  }
                } catch (e) {
                  console.warn('Flatpickr sync warning:', e);
                } finally {
                  isSyncing = false;
                }
              }
            },
            configurable: true
          });
        }
      }

      if (input._flatpickr && input._flatpickr.altInput) {
        input._flatpickr.altInput.placeholder = 'يوم / شهر / سنة';
        input._flatpickr.altInput.style.touchAction = 'manipulation';
      }
    } catch (err) {
      console.warn('Flatpickr init notice for', input.id, err);
    }
  });
}
window.initAllDatePickers = initAllDatePickers;

// Auto sync Flatpickr on form reset
document.addEventListener('reset', (e) => {
  setTimeout(() => {
    if (e.target && e.target.querySelectorAll) {
      e.target.querySelectorAll('input').forEach(inp => {
        if (inp._flatpickr) inp._flatpickr.clear();
      });
    }
  }, 10);
});

// Helper for when user taps or clicks capacity select in dispatch modal before brand is chosen
function checkDispatchCapacityClick(e) {
  const brandSelect = document.getElementById('dispatch-picker-brand');
  if (!brandSelect || !brandSelect.value) {
    if (typeof showToast === 'function') {
      showToast('⚠️ يرجى اختيار نوع وماركة الجهاز أولاً لعرض القدرات المتاحة بالمخزن', 'warning');
    } else {
      alert('⚠️ يرجى اختيار نوع وماركة الجهاز أولاً لعرض القدرات المتاحة بالمخزن');
    }
    if (brandSelect) {
      brandSelect.focus();
      brandSelect.style.borderColor = '#0ea5e9';
      setTimeout(() => { brandSelect.style.borderColor = ''; }, 1500);
    }
  }
}
window.checkDispatchCapacityClick = checkDispatchCapacityClick;

function openFullscreenImage(src) {
  const modal = document.getElementById('fullscreen-image-modal');
  const img = document.getElementById('fullscreen-image-element');
  if (!modal || !img) return;
  img.src = src;
  openModal('fullscreen-image-modal');
}
// --- SENSITIVE DATA VISIBILITY TOGGLES (EYE ICONS) ---
window.hideSalariesState = localStorage.getItem('hideSalariesState') === 'true';
window.hideStockCountsState = localStorage.getItem('hideStockCountsState') === 'true';
window.hideTreasuryState = localStorage.getItem('hideTreasuryState') === 'true';

function updateEyeIcon(iconId, isHidden) {
  const icon = document.getElementById(iconId);
  if (icon) {
    if (isHidden) {
      icon.className = 'bx bx-hide';
      icon.style.color = '#ef4444';
    } else {
      icon.className = 'bx bx-show';
      icon.style.color = '';
    }
  }
}

function toggleSalariesVisibility() {
  window.hideSalariesState = !window.hideSalariesState;
  localStorage.setItem('hideSalariesState', window.hideSalariesState);
  updateEyeIcon('salaries-eye-icon', window.hideSalariesState);
  renderHRTab();
}

function toggleStockCountsVisibility() {
  window.hideStockCountsState = !window.hideStockCountsState;
  localStorage.setItem('hideStockCountsState', window.hideStockCountsState);
  updateEyeIcon('stock-counts-eye-icon', window.hideStockCountsState);
  renderStocktake();
}

function toggleTreasuryVisibility() {
  window.hideTreasuryState = !window.hideTreasuryState;
  localStorage.setItem('hideTreasuryState', window.hideTreasuryState);
  updateEyeIcon('treasury-eye-icon', window.hideTreasuryState);
  renderCashflowTab();
  if (typeof renderFinancialTab === 'function') renderFinancialTab();
}

window.toggleSalariesVisibility = toggleSalariesVisibility;
window.toggleStockCountsVisibility = toggleStockCountsVisibility;
window.toggleTreasuryVisibility = toggleTreasuryVisibility;

window.openSupplierStatement = openSupplierStatement;
window.renderCurrentSupplierStatement = renderCurrentSupplierStatement;
window.filterSupplierStatementTable = filterSupplierStatementTable;
window.resetStatementDates = resetStatementDates;
window.printSupplierStatement = printSupplierStatement;
window.openFullscreenImage = openFullscreenImage;

// --- MODEL & SUPPLIER HISTORY QUERY ---
let currentModelHistoryKey = '';
let currentSupplierHistoryId = '';
let currentModelHistoryFilter = 'all';

const STANDARD_BRAND_GROUPS = [
  {
    name: 'كاريير (Carrier)',
    models: [
      'كاريير بارد عادي',
      'كاريير بارد انفرتر',
      'كاريير بارد ساخن عادي',
      'كاريير بارد ساخن انفرتر',
      'كاريير كونسيلد'
    ]
  },
  {
    name: 'ميديا (Midea)',
    models: [
      'ميديا بارد عادي',
      'ميديا بارد انفرتر',
      'ميديا بارد ساخن عادي',
      'ميديا بارد ساخن انفرتر'
    ]
  },
  {
    name: 'شارب (Sharp)',
    models: [
      'شارب بارد عادي',
      'شارب بارد انفرتر',
      'شارب بارد ساخن عادي',
      'شارب بارد ساخن انفرتر'
    ]
  },
  {
    name: 'تورنيدو (Tornado)',
    models: [
      'تورنيدو بارد عادي',
      'تورنيدو بارد انفرتر',
      'تورنيدو بارد ساخن عادي',
      'تورنيدو بارد ساخن انفرتر'
    ]
  },
  {
    name: 'ال جي (LG)',
    models: [
      'ال جي بارد عادي',
      'ال جي بارد انفرتر',
      'ال جي بارد ساخن عادي',
      'ال جي بارد ساخن انفرتر'
    ]
  },
  {
    name: 'فريش (Fresh)',
    models: [
      'فريش بارد عادي',
      'فريش بارد انفرتر',
      'فريش بارد ساخن عادي',
      'فريش بارد ساخن انفرتر'
    ]
  },
  {
    name: 'هاير (Haier)',
    models: [
      'هاير بارد عادي',
      'هاير بارد انفرتر',
      'هاير بارد ساخن عادي',
      'هاير بارد ساخن انفرتر'
    ]
  },
  {
    name: 'جري (Gree)',
    models: [
      'جري بارد عادي',
      'جري بارد انفرتر',
      'جري بارد ساخن عادي',
      'جري بارد ساخن انفرتر'
    ]
  },
  {
    name: 'سامسونج (Samsung)',
    models: [
      'سامسونج بارد عادي',
      'سامسونج بارد انفرتر',
      'سامسونج بارد ساخن عادي',
      'سامسونج بارد ساخن انفرتر'
    ]
  },
  {
    name: 'يونيون اير (Unionaire)',
    models: [
      'يونيون اير بارد عادي',
      'يونيون اير بارد انفرتر',
      'يونيون اير بارد ساخن عادي',
      'يونيون اير بارد ساخن انفرتر'
    ]
  }
];

function populateModelHistoryDropdown() {
  // 1. Populate Models Dropdown with clean standardized optgroups
  const modelSelect = document.getElementById('model-history-select');
  if (modelSelect) {
    const currentVal = modelSelect.value;
    let html = '<option value="">-- كافة الموديلات والماركات --</option>';

    STANDARD_BRAND_GROUPS.forEach(grp => {
      html += `<optgroup label="${grp.name}">`;
      grp.models.forEach(m => {
        html += `<option value="${m}">${m}</option>`;
      });
      html += `</optgroup>`;
    });

    modelSelect.innerHTML = html;
    if (currentVal) modelSelect.value = currentVal;
  }

  // 2. Populate Suppliers/Traders Dropdown
  const supplierSelect = document.getElementById('supplier-history-select');
  const modalSupplierSelect = document.getElementById('modal-supplier-filter');

  const supplierOptionsHtml = ['<option value="">-- كافة الموردين والتجار --</option>'];
  const sortedSuppliers = [...(stateCache.suppliers || [])].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  sortedSuppliers.forEach(s => {
    supplierOptionsHtml.push(`<option value="${s.id}">🤝 ${s.name}</option>`);
  });

  const fullSupplierHtml = supplierOptionsHtml.join('');

  if (supplierSelect) {
    const curVal = supplierSelect.value;
    supplierSelect.innerHTML = fullSupplierHtml;
    if (curVal) supplierSelect.value = curVal;
  }

  if (modalSupplierSelect) {
    const curVal = modalSupplierSelect.value;
    modalSupplierSelect.innerHTML = '<option value="">-- كل الموردين والتجار --</option>' + sortedSuppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (curVal) modalSupplierSelect.value = curVal;
  }
}

let currentCapacityHistoryKey = '';

function handleInventoryQueryChange() {
  const modelVal = document.getElementById('model-history-select')?.value || '';
  const capacityVal = document.getElementById('capacity-history-select')?.value || '';
  const supplierVal = document.getElementById('supplier-history-select')?.value || '';
  
  if (modelVal || capacityVal || supplierVal) {
    openModelHistoryModal(modelVal, supplierVal, 'all', capacityVal);
  }
}

function triggerInventoryQuery() {
  const modelVal = document.getElementById('model-history-select')?.value || '';
  const capacityVal = document.getElementById('capacity-history-select')?.value || '';
  const supplierVal = document.getElementById('supplier-history-select')?.value || '';
  
  if (!modelVal && !capacityVal && !supplierVal) {
    alert('الرجاء اختيار الموديل أو القدرة أو المورد/التاجر لاستعراض السجل والتحركات!');
    return;
  }
  openModelHistoryModal(modelVal, supplierVal, 'all', capacityVal);
}

function filterModelHistoryByModalSupplier(supplierId) {
  currentSupplierHistoryId = supplierId;
  const supplierSelect = document.getElementById('supplier-history-select');
  if (supplierSelect) supplierSelect.value = supplierId;

  openModelHistoryModal(currentModelHistoryKey, supplierId, currentModelHistoryFilter, currentCapacityHistoryKey);
}

function openModelHistoryModalFromStocktake() {
  const nameEl = document.getElementById('stocktake-detail-model-name');
  if (nameEl && nameEl.innerText && nameEl.innerText !== '-') {
    closeModal('stocktake-detail-modal');
    openModelHistoryModal(nameEl.innerText, '', 'all', '');
  }
}

function openModelHistoryModal(key = '', supplierId = '', filter = 'all', capacityKey = '') {
  currentModelHistoryKey = key;
  currentCapacityHistoryKey = capacityKey;
  currentSupplierHistoryId = supplierId;
  currentModelHistoryFilter = filter;

  // Update dropdown selection inside modal
  const modalSupplierSelect = document.getElementById('modal-supplier-filter');
  if (modalSupplierSelect) modalSupplierSelect.value = supplierId;

  const supplierObj = (stateCache.suppliers || []).find(s => s.id === supplierId);
  const supplierName = supplierObj ? supplierObj.name : '';

  let headerParts = [];
  if (key) headerParts.push(key);
  if (capacityKey) headerParts.push(`قدرة ${capacityKey}`);
  if (supplierName) headerParts.push(`التاجر/المورد: ${supplierName}`);

  let headerNameStr = headerParts.length > 0 ? headerParts.join(' · ') : 'كافة الموديلات والتحركات';

  document.getElementById('model-history-title').innerText = `📜 سجل وتتبع حركة الأجهزة والمعاملات`;
  document.getElementById('model-history-name').innerText = headerNameStr;

  // Find matching devices
  const matchingDevices = (stateCache.devices || []).filter(d => {
    if (d.serial_number && d.serial_number.startsWith('HIST-')) return false;
    if (d.customer_name === 'مبيعات سابقة غير مسجلة') return false;

    if (key) {
      const normKey = key.trim().toLowerCase();
      const normBrand = (d.brand || '').trim().toLowerCase();
      const fullDeviceName = `${d.brand || ''} (${d.capacity || ''})`.trim().toLowerCase();
      
      const isDirectMatch = normBrand === normKey || fullDeviceName === normKey;
      const isBrandMatch = normBrand.includes(normKey) || normKey.includes(normBrand);
      
      if (!isDirectMatch && !isBrandMatch) return false;
    }

    if (capacityKey) {
      const normCapKey = capacityKey.replace(/[\s-]/g, '').toLowerCase();
      const normDevCap = (d.capacity || '').replace(/[\s-]/g, '').toLowerCase();
      if (normDevCap !== normCapKey) return false;
    }

    if (supplierId) {
      const targetName = supplierObj ? supplierObj.name.trim().toLowerCase() : '';
      const matchIntakeSupplier = d.supplier_id === supplierId || (d.supplier_name && targetName && d.supplier_name.toLowerCase().includes(targetName));
      const matchCustomerTrader = d.customer_name && targetName && d.customer_name.toLowerCase().includes(targetName);

      if (!matchIntakeSupplier && !matchCustomerTrader) return false;
    }

    return true;
  });

  const availableCount = matchingDevices.filter(d => d.status === 'متاح').length;
  const receivedCount = matchingDevices.filter(d => d.created_at).length;
  const dispatchedCount = matchingDevices.filter(d => d.status !== 'متاح').length;

  if (document.getElementById('model-summary-received')) document.getElementById('model-summary-received').innerText = `${receivedCount} أجهزة`;
  if (document.getElementById('model-summary-dispatched')) document.getElementById('model-summary-dispatched').innerText = `${dispatchedCount} أجهزة`;
  if (document.getElementById('model-summary-available')) document.getElementById('model-summary-available').innerText = `${availableCount} أجهزة`;

  // Build events timeline array
  const events = [];

  matchingDevices.forEach(d => {
    const images = d.contract_images || [];

    const intakeImages = images.filter(img => 
      img.includes('__delivery_receipt__') || 
      (!img.includes('__sales_contract__') && !img.includes('__delivery_note__') && !img.includes('__installation_report__'))
    );

    const dispatchImages = images.filter(img => 
      img.includes('__sales_contract__') || img.includes('__delivery_note__') || img.includes('__installation_report__') || img.includes('__tax_invoice__') || img.includes('__cash_receipt__')
    );

    const supplier = (stateCache.suppliers || []).find(s => s.id === d.supplier_id);
    const supplierName = supplier ? supplier.name : (d.supplier_name || 'غير محدد');

    // 1. Intake Event
    if (d.created_at) {
      let includeIntake = true;
      if (supplierId) {
        const targetName = supplierObj ? supplierObj.name.trim().toLowerCase() : '';
        const matchIntake = d.supplier_id === supplierId || (d.supplier_name && targetName && d.supplier_name.toLowerCase().includes(targetName));
        if (!matchIntake) includeIntake = false;
      }

      if (includeIntake) {
        const docsHtml = getDeviceDocumentsHtml(intakeImages.length > 0 ? intakeImages : (d.status === 'متاح' ? images : []), d.id, false);
        const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
        let batchBtnHtml = '';
        if (batchInfo) {
          batchBtnHtml = `<div style="margin-top: 4px;"><button class="btn btn-secondary btn-sm" onclick="closeModal('model-history-modal'); openBatchDetailModal('${batchInfo.batchId}')" style="padding: 2px 7px; font-size: 0.75rem; background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3);">📦 إذن مجمع (#${batchInfo.batchId}) - إجمالي الإذن: ${batchInfo.totalAmount} ج.م (${batchInfo.count} أجهزة)</button></div>`;
        }

        events.push({
          timestamp: new Date(d.created_at).getTime(),
          dateStr: new Date(d.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' }),
          serial: d.serial_number,
          modelTag: `<div style="font-size:0.78rem; font-weight:700; color:var(--accent-cyan); margin-bottom:2px;">${d.brand} (${d.capacity})</div>`,
          statusCategory: 'received',
          typeBadge: '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">📥 تم استلامه</span>',
          details: `المورد المصدر: <strong>${supplierName}</strong>${batchBtnHtml}${d.notes ? `<br><small style="color:var(--text-secondary);">${d.notes}</small>` : ''}`,
          priceInfo: `<span style="color: var(--warning);">تكلفة الشراء: ${d.cost_price ? Number(d.cost_price).toLocaleString() + ' ج.م' : '—'}</span>`,
          attachments: docsHtml || '<span style="color: var(--text-secondary); font-size: 0.8rem;">لا توجد مرفقات استلام</span>',
          statusNow: d.status,
          batchInfo: batchInfo
        });
      }
    }

    // 2. Dispatch / Sale Event
    if (d.status !== 'متاح' && (d.installed_at || d.assigned_at)) {
      const txTime = d.installed_at || d.assigned_at;
      const docsHtml = getDeviceDocumentsHtml(dispatchImages.length > 0 ? dispatchImages : images, d.id, false);
      const hasContractOrReport = images.some(img => 
        img.includes('__sales_contract__') || img.includes('__installation_report__')
      );

      let typeBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">📤 تم صرفه وبيعه</span>';
      let detailsText = `العميل المستلم: <strong>${d.customer_name || '_'}</strong>`;
      if (!d.customer_name && d.supplier_id && !hasContractOrReport && d.status === 'تم التركيب') {
        const trader = (stateCache.suppliers || []).find(s => s.id === d.supplier_id);
        const traderName = trader ? trader.name : 'تاجر';
        typeBadge = '<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: var(--accent-cyan); border: 1px solid rgba(14, 165, 233, 0.3);">🤝 تم صرفه لتاجر</span>';
        detailsText = `التاجر المستلم: <strong>${traderName}</strong>`;
      } else if (d.status === 'جاري التركيب عهدة مع الفني') {
        const tech = (stateCache.technicians || []).find(t => t.id === d.technician_id);
        typeBadge = '<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3);">🔧 تم صرفه كعهدة</span>';
        detailsText = `الفني المسؤول: <strong>${tech ? tech.name : '_'}</strong>`;
      }

      let includeDispatch = true;
      if (supplierId) {
        const targetName = supplierObj ? supplierObj.name.trim().toLowerCase() : '';
        const matchCustomerTrader = d.customer_name && targetName && d.customer_name.toLowerCase().includes(targetName);
        const matchTraderSupplier = d.supplier_id === supplierId && !hasContractOrReport;
        if (!matchCustomerTrader && !matchTraderSupplier) includeDispatch = false;
      }

      if (includeDispatch) {
        const batchInfo = getBatchInfoFromText(d.installment_notes || d.notes, d.id);
        if (batchInfo) {
          detailsText += `<div style="margin-top: 4px;"><button class="btn btn-secondary btn-sm" onclick="closeModal('model-history-modal'); openBatchDetailModal('${batchInfo.batchId}')" style="padding: 2px 7px; font-size: 0.75rem; background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3);">📦 إذن مجمع (#${batchInfo.batchId}) - إجمالي العملية: ${batchInfo.totalAmount} ج.م (${batchInfo.count} أجهزة)</button></div>`;
        }

        events.push({
          timestamp: new Date(txTime).getTime(),
          dateStr: new Date(txTime).toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' }),
          serial: d.serial_number,
          modelTag: `<div style="font-size:0.78rem; font-weight:700; color:var(--accent-cyan); margin-bottom:2px;">${d.brand} (${d.capacity})</div>`,
          statusCategory: 'dispatched',
          typeBadge: typeBadge,
          details: detailsText,
          priceInfo: `<span style="color: var(--success);">سعر البيع: ${d.sale_price ? Number(d.sale_price).toLocaleString() + ' ج.م' : '—'}</span>`,
          attachments: docsHtml || '<span style="color: var(--text-secondary); font-size: 0.8rem;">لا توجد مرفقات صرف</span>',
          statusNow: d.status,
          batchInfo: batchInfo
        });
      }
    }
  });

  // Sort events chronologically (Newest first), keeping same batch items adjacent
  events.sort((a, b) => {
    if (a.statusCategory === b.statusCategory && a.batchInfo && b.batchInfo && a.batchInfo.batchId === b.batchInfo.batchId) {
      return 0;
    }
    return b.timestamp - a.timestamp;
  });

  window._currentModelEvents = events;

  filterModelHistoryTab(filter);
  openModal('model-history-modal');
}

function filterModelHistoryTab(filter) {
  currentModelHistoryFilter = filter;
  
  // Update Tab buttons active state
  ['all', 'received', 'dispatched', 'available'].forEach(f => {
    const btn = document.getElementById(`btn-tab-${f}`);
    if (btn) {
      if (f === filter) {
        btn.style.background = 'var(--accent)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  });

  const events = window._currentModelEvents || [];
  const filteredEvents = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'received') return e.statusCategory === 'received';
    if (filter === 'dispatched') return e.statusCategory === 'dispatched';
    if (filter === 'available') return e.statusCategory === 'received' && e.statusNow === 'متاح';
    return true;
  });

  const tbody = document.querySelector('#model-history-table tbody');
  tbody.innerHTML = '';

  if (filteredEvents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 25px; color: var(--text-secondary);">لا توجد معاملات مسجلة بهذا الفلتر لهذا الموديل أو التاجر/المورد.</td></tr>';
    return;
  }

  const rows = filteredEvents.map((ev, idx) => {
    const currentStatusBadge = ev.statusNow === 'متاح' 
      ? '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">🟢 متاح بالمخزن</span>'
      : '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">📤 تم صرفه</span>';

    return `
      <tr>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${idx + 1}</td>
        <td style="font-size: 0.85rem; white-space: nowrap;">${ev.dateStr}</td>
        <td>${ev.modelTag}<code style="font-weight: 700; color: var(--accent); font-size: 0.9rem;">${ev.serial}</code></td>
        <td>${ev.typeBadge} <div style="margin-top: 3px;">${currentStatusBadge}</div></td>
        <td style="font-size: 0.88rem;">${ev.details}</td>
        <td style="font-size: 0.88rem; font-weight: 600; white-space: nowrap;">${ev.priceInfo}</td>
        <td><div style="display: flex; gap: 4px; flex-wrap: wrap;">${ev.attachments}</div></td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rows;
}

window.populateModelHistoryDropdown = populateModelHistoryDropdown;
window.handleInventoryQueryChange = handleInventoryQueryChange;
window.triggerInventoryQuery = triggerInventoryQuery;
window.filterModelHistoryByModalSupplier = filterModelHistoryByModalSupplier;
window.openModelHistoryModalFromStocktake = openModelHistoryModalFromStocktake;
window.openModelHistoryModal = openModelHistoryModal;
window.filterModelHistoryTab = filterModelHistoryTab;
window.openEditCustomerModal = openEditCustomerModal;
window.handleEditCustomerSubmit = handleEditCustomerSubmit;
window.openEditDeviceModal = openEditDeviceModal;
window.renderCustomersTab = renderCustomersTab;

// ⚡ Global Delegated Event Listener for Edit Buttons
document.addEventListener('click', function(e) {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.classList.contains('btn-edit-customer') || btn.getAttribute('data-action') === 'edit-customer') {
    const type = btn.getAttribute('data-type');
    const id = btn.getAttribute('data-id');
    const name = btn.getAttribute('data-name');
    const phone = btn.getAttribute('data-phone');
    const address = btn.getAttribute('data-address');
    console.log('⚡ [GlobalClick] Caught edit customer button click:', { type, id, name, phone, address });
    openEditCustomerModal(type, id, name, phone, address);
  } else if (btn.classList.contains('btn-edit-device') || btn.getAttribute('data-action') === 'edit-device') {
    const id = btn.getAttribute('data-id');
    console.log('⚡ [GlobalClick] Caught edit device button click:', { id });
    if (id) openEditDeviceModal(id);
  }
});

// --- PROFITS AND LOSSES TAB LOGIC ---
function renderProfitsTab() {
  const startInput = document.getElementById('profits-start-date');
  const endInput = document.getElementById('profits-end-date');
  
  if (startInput && endInput && (!startInput.value || !endInput.value)) {
    // Default to this month preset on first load
    setProfitsPreset('this-month');
  } else {
    calculateProfits();
  }
}

function setProfitsPreset(preset) {
  const startInput = document.getElementById('profits-start-date');
  const endInput = document.getElementById('profits-end-date');
  if (!startInput || !endInput) return;

  const now = new Date();
  let start = new Date();
  let end = new Date();

  // Reset preset button active classes
  ['today', 'yesterday', 'this-week', 'this-month', 'last-month', 'all-time'].forEach(p => {
    document.getElementById(`btn-preset-${p}`)?.classList.remove('active');
  });
  document.getElementById(`btn-preset-${preset}`)?.classList.add('active');

  switch (preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'yesterday':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      break;
    case 'this-week':
      // Show last 7 days
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      end = now;
      break;
    case 'this-month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
      break;
    case 'last-month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'all-time':
      start = new Date(2020, 0, 1);
      end = now;
      break;
  }

  // Format as YYYY-MM-DD local time
  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  startInput.value = formatDate(start);
  endInput.value = formatDate(end);

  calculateProfits();
}

function calculateProfits() {
  const startInput = document.getElementById('profits-start-date');
  const endInput = document.getElementById('profits-end-date');
  if (!startInput || !endInput) return;

  const startDate = new Date(startInput.value + 'T00:00:00');
  const endDate = new Date(endInput.value + 'T23:59:59');

  const soldDevices = (stateCache.devices || []).filter(d => {
    if (d.serial_number && d.serial_number.startsWith('HIST-')) return false;
    if (d.customer_name === 'مبيعات سابقة غير مسجلة') return false;

    // Only sold devices (status 'تم التركيب' or 'صرف لتاجر' equivalent)
    if (d.status !== 'تم التركيب') return false;

    // Date range filtering
    const saleDateVal = d.installed_at || d.assigned_at || d.created_at;
    if (!saleDateVal) return false;

    const saleDate = new Date(saleDateVal);
    return saleDate >= startDate && saleDate <= endDate;
  });

  // Calculate sums
  const count = soldDevices.length;
  let totalCost = 0;
  let totalSales = 0;

  soldDevices.forEach(d => {
    totalCost += Number(d.cost_price || 0);
    totalSales += Number(d.sale_price || 0);
  });

  const netProfits = totalSales - totalCost;

  // Update UI Elements
  document.getElementById('profits-stat-count').innerText = `${count} جهاز`;
  document.getElementById('profits-stat-cost').innerText = `${totalCost.toLocaleString('ar-EG')} ج.م`;
  document.getElementById('profits-stat-sales').innerText = `${totalSales.toLocaleString('ar-EG')} ج.م`;
  
  const netEl = document.getElementById('profits-stat-net');
  netEl.innerText = `${netProfits.toLocaleString('ar-EG')} ج.م`;
  if (netProfits >= 0) {
    netEl.style.color = '#10b981'; // Green color for profit
  } else {
    netEl.style.color = '#ef4444'; // Red color for loss
  }

  // Cache for search
  window._currentProfitsDevices = soldDevices;

  // Render Table rows
  renderProfitsTableRows(soldDevices);
}

function renderProfitsTableRows(devices) {
  const tbody = document.querySelector('#profits-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (devices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: var(--text-secondary);">لا توجد عمليات بيع مسجلة في هذه الفترة.</td></tr>';
    return;
  }

  // Sort by sale date descending
  const sorted = [...devices].sort((a, b) => {
    const dateA = new Date(a.installed_at || a.assigned_at || a.created_at || 0);
    const dateB = new Date(b.installed_at || b.assigned_at || b.created_at || 0);
    return dateB - dateA;
  });

  const rowsHtml = sorted.map((d, idx) => {
    const saleDateVal = d.installed_at || d.assigned_at || d.created_at;
    const saleDateStr = saleDateVal 
      ? new Date(saleDateVal).toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' })
      : 'غير محدد';

    const cost = Number(d.cost_price || 0);
    const sale = Number(d.sale_price || 0);
    const profit = sale - cost;

    const profitColor = profit >= 0 ? '#10b981' : '#ef4444';
    const profitSign = profit >= 0 ? '+' : '';

    const clientName = d.customer_name || 'تاجر/مورد';

    return `
      <tr>
        <td style="color: var(--text-secondary);">${idx + 1}</td>
        <td><span style="color: var(--text-secondary); font-size: 0.85rem;">${saleDateStr}</span></td>
        <td>
          <div style="font-weight:700;">${d.brand} (${d.capacity})</div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">المستفيد: ${clientName}</div>
        </td>
        <td><code>${d.serial_number}</code></td>
        <td>${cost.toLocaleString('ar-EG')} ج.م</td>
        <td style="font-weight: 600;">${sale.toLocaleString('ar-EG')} ج.م</td>
        <td style="font-weight: 700; color: ${profitColor}; font-size: 0.95rem;">${profitSign}${profit.toLocaleString('ar-EG')} ج.م</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml.join('');
}

function filterProfitsTable() {
  const queryInput = document.getElementById('profits-search-input');
  if (!queryInput) return;
  const q = queryInput.value.trim().toLowerCase();

  const devices = window._currentProfitsDevices || [];
  if (!q) {
    renderProfitsTableRows(devices);
    return;
  }

  const filtered = devices.filter(d => {
    const brand = (d.brand || '').toLowerCase();
    const capacity = (d.capacity || '').toLowerCase();
    const serial = (d.serial_number || '').toLowerCase();
    const customer = (d.customer_name || '').toLowerCase();

    return brand.includes(q) || capacity.includes(q) || serial.includes(q) || customer.includes(q);
  });

  renderProfitsTableRows(filtered);
}

// Global exposure
window.renderProfitsTab = renderProfitsTab;
window.setProfitsPreset = setProfitsPreset;
window.calculateProfits = calculateProfits;
window.filterProfitsTable = filterProfitsTable;

// --- 🧪 SANDBOX TEST MODE FRONTEND ENGINE ---
async function checkSandboxModeState() {
  try {
    const { data: row } = await supabase.from('bot_sessions').select('*').eq('chat_id', 999999).maybeSingle();
    const isSandbox = row?.data?.sandbox_active === true;
    
    const banner = document.getElementById('sandbox-mode-banner');
    const btn = document.getElementById('toggle-sandbox-btn');

    if (banner) banner.style.display = isSandbox ? 'flex' : 'none';

    if (btn) {
      if (isSandbox) {
        btn.innerHTML = '🧪 وضع التجربة (مفعّل 🟢)';
        btn.style.background = 'rgba(239, 68, 68, 0.2)';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        btn.style.color = '#ef4444';
      } else {
        btn.innerHTML = '🧪 تجربة البوت';
        btn.style.background = 'rgba(245, 158, 11, 0.15)';
        btn.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        btn.style.color = '#f59e0b';
      }
    }
  } catch (e) {
    console.warn('checkSandboxModeState failed:', e.message);
  }
}

async function toggleSandboxModeFromWeb() {
  const { data: row } = await supabase.from('bot_sessions').select('*').eq('chat_id', 999999).single();
  const isSandbox = row?.data?.sandbox_active === true;

  if (isSandbox) {
    disableSandboxModeAndRestore();
  } else {
    enableSandboxModeFromWeb();
  }
}

async function enableSandboxModeFromWeb() {
  if (!confirm('🧪 هل ترغب في تفعيل وضع تجربة واختبار البوت؟\n\nسيتم أخذ لقطة حفظ احتياطية كاملة للموقع والمخزن والخزينة، ويمكنك تجربة أي حركات دون الخوف على الحسابات الأصلية.')) return;

  try {
    const { data: row } = await supabase.from('bot_sessions').select('*').eq('chat_id', 999999).single();
    const finData = row.data;

    const { data: dev } = await supabase.from('devices').select('*');
    const { data: st } = await supabase.from('supplier_transactions').select('*');
    const { data: cf } = await supabase.from('cash_flow').select('*');
    const { data: sup } = await supabase.from('suppliers').select('*');

    finData.sandbox_snapshot = {
      devices: dev || [],
      supplier_transactions: st || [],
      cash_flow: cf || [],
      suppliers: sup || [],
      liquidity: { ...(finData.liquidity || {}) },
      created_at: new Date().toISOString()
    };
    finData.sandbox_active = true;

    await supabase.from('bot_sessions').update({ data: finData, updated_at: new Date().toISOString() }).eq('chat_id', 999999);
    
    alert('🧪 تم تفعيل وضع تجربة البوت بنجاح!\n\nيمكنك الآن التجربة ولغبطة أي بيانات في الشات أو الموقع، وعند الانتهاء اضغط الزر الأحمر بالأسفل واستعادة كل شيء كما كان.');
    await checkSandboxModeState();
    if (typeof loadAllData === 'function') loadAllData();
  } catch (e) {
    alert('❌ فشل تفعيل وضع التجربة: ' + e.message);
  }
}

async function disableSandboxModeAndRestore() {
  if (!confirm('🔴 هل أنت تأكد من إنهاء وضع التجربة وإلغاء جميع الحركات التجريبية واستعادة البيانات الأصلية كما كانت بالضبط؟')) return;

  try {
    const { data: row } = await supabase.from('bot_sessions').select('*').eq('chat_id', 999999).single();
    const finData = row.data;

    if (!finData.sandbox_active || !finData.sandbox_snapshot) {
      alert('⚠️ وضع التجربة غير مفعل حالياً!');
      return;
    }

    const snap = finData.sandbox_snapshot;

    // 1. Clear child tables first
    await supabase.from('supplier_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('devices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('cash_flow').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('suppliers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Restore snapshot rows
    if (snap.suppliers && snap.suppliers.length > 0) await supabase.from('suppliers').insert(snap.suppliers);
    if (snap.devices && snap.devices.length > 0) await supabase.from('devices').insert(snap.devices);
    if (snap.supplier_transactions && snap.supplier_transactions.length > 0) await supabase.from('supplier_transactions').insert(snap.supplier_transactions);
    if (snap.cash_flow && snap.cash_flow.length > 0) await supabase.from('cash_flow').insert(snap.cash_flow);

    // 3. Restore liquidity
    finData.liquidity = { ...(snap.liquidity || {}) };
    finData.sandbox_active = false;
    delete finData.sandbox_snapshot;

    await supabase.from('bot_sessions').update({ data: finData, updated_at: new Date().toISOString() }).eq('chat_id', 999999);

    alert('✅ تم إنهاء وضع التجربة وإعادة كافة البيانات والمخزن والسيولة للحالة الأصلية بنجاح!');
    await checkSandboxModeState();
    window.location.reload();
  } catch (e) {
    alert('❌ فشل استعادة البيانات: ' + e.message);
  }
}

// Check Sandbox state on load
document.addEventListener('DOMContentLoaded', checkSandboxModeState);

window.checkSandboxModeState = checkSandboxModeState;
window.toggleSandboxModeFromWeb = toggleSandboxModeFromWeb;
window.enableSandboxModeFromWeb = enableSandboxModeFromWeb;
window.disableSandboxModeAndRestore = disableSandboxModeAndRestore;

// ==========================================
// 🛠️ WORK ORDERS, MAINTENANCE & TECH PERFORMANCE MODULE
// ==========================================

function renderWorkOrdersTab() {
  // Default to this month preset if dates not set
  const startInput = document.getElementById('workorders-start-date');
  const endInput = document.getElementById('workorders-end-date');
  
  if (!startInput?.value || !endInput?.value) {
    setWorkOrdersPreset('this-month');
  } else {
    calculateWorkOrders();
  }
}

function setWorkOrdersPreset(preset) {
  // Update active button styling
  const presetBtns = ['today', 'yesterday', 'this-week', 'this-month', 'last-month', 'all-time'];
  presetBtns.forEach(p => {
    const btn = document.getElementById(`btn-wo-preset-${p}`);
    if (btn) {
      if (p === preset) {
        btn.classList.add('active');
        btn.style.background = 'var(--accent-cyan)';
        btn.style.color = '#fff';
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
      }
    }
  });

  const now = new Date();
  let startDate, endDate;

  switch (preset) {
    case 'today': {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    }
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
      endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
      break;
    }
    case 'this-week': {
      // Start of week (Saturday in Egypt)
      const day = now.getDay(); // 0 is Sunday, 6 is Saturday
      const diff = (day + 1) % 7; // days since Saturday
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    }
    case 'this-month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    }
    case 'last-month': {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    }
    case 'all-time': {
      startDate = new Date(2020, 0, 1, 0, 0, 0);
      endDate = new Date(2099, 11, 31, 23, 59, 59);
      break;
    }
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const startInput = document.getElementById('workorders-start-date');
  const endInput = document.getElementById('workorders-end-date');

  if (startInput) startInput.value = startDate.toISOString().split('T')[0];
  if (endInput) endInput.value = endDate.toISOString().split('T')[0];

  calculateWorkOrders();
}

function calculateWorkOrders() {
  const startInput = document.getElementById('workorders-start-date');
  const endInput = document.getElementById('workorders-end-date');
  const typeFilter = document.getElementById('workorders-type-filter')?.value || 'all';

  if (!startInput?.value || !endInput?.value) return;

  const startDate = new Date(startInput.value);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(endInput.value);
  endDate.setHours(23, 59, 59, 999);

  // Update Period Label
  const periodLabel = document.getElementById('wo-tech-period-label');
  if (periodLabel) {
    const sStr = startDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    const eStr = endDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    periodLabel.innerText = `📅 الفترة: ${sStr} إلى ${eStr}`;
  }

  // 1. Gather Work Orders from Cash Flow
  const rawCashFlow = stateCache.cashFlow || [];
  const parsedOrders = [];

  rawCashFlow.forEach(c => {
    if (c.type !== 'إيراد') return;
    const desc = c.description || '';

    // Check if entry represents a work order or maintenance or extra work
    const isExplicitWO = desc.includes('أمر شغل');
    const isMaintenanceOrService = desc.match(/صيانة|غسيل|شحن فريون|تسريب|لحام|تنظيف|فك|تركيب خارجي|نحاس|مواسير|حامل|حوامل|أعمال إضافية/i);
    const isNotTraderOrSupplier = !desc.includes('تحصيل من تاجر') && !desc.includes('سداد مورد') && !desc.includes('سداد متبقي حساب');

    if (isExplicitWO || (isMaintenanceOrService && isNotTraderOrSupplier)) {
      const dateVal = c.date || c.created_at;
      if (!dateVal) return;
      const orderDate = new Date(dateVal);
      if (orderDate < startDate || orderDate > endDate) return;

      // Extract Branch / Type
      let woType = 'صيانة';
      if (desc.includes('أعمال إضافية') || desc.match(/نحاس|مواسير|حامل|حوامل|دفن|تكسير|كهرباء|تمديد|أعمال إضافية/i)) {
        woType = 'أعمال إضافية';
      }

      // Filter by type if selected
      if (typeFilter !== 'all' && woType !== typeFilter) return;

      // Extract Customer Details
      const matchName = desc.match(/العميل:\s*([^|]+)/);
      const matchPhone = desc.match(/تليفون:\s*([^|]+)/) || desc.match(/\((01\d{9})\)/);
      const matchAddress = desc.match(/عنوان:\s*([^|]+)/);
      
      const custName = matchName ? matchName[1].trim() : 'غير محدد';
      const custPhone = matchPhone ? matchPhone[1].trim() : '-';
      const custAddress = matchAddress ? matchAddress[1].trim() : '-';

      // Extract Work Details
      let workDetails = 'أمر شغل وصيانة';
      const matchDetails = desc.match(/أمر شغل \([^)]+\):\s*([^|]+)/) || desc.match(/البيان:\s*([^|]+)/);
      if (matchDetails) {
        workDetails = matchDetails[1].trim();
      } else {
        const parts = desc.split('|').map(p => p.trim());
        workDetails = parts[0] || 'صيانة / أعمال إضافية';
      }

      // Extract Technicians
      let rawTechs = 'غير محدد';
      const matchTechBracket = desc.match(/\[الفني:\s*([^\]]+)\]/);
      const matchTechTeam = desc.match(/(?:الفنيين|الفني|الفريق):\s*([^|]+)/);
      if (matchTechBracket) {
        rawTechs = matchTechBracket[1].trim();
      } else if (matchTechTeam) {
        rawTechs = matchTechTeam[1].trim();
      }

      // Extract Payment Method
      const parts = desc.split('|').map(p => p.trim());
      const method = parts.length > 1 ? parts[parts.length - 1].replace(/__ATTACHMENT__.*$/, '').trim() : 'خزنة';

      // Clean Attachment URL
      let attachmentUrl = null;
      if (desc.includes('__ATTACHMENT__')) {
        attachmentUrl = desc.split('__ATTACHMENT__')[1].replace(/__$/, '').trim();
      }

      parsedOrders.push({
        id: c.id,
        date: orderDate,
        dateStr: orderDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric' }),
        timeStr: orderDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: woType,
        customerName: custName,
        customerPhone: custPhone,
        customerAddress: custAddress,
        details: workDetails,
        technicians: rawTechs,
        amount: Number(c.amount || 0),
        paymentMethod: method,
        attachmentUrl: attachmentUrl
      });
    }
  });

  // 2. Calculate Summary Metrics
  const totalCount = parsedOrders.length;
  let totalRevenue = 0;
  let maintRevenue = 0;
  let extraRevenue = 0;
  let maintCount = 0;
  let extraCount = 0;

  parsedOrders.forEach(o => {
    totalRevenue += o.amount;
    if (o.type === 'صيانة') {
      maintRevenue += o.amount;
      maintCount++;
    } else {
      extraRevenue += o.amount;
      extraCount++;
    }
  });

  // Update KPI Cards
  const statCountEl = document.getElementById('wo-stat-count');
  if (statCountEl) {
    statCountEl.innerHTML = `<b>${totalCount}</b> أمر شغل <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary);">(${maintCount} صيانة | ${extraCount} إضافية)</span>`;
  }

  const statTotalRevEl = document.getElementById('wo-stat-total-revenue');
  if (statTotalRevEl) {
    statTotalRevEl.innerText = `${totalRevenue.toLocaleString('ar-EG')} ج.م`;
  }

  const statMaintRevEl = document.getElementById('wo-stat-maint-revenue');
  if (statMaintRevEl) {
    statMaintRevEl.innerText = `${maintRevenue.toLocaleString('ar-EG')} ج.م`;
  }

  const statExtraRevEl = document.getElementById('wo-stat-extra-revenue');
  if (statExtraRevEl) {
    statExtraRevEl.innerText = `${extraRevenue.toLocaleString('ar-EG')} ج.م`;
  }

  // 3. Compute Technician Productivity & Revenue Breakdown
  const techMap = {};

  parsedOrders.forEach(o => {
    if (!o.technicians || o.technicians === 'غير محدد' || o.technicians === 'فني') {
      const techKey = 'غير محدد';
      if (!techMap[techKey]) {
        techMap[techKey] = { name: 'غير محدد', count: 0, maintCount: 0, extraCount: 0, totalRevenue: 0 };
      }
      techMap[techKey].count += 1;
      techMap[techKey].totalRevenue += o.amount;
      if (o.type === 'صيانة') techMap[techKey].maintCount += 1;
      else techMap[techKey].extraCount += 1;
      return;
    }

    // Split multiple technicians if listed together (e.g. "شعراوي ومحمد" or "عبده، اسلام")
    const names = o.technicians.split(/[،,و+&/]+/).map(n => n.trim()).filter(n => n.length > 1 && n !== 'فني');
    if (names.length === 0) names.push(o.technicians);

    names.forEach(name => {
      if (!techMap[name]) {
        techMap[name] = { name: name, count: 0, maintCount: 0, extraCount: 0, totalRevenue: 0 };
      }
      techMap[name].count += 1;
      techMap[name].totalRevenue += o.amount;
      if (o.type === 'صيانة') techMap[name].maintCount += 1;
      else techMap[name].extraCount += 1;
    });
  });

  const techStats = Object.values(techMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Render Tech Leaderboard
  renderTechniciansProductivity(techStats);

  // 4. Cache and Render Work Orders Table
  window._currentWorkOrders = parsedOrders;
  renderWorkOrdersTableRows(parsedOrders);
}

function renderTechniciansProductivity(techStats) {
  const tbody = document.querySelector('#wo-tech-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (techStats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 20px; color: var(--text-secondary);">لا توجد عمليات مسجلة للفنيين في هذه الفترة.</td></tr>';
    return;
  }

  const rowsHtml = techStats.map((t, idx) => {
    let rankBadge = `${idx + 1}`;
    let highlightBg = '';
    if (idx === 0) {
      rankBadge = '🥇 #1';
      highlightBg = 'background: rgba(234, 179, 8, 0.08);';
    } else if (idx === 1) {
      rankBadge = '🥈 #2';
    } else if (idx === 2) {
      rankBadge = '🥉 #3';
    }

    const avgRev = t.count > 0 ? Math.round(t.totalRevenue / t.count) : 0;

    return `
      <tr style="${highlightBg}">
        <td style="font-weight: 700; color: var(--accent-cyan);">${rankBadge}</td>
        <td>
          <div style="font-weight: 700; display: flex; align-items: center; gap: 8px;">
            <i class='bx bxs-user' style="color: var(--accent-cyan);"></i>
            <span>${t.name}</span>
          </div>
        </td>
        <td><strong style="font-size: 1rem; color: var(--text-primary);">${t.count}</strong> أمر شغل</td>
        <td><span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); padding: 3px 8px; border-radius: 6px;">🧰 ${t.maintCount}</span></td>
        <td><span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; padding: 3px 8px; border-radius: 6px;">⚡ ${t.extraCount}</span></td>
        <td><strong style="color: var(--success); font-size: 1.05rem;">${t.totalRevenue.toLocaleString('ar-EG')} ج.م</strong></td>
        <td style="color: var(--text-secondary);">${avgRev.toLocaleString('ar-EG')} ج.م</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml.join('');
}

function renderWorkOrdersTableRows(orders) {
  const tbody = document.querySelector('#workorders-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 25px; color: var(--text-secondary);">لا توجد أوامر شغل مسجلة في هذه الفترة المحددة.</td></tr>';
    return;
  }

  // Sort newest first
  const sorted = [...orders].sort((a, b) => b.date.getTime() - a.date.getTime());

  const rowsHtml = sorted.map((o, idx) => {
    const isMaint = o.type === 'صيانة';
    const typeBadge = isMaint 
      ? `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); padding: 4px 10px; border-radius: 8px; font-weight: 600;">🧰 صيانة</span>`
      : `<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 4px 10px; border-radius: 8px; font-weight: 600;">⚡ أعمال إضافية</span>`;

    const attachBtn = o.attachmentUrl
      ? `<a href="${o.attachmentUrl}" target="_blank" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;"><i class='bx bx-paperclip'></i> مستند</a>`
      : `<span style="color: var(--text-secondary); font-size: 0.8rem;">-</span>`;

    return `
      <tr>
        <td style="color: var(--text-secondary);">${idx + 1}</td>
        <td>
          <div style="font-weight: 600; font-size: 0.85rem;">${o.dateStr}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${o.timeStr}</div>
        </td>
        <td>${typeBadge}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${o.customerName}</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">
            <span>📱 ${o.customerPhone}</span>
            ${o.customerAddress && o.customerAddress !== '-' ? ` | 📍 ${o.customerAddress}` : ''}
          </div>
        </td>
        <td>
          <div style="font-size: 0.88rem; line-height: 1.4; color: var(--text-primary);">${o.details}</div>
        </td>
        <td>
          <span class="badge" style="background: rgba(14, 165, 233, 0.12); color: var(--accent-cyan); padding: 4px 8px; border-radius: 6px; font-weight: 600;">
            👨‍🔧 ${o.technicians}
          </span>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--success); font-size: 0.95rem;">${o.amount.toLocaleString('ar-EG')} ج.م</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${o.paymentMethod}</div>
        </td>
        <td style="text-align: center;">${attachBtn}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml.join('');
}

function filterWorkOrdersTable() {
  const queryInput = document.getElementById('workorders-search-input');
  if (!queryInput) return;
  const q = queryInput.value.trim().toLowerCase();

  const orders = window._currentWorkOrders || [];
  if (!q) {
    renderWorkOrdersTableRows(orders);
    return;
  }

  const filtered = orders.filter(o => {
    const cust = (o.customerName || '').toLowerCase();
    const phone = (o.customerPhone || '').toLowerCase();
    const addr = (o.customerAddress || '').toLowerCase();
    const details = (o.details || '').toLowerCase();
    const techs = (o.technicians || '').toLowerCase();
    const type = (o.type || '').toLowerCase();

    return cust.includes(q) || phone.includes(q) || addr.includes(q) || details.includes(q) || techs.includes(q) || type.includes(q);
  });

  renderWorkOrdersTableRows(filtered);
}

// Global window exposure
window.renderWorkOrdersTab = renderWorkOrdersTab;
window.setWorkOrdersPreset = setWorkOrdersPreset;
window.calculateWorkOrders = calculateWorkOrders;
window.filterWorkOrdersTable = filterWorkOrdersTable;
