import { ReferenceSourceType, VerificationTier } from '@prisma/client';

export interface ReferenceMatch {
  verified: boolean;
  tier: VerificationTier;
  via: string | null;
  formattedCitation: string | null;
}

export interface ReferenceInput {
  citationText: string;
  doiOrIsbnOrLink?: string | null;
  sourceType: ReferenceSourceType;
}

// A DOI is "10." followed by a registrant code and a slash. Trailing
// punctuation is trimmed because citations often end a sentence with the DOI.
const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/;
const URL_RE = /https?:\/\/[^\s<>"')]+/i;

const UNVERIFIED: ReferenceMatch = {
  verified: false,
  tier: VerificationTier.STUDENT_CONFIRMED,
  via: null,
  formattedCitation: null,
};

const TIMEOUT_MS = 8000;

function trimDoi(value: string): string {
  return value.replace(/[.,;:)\]]+$/, '');
}

function normalizeIsbn(value: string): string | null {
  const compact = value.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (compact.length === 13 && /^97[89]/.test(compact)) return compact;
  if (compact.length === 10) return compact;
  return null;
}

type Identifier =
  | { kind: 'doi'; value: string }
  | { kind: 'isbn'; value: string }
  | { kind: 'url'; value: string };

function detectIdentifier(input: ReferenceInput): Identifier | null {
  const explicit = (input.doiOrIsbnOrLink ?? '').trim();

  const explicitDoi = explicit.match(DOI_RE);
  if (explicitDoi) return { kind: 'doi', value: trimDoi(explicitDoi[0]) };

  const explicitUrl = explicit.match(URL_RE);
  if (explicitUrl) return { kind: 'url', value: explicitUrl[0] };

  const explicitIsbn = normalizeIsbn(explicit);
  if (explicitIsbn) return { kind: 'isbn', value: explicitIsbn };

  const textDoi = input.citationText.match(DOI_RE);
  if (textDoi) return { kind: 'doi', value: trimDoi(textDoi[0]) };

  const textUrl = input.citationText.match(URL_RE);
  if (textUrl) return { kind: 'url', value: textUrl[0] };

  // Only trust an ISBN found in prose when it is clearly labelled as one,
  // otherwise ordinary numbers (page ranges, years) would be misread.
  if (/\bisbn\b/i.test(input.citationText)) {
    const textIsbn = normalizeIsbn(input.citationText.replace(/^.*?\bisbn\b/i, ''));
    if (textIsbn) return { kind: 'isbn', value: textIsbn };
  }

  return null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

function formatAuthorsFromCrossref(author: any[] | undefined): string[] {
  if (!Array.isArray(author)) return [];
  return author
    .map((a) => {
      const family = (a?.family ?? '').trim();
      const given = (a?.given ?? '').trim();
      if (!family) return given;
      const initials = given
        ? `, ${given
            .split(/\s+/)
            .map((part: string) => `${part[0]?.toUpperCase() ?? ''}.`)
            .join(' ')}`
        : '';
      return `${family}${initials}`;
    })
    .filter(Boolean);
}

function crossrefCitation(message: any, doi: string): string | null {
  const title = Array.isArray(message?.title) ? message.title[0] : message?.title;
  if (!title) return null;
  const authors = formatAuthorsFromCrossref(message?.author);
  const year = message?.issued?.['date-parts']?.[0]?.[0];
  const container = Array.isArray(message?.['container-title'])
    ? message['container-title'][0]
    : message?.['container-title'];

  const parts = [
    authors.length ? `${authors.join('; ')}.` : null,
    year ? `(${year}).` : null,
    `${title}.`,
    container ? `${container}.` : null,
    `https://doi.org/${doi}`,
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function verifyDoi(doi: string): Promise<ReferenceMatch> {
  const crossref = await fetchWithTimeout(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    { headers: { 'user-agent': 'SIWES-Logbook/1.0 (mailto:support@example.com)' } },
  );
  if (crossref.ok && crossref.data?.message) {
    return {
      verified: true,
      tier: VerificationTier.API_VERIFIED,
      via: 'crossref',
      formattedCitation: crossrefCitation(crossref.data.message, doi),
    };
  }

  const datacite = await fetchWithTimeout(
    `https://api.datacite.org/dois/${encodeURIComponent(doi)}`,
  );
  const attributes = datacite.data?.data?.attributes;
  if (datacite.ok && attributes) {
    const title = attributes?.titles?.[0]?.title;
    const year = attributes?.publicationYear;
    const creators = Array.isArray(attributes?.creators)
      ? attributes.creators.map((c: any) => c?.name).filter(Boolean)
      : [];
    const formatted = title
      ? [
          creators.length ? `${creators.join('; ')}.` : null,
          year ? `(${year}).` : null,
          `${title}.`,
          `https://doi.org/${doi}`,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      : null;
    return {
      verified: true,
      tier: VerificationTier.API_VERIFIED,
      via: 'datacite',
      formattedCitation: formatted,
    };
  }

  // The DOI didn't match a metadata API, but the resolver may still point
  // somewhere real — record that as a weaker "link checked" signal.
  const resolved = await fetchWithTimeout(`https://doi.org/${encodeURIComponent(doi)}`, {
    method: 'HEAD',
    redirect: 'follow',
  });
  if (resolved.ok) {
    return {
      verified: true,
      tier: VerificationTier.LINK_CHECKED,
      via: 'doi-resolver',
      formattedCitation: null,
    };
  }

  return UNVERIFIED;
}

async function verifyIsbn(isbn: string): Promise<ReferenceMatch> {
  const res = await fetchWithTimeout(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
  if (!res.ok || !res.data) return UNVERIFIED;

  const title = res.data.title;
  const year = res.data.publish_date;
  const formatted = title
    ? [title, year ? `(${year}).` : null, `ISBN ${isbn}.`].filter(Boolean).join(' ')
    : null;
  return {
    verified: true,
    tier: VerificationTier.API_VERIFIED,
    via: 'openlibrary',
    formattedCitation: formatted,
  };
}

async function verifyUrl(url: string): Promise<ReferenceMatch> {
  let res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' });
  // Many servers reject HEAD; fall back to a GET before giving up.
  if (!res.ok) res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' });
  if (res.ok) {
    return {
      verified: true,
      tier: VerificationTier.LINK_CHECKED,
      via: 'link',
      formattedCitation: null,
    };
  }
  return UNVERIFIED;
}

/**
 * Best-effort verification against free bibliographic APIs. A DOI is checked
 * against Crossref then DataCite; an ISBN against Open Library; a plain URL is
 * only reachability-checked. Anything we can't pin down stays
 * STUDENT_CONFIRMED so the student knows it wasn't verified — never silently
 * claimed as verified.
 */
export async function checkReference(input: ReferenceInput): Promise<ReferenceMatch> {
  const identifier = detectIdentifier(input);
  if (!identifier) return UNVERIFIED;

  try {
    if (identifier.kind === 'doi') return await verifyDoi(identifier.value);
    if (identifier.kind === 'isbn') return await verifyIsbn(identifier.value);
    return await verifyUrl(identifier.value);
  } catch {
    return UNVERIFIED;
  }
}
