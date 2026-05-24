FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget python3 make g++

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Compile contracts at build time
RUN npx hardhat compile

EXPOSE 8545
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0", "--port", "8545"]
