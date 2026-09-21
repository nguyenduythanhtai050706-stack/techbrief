import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export interface EvidenceSource {
  sourceId: number;
  sourceName: string;
  sourceUrl: string;
}

export interface EvidenceChunk {
  id: string;
  text: string;
  sources: EvidenceSource[];
  hash: string;
}

export interface ArticleEvidencePacket {
  articleId: number;
  title: string;
  evidenceLevel: 'rich' | 'limited';
  chunks: EvidenceChunk[];
  hash: string;
}

interface EvidenceRow {
  source_id: number;
  source_name: string;
  source_url: string;
  source_text: string | null;
}

interface Candidate {
  text: string;
  normalized: string;
  score: number;
  order: number;
  sources: EvidenceSource[];
}

const MAX_PACKET_CHARACTERS = 12_000;

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
}

function normalizeFact(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}%$€£]+/gu, ' ')
    .trim();
}

function score(text: string, titleTokens: Set<string>): number {
  const normalized = normalizeFact(text);
  const words = normalized.split(' ');
  let value = words.filter((word) => titleTokens.has(word)).length * 2;
  if (/\d/.test(text)) value += 6;
  if (
    /\b(?:%|percent|million|billion|trillion|ms|gb|tb|mhz|ghz|hours?|days?|weeks?|months?|years?)\b/i.test(
      text,
    )
  )
    value += 4;
  if (
    /\b(?:said|says|reported|according|claimed|forecast|expects?|announced|confirmed)\b/i.test(
      text,
    )
  )
    value += 3;
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(text)) value += 2;
  return value;
}

@Injectable()
export class ArticleEvidenceService {
  constructor(private readonly database: DatabaseService) {}

  async create(
    articleId: number,
    title: string,
  ): Promise<ArticleEvidencePacket> {
    const result = await this.database.query<EvidenceRow>(
      `SELECT
        provenance.source_id,
        source.name AS source_name,
        COALESCE(provenance.article_url, article.canonical_url) AS source_url,
        COALESCE(provenance.source_text, article.summary) AS source_text
       FROM articles article
       JOIN article_sources provenance ON provenance.article_id = article.id
       JOIN sources source ON source.id = provenance.source_id
       WHERE article.id = $1
       ORDER BY provenance.source_id ASC, provenance.external_id ASC`,
      [articleId],
    );
    return this.build(articleId, title, result.rows);
  }

  build(
    articleId: number,
    title: string,
    rows: EvidenceRow[],
  ): ArticleEvidencePacket {
    const titleTokens = new Set(
      normalizeFact(title)
        .split(' ')
        .filter((token) => token.length >= 3),
    );
    const candidates = new Map<string, Candidate>();
    let totalUsefulCharacters = 0;
    let sentenceCount = 0;

    rows.forEach((row, rowIndex) => {
      const sourceText = row.source_text?.trim();
      if (!sourceText) return;
      totalUsefulCharacters += sourceText.length;
      const parts = sentences(sourceText);
      sentenceCount += parts.length;
      const source: EvidenceSource = {
        sourceId: row.source_id,
        sourceName: row.source_name,
        sourceUrl: row.source_url,
      };

      parts.forEach((part, sentenceIndex) => {
        const hasNumber = /\d/.test(part);
        const windowStart = hasNumber
          ? Math.max(0, sentenceIndex - 1)
          : sentenceIndex;
        const windowEnd = hasNumber
          ? Math.min(parts.length, sentenceIndex + 2)
          : sentenceIndex + 1;
        const text = parts.slice(windowStart, windowEnd).join(' ');
        const normalized = normalizeFact(text);
        const existing = candidates.get(normalized);
        if (existing) {
          if (
            !existing.sources.some((item) => item.sourceId === source.sourceId)
          ) {
            existing.sources.push(source);
          }
          return;
        }
        candidates.set(normalized, {
          text,
          normalized,
          score: score(text, titleTokens),
          order: rowIndex * 10_000 + sentenceIndex,
          sources: [source],
        });
      });
    });

    const ranked = [...candidates.values()].sort(
      (left, right) =>
        right.score - left.score ||
        left.order - right.order ||
        left.normalized.localeCompare(right.normalized),
    );
    const selected: Candidate[] = [];
    let usedCharacters = 0;
    for (const candidate of ranked) {
      if (usedCharacters + candidate.text.length > MAX_PACKET_CHARACTERS)
        continue;
      selected.push(candidate);
      usedCharacters += candidate.text.length;
    }

    const chunks = selected.map((candidate, index): EvidenceChunk => {
      const hash = createHash('sha256')
        .update(candidate.text)
        .update('\n')
        .update(
          candidate.sources
            .map((source) => source.sourceId)
            .sort((a, b) => a - b)
            .join(','),
        )
        .digest('hex');
      return {
        id: `E${index + 1}`,
        text: candidate.text,
        sources: candidate.sources.sort((a, b) => a.sourceId - b.sourceId),
        hash,
      };
    });
    const packetHash = createHash('sha256')
      .update(title)
      .update('\n')
      .update(chunks.map((chunk) => chunk.hash).join('\n'))
      .digest('hex');

    return {
      articleId,
      title,
      evidenceLevel:
        totalUsefulCharacters >= 800 && sentenceCount >= 4 ? 'rich' : 'limited',
      chunks,
      hash: packetHash,
    };
  }
}
