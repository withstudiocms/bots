FROM node:lts-alpine AS base
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run --filter=artemis build
RUN pnpm deploy --filter=artemis --prod /prod/artemis

FROM base AS runtime
COPY --from=build /prod/artemis /prod/artemis
WORKDIR /prod/artemis
EXPOSE 3000
CMD [ "node", "dist/main.js" ]
