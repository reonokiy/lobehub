# CNPG deployment image

This fork maintains the CNPG compatibility layer for LobeHub v2.2.20-canary.6. The image build reuses
the digest-pinned official runtime and frontend, and copies this fork's migration
runner and signing-key adapter into it. It does not rebuild the unchanged web
frontend. The original upstream Dockerfile also includes the migration helper
when building the entire source tree.

`FTS_SEARCH_PROVIDER=pg_like` selects LobeHub's official PostgreSQL ILIKE backend.
During Docker startup, only migrations `0090_enable_pg_search` and
`0093_add_bm25_indexes_with_icu` become no-op statements. Drizzle records their
original hashes and timestamps, and executes every other migration normally.
The immutable SQL files and journal remain unchanged. Changed or new ParadeDB
migrations fail explicitly until reviewed. pgvector is still required.

pg_search Community cannot safely participate in the shared CNPG cluster's
physical replication, so this image avoids installing or indexing with it.
Switching this database back to pg_search requires a separately reviewed index
installation: historical migrations have already been recorded as completed.
Selecting another provider alone does not rebuild those skipped indexes.

`JWKS_PRIVATE_PEM` optionally accepts a generated RSA private key from the
secret producer. The startup adapter derives the upstream `JWKS_KEY` in memory
and its public `JWKS_PUBLIC_KEY`, then removes the duplicate PEM environment
entry. The gateway receives only the public key. Existing `JWKS_KEY` input
remains supported. No credentials are part of the image or build arguments.

Build and test locally:

Memory embedding input is additionally bounded before every request. The existing
`tokenx` estimator can count a 30,000-digit string as one token even though the
embedding tokenizer needs 10,000 tokens, so an estimated 7,000-token trim does
not enforce the provider's 8,192-token limit. User context overrides and a chat
model's larger context window must not increase the global embedding budget.

`embeddingInputLimit.cjs` retains the newest complete Unicode suffix within a
conservative UTF-8 byte budget (default 7,000; hard ceiling 8,191). For byte-based
embedding tokenizers this bounds tokens even when the estimator undercounts.
It can retain less context than exact tokenization; stored conversations and
the extraction model's context are unchanged. Only byte counts are logged.

Since this image reuses the official compiled runtime, the build patches all
four reviewed embedding call sites in three server chunks. Every original chunk
checksum and replacement count is verified before any file is written; an
upstream runtime change fails the build until reviewed. Corresponding source
call sites use the same helper. Regression tests execute the compiled generation
and retrieval methods with synthetic over-limit input, test Unicode boundaries,
and ensure user settings cannot enlarge the safety budget. Pull requests run
the image tests without publishing; merged revisions publish the tested image.

```sh
docker build -f deploy/cnpg/Dockerfile -t lobehub-cnpg:local .
python3 deploy/cnpg/test-isolated.py lobehub-cnpg:local
```

The isolated test uses the pinned production PG18 and pgvector binaries,
ordinary application ownership, the 2.2.19-to-2.2.20-canary.6 upgrade (176 to 180 real Drizzle migrations), preserved records, original
journal hashes, repeated migration, Unicode ILIKE and vector/HNSW queries,
physical backup and WAL replay. It uses no production credentials and exposes
no ports. It does not establish a completed human OIDC login or AI conversation.

The fork's `CNPG compatible image` workflow publishes only after these tests
pass, using an immutable Git-SHA tag in `ghcr.io/reonokiy/lobehub`. Talos pins the
published digest. Upgrades require reviewing the upstream runtime, SQL hashes
and all new extension-dependent migrations before replacing this base image.

## October 14 preview upgrade

Stable remains 2.2.19. The reviewed preview is upstream commit
`e1d55d679cbb801468279a6ce5d9238b6123fbfb` (`v2.2.20-canary.6`).
The official multi-platform runtime digest is
`sha256:4dff48694f25cd79926dac0e762b4074757ca873ae8ec5a5688bfca3d3870a91`.
Four incremental migrations add project context, goal subscriptions, workspace
teams and distinct intervention callbacks. Existing migration SQL is unchanged.
The compiled frontend is reused; this branch is a compatibility packaging branch,
not a complete source synchronization with upstream. The upstream tokenizer fix
(#20508) adds exact cl100k limits; the independent conservative UTF-8 guard is
retained at all four compiled call sites, including unknown custom tokenizers.
The preview changes many replica-backed stores; authenticated UI and real-provider
acceptance remain separate from isolated database and memory regression tests.
It does not establish fixes for provider 404/429/overload, malformed extraction
results, missing market routes or undefined handoff titles.
