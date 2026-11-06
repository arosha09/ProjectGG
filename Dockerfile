FROM node:20-alpine AS build
WORKDIR /app
COPY projectgg.backend/package*.json ./
RUN npm ci
COPY projectgg.backend/ .
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache python3 py3-pip && pip3 install --break-system-packages --no-cache-dir edge-tts
WORKDIR /app
COPY projectgg.backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]