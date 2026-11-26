# EmperorsList, self-hosted: the app plus the live-game relay and the move-to-new-address drop-box.
#   docker build -t emperorslist .
#   docker run -p 8080:8080 -v emperorslist-data:/data emperorslist
# No game data is baked in or served: every device still downloads it from the data source it is set to.

FROM node:24.22.3-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm ci --prefix server --no-audit --no-fund
# "/" unless served under a sub-path. VITE_RELAY_URL makes live games go through this server.
ARG BASE_PATH=/
ARG VITE_RELAY_URL=/relay
# Stratagems, Core Rules and mission text are read from the GitHub Pages copy, so this server never hosts rules text.
ARG VITE_EXTRAS_URL=https://elvaragust.github.io/EmperorsList/wahapedia/
ENV BASE_PATH=$BASE_PATH VITE_RELAY_URL=$VITE_RELAY_URL VITE_EXTRAS_URL=$VITE_EXTRAS_URL
RUN npm test && npm run build

FROM node:24.22.3-alpine
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir -p /data && chown node:node /data
COPY server/server.mjs ./
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/srv/dist DATA_DIR=/data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "server.mjs"]
