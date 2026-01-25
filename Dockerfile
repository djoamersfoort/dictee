FROM oven/bun:latest

COPY package.json ./
COPY bun.lock ./
COPY index.ts ./
COPY src ./src

RUN bun install

CMD ["bun", "run", "./index.ts"]
