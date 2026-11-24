FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node sim/ ./sim/
COPY --chown=node:node LICENSE ./
COPY --chown=node:node random-32-32-20.map random-32-32-20-random-1.scen example_paths_xy.txt warehouse-10-20-10-2-1.map warehouse-10-20-10-2-1-random-1.scen scen_1_1000_paths.txt ./
ENV SMART_HOST=0.0.0.0 SMART_PORT=8765
USER node
EXPOSE 8765
CMD ["node", "sim/server.mjs"]
