// @ts-check
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Obtain a valid vt_session cookie and write it into storageState so every test
// starts authenticated. This is the harness's way past PAM/Cloudflare-Access with
// no human — the cookie is a real HS256 token signed by the manager's own
// _sign_session (via tools/mint-session-cookie.py), so the server accepts it
// exactly like a real login.
//
// The token is obtained in this priority order:
//   1) VIBETOP_E2E_COOKIE           — a token value the bring-up already minted
//                                     (the Docker env exports this via `docker exec`).
//   2) VIBETOP_MINT_CMD             — a shell command that prints the token value.
//   3) local mint                   — run tools/mint-session-cookie.py here (only
//                                     works if this machine can read the session
//                                     secret, e.g. VIBETOP_SESSION_SECRET_FILE).
module.exports = async () => {
  const baseURL = process.env.VIBETOP_BASE_URL || 'http://localhost:8080';
  const user = process.env.VIBETOP_E2E_USER || 'e2e';

  let token = process.env.VIBETOP_E2E_COOKIE;
  if (!token && process.env.VIBETOP_MINT_CMD) {
    token = execFileSync('bash', ['-lc', process.env.VIBETOP_MINT_CMD], { encoding: 'utf8' }).trim();
  }
  if (!token) {
    const minter = path.resolve(__dirname, '../../tools/mint-session-cookie.py');
    token = execFileSync('python3', [minter, user, '--value-only'], { encoding: 'utf8' }).trim();
  }
  // The minter may print `vt_session=<tok>`; keep only the value.
  if (token.includes('=')) token = token.split('=').slice(1).join('=');
  if (!token) throw new Error('global-setup: could not obtain a vt_session token');

  const u = new URL(baseURL);
  const storageState = {
    cookies: [{
      name: 'vt_session',
      value: token,
      domain: u.hostname,
      path: '/',
      httpOnly: true,
      secure: u.protocol === 'https:',
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    }],
    origins: [],
  };
  const dir = path.resolve(__dirname, '.auth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(storageState, null, 2));
  console.log(`[global-setup] authed as "${user}" against ${baseURL}`);
};
