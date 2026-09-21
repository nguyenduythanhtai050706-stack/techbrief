import { Inject, Injectable, Optional } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { NormalizedArticlePreview } from './ingestion.types';
import { ArticleContentExtractor } from './article-content-extractor';

export const ARTICLE_EVIDENCE_NETWORK = Symbol('ARTICLE_EVIDENCE_NETWORK');
export const MIN_USEFUL_SOURCE_LENGTH = 800;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;

export interface ArticleEvidenceNetwork {
  fetch: typeof globalThis.fetch;
  lookup: (
    hostname: string,
  ) => Promise<Array<{ address: string; family: number }>>;
}

function hostAllowed(target: string, registered: string): boolean {
  const normalize = (hostname: string) =>
    hostname.replace(/^(?:www|feeds?|rss)\./i, '');
  const normalizedTarget = normalize(target);
  const normalizedRegistered = normalize(registered);
  return (
    normalizedTarget === normalizedRegistered ||
    normalizedTarget.endsWith(`.${normalizedRegistered}`) ||
    normalizedRegistered.endsWith(`.${normalizedTarget}`)
  );
}

async function readLimitedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('PAGE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
    return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

@Injectable()
export class ArticleEvidenceFetcher {
  private readonly network: ArticleEvidenceNetwork;

  constructor(
    private readonly extractor: ArticleContentExtractor,
    @Optional()
    @Inject(ARTICLE_EVIDENCE_NETWORK)
    network?: ArticleEvidenceNetwork,
  ) {
    this.network = network ?? {
      fetch: globalThis.fetch,
      lookup: async (hostname) =>
        lookup(hostname, { all: true, verbatim: true }),
    };
  }

  async enrich(
    preview: NormalizedArticlePreview,
    registeredSourceUrl: string,
  ): Promise<NormalizedArticlePreview> {
    if ((preview.sourceText?.length ?? 0) >= MIN_USEFUL_SOURCE_LENGTH) {
      return preview;
    }

    try {
      const registeredHost = new URL(
        registeredSourceUrl,
      ).hostname.toLowerCase();
      let current = new URL(preview.url);

      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        await this.assertSafeUrl(current, registeredHost);
        const response = await this.network.fetch(current, {
          headers: { 'User-Agent': 'TechBrief/0.1' },
          redirect: 'manual',
          signal: AbortSignal.timeout(8_000),
        });

        if (response.status >= 300 && response.status < 400) {
          if (redirect === MAX_REDIRECTS) throw new Error('TOO_MANY_REDIRECTS');
          const location = response.headers.get('location');
          if (!location) throw new Error('INVALID_REDIRECT');
          current = new URL(location, current);
          continue;
        }

        if (!response.ok) throw new Error('PAGE_FETCH_FAILED');
        const contentType =
          response.headers.get('content-type')?.toLowerCase() ?? '';
        if (!contentType.startsWith('text/html'))
          throw new Error('UNSUPPORTED_CONTENT');
        const declaredLength = Number(
          response.headers.get('content-length') ?? 0,
        );
        if (declaredLength > MAX_RESPONSE_BYTES)
          throw new Error('PAGE_TOO_LARGE');
        const extracted = this.extractor.extract(
          await readLimitedBody(response),
        );
        if (
          !extracted ||
          extracted.length <= (preview.sourceText?.length ?? 0)
        ) {
          return preview;
        }
        return { ...preview, sourceText: extracted, sourceTextKind: 'page' };
      }
    } catch {
      return preview;
    }

    return preview;
  }

  private async assertSafeUrl(url: URL, registeredHost: string): Promise<void> {
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('INVALID_PROTOCOL');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || !hostAllowed(hostname, registeredHost)) {
      throw new Error('UNREGISTERED_HOST');
    }
    const addresses = await this.network.lookup(hostname);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateAddress(address))
    ) {
      throw new Error('PRIVATE_ADDRESS');
    }
  }
}
