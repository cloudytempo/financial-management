# One container: builds the Angular app and serves it from the Express API.
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npx ng build

FROM node:20-alpine
WORKDIR /app
COPY backend/package.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY --from=web /web/dist/app/browser ./public
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
