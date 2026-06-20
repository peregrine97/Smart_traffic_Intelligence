# =============================================================================
# Smart Traffic Intelligence — Backend Dockerfile
# =============================================================================
# Build context: Smart_traffic_Intelligence/ (repo root)
# Run: docker build -f backend/Dockerfile -t sti-backend .
# The server MUST start from Smart_traffic_Intelligence/ so that
# `from backend.agents...` package imports resolve correctly.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies for numpy/scikit-learn/xgboost compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer-cached unless requirements change)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Install only runtime system libs (libgomp1 is required by XGBoost)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Set working directory to repo root so `backend.*` imports work
WORKDIR /app

# Copy the entire Smart_traffic_Intelligence directory into /app
# This preserves the package structure: backend/, frontend/ (not needed but harmless)
COPY . .

# Create a non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# The feedback file needs to be writable at runtime
RUN mkdir -p /app/backend && \
    touch /app/backend/feedback.jsonl && \
    chown -R appuser:appgroup /app

USER appuser

# Expose the API port
EXPOSE 8000

# Health check — Render uses this to determine service readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start uvicorn — note: must run from /app (which is Smart_traffic_Intelligence/)
# so that `backend` is a top-level package on sys.path
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--log-level", "info"]
