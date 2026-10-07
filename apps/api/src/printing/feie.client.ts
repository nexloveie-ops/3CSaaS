import { createHash } from 'crypto';

/** European Feie cluster. Accounts on developer.de.feieyun.com are not visible to api.feieyun.cn. */
const FEIE_URL = 'https://api.de.feieyun.com/Api/Open/';

export async function feieOpen(
  user: string,
  ukey: string,
  fields: Record<string, string>,
): Promise<{ ret?: number; msg?: string; data?: string }> {
  const stime = Math.floor(Date.now() / 1000).toString();
  const sig = createHash('sha1').update(`${user}${ukey}${stime}`).digest('hex');
  const body = new URLSearchParams({ user, stime, sig, ...fields });
  const res = await fetch(FEIE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error('feie_unreachable');
  }
  return (await res.json()) as { ret?: number; msg?: string; data?: string };
}
