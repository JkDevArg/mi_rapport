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
load_dotenv() # Carga .env local o variables de entorno del sistema
LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOGS_DIR, exist_ok=True)
log_file = os.path.join(LOGS_DIR, "rapport.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
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


from cryptography.fernet import Fernet
import base64

def get_crypto_key():
    key_file = os.path.join(LOGS_DIR, ".key")
    if not os.path.exists(key_file):
        key = Fernet.generate_key()
        with open(key_file, "wb") as f:
            f.write(key)
    else:
        with open(key_file, "rb") as f:
            key = f.read()
    return key

def encrypt_password(password: str) -> str:
    f = Fernet(get_crypto_key())
    return f.encrypt(password.encode()).decode()

def decrypt_password(encrypted_password: str) -> str:
    try:
        f = Fernet(get_crypto_key())
        return f.decrypt(encrypted_password.encode()).decode()
    except:
        return encrypted_password # Fallback if not encrypted


@app.route("/api/encrypt", methods=["POST"])
def api_encrypt():
    """Encrypt a password and return it."""
    data = request.get_json()
    password = data.get("password")
    if not password:
        return jsonify({"error": "No password"}), 400
    return jsonify({"encrypted": encrypt_password(password)})


def log_history(dates: list, hours: float, details: list, source: str = "manual"):
    """Save registration history to a JSON file, deduplicating by week."""
    history_file = os.path.join(LOGS_DIR, "history.json")
    try:
        if os.path.exists(history_file):
            with open(history_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        else:
            history = []

        # Normalize incoming dates to ISO strings
        new_dates_set = set(
            d.isoformat() if isinstance(d, datetime.date) else d for d in dates
        )

        # Compute ISO week key for the new entry (e.g. "2026-W17")
        def _week_key(iso_str):
            d = datetime.date.fromisoformat(iso_str)
            y, w, _ = d.isocalendar()
            return f"{y}-W{w:02d}"

        new_week_keys = {_week_key(d) for d in new_dates_set}

        # Remove any existing entry that shares at least one week with the new entry
        history = [
            e for e in history
            if not new_week_keys.intersection(
                {_week_key(dt) for dt in e.get("dates", [])}
            )
        ]

        entry = {
            "timestamp": datetime.datetime.now(tz=PERU_TZ).isoformat(),
            "dates": sorted(new_dates_set),
            "total_hours_daily": hours,
            "details": details,
            "source": source,
        }
        history.append(entry)

        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error logging history: {e}")


from exporter import generate_excel, generate_pdf, send_email, send_webhook

# ── Paths ──────────────────────────────────────────────────────────────────
EXPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)

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
    should_send_email = data.get("send_email", False)
    should_send_webhook = data.get("send_webhook", False)
    test_email = data.get("test_email", False)
    week_number = data.get("week_number", "N/A")

    name = (data.get("name") or os.getenv("NAME", "")).strip()
    pernr = (data.get("pernr") or os.getenv("PERNR", "")).strip()
    password = (data.get("password") or os.getenv("PASSWORD", "")).strip()
    password = decrypt_password(password)
    posid = (data.get("posid") or os.getenv("POSID", "")).strip()
    descr = (data.get("descr") or os.getenv("DESCR", "")).strip()
    daily_descriptions = data.get("daily_descriptions")
    multi_client = data.get("multi_client") # List of {project, hours, description}

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
        args=(name, username, password, sorted(dates), hours, should_export, should_send_email, week_number, pernr, posid, descr, daily_descriptions, should_send_webhook, test_email, multi_client),
        daemon=True,
    )
    thread.start()
    return jsonify({"ok": True, "message": f"Registro iniciado para {len(dates)} día(s)."})


@app.route("/api/stream")
def api_stream():
    """Real-time log streaming using Server-Sent Events."""
    def event_stream():
        # Clean backlog to avoid old logs on fresh connect
        while not _log_queue.empty():
            _log_queue.get_nowait()
        
        # Wait for and yield logs from the global queue
        while True:
            try:
                event = _log_queue.get(timeout=20)
                yield f"data: {event}\n\n"
            except queue.Empty:
                # Keep-alive ping every 20s to avoid timeouts
                yield "data: {\"level\": \"ping\"}\n\n"
            except Exception:
                break
    
    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

