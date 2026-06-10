# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

# ── Development (hot reload) ──────────────────────────────────────────────────
FROM base AS development

COPY Backend/requirements.txt .
RUN pip install -r requirements.txt

COPY Backend/ .
RUN mkdir -p static/uploads

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "src"]

# ── Production ────────────────────────────────────────────────────────────────
FROM base AS production

COPY Backend/requirements.txt .
RUN pip install -r requirements.txt

COPY Backend/ .
RUN mkdir -p static/uploads

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
