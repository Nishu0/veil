# Build context is the repo root: docker build -f web/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/web
COPY --from=build /app/web ./
# ABIs and deployment addresses; /app/.env (keys, network) is mounted at run time
COPY shared /app/shared
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
