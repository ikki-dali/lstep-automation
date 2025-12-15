# Node.js 18 LTS
FROM node:18-slim

# Install Chromium, build tools and Japanese fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-ipafont-mincho \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium (use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including native modules)
RUN npm ci && npm cache clean --force

# Copy app source
COPY . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/.browser-data /app/downloads /app/logs /app/config /app/data && \
    chmod -R 777 /app/.browser-data /app/downloads /app/logs /app/data

# Set default port
ENV PORT=8080

# Expose web UI port
EXPOSE 8080

# Start web server
CMD ["node", "src/web/server.js"]
