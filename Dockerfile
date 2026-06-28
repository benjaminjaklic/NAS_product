# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React frontend
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# Output lands in /app/app/static/react (see vite.config.js outDir)

# ---------------------------------------------------------------------------
# Stage 2 — Python runtime
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# libmagic1 is needed by python-magic; build tools kept minimal
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Copy the built frontend from stage 1
COPY --from=frontend /app/app/static/react ./app/static/react

# Create runtime directories
RUN mkdir -p files/users files/shared files/system files/tmp logs instance

EXPOSE 5000

# gunicorn imports the module-level `app` from run.py.
# --timeout 3600 supports very large uploads (matches Config.REQUEST_TIMEOUT).
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "3600", "run:app"]
