/**
 * Memory embedding requests must fit even when the heuristic token estimator
 * undercounts opaque identifiers, numbers, or whitespace. UTF-8 byte length is
 * a conservative upper bound for the byte-based embedding tokenizer: each
 * token consumes at least one byte. Keep the newest complete Unicode suffix.
 * This only bounds embedding input; stored messages and extraction context
 * are not modified.
 */
const DEFAULT_LIMIT = 7000;
const PROVIDER_LIMIT = 8191;

/** @param {unknown} value @returns {number | undefined} */
function positiveLimit(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return undefined;
  return Math.floor(number);
}

/**
 * User settings can lower the input budget, but cannot bypass the global
 * safety limit. Never use the chat model's context window for embeddings.
 * @param {number | undefined} requested
 * @param {string | undefined} configured
 */
function resolveMemoryEmbeddingLimit(
  requested,
  configured = process.env.MEMORY_USER_MEMORY_EMBEDDING_CONTEXT_LIMIT,
) {
  const globalLimit = positiveLimit(configured) ?? DEFAULT_LIMIT;
  return Math.min(positiveLimit(requested) ?? globalLimit, globalLimit, PROVIDER_LIMIT);
}

/**
 * @param {string} text
 * @param {number | undefined} requestedLimit
 * @returns {string}
 */
function boundMemoryEmbeddingInput(text, requestedLimit) {
  const limit = resolveMemoryEmbeddingLimit(requestedLimit);
  const normalized = text.trim();
  const bytes = Buffer.from(normalized, 'utf8');
  if (bytes.length <= limit) return normalized;

  let start = bytes.length - limit;
  // Skip continuation bytes so decoding never splits a Unicode code point.
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  const bounded = bytes.subarray(start).toString('utf8').trim();
  console.warn('[user-memory] bounded embedding input bytes', {
    budgetBytes: limit,
    originalBytes: bytes.length,
    retainedBytes: Buffer.byteLength(bounded, 'utf8'),
  });
  return bounded;
}

module.exports = { boundMemoryEmbeddingInput, resolveMemoryEmbeddingLimit };
