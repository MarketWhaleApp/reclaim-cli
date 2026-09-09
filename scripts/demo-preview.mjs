// Offline illustrative demo. The injected transport returns fixtures; no network calls.
import { readFile } from 'node:fs/promises';
import { previewSolanaRent } from '../dist/preview/tool.js';
const fixture = JSON.parse(await readFile(new URL('../docs/preview-v1-example.json', import.meta.url), 'utf8'));
const fresh = () => {
  const p = structuredClone(fixture);
  const now = Date.now();
  p.observation.observedAt = new Date(now).toISOString();
  p.observation.expiresAt = new Date(now + 30_000).toISOString();
  return p;
};
const sol = value => {
  const n = BigInt(value);
  return `${n / 1_000_000_000n}.${String(n % 1_000_000_000n).padStart(9, '0')}`;
};
console.log('ILLUSTRATIVE OFFLINE DEMO — fixtures, no live wallet scan, no signing.');
for (const scenario of ['eligible', 'no_accounts', 'rate_limited']) {
  const result = await previewSolanaRent({ publicKey: fixture.publicKey }, { fetcher: async () => {
    if (scenario === 'rate_limited') return Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'Retry-After': '30' } });
    const p = fresh();
    if (scenario === 'no_accounts') {
      p.accounts = { scanned: 0, empty: 0, candidates: 0, protected: 0 };
      p.amounts.grossRentLamports = '0'; p.amounts.estimatedNetLamports = '0';
      p.amounts.deductions.serviceLamports = '0'; p.amounts.deductions.referralPortionLamports = '0';
      p.eligibility = { status: 'no_accounts', reasonCodes: ['NO_EMPTY_ACCOUNTS'] };
    }
    return Response.json(p);
  } });
  if (scenario !== 'rate_limited' && (!result.ok || result.preview.eligibility.status !== scenario)) throw new Error(`Unexpected fixture result: ${scenario}`);
  if (scenario === 'rate_limited' && (result.ok || result.error.code !== 'RATE_LIMITED')) throw new Error('Expected throttle response');
  console.log(`\n${scenario}:`);
  if (result.ok) {
    const p = result.preview;
    console.log(`${p.accounts.candidates} candidates; status ${p.eligibility.status}.`);
    console.log(`Gross ${sol(p.amounts.grossRentLamports)} SOL; estimated net ${sol(p.amounts.estimatedNetLamports)} SOL before unknown network fees.`);
    console.log(`Reasons: ${p.eligibility.reasonCodes.join(', ') || 'none'}. Eligibility is provisional.`);
  } else {
    console.log(`${result.error.code}; retryable ${result.error.retryable}; retry after ${result.error.retryAfterSeconds}s. No automatic retry.`);
  }
}
