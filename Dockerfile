FROM node:22-alpine AS builder
WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copia código e compila para servidor Node.js
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

# Imagem final de produção enxuta
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
