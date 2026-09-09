FROM node:20-alpine

WORKDIR /app

# Install dependensi sistem yang dibutuhkan jika ada
RUN apk add --no-cache git tzdata

ENV NODE_ENV=production
ENV PORT=3005

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Buat folder auth dan berikan hak akses
RUN mkdir -p auth_info_baileys && chown -R node:node /app

USER node

EXPOSE 3005

CMD ["npm", "start"]
