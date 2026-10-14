const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// The compatibility image reuses this exact upstream runtime. A different
// compilation must be reviewed rather than silently omitting the fix.
const ORIGINAL_HASHES = {
  '_1d_4qrr._.js': 'a5f4921d469430048be155fbf54cc8b2677b80530fbdef3941aae20fc9fe3916',
  '_0andha6._.js': 'f8618241adeba00238b48a609179b68e4d504db3d7edecb3cd7393d0c0fee7f7',
  '_1h4uq48._.js': '3a4cafffa25aa6906ed38f601d9ff9b7134dc0a109af69ab03bd39d724b79458',
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
    source = replaceOnce(source,
      'let r=await (0,V.trimEmbeddingInput)(n,t,i);r.trim()&&',
      `let r=${guard}(await (0,V.trimEmbeddingInput)(n,t,i),i);r.trim()&&`);
    source = replaceOnce(source,
      'l=await (0,V.trimEmbeddingInput)(i.map(e=>`${e.role.toUpperCase()}: ${e.content}`).join("\\n\\n"),r,s),u=await t.embeddings(',
      `l=${guard}(await (0,V.trimEmbeddingInput)(i.map(e=>\`\${e.role.toUpperCase()}: \${e.content}\`).join("\\n\\n"),r,s),s),u=await t.embeddings(`);
  } else {
    source = replaceOnce(source,
      'let o=(await (0,a.trimEmbeddingInput)(r,e.model,n)).trim();',
      `let o=${guard}(await (0,a.trimEmbeddingInput)(r,e.model,n),n);`);
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
