/* ═══════════════════════════════════════════════════
   Rapport Tool — Frontend JavaScript
   Real-time SSE log streaming + Form handling
   ═══════════════════════════════════════════════════ */
// ── Project / Description toggle logic ──────────────
const useDefaultProject = document.getElementById('useDefaultProject');
const useDefaultDesc = document.getElementById('useDefaultDesc');
const projectFields = document.getElementById('projectFields');
const projectToggleArea = document.querySelector('.project-toggles');
const projectFieldGroup = document.getElementById('projectFieldGroup');
const descFieldGroup = document.getElementById('descFieldGroup');
const projectInput = document.getElementById('project');
const descInput = document.getElementById('description');

const useDailyDesc = document.getElementById('useDailyDesc');
const dailyDescFields = document.getElementById('dailyDescFields');
const defaultDescRow = document.getElementById('defaultDescRow');

const exportCheck = document.getElementById('exportCheck');
const sendTestEmailCheck = document.getElementById('sendTestEmailCheck');
const sendWebhookCheck = document.getElementById('sendWebhookCheck');
const emailOption = document.getElementById('emailOption');
const webhookOption = document.getElementById('webhookOption');

const multiClientToggle = document.getElementById('multiClientToggle');
const multiClientFields = document.getElementById('multiClientFields');
const projectsList = document.getElementById('projectsList');
const addProjectBtn = document.getElementById('addProjectBtn');
const distributedHoursEl = document.getElementById('distributedHours');
const multiClientTotal = document.getElementById('multiClientTotal');
const targetHoursDisplay = document.querySelectorAll('.target-hours-display');

const navRegister = document.getElementById('navRegister');
const navHistory = document.getElementById('navHistory');
const registerSection = document.getElementById('register');
const historySection = document.getElementById('history');
const historyList = document.getElementById('historyList');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const consoleSection = document.getElementById('logs');

if (exportCheck && sendTestEmailCheck) {
  exportCheck.addEventListener('change', () => {
    const enabled = exportCheck.checked;
    // Test email toggle
    sendTestEmailCheck.disabled = !enabled;
    emailOption.style.opacity = enabled ? '1' : '0.5';
    if (!enabled) sendTestEmailCheck.checked = false;
    // Webhook toggle
    sendWebhookCheck.disabled = !enabled;
    webhookOption.style.opacity = enabled ? '1' : '0.5';
    if (!enabled) sendWebhookCheck.checked = false;
  });
}

// ── Peruvian Clock ──────────────────────────────────
// ... (omitted for brevity in replace call, but I'll write the whole function below)
function updateClock() {
  const now = new Date();
  const opts = { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const clockEl = document.getElementById('peruvianClock');
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('es-PE', opts);
}
updateClock();
setInterval(updateClock, 1000);

// ── Day pill toggles ────────────────────────────────
document.querySelectorAll('.day-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const cb = pill.querySelector('.day-checkbox');
    // The click event on label already toggles the checkbox IF we don't prevent default.
    // In index.html, it's a label with an input inside. 
    // Wait, the previous code had pill.classList.toggle('checked', cb.checked);
    // but the checkbox state might not have updated yet if this runs on label click.
    setTimeout(() => {
      pill.classList.toggle('checked', cb.checked);
      updateHoursTotal();
      renderDailyDescFields();
    }, 0);
  });
});

// ── Hours control ───────────────────────────────────
const hoursInput = document.getElementById('hours');
const upBtn = document.getElementById('hoursUp');
const downBtn = document.getElementById('hoursDown');
if (upBtn) {
  upBtn.addEventListener('click', () => {
    const v = parseInt(hoursInput.value);
    if (v < 12) { hoursInput.value = v + 1; updateHoursTotal(); }
  });
}
if (downBtn) {
  downBtn.addEventListener('click', () => {
    const v = parseInt(hoursInput.value);
    if (v > 1) { hoursInput.value = v - 1; updateHoursTotal(); }
  });
}

