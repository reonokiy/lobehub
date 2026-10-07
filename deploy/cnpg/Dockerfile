FROM lobehub/lobehub:2.2.19@sha256:56a21005ba1148ad45310e57e09f88ce25006cd6492b5b585e90cf92f4d1826f

LABEL org.opencontainers.image.source="https://github.com/reonokiy/lobehub" \
      org.opencontainers.image.version="2.2.19-cnpg" \
      org.opencontainers.image.description="LobeHub with explicit pg_like migration compatibility for CNPG"

COPY --chown=nextjs:nextjs scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --chown=nextjs:nextjs scripts/migrateServerDB/searchProvider.cjs /app/searchProvider.cjs
COPY --chown=nextjs:nextjs deploy/cnpg/start.cjs deploy/cnpg/jwks.cjs /app/

# Query selection and migration selection must stay aligned at runtime.
ENV FTS_SEARCH_PROVIDER=pg_like

CMD ["/app/start.cjs"]
