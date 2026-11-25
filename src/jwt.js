// Read the payload of a JWT (API key or login token) without checking its
// signature. Use the result only to show who a credential claims to be. It is
// never proof that the credential is valid: only Mayar can say that.

function decodeJwt(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload = JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch (_) {
    return null;
  }
}

// Pick the identity fields Mayar tokens are known to use. Return null when the
// token is not a JWT.
function identity(token) {
  const c = decodeJwt(token);
  if (!c) return null;
  const pick = (...keys) => {
    for (const k of keys) if (c[k] !== undefined && c[k] !== null && c[k] !== '') return String(c[k]);
    return null;
  };
  return {
    name: pick('name', 'merchantName', 'fullName'),
    email: pick('email', 'merchantEmail'),
    accountId: pick('accountId', 'userId', 'sub', 'id'),
    expiresAt: typeof c.exp === 'number' ? new Date(c.exp * 1000).toISOString() : null,
  };
}

module.exports = { decodeJwt, identity };