function updateHoursTotal() {
  const checkedDays = document.querySelectorAll('.day-checkbox:checked').length;
  const hours = parseInt(hoursInput.value);
  const total = checkedDays * hours;
  const totalEl = document.getElementById('hoursTotal');
  if (totalEl) totalEl.innerHTML = `Total semana: <strong>${total}h</strong>`;
}
updateHoursTotal();

// ── Password toggle ─────────────────────────────────
const togglePass = document.getElementById('togglePass');
if (togglePass) {
  togglePass.addEventListener('click', () => {
    const input = document.getElementById('password');
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    document.getElementById('eyeIcon').style.opacity = isPass ? '0.5' : '1';
  });
}

const encryptBtn = document.getElementById('encryptBtn');
if (encryptBtn) {
  encryptBtn.addEventListener('click', async () => {
    const passInput = document.getElementById('password');
    const pass = passInput.value.trim();
    if (!pass) {
      showToast('warn', '⚠', 'Ingresa una contraseña para encriptar.');
      return;
    }
    try {
      const res = await fetch('/api/encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();
      if (data.encrypted) {
        passInput.value = data.encrypted;
        showToast('success', '🔐', 'Contraseña encriptada. ¡Cópiala en tu .env!');
      }
    } catch (err) {
      showToast('error', '✖', 'Error al encriptar.');
    }
  });
}

// ── SSE Log Stream ──────────────────────────────────
const consoleBody = document.getElementById('consoleBody');
let sseConnected = false;

function appendLog(ts, msg, level) {
  if (level === 'ping') return;

  // Remove welcome message on first real log
  const welcome = consoleBody.querySelector('.console-welcome');
  if (welcome) welcome.remove();

  if (level === 'system' && (msg.startsWith('LINK_DOWNLOAD:') || msg.startsWith('LINK_DOWNLOAD_PDF:'))) {
    const isPdf = msg.startsWith('LINK_DOWNLOAD_PDF:');
    const filename = msg.split(':')[1];
    const linkLine = document.createElement('div');
    linkLine.className = 'log-line log-success log-download';
    linkLine.innerHTML = `
      <span class="log-ts">[SISTEMA]</span>
      <span class="log-msg">📥 Reporte ${isPdf ? 'PDF' : 'Excel'} listo: </span>
      <a href="/api/download/${filename}" class="download-link" download>Descargar ${isPdf ? 'PDF' : 'Excel'}</a>
    `;
    consoleBody.appendChild(linkLine);
  } else {
    const line = document.createElement('div');
    line.className = `log-line log-${level}`;
    line.innerHTML = `<span class="log-ts">[${ts}]</span><span class="log-msg">${escapeHtml(msg)}</span>`;
    consoleBody.appendChild(line);
  }
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startSSE() {
  const evtSource = new EventSource('/api/stream');
  sseConnected = true;
  const liveBadge = document.getElementById('liveBadge');
  if (liveBadge) liveBadge.style.opacity = '1';

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      appendLog(data.ts, data.msg, data.level);
    } catch { }
  };

  evtSource.onerror = () => {
    sseConnected = false;
    if (liveBadge) liveBadge.style.opacity = '0.4';
    evtSource.close();
    // Reconnect after 3s
    setTimeout(startSSE, 3000);
  };
}
startSSE();

// ── Status helpers ──────────────────────────────────
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

function setStatus(state, text) {
  if (statusDot) statusDot.className = `status-dot ${state}`;
  if (statusText) statusText.textContent = text;
}

// ── Daily description rendering ─────────────────────
function renderDailyDescFields() {
  if (!useDailyDesc.checked) {
    dailyDescFields.style.display = 'none';
    return;
  }

  const selectedCheckboxes = document.querySelectorAll('.day-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    dailyDescFields.innerHTML = '<p class="no-days-msg">Selecciona días arriba para ingresar descripciones.</p>';
  } else {
    let html = '<h3 class="daily-desc-title">Descripciones por día</h3>';
    selectedCheckboxes.forEach(cb => {
      const date = cb.value;
      const label = cb.parentElement.querySelector('.day-name').textContent;
      const displayDate = cb.parentElement.querySelector('.day-date').textContent;
      
      // Keep existing values if already typed
      const existingVal = document.querySelector(`.daily-textarea[data-date="${date}"]`)?.value || '';

      html += `
        <div class="form-group daily-desc-item">
          <label class="form-label">${label} (${displayDate})</label>
          <div class="input-wrapper textarea-wrapper">
            <span class="input-icon textarea-icon">✏️</span>
            <textarea class="form-input form-textarea daily-textarea" 
                      data-date="${date}" 
                      placeholder="Descripción para este día..." 
                      rows="2">${existingVal}</textarea>
          </div>
        </div>
      `;
    });
    dailyDescFields.innerHTML = html;
  }
  dailyDescFields.style.display = 'block';
}

