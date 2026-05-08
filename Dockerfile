# LeadFlow Pro — production image for Cloud Run.
#
# Multi-stage so the final image only carries the built frontend and the
# server's runtime deps (no toolchain, no source). Smaller image = faster
# cold starts.

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Vite bakes VITE_* env vars into the bundle at build time, so they have to
# be present during `npm run build`. Pass them via --build-arg (or Cloud
# Build substitutions). They are field-key identifiers and the n8n base URL
# — not secrets; safe to inline into the public bundle.
ARG VITE_N8N_BASE_URL
ARG VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY
ARG VITE_PIPEDRIVE_PERSON_HEADLINE_KEY
ARG VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY
ARG VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY
ENV VITE_N8N_BASE_URL=$VITE_N8N_BASE_URL \
    VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY=$VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY \
    VITE_PIPEDRIVE_PERSON_HEADLINE_KEY=$VITE_PIPEDRIVE_PERSON_HEADLINE_KEY \
    VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY=$VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY \
    VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY=$VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY

# Install all deps (incl. devDependencies — vite is a devDependency).
COPY package*.json ./
RUN npm ci

# Build the Vite frontend into ./dist.
COPY . .
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Production-only deps.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App code + the built frontend from stage 1.
COPY server.js ./
COPY scripts ./scripts
COPY src ./src
COPY db ./db
COPY --from=build /app/dist ./dist

# Cloud Run sets PORT (defaults to 8080). Express reads process.env.PORT.
EXPOSE 8080

# Run as the built-in non-root `node` user.
USER node

CMD ["node", "server.js"]
