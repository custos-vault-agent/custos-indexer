FROM node:24.3.0-slim

# psql dumps and restores the initial effects cache.
# --no-install-recommends and the list cleanup keep the image small.
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /envio-indexer

# npm, because package-lock.json is what this repository commits.
COPY ./package.json ./package-lock.json ./
RUN npm ci

# Codegen reads these three, so they come before the rest of the source: an edit
# to a handler then reuses the cached install and the cached codegen inputs.
COPY ./config.yaml ./config.yaml
COPY ./schema.graphql ./schema.graphql
COPY ./abis ./abis

RUN npm run codegen

COPY ./ ./

# `npm start` runs the `start` script, which is `envio start`. Calling the binary
# through the package manager directly does not work.
CMD ["npm", "run", "start"]
