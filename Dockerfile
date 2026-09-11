# Serveur de match Ricochet (Phase 3). Image unique, deux entrées possibles :
#   - web  : sert le build statique Vite
#   - match: serveur WebSocket autoritatif (npm run server)
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

FROM base AS web
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]

FROM base AS match
ENV PORT=8787
EXPOSE 8787
CMD ["npm", "run", "server"]
