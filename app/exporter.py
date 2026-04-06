import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
import openpyxl
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def generate_excel(dates, hours_per_day, filename="/tmp/rapport_export.xlsx", description="Desarrollo", posid="N/A", week_number="N/A"):
    """
    Generates an Excel file with the registered hours.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Rapport Horas"

    # 1. First row: Personalized Title
    user_name = os.getenv("NAME") or os.getenv("EMAIL_ADDRESS_SENDER") or os.getenv("USERNAME") or "USUARIO"
    title_text = f"RAPPORT SEMANA {week_number} - {user_name.upper()}"
    
    ws.append([title_text])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=5)
    
    # Style title row
    title_cell = ws.cell(row=1, column=1)
    title_cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF", size=12)
    title_cell.fill = openpyxl.styles.PatternFill(start_color="6366F1", end_color="6366F1", fill_type="solid")
    title_cell.alignment = openpyxl.styles.Alignment(horizontal="center")

    # 2. Second row: Column Headers
    headers = ["Fecha", "Día", "Horas", "Proyecto", "Descripción"]
    ws.append(headers)

    # Style headers
    for cell in ws[2]:
        cell.font = openpyxl.styles.Font(bold=True)
        cell.fill = openpyxl.styles.PatternFill(start_color="CCE5FF", end_color="CCE5FF", fill_type="solid")

    day_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    total_hours = 0
    
    for date_str in sorted(dates):
        date_obj = datetime.fromisoformat(date_str)
        day_name = day_names[date_obj.weekday()]
        ws.append([date_obj.strftime("%Y-%m-%d"), day_name, hours_per_day, posid, description])
        total_hours += hours_per_day

    ws.append([])
    ws.append(["TOTAL", "", total_hours])
    
    # Adjust column widths slightly for better readability
    dims = {"A": 15, "B": 12, "C": 10, "D": 25, "E": 60}
    for col, value in dims.items():
        ws.column_dimensions[col].width = value

    # Save
    wb.save(filename)
    return filename, total_hours

def send_email(file_path, total_hours, week_number):
    """
    Sends the generated Excel file via email.
    """
    
    recipient = os.getenv("EMAIL_ADDRESS_RECIPIENT", "[EMAIL_ADDRESS]")
    sender = os.getenv("EMAIL_ADDRESS_SENDER", "[EMAIL_ADDRESS]")
    name = os.getenv("NAME", "JOAQUIN CENTURION")
    subject = f"Semana {week_number} - Horas registradas {total_hours} || {name}"
    
    msg = MIMEMultipart()
    msg['From'] = sender
    msg['To'] = recipient
    msg['Subject'] = subject

    body = f"""
Hola,

Se adjunta el registro de horas de la semana {week_number}.
Total de horas registradas: {total_hours}h.

Nombre y Apellido: {name}
    """
    msg.attach(MIMEText(body, 'plain'))

    # Attachment
    with open(file_path, "rb") as attachment:
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(attachment.read())
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f"attachment; filename= {os.path.basename(file_path)}")
        msg.attach(part)

    smtp_server = os.getenv("SMTP_SERVER", "localhost")
    smtp_port = int(os.getenv("SMTP_PORT", 1025)) # Default for local testing like MailHog or similar
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")

    try:
        if smtp_server == "localhost":
            # For testing with local dev mail servers
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.send_message(msg)
        else:
            # Production SMTP
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        logger.info(f"Email sent successfully to {recipient}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False
