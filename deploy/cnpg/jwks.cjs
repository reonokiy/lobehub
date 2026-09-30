const { createHash, createPrivateKey, createPublicKey } = require('node:crypto');

function configureSigningKey(env) {
  if (!env.JWKS_PRIVATE_PEM) return;
  if (env.JWKS_KEY) throw new Error('Configure only one LobeHub signing-key source');
  const privateKey = createPrivateKey(env.JWKS_PRIVATE_PEM);
  if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 2048) {
    throw new Error('LobeHub requires an RSA signing key of at least 2048 bits');
  }
  const publicKey = createPublicKey(privateKey);
  const kid = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
  const metadata = { kid, alg: 'RS256', use: 'sig' };
  env.JWKS_KEY = JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), ...metadata }] });
  const publicJwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), ...metadata }] };
  if (env.JWKS_PUBLIC_KEY && JSON.parse(env.JWKS_PUBLIC_KEY).keys?.[0]?.n !== publicJwks.keys[0].n) {
    throw new Error('LobeHub and gateway signing keys differ');
  }
  env.JWKS_PUBLIC_KEY = JSON.stringify(publicJwks);
  delete env.JWKS_PRIVATE_PEM;
}

module.exports = { configureSigningKey };
