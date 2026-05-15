FROM node:22-alpine
WORKDIR /app
RUN chown -R node:node /app
USER node
COPY --chown=node:node package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY --chown=node:node . .
EXPOSE 4000
CMD ["npm", "run", "dev"]
