FROM node:18-alpine
WORKDIR /app
COPY . .
RUN apk add --no-cache curl
RUN npm install
EXPOSE 3001
CMD ["npm", "run", "dev"]
