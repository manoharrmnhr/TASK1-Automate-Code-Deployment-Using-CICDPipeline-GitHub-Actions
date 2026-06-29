# ---- Base image ----
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies first (better layer caching: deps only re-install if package*.json changes)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Drop root privileges (security best practice — image already ships a non-root 'node' user)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
