FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache \
    curl \
    yt-dlp \
    python3 \
    py3-pip \
    ffmpeg
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY package*.json ./
RUN npm install
RUN mkdir -p /app/dist /app/downloads && chmod -R 777 /app/downloads /app/dist
COPY . .
RUN chown -R node:node /app
RUN pip3 install --no-cache-dir spotdl
USER node
EXPOSE 3001
CMD ["npm", "run", "dev"]
