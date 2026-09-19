# One process, no build step, no dependencies to install.
FROM node:22-alpine

WORKDIR /app
COPY . .

# The SQLite file lives on a mounted volume, not in the image.
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
VOLUME /data
EXPOSE 3000

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown -R app:app /data /app
USER app

CMD ["node", "server/start.js"]
