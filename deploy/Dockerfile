FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS web-build
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server/deployment ./server/deployment
ARG MTX_DOMAIN
ARG MTX_BOT_USERNAME=TOKXTAPBOT
ENV MTX_DOMAIN=$MTX_DOMAIN VITE_TELEGRAM_BOT_USERNAME=$MTX_BOT_USERNAME VITE_API_BASE="" VITE_LEADERBOARD_WS=""
RUN pnpm build && node server/deployment/manifest.mjs

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "server/deployment/start.mjs", "serve"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/dist /srv
