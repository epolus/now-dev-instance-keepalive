function getAdminPasswordHash() {
  if (process.env.ADMIN_PASSWORD_HASH_B64) {
    return Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8');
  }
  return process.env.ADMIN_PASSWORD_HASH || '';
}

function hasAdminCredentials() {
  return !!(process.env.ADMIN_USER && getAdminPasswordHash());
}

module.exports = { getAdminPasswordHash, hasAdminCredentials };
