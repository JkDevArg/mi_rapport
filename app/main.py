"""
Rapport Hours Registration Tool — Flask Web Server
Serves the web UI and handles API requests for hour registration.
"""

import datetime
import json
import logging
import os
import queue
import sys
import threading
import time

import pytz
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request, stream_with_context

from rapport_client import RapportClient
from scheduler import RapportScheduler

# ── Setup ──────────────────────────────────────────────────────────────────
load_dotenv("/app/.env")
os.makedirs("/app/logs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/app/logs/rapport.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

PERU_TZ = pytz.timezone("America/Lima")

# ── Flask app ──────────────────────────────────────────────────────────────
app = Flask(__name__, template_folder="templates", static_folder="static")

# Global SSE event queue for real-time log streaming
_log_queue: queue.Queue = queue.Queue(maxsize=200)
# Registration lock to avoid parallel runs
_running_lock = threading.Lock()
_is_running = False


def push_log(message: str, level: str = "info"):
    """Push a log event to the SSE queue."""
    ts = datetime.datetime.now(tz=PERU_TZ).strftime("%H:%M:%S")
    event = json.dumps({"ts": ts, "msg": message, "level": level})
    try:
        _log_queue.put_nowait(event)
    except queue.Full:
        _log_queue.get_nowait()
        _log_queue.put_nowait(event)
    logger.info(f"[{level.upper()}] {message}")


from exporter import generate_excel, send_email

# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Main web UI page with week navigation."""
    offset = int(request.args.get("week_offset", 0))
    
    # Calculate dates based on offset
    today = datetime.date.today()
    # Find this week's Monday
    current_monday = today - datetime.timedelta(days=today.weekday())
    # Apply offset (weeks)
    target_monday = current_monday + datetime.timedelta(weeks=offset)
    
    week_dates = [(target_monday + datetime.timedelta(days=i)) for i in range(7)]
    week_number = target_monday.isocalendar()[1]

    day_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    days = [
        {
            "label": day_names[i],
            "iso": d.isoformat(),
            "display": d.strftime("%d/%m"),
            "checked": i < 5,
            "is_weekend": i >= 5,
        }
        for i, d in enumerate(week_dates)
    ]

    next_friday = _next_friday_8pm()
    return render_template(
        "index.html",
        days=days,
        username=os.getenv("USERNAME", ""),
        next_run=next_friday.strftime("%A %d/%m/%Y — 20:00 PET"),
        week_offset=offset,
        week_number=week_number,
        this_week=(offset == 0)
    )


@app.route("/api/register", methods=["POST"])
def api_register():
    """Start the registration process in a background thread."""
    global _is_running

    if _running_lock.locked():
        return jsonify({"ok": False, "error": "Ya hay un registro en curso. Espera a que termine."}), 409

    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    selected_dates = data.get("dates", [])
    hours = int(data.get("hours", 8))
    should_export = data.get("export", False)
    week_number = data.get("week_number", "N/A")

    if not username or not password:
        return jsonify({"ok": False, "error": "Usuario y contraseña son obligatorios."}), 400
    if not selected_dates:
        return jsonify({"ok": False, "error": "Selecciona al menos un día."}), 400

    dates = []
    for d in selected_dates:
        try:
            dates.append(datetime.date.fromisoformat(d))
        except ValueError:
            return jsonify({"ok": False, "error": f"Fecha inválida: {d}"}), 400

    thread = threading.Thread(
        target=_run_registration_bg,
        args=(username, password, sorted(dates), hours, should_export, week_number),
        daemon=True,
    )
    thread.start()
    return jsonify({"ok": True, "message": f"Registro iniciado para {len(dates)} día(s)."})


@app.route("/api/stream")
def api_stream():
    """SSE endpoint: streams log events to the browser in real-time."""

    def event_generator():
        push_log("Conectado al stream de eventos.", "info")
        while True:
            try:
                event = _log_queue.get(timeout=30)
                yield f"data: {event}\n\n"
            except queue.Empty:
                # Heartbeat to keep connection alive
                yield "data: {\"ts\":\"\",\"msg\":\"ping\",\"level\":\"ping\"}\n\n"

    return Response(
        stream_with_context(event_generator()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/status")
def api_status():
    """Return current scheduler status and next run time."""
    next_run = scheduler.get_next_run()
    return jsonify({
        "running": _running_lock.locked(),
        "next_run": next_run.strftime("%A %d/%m/%Y %H:%M %Z") if next_run else "N/A",
    })


@app.route("/api/logs")
def api_logs():
    """Return the last N lines of the log file."""
    log_path = "/app/logs/rapport.log"
    lines = []
    if os.path.exists(log_path):
        with open(log_path, encoding="utf-8") as f:
            lines = f.readlines()[-100:]
    return jsonify({"lines": [l.rstrip() for l in lines]})


# ── Registration logic ─────────────────────────────────────────────────────

def _run_registration_bg(username: str, password: str, dates: list, hours: int, should_export: bool = False, week_number: str = "N/A"):
    """Run hour registration in a background thread, streaming progress via SSE."""
    global _is_running
    with _running_lock:
        client = RapportClient(username=username, password=password, headless=True)
        try:
            push_log(f"🔐 Autenticando como {username}...", "info")
            client.login()
            push_log("✔ Login exitoso.", "success")

            success_count = 0
            registered_dates = []
            for date in dates:
                push_log(f"📅 Registrando {date.strftime('%A %d/%m/%Y')} — {hours}h...", "info")
                ok = client.register_day(date=date, hours=hours)
                if ok:
                    push_log(f"  ✔ {date.strftime('%d/%m/%Y')} registrado correctamente.", "success")
                    success_count += 1
                    registered_dates.append(date.isoformat())
                else:
                    push_log(f"  ✖ Error al registrar {date.strftime('%d/%m/%Y')}.", "error")

            if success_count > 0 and should_export:
                push_log(f"📊 Generando Excel para la semana {week_number}...", "info")
                excel_file, total_h = generate_excel(registered_dates, hours)
                push_log(f"📧 Enviando correo con el reporte ({total_h}h)...", "info")
                email_ok = send_email(excel_file, total_h, week_number)
                email = os.getenv("EMAIL_ADDRESS_RECIPIENT", "[EMAIL_ADDRESS]")
                if email_ok:
                    push_log(f"✔ Reporte enviado a {email}", "success")
                else:
                    push_log(f"✖ Error enviando el correo.", "error")

            push_log(
                f"🏁 Proceso finalizado: {success_count}/{len(dates)} días registrados.",
                "success" if success_count == len(dates) else "warn",
            )
        except Exception as exc:
            push_log(f"✖ Error inesperado: {exc}", "error")
        finally:
            client.close()


def _auto_register():
    """Triggered automatically by the scheduler every Friday 20:00 PET."""
    push_log("⚡ Ejecución automática del scheduler (viernes 20:00 PET).", "warn")
    username = os.getenv("USERNAME", "").strip()
    password = os.getenv("PASSWORD", "").strip()
    if not username or not password:
        push_log("✖ No hay credenciales en .env para la ejecución automática.", "error")
        return

    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    dates = [(monday + datetime.timedelta(days=i)) for i in range(5)]  # Mon–Fri
    _run_registration_bg(username, password, dates, 8)


def _next_friday_8pm() -> datetime.datetime:
    now = datetime.datetime.now(tz=PERU_TZ)
    days_ahead = 4 - now.weekday()
    if days_ahead < 0 or (days_ahead == 0 and now.hour >= 20):
        days_ahead += 7
    nf = now + datetime.timedelta(days=days_ahead)
    return nf.replace(hour=20, minute=0, second=0, microsecond=0)


# ── Scheduler ──────────────────────────────────────────────────────────────
scheduler = RapportScheduler(callback=_auto_register)
scheduler.start()
push_log("🕐 Scheduler iniciado — se ejecutará cada viernes a las 20:00 PET.", "info")


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting Rapport web server on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
