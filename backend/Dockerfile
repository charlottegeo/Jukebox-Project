FROM node:18-alpine
WORKDIR /app
COPY package*.json .
RUN apk add --no-cache curl
RUN npm install
RUN mkdir -p /app/dist && chown -R node:node /app && chmod -R 755 /app
COPY . .
USER node
EXPOSE 3001
CMD ["npm", "run", "dev"]
