# Neighbour Trust — common tasks.
# On Windows these are runnable one line at a time if you don't have make.

PY := .venv/Scripts/python.exe

.PHONY: help setup db migrate seed fetch api web test clean

help:
	@echo "setup    - create venv, install Python + web deps"
	@echo "db       - start Postgres+PostGIS (docker compose)"
	@echo "migrate  - apply infra/migrations to a running db"
	@echo "seed     - insert the Bengaluru + Gurugram localities"
	@echo "fetch    - run the air quality agent once"
	@echo "api      - run FastAPI on :8000"
	@echo "web      - run Next.js on :3000"
	@echo "test     - run the Python test suite"

setup:
	python -m venv .venv
	$(PY) -m pip install -r requirements.txt
	cd apps/web && npm install

db:
	docker compose -f infra/docker-compose.yml up -d
	@echo "Postgres on localhost:5433"

migrate:
	docker exec -i neighbour-trust-db psql -U neighbour -d neighbour_trust < infra/migrations/001_init.sql

seed:
	$(PY) -m agents.common.seed_localities

fetch:
	$(PY) -m agents.air_quality.run

api:
	$(PY) -m uvicorn apps.api.app.main:app --reload

web:
	cd apps/web && npm run dev

test:
	$(PY) -m pytest tests/ -q

clean:
	docker compose -f infra/docker-compose.yml down -v
