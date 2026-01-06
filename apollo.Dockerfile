FROM node:lts-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

FROM base AS build
ENV NODE_ENV=production
RUN apk add --no-cache py-setuptools python3 make g++
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run --filter=apollo build
RUN pnpm deploy --filter=apollo --prod /prod/apollo

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /prod/apollo /prod/apollo
WORKDIR /prod/apollo
EXPOSE 3000
CMD [ "node", "dist/index.js" ]
