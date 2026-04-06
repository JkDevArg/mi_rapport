# 🕒 Rapport Automation Tool

Herramienta diseñada para automatizar el registro de horas en la plataforma **Rapport** (Seidor Intranet). Permite gestionar la carga horaria semanal de forma manual a través de una interfaz web o programar registros automáticos cada viernes.

---

## ✨ Características Principales

- **Registro Automatizado**: Utiliza **Playwright** para la navegación y autenticación, y **OData SAP API** para el registro directo de horas.
- **Interfaz Web Intuitiva**: Dashboard construido con **Flask** que permite:
  - Seleccionar días específicos para registrar.
  - Navegar entre semanas (actual, anterior, siguiente).
  - Visualizar logs en tiempo real mediante **Server-Sent Events (SSE)**.
- **Programador (Scheduler)**: Ejecución automática configurada para los viernes a las 20:00 (PET).
- **Exportación de Reportes**: Genera automáticamente un archivo Excel con las horas registradas.
- **Notificaciones por Email**: Envía el reporte generado adjunto por correo electrónico al finalizar el proceso (opcional).
- **Contenerizado**: Listo para ser desplegado con **Docker** y **docker-compose**.

---

## 🛠️ Stack Tecnológico

- **Backend**: Python 3.12, Flask
- **Automatización**: Playwright (Chromium)
- **Base de Datos/Persistencia**: Archivos JSON para caché de sesión
- **Frontend**: HTML5, Jinja2, CSS3 Vanilla (con soporte SSE)
- **Programación**: APScheduler
- **Reportes**: openpyxl
- **Despliegue**: Docker, Docker Compose

---

## 🚀 Instalación y Uso

### Requisitos Previos

- Python 3.12+ (si se corre localmente)
- Docker y Docker Compose (opcional, recomendado)

### Configuración del Entorno (`.env`)

Crea un archivo `.env` en el directorio raíz basado en `.env.example`. Asegúrate de completar las siguientes variables:

```env
# Credenciales de Acceso
USERNAME=tu_usuario
PASSWORD=tu_contraseña

# Configuración de SAP/Rapport
PERNR=tu_numero_personal
POSID=codigo_de_posicion
DESCR=descripcion_predeterminada_de_tareas

# Configuración de Correo (SMTP)
EMAIL_ADDRESS_SENDER=emisor@ejemplo.com
EMAIL_ADDRESS_RECIPIENT=receptor@ejemplo.com
SMTP_SERVER=servidor_smtp
SMTP_PORT=puerto_smtp
SMTP_USER=usuario_smtp
SMTP_PASS=password_smtp

# Configuración General
PORT=8080
NAME=Tu Nombre Completo
```

### Opción 1: Ejecución con Docker (Recomendado)

1. Construye e inicia el contenedor:
   ```bash
   docker-compose up -d --build
   ```
2. Accede a la aplicación en `http://localhost:8080`.

### Opción 2: Ejecución Local

1. Instala las dependencias:
   ```bash
   pip install -r app/requirements.txt
   ```
2. Instala los navegadores de Playwright:
   ```bash
   playwright install chromium
   ```
3. Ejecuta la aplicación:
   ```bash
   python app/main.py
   ```

---

## 🔍 Funcionamiento del Registro

1. **Autenticación**: El sistema inicia una sesión en la Intranet capturando los tokens de seguridad (CSRF y SAP Passport).
2. **Caché de Sesión**: Las cookies se guardan localmente para acelerar registros futuros y evitar bloqueos por inicios de sesión repetitivos.
3. **Petición OData**: Por cada día seleccionado, se envía una petición POST estructurada al servicio de SAP para registrar las horas.
4. **Post-Procesamiento**: Si se solicita exportación, se genera el Excel y se dispara el envío de correo.

---

## 📁 Estructura del Proyecto

- `app/main.py`: Punto de entrada del servidor Flask y lógica de rutas.
- `app/rapport_client.py`: Cliente de automatización (Playwright + API).
- `app/exporter.py`: Lógica de generación de Excel y envío de correos.
- `app/scheduler.py`: Configuración de tareas programadas.
- `app/templates/`: Vistas HTML.
- `app/static/`: Archivos estáticos (CSS/JS).
- `logs/`: Directorio de registros y sesiones guardadas.

---

> [!IMPORTANT]
> Esta herramienta debe ser utilizada de acuerdo con las políticas de la empresa. Las credenciales deben ser protegidas y nunca subidas al repositorio de código.
