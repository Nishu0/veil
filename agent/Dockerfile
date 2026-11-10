# Build context is the repo root: docker build -f agent/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /app/agent
COPY agent/package.json agent/package-lock.json ./
RUN npm ci
# opencode CLI for the LLM rationale. If it is unavailable the agent falls back to its deterministic policy.
RUN npm install -g opencode-ai || echo "opencode not installed; agent will use the deterministic fallback"
COPY agent ./
COPY shared /app/shared
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
