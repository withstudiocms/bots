FROM node:lts-alpine AS base
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
RUN apk add --no-cache py-setuptools python3 make g++

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile
## TODO: Uncomment when apollo has a build step
# RUN pnpm run --filter=apollo build 
RUN pnpm deploy --filter=apollo --prod /prod/apollo

FROM base AS runtime
COPY --from=build /prod/apollo /prod/apollo
WORKDIR /prod/apollo
EXPOSE 3000
CMD [ "pnpm", "exec", "tsx", "./src/index.ts" ]
