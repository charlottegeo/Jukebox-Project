FROM node:18-alpine as build
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
COPY . .
RUN npm run build
RUN pip3 install --no-cache-dir spotdl

FROM nginx:alpine
RUN apk add --no-cache \
    curl \
    yt-dlp \
    python3 \
    py3-pip \
    ffmpeg
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install --no-cache-dir spotdl

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/downloads /app/downloads
RUN mkdir -p /app/downloads && chmod -R 777 /app/downloads

COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
