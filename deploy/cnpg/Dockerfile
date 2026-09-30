FROM lobehub/lobehub:2.2.18@sha256:b7c843911259c54c92f03864d9dd2e9099e18525de1d37498b64cc15751d087d

LABEL org.opencontainers.image.source="https://github.com/reonokiy/lobehub" \
      org.opencontainers.image.version="2.2.18-cnpg" \
      org.opencontainers.image.description="LobeHub with explicit pg_like migration compatibility for CNPG"

COPY --chown=nextjs:nextjs scripts/migrateServerDB/docker.cjs /app/docker.cjs
COPY --chown=nextjs:nextjs scripts/migrateServerDB/searchProvider.cjs /app/searchProvider.cjs
COPY --chown=nextjs:nextjs deploy/cnpg/start.cjs deploy/cnpg/jwks.cjs /app/

# Query selection and migration selection must stay aligned at runtime.
ENV FTS_SEARCH_PROVIDER=pg_like

CMD ["/app/start.cjs"]
