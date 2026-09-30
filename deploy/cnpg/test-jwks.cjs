const assert = require('node:assert/strict');
const { createPublicKey, generateKeyPairSync, sign, verify } = require('node:crypto');
const { test } = require('node:test');
const { configureSigningKey } = require('/app/jwks.cjs');

test('private PEM becomes the same RSA signing identity and gateway receives only its public half', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = { JWKS_PRIVATE_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  configureSigningKey(env);
  assert.ok(!Object.hasOwn(env, 'JWKS_PRIVATE_PEM'));
  const privateJwk = JSON.parse(env.JWKS_KEY).keys[0];
  const publicJwk = JSON.parse(env.JWKS_PUBLIC_KEY).keys[0];
  assert.ok(privateJwk.d);
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.ok(!Object.hasOwn(publicJwk, field));
  assert.equal(privateJwk.n, publicJwk.n);
  assert.equal(privateJwk.kid, publicJwk.kid);
  const data = Buffer.from('isolated gateway signing probe');
  assert.ok(verify('sha256', data, createPublicKey({ key: publicJwk, format: 'jwk' }), sign('sha256', data, privateKey)));
});

test('upstream JWKS input stays supported and ambiguous or invalid key sources fail', () => {
  assert.doesNotThrow(() => configureSigningKey({}));
  assert.throws(() => configureSigningKey({ JWKS_KEY: '{}', JWKS_PRIVATE_PEM: 'invalid' }));
  assert.throws(() => configureSigningKey({ JWKS_PRIVATE_PEM: 'invalid' }));
});