# ── Registration logic ─────────────────────────────────────────────────────

def _run_registration_bg(name: str, username: str, password: str, dates: list, hours: int, 
                         should_export: bool = False, should_send_email: bool = False,
                         week_number: str = "N/A", 
                         pernr: str = None, posid: str = None, descr: str = None,
                         daily_descriptions: dict = None,
                         should_send_webhook: bool = False,
                         test_email: bool = False,
                         multi_client: list = None,
                         source: str = "manual"):
    """Run hour registration in a background thread, streaming progress via SSE."""
    global _is_running
    with _running_lock:
        client = RapportClient(
            username=username, 
            password=password, 
            headless=True,
            pernr=pernr,
            posid=posid,
            descr=descr
        )
        try:
            display_name = name or username
            push_log(f"🔐 Autenticando como {display_name}...", "info")
            client.login()
            push_log("✔ Login exitoso.", "success")

            success_count = 0
            registered_dates = []
            for date in dates:
                date_iso = date.isoformat()
                
                if multi_client:
                    push_log(f"📅 Registrando {date.strftime('%A %d/%m/%Y')} (Modo Multi-Cliente)...", "info")
                    for entry in multi_client:
                        p_hours = entry.get("hours", 0)
                        p_posid = entry.get("project") or posid
                        p_descr = entry.get("description") or descr
                        
                        push_log(f"  🔹 {p_posid}: {p_hours}h — {p_descr}", "info")
                        client.register_day(date=date, hours=p_hours, description=p_descr, posid=p_posid)
                    
                    push_log(f"  ✔ {date.strftime('%d/%m/%Y')} completado.", "success")
                    success_count += 1
                    registered_dates.append(date.isoformat())
                else:
                    # Get daily description if available
                    day_descr = (daily_descriptions or {}).get(date_iso) or descr
                    
                    push_log(f"📅 Registrando {date.strftime('%A %d/%m/%Y')} — {hours}h...", "info")
                    ok = client.register_day(date=date, hours=hours, description=day_descr)
                    if ok:
                        push_log(f"  ✔ {date.strftime('%d/%m/%Y')} registrado correctamente.", "success")
                        success_count += 1
                        registered_dates.append(date.isoformat())
                    else:
                        push_log(f"  ✖ Error al registrar {date.strftime('%d/%m/%Y')}.", "error")

            if success_count > 0:
                # Log history
                history_details = multi_client if multi_client else [{"project": posid, "hours": hours, "description": descr}]
                log_history(dates, hours, history_details, source=source)

                if should_export:
                    push_log(f"📊 Generando reportes para la semana {week_number}...", "info")
                    excel_filename = os.path.join(EXPORTS_DIR, f"Rapport_{week_number}_{name.replace(' ', '_')}.xlsx")
                    pdf_filename = os.path.join(EXPORTS_DIR, f"Rapport_{week_number}_{name.replace(' ', '_')}.pdf")
                    
                    generate_excel(registered_dates, hours, excel_filename, descr, posid, week_number, multi_client)
                    generate_pdf(registered_dates, hours, pdf_filename, descr, posid, week_number, multi_client)
                    push_log(f"📄 Reportes generados: Excel y PDF.", "info")
                    push_log(f"LINK_DOWNLOAD:{os.path.basename(excel_filename)}", "system")
                    push_log(f"LINK_DOWNLOAD_PDF:{os.path.basename(pdf_filename)}", "system")

                    if should_send_email:
                        push_log(f"📧 Enviando correo con el reporte...", "info")
                        email_ok = send_email(excel_filename, hours, week_number)
                        email = os.getenv("EMAIL_ADDRESS_RECIPIENT", "[EMAIL_ADDRESS]")
                        if email_ok:
                            push_log(f"✔ Reporte enviado a {email}", "success")
                        else:
                            push_log(f"✖ Error enviando el correo.", "error")

                    if should_send_webhook:
                        push_log(f"🌐 Enviando reporte al webhook (semana {week_number})...", "info")
                        webhook_ok = send_webhook(excel_filename, week_number, name=name, test_email=test_email)
                        if webhook_ok:
                            push_log(f"✔ Webhook entregado correctamente.", "success")
                        else:
                            push_log(f"✖ Error al enviar el webhook.", "error")

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
    name = os.getenv("NAME", "").strip()
    username = os.getenv("USERNAME", "").strip()
    password = os.getenv("PASSWORD", "").strip()
    password = decrypt_password(password)
    pernr = os.getenv("PERNR", "").strip()
    posid = os.getenv("POSID", "").strip()
    descr = os.getenv("DESCR", "").strip()
    should_export = True # Default for auto-runs usually

    if not username or not password:
        push_log("✖ No hay credenciales en .env para la ejecución automática.", "error")
        return

    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    dates = []
    for i in range(5): # Mon-Fri
        d = monday + datetime.timedelta(days=i)
        if not is_holiday(d):
            dates.append(d)
        else:
            push_log(f"🌴 {d.strftime('%d/%m')} es feriado, saltando registro automático.", "warn")

    if not dates:
        push_log("🏝 Toda la semana son vacaciones o feriados. Nada que registrar.", "success")
        return

    week_number = str(today.isocalendar()[1])
    
    _run_registration_bg(
        name=name, 
        username=username, 
        password=password, 
        dates=dates,
        hours=8, 
        should_export=should_export, 
        week_number=week_number,
        pernr=pernr,
        posid=posid,
        descr=descr,
        should_send_webhook=True,   # Always deliver webhook on auto weekly run
        test_email=True,            # Production: send to real recipients
        source="auto"
    )


