try {
  require('./jwks.cjs').configureSigningKey(process.env);
} catch {
  console.error('LobeHub signing-key setup failed; check the configured key sources');
  process.exit(1);
}
require('/app/startServer.js');
