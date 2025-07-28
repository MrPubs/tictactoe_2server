FROM node:20

# Create app directory
WORKDIR /app

# Copy only package files first for layer caching
COPY server/package*.json ./server/

# Install server dependencies
RUN cd server && npm install

# Copy everything needed for the server
COPY server/ ./server/
COPY game/ ./game/

# Set working directory to server where server.js lives
WORKDIR /app/server

# Start server
CMD ["node", "server.js"]
