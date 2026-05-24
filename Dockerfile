FROM node:20-alpine AS build
WORKDIR /app
COPY projectgg.backend/package*.json ./
RUN npm ci
COPY projectgg.backend/ ./
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY projectgg.backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
