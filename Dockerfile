# Build stage for the integrated Twine editor (served at /twine/).
# Built in its own stage so its large dev-dependency tree never reaches the
# frontend or runtime images.
FROM node:20-alpine AS twine-builder
WORKDIR /twine

# The web build (vite + tsc) never uses Electron or Playwright, so skip their
# heavy postinstall binary downloads. The EBADENGINE warnings from Electron
# sub-packages are harmless here — they are not run.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HUSKY=0

# Install submodule deps from its lockfile
COPY twinejs-integrated/package.json twinejs-integrated/package-lock.json ./
RUN npm ci

# Build the web output (tsc && vite build -> dist/web, base /twine/)
COPY twinejs-integrated/ ./
RUN npm run build:web

# Build stage for Next.js frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY app ./app
COPY public ./public
COPY tsconfig.json next.config.ts eslint.config.mjs ./

# Copy backend data files referenced by the frontend build
COPY backend/data ./backend/data

# Bring in the prebuilt Twine editor so it ships under public/twine/
COPY --from=twine-builder /twine/dist/web ./public/twine

# Python is needed by the recipe-viewer build script (public/craft/build-recipe-viewer.py)
RUN apk add --no-cache python3

# Build Next.js app. Twine is already built and copied above, so use build:app
# (recipe + next build) rather than build:twine, which would rebuild it here.
RUN npm run build:app

# Python backend stage
FROM python:3.11-slim AS backend-builder
WORKDIR /backend

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend ./

# Final runtime stage
FROM python:3.11-slim
WORKDIR /app

# Node.js only — no npm needed, the standalone server below is started
# directly with `node server.js`.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Standalone output traces exactly which files/node_modules entries the
# server actually needs at runtime, instead of shipping the whole
# (dev-dependency-laden) node_modules tree. Static assets and public/ are
# excluded from the trace and must be copied in separately.
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static ./.next/static
COPY --from=frontend-builder /app/public ./public

# Copy Python backend and dependencies
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /backend ./backend

# Expose ports
EXPOSE 3000 8000

# Set environment variables (override in docker-compose or at runtime)
ENV NODE_ENV=production

# Start both services with a simple shell script
RUN printf '#!/bin/sh\nnode server.js &\npython -m uvicorn backend.main:app --host 0.0.0.0 --port 8000\nwait\n' > /entrypoint.sh && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
