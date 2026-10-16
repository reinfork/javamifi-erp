FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm install --no-audit --no-fund && npx prisma generate && npm cache clean --force
COPY prisma ./prisma
COPY src ./src
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node src/server.js"]
