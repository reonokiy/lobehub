const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// The compatibility image reuses this exact upstream runtime. A different
// compilation must be reviewed rather than silently omitting the fix.
const ORIGINAL_HASHES = {
  '_1d_4qrr._.js': '71f3d5ccd186dab334a7b42a0a465ead35cf63140a056ac1292f589f199de78d',
  '_1tr4zf2._.js': 'd6422d81ac03da9ac2bd0fb1306fc5af55264cfe055b866a639666bc9dca6aff',
  '_06-2yjp._.js': '0c2ca0a13fef47472feb909bad171e3ef4418f7cab332c8290825c2d1657d760',
};

function replaceOnce(source, oldText, newText) {
  if (source.split(oldText).length !== 2) {
    throw new Error('Expected exactly one reviewed memory embedding call site');
  }
  return source.replace(oldText, newText);
}

function patchedSource(name, source, helperPath) {
  const guard = `require(${JSON.stringify(helperPath)}).boundMemoryEmbeddingInput`;
  if (name === '_1d_4qrr._.js') {
    source = replaceOnce(
      source,
      'let r=await this.trimTextToTokenLimit(t,i);r.trim()&&',
      `let r=${guard}(await this.trimTextToTokenLimit(t,i),i);r.trim()&&`,
    );
    source = replaceOnce(
      source,
      'l=await this.trimTextToTokenLimit(i.map(e=>`${e.role.toUpperCase()}: ${e.content}`).join("\\n\\n"),s),u=await t.embeddings({dimensions:n.DEFAULT_USER_MEMORY_EMBEDDING_DIMENSIONS,input:[l],model:r},{metadata:{trigger:g.RequestTrigger.Memory},user:a}),m=u?.[0];',
      `l=${guard}(await this.trimTextToTokenLimit(i.map(e=>\`\${e.role.toUpperCase()}: \${e.content}\`).join("\\n\\n"),s),s),u=l?await t.embeddings({dimensions:n.DEFAULT_USER_MEMORY_EMBEDDING_DIMENSIONS,input:[l],model:r},{metadata:{trigger:g.RequestTrigger.Memory},user:a}):[],m=u?.[0];`,
    );
  } else {
    source = replaceOnce(
      source,
      'let o=(n?await (0,i.trimBasedOnBatchProbe)(r,n):r).trim();',
      `let o=${guard}(n?await (0,i.trimBasedOnBatchProbe)(r,n):r,n);`,
    );
  }
  return source;
}

function patchMemoryEmbedding(root, helperPath = '/app/memory-embedding-input-limit.cjs') {
  const pending = [];
  for (const [name, expectedHash] of Object.entries(ORIGINAL_HASHES)) {
    const filename = path.join(root, name);
    const original = fs.readFileSync(filename);
    const hash = crypto.createHash('sha256').update(original).digest('hex');
    if (hash !== expectedHash) throw new Error('Upstream memory runtime checksum changed');
    pending.push([filename, patchedSource(name, original.toString('utf8'), helperPath)]);
  }
  // Validate every file before writing any of them.
  for (const [filename, source] of pending) fs.writeFileSync(filename, source);
  return { patchedFiles: pending.length, protectedCallSites: 4 };
}

module.exports = { ORIGINAL_HASHES, patchMemoryEmbedding, patchedSource };
if (require.main === module) {
  console.log(JSON.stringify(patchMemoryEmbedding(process.argv[2] ?? '/app/.next/server/chunks')));
}
