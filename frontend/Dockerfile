FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache curl
RUN npm install
RUN chown -R node:node /app && chmod -R 755 /app
COPY . .
USER node

EXPOSE 8080
CMD ["npm", "run", "dev"]