def _next_friday_8pm() -> datetime.datetime:
    now = datetime.datetime.now(tz=PERU_TZ)
    days_ahead = 4 - now.weekday()
    if days_ahead < 0 or (days_ahead == 0 and now.hour >= 20):
        days_ahead += 7
    nf = now + datetime.timedelta(days=days_ahead)
    return nf.replace(hour=20, minute=0, second=0, microsecond=0)


from flask import send_from_directory

@app.route("/api/download/<filename>")
def download_file(filename):
    """Download a generated Excel report."""
    exports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "exports")
    return send_from_directory(exports_dir, filename, as_attachment=True)


@app.route("/api/status")
def api_status():
    """Return the current registration status."""
    return jsonify({"running": _running_lock.locked()})


@app.route("/api/history")
def api_history():
    """Return the registration history from the JSON file."""
    history_file = os.path.join(LOGS_DIR, "history.json")
    if not os.path.exists(history_file):
        return jsonify([])
    try:
        with open(history_file, "r", encoding="utf-8") as f:
            history = json.load(f)
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/templates", methods=["GET", "POST"])
def api_templates():
    """Save or load registration templates."""
    templates_file = os.path.join(LOGS_DIR, "templates.json")
    if request.method == "POST":
        try:
            data = request.get_json()
            with open(templates_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500
    else:
        if not os.path.exists(templates_file):
            return jsonify([])
        try:
            with open(templates_file, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify([])


def is_holiday(date: datetime.date) -> bool:
    """Check if a date is a holiday in Peru (simplified list)."""
    # Simplified list for 2026/General Peru
    holidays = [
        (1, 1),   # Año Nuevo
        (4, 2),   # Jueves Santo
        (4, 3),   # Viernes Santo
        (5, 1),   # Día del Trabajo
        (6, 29),  # San Pedro y San Pablo
        (7, 28),  # Fiestas Patrias
        (7, 29),  # Fiestas Patrias
        (8, 6),   # Batalla de Junín
        (8, 30),  # Santa Rosa de Lima
        (10, 8),  # Combate de Angamos
        (11, 1),  # Todos los Santos
        (12, 8),  # Inmaculada Concepción
        (12, 9),  # Batalla de Ayacucho
        (12, 25), # Navidad
    ]
    return (date.month, date.day) in holidays


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Iniciar scheduler solo cuando se corre el servidor web
    scheduler = RapportScheduler(callback=_auto_register)
    scheduler.start()
    push_log("🕐 Scheduler iniciado — se ejecutará cada viernes a las 20:00 PET.", "info")

    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting Rapport web server on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
