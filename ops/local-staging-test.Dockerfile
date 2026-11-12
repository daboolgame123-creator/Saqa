FROM node:24-bookworm-slim AS node
FROM postgres:17-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY scripts ./scripts
COPY server ./server
COPY src ./src
USER postgres
ENV ALSQAYA_DISPOSABLE_STAGING=container-only
ENTRYPOINT ["node", "--import", "tsx", "server/tests/integration/localStagingAdmin.ts"]
