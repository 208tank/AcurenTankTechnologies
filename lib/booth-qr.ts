/** What the QR code on the booth contact card holds. Saved per browser. */
export type BoothQr = {
  /** 'contact' saves a contact card (vCard); 'link' opens a web address. */
  mode: 'contact' | 'link';
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  /** For 'link' mode, e.g. a Microsoft Form. */
  link: string;
  /** For 'link' mode: the line shown under the code. */
  linkCaption: string;
};

export const BOOTH_QR_KEY = 'tankscope-booth-qr-v1';

export const DEFAULT_BOOTH_QR: BoothQr = {
  mode: 'contact',
  name: 'Harley Thorp',
  title: 'Tank Integrity Program Supervisor',
  company: 'Acuren',
  phone: '+1-780-405-2962',
  email: 'harley.thorp@acuren.com',
  website: 'https://www.acuren.com',
  link: '',
  linkCaption: 'Scan to leave your details',
};

const FIELDS = [
  'name',
  'title',
  'company',
  'phone',
  'email',
  'website',
  'link',
  'linkCaption',
] as const;

export function readBoothQr(raw: string | null): BoothQr {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<BoothQr>) : {};
    const out: BoothQr = { ...DEFAULT_BOOTH_QR, mode: v.mode === 'link' ? 'link' : 'contact' };
    for (const f of FIELDS) if (typeof v[f] === 'string') out[f] = (v[f] as string).slice(0, 200);
    return out;
  } catch {
    return DEFAULT_BOOTH_QR;
  }
}

/** Escape a value for a vCard 3.0 text field. */
const esc = (s: string) =>
  s
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/** Add https:// to a bare web address so phones open it as a link. */
export function withScheme(url: string) {
  const u = url.trim();
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

export function vCard(q: BoothQr): string {
  const name = q.name.trim();
  const parts = name.split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(name)}`,
    q.company.trim() && `ORG:${esc(q.company)}`,
    q.title.trim() && `TITLE:${esc(q.title)}`,
    q.phone.trim() && `TEL;TYPE=CELL:${q.phone.trim()}`,
    q.email.trim() && `EMAIL;TYPE=WORK:${q.email.trim()}`,
    q.website.trim() && `URL:${withScheme(q.website)}`,
    'END:VCARD',
  ];
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}

/** The text encoded in the QR code, or an error message if it can't be made. */
export function qrPayload(q: BoothQr): { text: string } | { error: string } {
  if (q.mode === 'link') {
    const link = withScheme(q.link);
    if (!link) return { error: 'Enter the web address the QR code should open.' };
    if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(link))
      return { error: 'That doesn’t look like a web address.' };
    return { text: link };
  }
  if (!q.name.trim()) return { error: 'Enter a name for the contact card.' };
  if (!q.phone.trim() && !q.email.trim()) return { error: 'Enter a phone number or email.' };
  return { text: vCard(q) };
}

/** Lines shown under the QR code on the booth screen. */
export function qrCaption(q: BoothQr): { heading: string; lines: string[] } {
  if (q.mode === 'link') return { heading: q.linkCaption.trim() || 'Scan me', lines: [] };
  return {
    heading: 'Scan to save my contact',
    lines: [q.name.trim(), q.title.trim()].filter(Boolean),
  };
}
