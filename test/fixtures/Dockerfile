FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm ci --only=production

FROM base AS build
COPY . .
RUN npm run build

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

ARG BUILD_VERSION
ARG GIT_SHA

EXPOSE 3000
EXPOSE 9229

ENTRYPOINT ["node"]
CMD ["dist/index.js"]
