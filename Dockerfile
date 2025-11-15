FROM node:24-alpine

# Set working directory
WORKDIR /app

# Install tzdata to set timezone
RUN apk add --no-cache tzdata && cp /usr/share/zoneinfo/Asia/Kolkata /etc/localtime && echo "Asia/Kolkata" > /etc/timezone

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]
