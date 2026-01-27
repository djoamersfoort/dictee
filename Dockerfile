FROM oven/bun:latest

WORKDIR /dictee

COPY package.json ./
COPY bun.lock ./
COPY app ./app
COPY static ./static

RUN bun install

CMD ["bun", "run", "./app/index.ts"]
