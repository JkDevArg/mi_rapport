# 🕒 Rapport Automation Tool

Herramienta diseñada para automatizar el registro de horas en la plataforma **Rapport** (Seidor Intranet). Permite gestionar la carga horaria semanal de forma manual a través de una interfaz web o programar registros automáticos cada viernes, con integración a **Power Automate** mediante webhook.

---

## ✨ Características Principales

- **Registro Automatizado**: Utiliza **Playwright** para la navegación y autenticación, y **OData SAP API** para el registro directo de horas.
- **Interfaz Web Intuitiva**: Dashboard construido con **Flask** que permite:
  - Seleccionar días específicos para registrar.
  - Navegar entre semanas (actual, anterior, siguiente).
  - Visualizar logs en tiempo real mediante **Server-Sent Events (SSE)**.
- **Programador (Scheduler)**: Ejecución automática configurada para los viernes a las 20:00 (PET).
- **Exportación de Reportes**: Genera automáticamente un archivo Excel con las horas registradas.
- **Integración Webhook**: Envía el reporte Excel (codificado en Base64) a un endpoint de **Power Automate** al finalizar el proceso (opcional desde la UI, siempre activo en ejecución automática).
- **Modo Prueba de Correo**: Toggle en la UI para indicar si el envío es una prueba (`testEmail: true`) o producción real (`testEmail: false`).
- **Contenerizado**: Listo para ser desplegado con **Docker** y **docker-compose**.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12, Flask |
| Automatización | Playwright (Chromium) |
| Frontend | HTML5, Jinja2, CSS3 Vanilla (SSE) |
| Programación | APScheduler |
| Reportes | openpyxl |
| Integración | requests (HTTP webhook) |
| Despliegue | Docker, Docker Compose |

---

## 🚀 Instalación y Uso

### Requisitos Previos

- Python 3.12+ (si se corre localmente)
- Docker y Docker Compose (opcional, recomendado)

### Configuración del Entorno (`.env`)

Crea un archivo `.env` en el directorio raíz basado en `.env.example`:

```env
# Credenciales de Acceso a Seidor Intranet
NAME=JOAQUIN CENTURION
USERNAME=tu_usuario
PASSWORD=tu_contraseña

# Configuración de SAP/Rapport
PERNR=tu_numero_personal
POSID=codigo_de_posicion
DESCR=descripcion_predeterminada_de_tareas

# Correos (para el payload del webhook)
EMAIL_ADDRESS_SENDER=emisor@seidor.es
EMAIL_ADDRESS_RECIPIENT=receptor@seidor.com

# Webhook de Power Automate
WEBHOOK=https://...powerautomate.com/...

# Configuración SMTP (opcional, si se usa send_email directo)
SMTP_SERVER=servidor_smtp
SMTP_PORT=puerto_smtp
SMTP_USER=usuario_smtp
SMTP_PASS=password_smtp

# Puerto del servidor web
PORT=8080
```

### Opción 1: Ejecución con Docker (Recomendado)

```bash
docker-compose up -d --build
```

Accede a la aplicación en `http://localhost:8080`.

### Opción 2: Ejecución Local

```bash
pip install -r app/requirements.txt
playwright install chromium
python app/main.py
```

---

## 🔍 Funcionamiento del Registro

1. **Autenticación**: El sistema inicia sesión en la Intranet capturando tokens CSRF y SAP Passport.
2. **Caché de Sesión**: Las cookies se guardan localmente para acelerar futuros registros.
3. **Petición OData**: Por cada día seleccionado se envía un POST al servicio SAP.
4. **Post-Procesamiento**: Si se activa la exportación, se genera el Excel y se disparan las acciones configuradas (webhook, email de prueba).

---

## 🌐 Integración Webhook

Al completar el registro semanal, si la opción **Enviar Webhook** está activada (o en ejecución automática), se envía un `POST` al endpoint configurado en `WEBHOOK` con el siguiente payload:

