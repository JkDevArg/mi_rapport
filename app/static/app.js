/* ═══════════════════════════════════════════════════
   Rapport Tool — Frontend JavaScript
   Real-time SSE log streaming + Form handling
   ═══════════════════════════════════════════════════ */

// ── Peruvian Clock ──────────────────────────────────
function updateClock() {
  const now = new Date();
  const opts = { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  document.getElementById('peruvianClock').textContent = now.toLocaleTimeString('es-PE', opts);
}
updateClock();
setInterval(updateClock, 1000);

// ── Day pill toggles ────────────────────────────────
document.querySelectorAll('.day-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const cb = pill.querySelector('.day-checkbox');
    pill.classList.toggle('checked', cb.checked);
    updateHoursTotal();
  });
});

// ── Hours control ───────────────────────────────────
const hoursInput = document.getElementById('hours');
document.getElementById('hoursUp').addEventListener('click', () => {
  const v = parseInt(hoursInput.value);
  if (v < 12) { hoursInput.value = v + 1; updateHoursTotal(); }
});
document.getElementById('hoursDown').addEventListener('click', () => {
  const v = parseInt(hoursInput.value);
  if (v > 1) { hoursInput.value = v - 1; updateHoursTotal(); }
});

function updateHoursTotal() {
  const checkedDays = document.querySelectorAll('.day-checkbox:checked').length;
  const hours = parseInt(hoursInput.value);
  const total = checkedDays * hours;
  document.getElementById('hoursTotal').innerHTML = `Total semana: <strong>${total}h</strong>`;
}
updateHoursTotal();

// ── Password toggle ─────────────────────────────────
document.getElementById('togglePass').addEventListener('click', () => {
  const input = document.getElementById('password');
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  document.getElementById('eyeIcon').style.opacity = isPass ? '0.5' : '1';
});

// ── SSE Log Stream ──────────────────────────────────
const consoleBody = document.getElementById('consoleBody');
let sseConnected = false;

function appendLog(ts, msg, level) {
  if (level === 'ping') return;

  // Remove welcome message on first real log
  const welcome = consoleBody.querySelector('.console-welcome');
  if (welcome) welcome.remove();

  const line = document.createElement('div');
  line.className = `log-line log-${level}`;
  line.innerHTML = `<span class="log-ts">[${ts}]</span><span class="log-msg">${escapeHtml(msg)}</span>`;
  consoleBody.appendChild(line);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startSSE() {
  const evtSource = new EventSource('/api/stream');
  sseConnected = true;
  document.getElementById('liveBadge').style.opacity = '1';

  evtSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      appendLog(data.ts, data.msg, data.level);
    } catch { }
  };

  evtSource.onerror = () => {
    sseConnected = false;
    document.getElementById('liveBadge').style.opacity = '0.4';
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
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

// ── Form submission ─────────────────────────────────
const form = document.getElementById('rapportForm');
const submitBtn = document.getElementById('submitBtn');
const btnIcon = document.getElementById('btnIcon');
const btnText = document.getElementById('btnText');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const dates = [...document.querySelectorAll('.day-checkbox:checked')].map(cb => cb.value);
  const hours = parseInt(hoursInput.value);
  const exportFlag = document.getElementById('exportCheck').checked;
  const weekNum = form.getAttribute('data-week');

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
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, dates, hours, export: exportFlag, week_number: weekNum }),
    });
    const data = await res.json();

    if (data.ok) {
      showToast('success', '✔', data.message);
      setStatus('running', 'En progreso...');
      // Status will update via SSE logs
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
  // Poll /api/status until no longer running
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
document.getElementById('clearLogsBtn').addEventListener('click', () => {
  consoleBody.innerHTML = '';
  appendLog(new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false }), 'Consola limpiada.', 'info');
});

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

function dismissToast(toast) {
  toast.classList.add('hide');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

// ── Smooth nav scroll ───────────────────────────────
document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});
