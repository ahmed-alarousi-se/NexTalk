# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

WORKDIR /app

# ── Development (Vite dev server) ─────────────────────────────────────────────
FROM base AS development

COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY Frontend/ .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ── Build (production assets + SSR server) ────────────────────────────────────
FROM base AS build

COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY Frontend/ .

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_API_URL

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Production (Node SSR server via srvx) ─────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production \
    HOST=0.0.0.0

COPY Frontend/package.json Frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev

COPY --from=build /app/dist ./dist

# Railway injects PORT at runtime; srvx reads PORT and HOST automatically.
EXPOSE 3000

CMD ["npm", "run", "start"]