useDailyDesc.addEventListener('change', () => {
  renderDailyDescFields();
  updateProjectFields();
});

// ── Multi Client Project Management ─────────────────
function createProjectRow(project = '', hours = 4, desc = '') {
  const row = document.createElement('div');
  row.className = 'project-item';
  row.innerHTML = `
    <div class="project-input-group">
      <span class="project-icon">📂</span>
      <input type="text" class="project-name-input" placeholder="Proyecto (ej. UCS)" value="${project}" required />
    </div>
    <div class="project-input-group hours-group">
      <span class="project-icon">⏱</span>
      <input type="number" class="project-hours-input" placeholder="Horas" value="${hours}" min="0.5" step="0.5" required />
    </div>
    <div class="project-input-group desc-group">
      <span class="project-icon">📝</span>
      <input type="text" class="project-desc-input" placeholder="Descripción" value="${desc}" required />
    </div>
    <button type="button" class="btn-remove-project" title="Eliminar">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  const isMulti = multiClientToggle.checked;
  row.querySelectorAll('input').forEach(input => {
    input.required = isMulti;
  });

  row.querySelector('.btn-remove-project').addEventListener('click', () => {
    row.remove();
    updateDistributedHours();
  });

  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', updateDistributedHours);
  });

  return row;
}

function updateDistributedHours() {
  let total = 0;
  document.querySelectorAll('.project-hours-input').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  distributedHoursEl.textContent = total;
  
  const targetHours = parseInt(hoursInput.value);
  multiClientTotal.classList.toggle('over-limit', total !== targetHours);
}

if (addProjectBtn) {
  addProjectBtn.addEventListener('click', () => {
    projectsList.appendChild(createProjectRow());
    updateDistributedHours();
  });
}
multiClientToggle.addEventListener('change', () => {
  if (multiClientToggle.checked && projectsList.children.length === 0) {
    // Add two default rows if empty
    projectsList.appendChild(createProjectRow('', 4, ''));
    projectsList.appendChild(createProjectRow('', 4, ''));
  }
  updateProjectFields();
  updateDistributedHours();
});

// ── Templates Management ────────────────────────────
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const loadTemplateBtn = document.getElementById('loadTemplateBtn');

if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener('click', async () => {
    const multiClientData = [];
    document.querySelectorAll('.project-item').forEach(row => {
      multiClientData.push({
        project: row.querySelector('.project-name-input').value.trim(),
        hours: parseFloat(row.querySelector('.project-hours-input').value),
        description: row.querySelector('.project-desc-input').value.trim()
      });
    });

    if (multiClientData.length === 0) {
      showToast('warn', '⚠', 'No hay proyectos para guardar.');
      return;
    }

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(multiClientData)
      });
      const data = await res.json();
      if (data.ok) showToast('success', '💾', 'Plantilla guardada correctamente.');
    } catch (err) {
      showToast('error', '✖', 'Error al guardar la plantilla.');
    }
  });
}

if (loadTemplateBtn) {
  loadTemplateBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      if (data && data.length > 0) {
        projectsList.innerHTML = '';
        data.forEach(item => {
          projectsList.appendChild(createProjectRow(item.project, item.hours, item.description));
        });
        updateDistributedHours();
        showToast('success', '📂', 'Plantilla cargada.');
      } else {
        showToast('info', 'ℹ', 'No hay plantillas guardadas.');
      }
    } catch (err) {
      showToast('error', '✖', 'Error al cargar la plantilla.');
    }
  });
}

// ── Tab Navigation ──────────────────────────────────
if (navRegister && navHistory) {
  navRegister.addEventListener('click', (e) => {
    e.preventDefault();
    showTab('register');
  });
  navHistory.addEventListener('click', (e) => {
    e.preventDefault();
    showTab('history');
    loadHistory();
  });
}

function showTab(tab) {
  registerSection.style.display = tab === 'register' ? 'block' : 'none';
  historySection.style.display = tab === 'history' ? 'block' : 'none';
  consoleSection.style.display = tab === 'register' ? 'block' : 'none';
  
  navRegister.classList.toggle('active', tab === 'register');
  navHistory.classList.toggle('active', tab === 'history');
}

// ── History Management ──────────────────────────────
async function loadHistory() {
  historyList.innerHTML = '<div class="history-empty">Cargando historial...</div>';
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    renderHistory(data);
  } catch (err) {
    historyList.innerHTML = '<div class="history-empty">Error al cargar el historial.</div>';
  }
}

function renderHistory(data) {
  if (!data || data.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No hay registros en el historial.</div>';
    return;
  }

  const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function isoWeek(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const diff = (d - jan4) / 86400000;
    return Math.ceil((diff + jan4.getDay() + 1) / 7);
  }

  function formatDate(isoDate) {
    const d = new Date(isoDate + 'T12:00:00');
    return `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${MONTH_NAMES[d.getMonth()]}`;
  }

  // Sort newest first and deduplicate by week (keep only most recent per week)
  const sorted = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const seenWeeks = new Set();
  const deduped = sorted.filter(entry => {
    const week = entry.dates && entry.dates.length > 0
      ? `${new Date(entry.dates[0]+'T12:00:00').getFullYear()}-W${isoWeek(entry.dates[0])}`
      : entry.timestamp;
    if (seenWeeks.has(week)) return false;
    seenWeeks.add(week);
    return true;
  });

  let html = '';
  deduped.forEach(entry => {
    const ts = new Date(entry.timestamp);
    const tsStr = ts.toLocaleString('es-PE', { hour12: false, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const isAuto = entry.source === 'auto';
    const sourceBadge = isAuto
      ? '<span class="hist-badge hist-badge-auto">⚡ Auto</span>'
      : '<span class="hist-badge hist-badge-manual">🖱 Manual</span>';

    // Week label
    const weekNum = entry.dates && entry.dates.length ? isoWeek(entry.dates[0]) : '?';
    const year = entry.dates && entry.dates.length ? new Date(entry.dates[0]+'T12:00:00').getFullYear() : '';

    // Day chips
    const daysHtml = (entry.dates || []).map(iso => {
      const d = new Date(iso + 'T12:00:00');
      const dayIdx = d.getDay();
      const isWeekend = dayIdx === 0 || dayIdx === 6;
      return `<span class="hist-day-chip ${isWeekend ? 'hist-day-weekend' : ''}">${formatDate(iso)}</span>`;
    }).join('');

    // Total hours
    const totalHours = (entry.dates || []).length * (entry.total_hours_daily || 8);

    // Details rows
    const details = entry.details || [];
    const detailsHtml = details.map(d => `
      <div class="hist-detail-row">
        <span class="hist-detail-project">${escapeHtml(d.project || '')}</span>
        <span class="hist-detail-hours">${d.hours}h/día</span>
        <span class="hist-detail-desc">${escapeHtml(d.description || '')}</span>
      </div>`).join('');

    html += `
      <div class="hist-card">
        <div class="hist-card-header">
          <div class="hist-week-info">
            <span class="hist-week-label">Semana ${weekNum} <span class="hist-year">${year}</span></span>
            <span class="hist-total-hours">${totalHours}h totales</span>
          </div>
          <div class="hist-card-meta">
            ${sourceBadge}
            <span class="hist-ts">${tsStr}</span>
          </div>
        </div>
        <div class="hist-days-row">${daysHtml}</div>
        <div class="hist-details-block">${detailsHtml}</div>
      </div>
    `;
  });

  historyList.innerHTML = html;
  updateStats(data);
}

let historyChart = null;

function updateStats(data) {
  if (!data || data.length === 0) return;

  const projectsMap = {};
  let totalHoursMonth = 0;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  data.forEach(entry => {
    const entryDate = new Date(entry.timestamp);
    const numDays = entry.dates.length;
    
    entry.details.forEach(d => {
      const h = d.hours * numDays;
      projectsMap[d.project] = (projectsMap[d.project] || 0) + h;
      
      if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
        totalHoursMonth += h;
      }
    });
  });

  // Update stat cards
  document.getElementById('statTotalMonth').textContent = `${totalHoursMonth}h`;
  
  const sortedProjects = Object.entries(projectsMap).sort((a, b) => b[1] - a[1]);
  if (sortedProjects.length > 0) {
    document.getElementById('statTopProject').textContent = sortedProjects[0][0];
  }

  // Render Chart
  const ctx = document.getElementById('historyChart').getContext('2d');
  if (historyChart) historyChart.destroy();

  historyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedProjects.map(p => p[0]),
      datasets: [{
        label: 'Total Horas por Proyecto',
        data: sortedProjects.map(p => p[1]),
        backgroundColor: 'rgba(99, 102, 241, 0.5)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8892b0' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#8892b0' }
        }
      }
    }
  });
}

if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener('click', loadHistory);
}

// ── Form submission ─────────────────────────────────
const form = document.getElementById('rapportForm');
const submitBtn = document.getElementById('submitBtn');
const btnIcon = document.getElementById('btnIcon');
const btnText = document.getElementById('btnText');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validateProjectFields()) return;

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const dates = [...document.querySelectorAll('.day-checkbox:checked')].map(cb => cb.value);
  const hours = parseInt(hoursInput.value);
  const project = document.getElementById('project').value.trim();
  const description = document.getElementById('description').value.trim();
  const exportFlag = document.getElementById('exportCheck').checked;
  const testEmailFlag = document.getElementById('sendTestEmailCheck').checked;
  const sendWebhookFlag = document.getElementById('sendWebhookCheck').checked;
  const weekNum = form.getAttribute('data-week');

  const isMultiClient = multiClientToggle.checked;
  const multiClientData = [];
  if (isMultiClient) {
    document.querySelectorAll('.project-item').forEach(row => {
      multiClientData.push({
        project: row.querySelector('.project-name-input').value.trim(),
        hours: parseFloat(row.querySelector('.project-hours-input').value),
        description: row.querySelector('.project-desc-input').value.trim()
      });
    });

    const totalDistributed = multiClientData.reduce((sum, item) => sum + item.hours, 0);
    if (totalDistributed !== hours) {
      showToast('warn', '⚠', `El total de horas repartidas (${totalDistributed}h) debe ser igual a las horas diarias (${hours}h).`);
      return;
    }
  }

  const dailyDescriptions = {};
  if (useDailyDesc.checked) {
    document.querySelectorAll('.daily-textarea').forEach(ta => {
      dailyDescriptions[ta.getAttribute('data-date')] = ta.value.trim();
    });
  }

  if (!username || !password) {
    showToast('warn', '⚠', 'Ingresa usuario y contraseña.');
    return;
  }
  if (dates.length === 0) {
    showToast('warn', '⚠', 'Selecciona al menos un día.');
    return;
  }

  // Disable button + show spinner
  submitBtn.disabled = true;
  btnIcon.innerHTML = '<div class="spinner"></div>';
  btnText.textContent = 'Registrando...';
  setStatus('running', 'Registrando...');

  try {
    const payload = { 
      username, 
      password, 
      dates, 
      hours, 
      export: exportFlag, 
      send_webhook: sendWebhookFlag,
      test_email: testEmailFlag,
      posid: useDefaultProject.checked ? null : project, 
      descr: useDefaultDesc.checked ? null : description, 
      daily_descriptions: useDailyDesc.checked ? dailyDescriptions : null,
      multi_client: isMultiClient ? multiClientData : null,
      week_number: weekNum 
    };

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ok) {
      showToast('success', '✔', data.message);
      setStatus('running', 'En progreso...');
      monitorCompletion();
    } else {
      showToast('error', '✖', data.error || 'Error al iniciar el registro.');
      setStatus('error', 'Error');
      resetButton();
    }
  } catch (err) {
    showToast('error', '✖', 'Error de conexión con el servidor.');
    setStatus('error', 'Sin conexión');
    resetButton();
  }
});

function monitorCompletion() {
  const poll = setInterval(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (!data.running) {
        clearInterval(poll);
        setStatus('success', 'Completado ✔');
        resetButton();
        showToast('success', '🏁', 'Proceso de registro finalizado.');
      }
    } catch { clearInterval(poll); resetButton(); }
  }, 2000);
}

function resetButton() {
  submitBtn.disabled = false;
  btnIcon.textContent = '▶';
  btnText.textContent = 'Registrar Horas Ahora';
}

// ── Clear logs ──────────────────────────────────────
const clearBtn = document.getElementById('clearLogsBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    consoleBody.innerHTML = '';
    appendLog(new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false }), 'Consola limpiada.', 'info');
  });
}

// ── Fetch status on load ────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.running) setStatus('idle', 'Listo');
  } catch { }
})();

// ── Toast system ────────────────────────────────────
function showToast(type, icon, message, duration = 5000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), duration);
}

// Global dismissToast for onclick
window.dismissToast = function(toast) {
  toast.classList.add('hide');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
};

function updateProjectFields() {
  const isMulti = multiClientToggle.checked;
  const showProject = !useDefaultProject.checked && !isMulti;
  const isDaily = useDailyDesc.checked && !isMulti;
  const showDesc = !useDefaultDesc.checked && !isDaily && !isMulti;
  
  // Hide other toggles if multi is on
  document.getElementById('defaultProjectRow').style.display = isMulti ? 'none' : 'flex';
  document.getElementById('dailyDescRow').style.display = isMulti ? 'none' : 'flex';
  defaultDescRow.style.display = (isDaily || isMulti) ? 'none' : 'flex';

  multiClientFields.style.display = isMulti ? 'block' : 'none';
  projectFieldGroup.classList.toggle('show', showProject);
  descFieldGroup.classList.toggle('show', showDesc);
  
  const anyCustom = showProject || showDesc || isDaily || isMulti;
  projectFields.classList.toggle('visible', anyCustom);
  projectToggleArea.classList.toggle('has-fields', anyCustom);

  projectInput.required = showProject;
  descInput.required = showDesc;

  // Fix: handle required for multi-client inputs to avoid "not focusable" error
  document.querySelectorAll('.project-name-input, .project-hours-input, .project-desc-input').forEach(el => {
    el.required = isMulti;
  });

  // Update target hours display in multi-client area
  targetHoursDisplay.forEach(el => el.textContent = hoursInput.value);
}

useDefaultProject.addEventListener('change', updateProjectFields);
useDefaultDesc.addEventListener('change', updateProjectFields);

// Remove error highlight on input
[projectInput, descInput].forEach(el => {
  if (el) el.addEventListener('input', () => el.classList.remove('input-error'));
});

// Init on load
updateProjectFields();

function validateProjectFields() {
  let valid = true;

  if (!useDefaultProject.checked && !projectInput.value.trim()) {
    projectInput.classList.add('input-error');
    projectInput.focus();
    showToast('warn', '⚠', 'El campo Proyecto es obligatorio.');
    valid = false;
  }

  if (!useDailyDesc.checked && !useDefaultDesc.checked && !descInput.value.trim()) {
    descInput.classList.add('input-error');
    if (valid) descInput.focus();
    showToast('warn', '⚠', 'El campo Descripción es obligatorio.');
    valid = false;
  }
  
  if (useDailyDesc.checked) {
    const textareas = document.querySelectorAll('.daily-textarea');
    textareas.forEach(ta => {
      if (!ta.value.trim()) {
        ta.classList.add('input-error');
        if (valid) ta.focus();
        showToast('warn', '⚠', 'Todas las descripciones diarias son obligatorias.');
        valid = false;
      }
    });
  }

  return valid;
}

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});

