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
const sendEmailCheck = document.getElementById('sendEmailCheck');
const emailOption = document.getElementById('emailOption');

if (exportCheck && sendEmailCheck) {
  exportCheck.addEventListener('change', () => {
    sendEmailCheck.disabled = !exportCheck.checked;
    emailOption.style.opacity = exportCheck.checked ? '1' : '0.5';
    if (!exportCheck.checked) sendEmailCheck.checked = false;
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

// ── SSE Log Stream ──────────────────────────────────
const consoleBody = document.getElementById('consoleBody');
let sseConnected = false;

function appendLog(ts, msg, level) {
  if (level === 'ping') return;

  // Remove welcome message on first real log
  const welcome = consoleBody.querySelector('.console-welcome');
  if (welcome) welcome.remove();

  if (level === 'system' && msg.startsWith('LINK_DOWNLOAD:')) {
    const filename = msg.split(':')[1];
    const linkLine = document.createElement('div');
    linkLine.className = 'log-line log-success log-download';
    linkLine.innerHTML = `
      <span class="log-ts">[SISTEMA]</span>
      <span class="log-msg">📥 Reporte listo: </span>
      <a href="/api/download/${filename}" class="download-link" download>Descargar Excel</a>
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
  const sendEmailFlag = document.getElementById('sendEmailCheck').checked;
  const weekNum = form.getAttribute('data-week');

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
      send_email: sendEmailFlag,
      posid: useDefaultProject.checked ? null : project, 
      descr: useDefaultDesc.checked ? null : description, 
      daily_descriptions: useDailyDesc.checked ? dailyDescriptions : null,
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
  const showProject = !useDefaultProject.checked;
  const isDaily = useDailyDesc.checked;
  const showDesc = !useDefaultDesc.checked && !isDaily;
  
  // Hide default desc toggle if daily is on
  defaultDescRow.style.display = isDaily ? 'none' : 'flex';

  projectFieldGroup.classList.toggle('show', showProject);
  descFieldGroup.classList.toggle('show', showDesc);
  
  const anyCustom = showProject || showDesc || isDaily;
  projectFields.classList.toggle('visible', anyCustom);
  projectToggleArea.classList.toggle('has-fields', anyCustom);

  projectInput.required = showProject;
  descInput.required = showDesc;
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

