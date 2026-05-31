# Multi-stage Dockerfile for Ledgr Frontend
# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm ci --only=dev

# Copy source files
COPY . .

# Build assets (CSS compilation)
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Install nginx for serving static files with caching headers
RUN apk add --no-cache nginx

# Copy built assets from builder
COPY --from=builder /app . .

# Create nginx config
RUN mkdir -p /etc/nginx/conf.d
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
