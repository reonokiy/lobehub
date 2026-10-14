FROM lobehub/lobehub:2.2.20-canary.6@sha256:4dff48694f25cd79926dac0e762b4074757ca873ae8ec5a5688bfca3d3870a91

LABEL org.opencontainers.image.source="https://github.com/reonokiy/lobehub" \
      org.opencontainers.image.version="2.2.20-canary.6-cnpg" \
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
