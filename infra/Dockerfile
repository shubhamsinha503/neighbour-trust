# One image, two Railway services. The API and the scheduler share all their code
# — the same envelope types, the same db helpers, the same agent — so building
# them separately would mean keeping two Dockerfiles honest about one dependency
# set. They differ only in start command, set per-service in Railway.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# psycopg[binary] ships wheels, so no libpq-dev build chain is needed. Keeping
# the image slim matters here because Railway rebuilds on every push.
COPY requirements.txt ./
COPY packages/ ./packages/
RUN pip install --no-cache-dir -r requirements.txt

COPY agents/ ./agents/
COPY apps/api/ ./apps/api/
COPY infra/migrations/ ./infra/migrations/

# Run as a non-root user. The default was root, so a flaw in the process would
# have held root inside the container. The app only reads its own code and talks
# to Postgres over the network, so it needs no privileges and no write access to
# /app; an unprivileged user is strictly safer at no cost.
RUN useradd --system --no-create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Railway injects PORT; 8000 is the local default.
ENV PORT=8000
EXPOSE 8000

# Overridden by the scheduler service — see infra/DEPLOY.md.
CMD ["sh", "-c", "python -m uvicorn apps.api.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
