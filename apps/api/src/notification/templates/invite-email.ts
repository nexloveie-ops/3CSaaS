export type InviteEmailLocale = 'en' | 'zh';

const COPY: Record<
  InviteEmailLocale,
  {
    subject: (company: string) => string;
    title: string;
    body: (company: string, role: string) => string;
    expires: (date: string) => string;
    cta: string;
    footer: string;
    plain: (company: string, role: string, url: string, expires: string) => string;
  }
> = {
  en: {
    subject: (c) => `You're invited to ${c}`,
    title: "You're invited",
    body: (c, r) =>
      `Join <strong style="color:#0f172a;">${escapeHtml(c)}</strong> as <strong style="color:#1d4ed8;">${escapeHtml(r)}</strong>.`,
    expires: (d) => `Accept before ${d}.`,
    cta: 'Accept invitation',
    footer: '3C retail &amp; service platform · Ireland-first',
    plain: (c, r, url, exp) =>
      `You have been invited as ${r} to ${c}.\n\nAccept your invite:\n${url}\n\nExpires: ${exp}`,
  },
  zh: {
    subject: (c) => `邀请加入 ${c}`,
    title: '诚邀加入',
    body: (c, r) =>
      `邀请您以 <strong style="color:#1d4ed8;">${escapeHtml(r)}</strong> 身份加入 <strong style="color:#0f172a;">${escapeHtml(c)}</strong>。`,
    expires: (d) => `请在 ${d} 前接受邀请。`,
    cta: '接受邀请',
    footer: '3C 零售与服务平台',
    plain: (c, r, url, exp) =>
      `您已被邀请以 ${r} 身份加入 ${c}。\n\n接受邀请：\n${url}\n\n有效期至：${exp}`,
  },
};

export function resolveInviteLocale(locale?: string): InviteEmailLocale {
  return locale === 'zh' ? 'zh' : 'en';
}

export function resolveInviteNote(
  company: { inviteEmailNote?: string; inviteEmailNoteZh?: string },
  locale?: string,
): string | undefined {
  const en = company.inviteEmailNote?.trim();
  const zh = company.inviteEmailNoteZh?.trim();
  if (resolveInviteLocale(locale) === 'zh') return zh || en;
  return en || zh;
}

export function inviteEmailSubject(companyName: string, locale?: string) {
  return COPY[resolveInviteLocale(locale)].subject(companyName);
}

export function inviteEmailPlain(opts: {
  companyName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
  locale?: string;
  customNote?: string;
}) {
  const c = COPY[resolveInviteLocale(opts.locale)];
  const base = c.plain(opts.companyName, opts.role, opts.inviteUrl, opts.expiresAt.slice(0, 10));
  const note = opts.customNote?.trim();
  return note ? `${note}\n\n${base}` : base;
}

function renderCustomNote(note: string | undefined) {
  const n = note?.trim();
  if (!n) return '';
  return `<p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.5;padding:12px 16px;background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:4px;">${escapeHtml(n)}</p>`;
}

export function renderInviteEmail(opts: {
  companyName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
  locale?: string;
  customNote?: string;
}) {
  const loc = resolveInviteLocale(opts.locale);
  const c = COPY[loc];
  const expires = opts.expiresAt.slice(0, 10);
  const lang = loc === 'zh' ? 'zh' : 'en';
  const noteBlock = renderCustomNote(opts.customNote);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">
        <tr><td style="background:linear-gradient(135deg,#1d4ed8,#0f766e);padding:28px 32px;">
          <p style="margin:0;font-size:13px;color:#bfdbfe;letter-spacing:.05em;text-transform:uppercase;">LZ3C</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#fff;font-weight:600;">${c.title}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;color:#334155;line-height:1.5;">${c.body(opts.companyName, opts.role)}</p>
          ${noteBlock}
          <p style="margin:0 0 24px;font-size:14px;color:#64748b;">${c.expires(expires)}</p>
          <a href="${opts.inviteUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">${c.cta}</a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">${escapeHtml(opts.inviteUrl)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">${c.footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
