# Social Media Manager - Docker Image for Cloud Run
# Multi-stage build for smaller image size

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY manager/package*.json ./manager/
COPY background_engine/package*.json ./background_engine/
COPY post_generator/package*.json ./post_generator/
COPY auto_poster/package*.json ./auto_poster/

# Install all dependencies
RUN npm install --production
RUN cd manager && npm install --production
RUN cd background_engine && npm install --production
RUN cd post_generator && npm install --production
RUN cd auto_poster && npm install --production

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/manager/node_modules ./manager/node_modules
COPY --from=builder /app/background_engine/node_modules ./background_engine/node_modules
COPY --from=builder /app/post_generator/node_modules ./post_generator/node_modules
COPY --from=builder /app/auto_poster/node_modules ./auto_poster/node_modules

# Copy application code
COPY package*.json ./
COPY main.js ./
COPY manager ./manager
COPY background_engine ./background_engine
COPY post_generator ./post_generator
COPY auto_poster ./auto_poster
COPY shared ./shared

# Create necessary directories with proper permissions
RUN mkdir -p /app/shared/db && \
    mkdir -p /app/manager/uploads/posts && \
    mkdir -p /app/manager/uploads/logos && \
    mkdir -p /app/manager/uploads/images && \
    mkdir -p /app/post_generator/uploads/images && \
    mkdir -p /app/background_engine/backgrounds && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Cloud Run uses PORT env variable, we'll map it to our manager port
# All services run internally on their default ports

# Expose the main port (manager dashboard)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start all services
CMD ["node", "main.js"]
