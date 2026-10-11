const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const helperPath = process.env.MEMORY_LIMIT_HELPER_PATH ??
  path.resolve(__dirname, '../../apps/server/src/services/memory/userMemory/embeddingInputLimit.cjs');
const { boundMemoryEmbeddingInput, resolveMemoryEmbeddingLimit } = require(helperPath);

test('global limit cannot be enlarged by a user setting or chat context window', () => {
  assert.equal(resolveMemoryEmbeddingLimit(128000, '7000'), 7000);
  assert.equal(resolveMemoryEmbeddingLimit(4000, '7000'), 4000);
  assert.equal(resolveMemoryEmbeddingLimit(undefined, undefined), 7000);
  assert.equal(resolveMemoryEmbeddingLimit(128000, '128000'), 8191);
  for (const value of ['NaN', '-1', '0', '0.5', 'Infinity']) {
    assert.equal(resolveMemoryEmbeddingLimit(undefined, value), 7000);
  }
});

test('long numeric input cannot bypass the limit by being estimated as one token', () => {
  const text = '1234567890'.repeat(3000);
  const bounded = boundMemoryEmbeddingInput(text, 128000);
  assert.equal(Buffer.byteLength(bounded), 7000);
  assert.equal(bounded, text.slice(-7000));
  assert.equal(text.length, 30000);
});

test('opaque identifiers are bounded independently of the token estimator', () => {
  const bounded = boundMemoryEmbeddingInput('a9f2bc47d308e1'.repeat(2000), 7000);
  assert.ok(Buffer.byteLength(bounded) <= 7000);
});

test('Unicode suffix remains valid and includes the newest text', () => {
  const text = '记忆🙂'.repeat(5000) + '最新消息';
  for (const limit of [1, 2, 3, 4, 5, 13, 7000]) {
    const bounded = boundMemoryEmbeddingInput(text, limit);
    assert.ok(Buffer.byteLength(bounded) <= limit);
    assert.ok(!bounded.includes('\ufffd'));
    assert.ok(text.endsWith(bounded));
  }
  assert.ok(boundMemoryEmbeddingInput(text, 7000).endsWith('最新消息'));
});

test('short input, empty input and exact boundary behave predictably', () => {
  assert.equal(boundMemoryEmbeddingInput('  short input  ', 7000), 'short input');
  assert.equal(boundMemoryEmbeddingInput(' \n ', 7000), '');
  assert.equal(boundMemoryEmbeddingInput('x'.repeat(7000), 7000), 'x'.repeat(7000));
});

test('built production runtime protects all four reviewed embedding call sites', {
  skip: !process.env.MEMORY_LIMIT_CHUNKS,
}, () => {
  const root = process.env.MEMORY_LIMIT_CHUNKS;
  const guard = 'require("/app/memory-embedding-input-limit.cjs").boundMemoryEmbeddingInput';
  for (const [name, count] of [['_1d_4qrr._.js', 2], ['_1tr4zf2._.js', 1], ['_06-2yjp._.js', 1]]) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(source.split(guard).length - 1, count);
  }
});

test('compiled memory generation completes for the numeric input that exceeded 8192 tokens', {
  skip: !process.env.MEMORY_LIMIT_CHUNKS,
}, async () => {
  const source = fs.readFileSync(path.join(process.env.MEMORY_LIMIT_CHUNKS, '_1d_4qrr._.js'), 'utf8');
  const start = source.indexOf('async generateEmbeddings(');
  const end = source.indexOf('async persistActivityMemories(', start);
  assert.ok(start > 0 && end > start);
  const method = source.slice(start, end);
  const statuses = { OK: 1, ERROR: 2 };
  const span = { setAttribute() {}, setStatus() {}, recordException() {}, end() {} };
  const Runtime = new Function('require', 'n', 'p', 'h', 'y', 'm', 'g',
    `return class Runtime { async trimTextToTokenLimit(text) { return text; } ${method} }`,
  )(require,
    { DEFAULT_USER_MEMORY_EMBEDDING_DIMENSIONS: 1536 },
    { ATTR_GEN_AI_OPERATION_NAME: 'operation', ATTR_GEN_AI_REQUEST_MODEL: 'model' },
    { attributesCommon: () => ({}) },
    { tracer: { startActiveSpan: (_name, _options, callback) => callback(span) } },
    { SpanStatusCode: statuses }, { RequestTrigger: { Memory: 'memory' } });
  const text = '1234567890'.repeat(3000);
  let sent;
  const result = await new Runtime().generateEmbeddings({
    async embeddings(payload) {
      sent = payload;
      // cl100k_base numeric runs are split into groups of at most three digits.
      assert.ok(Math.ceil(payload.input[0].length / 3) <= 8192);
      return [[0.1, 0.2], [0.3, 0.4]];
    },
  }, 'text-embedding-3-small', [text, undefined, 'short'], 'synthetic-user', 128000);
  assert.equal(Buffer.byteLength(sent.input[0]), 7000);
  assert.equal(sent.input[1], 'short');
  assert.deepEqual(result, [[0.1, 0.2], null, [0.3, 0.4]]);
});

test('compiled retrieval bounds its conversation embedding and reaches search', {
  skip: !process.env.MEMORY_LIMIT_CHUNKS,
}, async () => {
  const source = fs.readFileSync(path.join(process.env.MEMORY_LIMIT_CHUNKS, '_1d_4qrr._.js'), 'utf8');
  const start = source.indexOf('async listRelevantUserMemories(');
  const end = source.indexOf('async listUserMemoryIdentities(', start);
  assert.ok(start > 0 && end > start);
  const method = source.slice(start, end);
  const expectedSearch = { activities: ['synthetic-memory'] };
  const Runtime = new Function('require', 'n', 'z', 'M', 'g', 'A', 'B',
    `return class Runtime { db = Promise.resolve({}); async trimTextToTokenLimit(text) { return text; } ${method} }`,
  )(require, { DEFAULT_USER_MEMORY_EMBEDDING_DIMENSIONS: 1536 },
    { createFtsSearchRepo: async () => ({}) },
    { UserMemoryModel: class { async searchMemory() { return expectedSearch; } } },
    { RequestTrigger: { Memory: 'memory' } },
    { normalizeUserMemorySearchQueries: value => value, shouldRunUserMemoryLexicalSearch: () => false },
    { recordUserMemoryLexicalSearchDecision() {} });
  let sent;
  const result = await new Runtime().listRelevantUserMemories({}, {
    async embeddings(payload) {
      sent = payload;
      assert.ok(Math.ceil((payload.input[0].match(/\d/g) ?? []).length / 3) <= 8192);
      return [[0.1, 0.2]];
    },
  }, 'text-embedding-3-small', 'synthetic-user', [
    { role: 'user', content: '1234567890'.repeat(3000) },
  ], 128000);
  assert.equal(Buffer.byteLength(sent.input[0]), 7000);
  assert.deepEqual(result, expectedSearch);
});
