FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget

COPY package*.json ./
RUN npm install

COPY . .
RUN mkdir -p uploads

EXPOSE 5000
CMD ["node", "src/index.js"]
