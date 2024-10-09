FROM node:18-alpine
WORKDIR /app
COPY package*.json .
RUN apk add --no-cache curl
RUN npm install
RUN mkdir -p /app/dist && chmod -R 777 /app/dist
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm", "run", "dev"]
