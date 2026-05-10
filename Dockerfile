FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

ENV npm_config_prefer_offline=false
RUN npm config set git-tag-version false && \
    npm install --legacy-peer-deps --ignore-scripts && \
    npm rebuild

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
