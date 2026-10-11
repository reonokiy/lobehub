FROM lobehub/lobehub:2.2.19@sha256:56a21005ba1148ad45310e57e09f88ce25006cd6492b5b585e90cf92f4d1826f

LABEL org.opencontainers.image.source="https://github.com/reonokiy/lobehub" \
      org.opencontainers.image.version="2.2.19-cnpg" \
      org.opencontainers.image.description="LobeHub with explicit pg_like migration compatibility for CNPG"

COPY --chown=nextjs:nextjs scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --chown=nextjs:nextjs scripts/migrateServerDB/searchProvider.cjs /app/searchProvider.cjs
COPY --chown=nextjs:nextjs deploy/cnpg/start.cjs deploy/cnpg/jwks.cjs /app/
COPY --chown=nextjs:nextjs apps/server/src/services/memory/userMemory/embeddingInputLimit.cjs /app/memory-embedding-input-limit.cjs
COPY --chown=nextjs:nextjs deploy/cnpg/patch-memory-embedding.cjs /app/patch-memory-embedding.cjs

# Patch only checksum-reviewed memory call sites in the pinned upstream build.
# Source counterparts use the same helper when the complete app is rebuilt.
RUN node /app/patch-memory-embedding.cjs

# Query selection and migration selection must stay aligned at runtime.
ENV FTS_SEARCH_PROVIDER=pg_like

CMD ["/app/start.cjs"]
