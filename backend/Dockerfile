FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache curl yt-dlp
COPY package*.json ./
RUN apk add --no-cache curl
RUN npm install
RUN mkdir -p /app/dist /app/downloads && chmod -R 777 /app/downloads /app/dist
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm", "run", "dev"]
