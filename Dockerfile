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
COPY lib ./lib
COPY tsconfig.json next.config.ts eslint.config.mjs ./

# Build Next.js app
RUN npm run build

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

# Install Node.js
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Copy built Next.js from frontend-builder
COPY --from=frontend-builder /app/.next ./.next
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/public ./public
COPY --from=frontend-builder /app/package*.json ./
COPY --from=frontend-builder /app/next.config.ts ./

# Copy Python backend and dependencies
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /backend ./backend

# Expose ports
EXPOSE 3000 8000

# Set environment variables (override in docker-compose or at runtime)
ENV NODE_ENV=production

# Start both services with a simple shell script
RUN printf '#!/bin/sh\nnpm start &\npython -m uvicorn backend.main:app --host 0.0.0.0 --port 8000\nwait\n' > /entrypoint.sh && chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
