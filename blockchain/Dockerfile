FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN NODE_ENV=development npm install --legacy-peer-deps

COPY . .

# Pre-bundle the solc binary so the build works fully offline
RUN mkdir -p /root/.cache/hardhat-nodejs/compilers-v2/linux-amd64
COPY compilers/ /root/.cache/hardhat-nodejs/compilers-v2/linux-amd64/

RUN ./node_modules/.bin/hardhat compile

EXPOSE 8545
CMD ["./node_modules/.bin/hardhat", "node", "--hostname", "0.0.0.0", "--port", "8545"]
