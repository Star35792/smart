FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node sim/ ./sim/
COPY --chown=node:node LICENSE ./
COPY --chown=node:node examples/random/ ./examples/random/
COPY --chown=node:node examples/warehouse/ ./examples/warehouse/
ENV SMART_HOST=0.0.0.0 SMART_PORT=8765
USER node
EXPOSE 8765
CMD ["node", "sim/server.mjs"]
