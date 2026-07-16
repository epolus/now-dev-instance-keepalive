#!/usr/bin/env node
const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- <password>');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  const b64 = Buffer.from(hash, 'utf8').toString('base64');
  const dockerEscaped = hash.replace(/\$/g, () => '$$');

  console.log('Recommended for Docker Compose (.env):');
  console.log(`ADMIN_PASSWORD_HASH_B64=${b64}`);
  console.log('\nPlain hash (local npm run only):');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\nAlternative Docker Compose (escape $ as $$):');
  console.log(`ADMIN_PASSWORD_HASH=${dockerEscaped}`);
});
