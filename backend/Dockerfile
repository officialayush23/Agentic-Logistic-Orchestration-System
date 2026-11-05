# DisruptionOps API — built from the REPO ROOT so the image can include
# supabase/seed.sql (main.py resolves it as <root>/supabase/seed.sql).
#   docker build -f backend/Dockerfile -t disruptionops-api .
#   docker run --env-file backend/.env -p 8000:8000 disruptionops-api
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend

# Dependencies first so code edits don't bust the pip layer.
COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY supabase/seed.sql /srv/supabase/seed.sql

# Never run as root.
RUN useradd --create-home --uid 10001 app && chown -R app:app /srv
USER app

EXPOSE 8000
# Render injects $PORT. One worker: the agent keeps per-process state and a
# single WebSocket hub, so more workers would split it.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
