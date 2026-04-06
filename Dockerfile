# ─────────────────────────────────────────────────────────────────────────────
# Rapport Hours Registration Tool
# Python 3.12 + Flask Web UI + Playwright (Chromium) headless
# Access via browser at http://localhost:8080
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

LABEL maintainer="rapport-tool"
LABEL description="Automated weekly hour registration for Seidor Intranet Rapport"

# ── System dependencies for Playwright / Chromium ─────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    gnupg \
    # Chromium runtime deps
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libgbm1 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# ── App directory ──────────────────────────────────────────────────────────
WORKDIR /app

# ── Python deps (cached layer) ────────────────────────────────────────────
COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Install Playwright Chromium (skip install-deps, manually handled above) ──
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
# We skip install-deps because Debian Trixie renames some packages;
# all required libraries are already installed in the apt layer above.
RUN playwright install chromium

# ── Copy application source ───────────────────────────────────────────────
COPY app/ /app/

# ── Ensure logs dir exists ────────────────────────────────────────────────
RUN mkdir -p /app/logs

# ── Environment defaults ──────────────────────────────────────────────────
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV TZ=America/Lima
ENV PORT=8080

# ── Expose web port ───────────────────────────────────────────────────────
EXPOSE 8080

# ── Healthcheck ───────────────────────────────────────────────────────────
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/ || exit 1

# ── Entry point ───────────────────────────────────────────────────────────
CMD ["python", "main.py"]