```json
{
    "emailSender": "emisor@seidor.es",
    "emailRecepiter": "receptor@seidor.com",
    "fileName": "rapport_sem16_20260418_200000.xlsx",
    "fileData": "<base64>",
    "week": 16,
    "nameRapport": "JOAQUIN CENTURION",
    "testEmail": false
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `emailSender` | string | Emisor configurado en `.env` (`EMAIL_ADDRESS_SENDER`) |
| `emailRecepiter` | string | Destinatario(s) configurado(s) en `.env` (`EMAIL_ADDRESS_RECIPIENT`) |
| `fileName` | string | Nombre del archivo Excel generado |
| `fileData` | string | Contenido del Excel codificado en Base64 |
| `week` | integer | Número de semana ISO del reporte |
| `nameRapport` | string | Nombre completo del empleado (`NAME` en `.env`) |
| `testEmail` | boolean | `true` = prueba, `false` = envío real a los destinatarios |

### Comportamiento por modo de ejecución

| Modo | Webhook | `testEmail` |
|---|---|---|
| **Manual (UI)** | Solo si el toggle "🌐 Enviar Webhook" está activo | Según el toggle "🧪 Prueba de Correo" |
| **Automático (Scheduler, viernes 20:00 PET)** | Siempre activo | `false` (producción) |

---

## 🎛️ Opciones de la Interfaz Web

| Toggle | Por defecto | Descripción |
|---|---|---|
| Generar Reporte Excel | ✅ Activado | Genera el `.xlsx` con las horas registradas |
| 🧪 Prueba de Correo | ☐ Desactivado | Marca el webhook como prueba (`testEmail: true`) |
| 🌐 Enviar Webhook | ☐ Desactivado | Envía el reporte al endpoint de Power Automate |

> Si se desactiva **Generar Reporte Excel**, los toggles de prueba y webhook se deshabilitan automáticamente.

---

## 📁 Estructura del Proyecto

```
rapport/
├── app/
│   ├── main.py            # Servidor Flask, rutas API y lógica de registro
│   ├── rapport_client.py  # Cliente de automatización (Playwright + OData API)
│   ├── exporter.py        # Generación de Excel, envío email y webhook
│   ├── scheduler.py       # Tareas programadas (APScheduler)
│   ├── templates/         # Vistas HTML (Jinja2)
│   └── static/            # CSS y JavaScript del dashboard
├── logs/                  # Logs de ejecución
├── exports/               # Archivos Excel generados
├── .env                   # Variables de entorno (no subir al repo)
├── Dockerfile
└── docker-compose.yml
```

---

## 📈 Historial de Versiones

### v4.0 (Versión Actual)
- **Modo Multi-Cliente**:
  - Permite dividir las horas diarias entre múltiples proyectos.
  - Interfaz dinámica para añadir/eliminar proyectos con sus respectivas descripciones y horas.
  - Validación automática de que el total repartido coincida con las horas del día.
- **Historial de Registros**:
  - Nuevo archivo `logs/history.json` que registra cada operación.
  - Incluye marca de tiempo, fechas, proyectos, horas y si el registro fue manual o automático.
  - Endpoint `/api/history` para consultar los datos.
- **Mejoras en Excel**:
  - El reporte ahora refleja el desglose por proyecto en múltiples filas por día si se usa el modo multi-cliente.
  - Soporte para horas con decimales (ej. 4.5h).

### v3.0
- **Integración Webhook (Power Automate)**:
  - Envío automático del reporte Excel en Base64 al webhook configurado.
  - Payload completo con `emailSender`, `emailRecepiter`, `fileName`, `fileData`, `week`, `nameRapport` y `testEmail`.
  - Toggle independiente en la UI para activar el envío manual.
  - En ejecución automática (scheduler), el webhook siempre se envía en modo producción (`testEmail: false`).
- **Toggle "Prueba de Correo"**:
  - Reemplaza el antiguo toggle "Enviar por Correo".
  - Controla el campo `testEmail` del payload: `true` para pruebas, `false` para envío real.
- **Campo `nameRapport`**:
  - Nuevo campo en el payload del webhook con el nombre completo del empleado, leído desde `NAME` en `.env`.

### v2.0
- **Mejoras en Reportes**:
  - Personalización de Excel con cabecera corporativa (colores, nombre y semana).
  - Columna de **Proyecto** en el reporte.
  - Ajuste automático de anchos de columna.
- **Flujo de Trabajo**:
  - Separación de la opción "Generar Reporte" de las acciones de envío.
  - Descarga directa desde la consola web mediante ruta de API.
- **Estabilidad**:
  - Corrección de error crítico (TypeError) en streaming de logs.
  - Optimización de la caché de sesión.

### v1.0
- Versión inicial con registro automatizado vía Playwright y OData API.
- Interfaz web básica con navegación de semanas.
- Exportación y envío de correo unificados.

---

> [!IMPORTANT]
> Esta herramienta debe ser utilizada de acuerdo con las políticas de la empresa. Las credenciales y la URL del webhook deben ser protegidas y **nunca subidas al repositorio de código**. Asegúrate de que `.env` esté en `.gitignore`.
