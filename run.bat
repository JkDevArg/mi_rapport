@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  Rapport Tool — Windows Launcher
REM  Requires: Docker Desktop running
REM  Opens: http://localhost:8080 in your default browser
REM ─────────────────────────────────────────────────────────────────────────────

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     RAPPORT HOURS REGISTRATION TOOL     ║
echo  ║        Seidor Intranet Automation        ║
echo  ╚══════════════════════════════════════════╝
echo.

REM ── Check Docker is running ───────────────────────────────────────────────
echo [1/3] Checking Docker...
docker info >NUL 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop and try again.
    pause
    exit /b 1
)
echo       Docker OK.

REM ── Build ─────────────────────────────────────────────────────────────────
echo.
echo [2/3] Building Docker image (first run may take a few minutes)...
docker-compose build
if errorlevel 1 (
    echo [ERROR] Build failed. Check the output above.
    pause
    exit /b 1
)

REM ── Start container in background ─────────────────────────────────────────
echo.
echo [3/3] Starting Rapport Tool...
docker-compose up -d
if errorlevel 1 (
    echo [ERROR] Failed to start container.
    pause
    exit /b 1
)

REM ── Wait a moment for Flask to boot ───────────────────────────────────────
echo       Waiting for server to start...
timeout /t 4 /nobreak >NUL

REM ── Open browser ──────────────────────────────────────────────────────────
echo.
echo  ✔  Rapport Tool is running at: http://localhost:8080
echo.
start http://localhost:8080

echo  Press any key to stop the container and exit.
pause >NUL
docker-compose down
echo  Container stopped.
pause
