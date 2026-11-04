# Container for the FastAPI service (apps/api), for Google Cloud Run or any
# container host. The API imports from agents/ and packages/schema, so the build
# context is the whole repo (this file lives at the repo root for that reason).
#
# Local build/run:
#   docker build -t nestra-api .
#   docker run -p 8080:8080 --env-file .env nestra-api
#
# Cloud Run picks this up automatically with `gcloud run deploy --source .`.

FROM python:3.12-slim

# Unbuffered logs so Cloud Run captures them live; no .pyc; quiet, cacheless pip.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first, for layer caching. packages/ is copied before the install
# because requirements.txt installs the shared schema in editable mode
# (-e ./packages/schema/python), so that path must already exist.
COPY requirements.txt ./
COPY packages/ ./packages/
RUN pip install -r requirements.txt

# Application code.
COPY apps/ ./apps/
COPY agents/ ./agents/

# Cloud Run sends traffic to $PORT (default 8080) and expects the server bound to
# 0.0.0.0. Shell form so $PORT expands at runtime.
ENV PORT=8080
CMD exec uvicorn apps.api.app.main:app --host 0.0.0.0 --port ${PORT}
