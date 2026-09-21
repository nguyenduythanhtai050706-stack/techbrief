import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ArticleBriefRepository } from './article-brief.repository';
import { GeminiBriefService } from './gemini-brief.service';
import { ArticlesCacheService } from './articles-cache.service';
import { ArticleEvidenceService } from './article-evidence.service';

export interface BriefRunResult {
  status: 'completed' | 'partial' | 'disabled' | 'busy';
  processed: number;
  failed: number;
  error?: string;
}

@Injectable()
export class ArticleBriefService {
  private running = false;
  constructor(
    private readonly repository: ArticleBriefRepository,
    private readonly gemini: GeminiBriefService,
    private readonly cache: ArticlesCacheService,
    private readonly evidence: ArticleEvidenceService,
  ) {}

  async run(limit = 10): Promise<BriefRunResult> {
    if (!this.gemini.enabled)
      return { status: 'disabled', processed: 0, failed: 0 };
    if (this.running) return { status: 'busy', processed: 0, failed: 0 };
    this.running = true;
    const result: BriefRunResult = {
      status: 'completed',
      processed: 0,
      failed: 0,
    };
    try {
      for (let index = 0; index < Math.min(20, Math.max(0, limit)); index++) {
        const token = randomUUID();
        const input = await this.repository.claim(token);
        if (!input) break;
        try {
          const packet = await this.evidence.create(input.id, input.title);
          if (packet.chunks.length === 0)
            throw new Error('INVALID_BRIEF_EVIDENCE');
          const brief = await this.gemini.generateV2(packet);
          if (
            await this.repository.save(input, token, this.gemini.model, brief)
          ) {
            result.processed++;
            await this.cache.invalidateArticles();
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : '';
          const code =
            /^(GEMINI_HTTP_\d{3}|GEMINI_UNAVAILABLE|GEMINI_KEY_MISSING|INVALID_BRIEF|INVALID_BRIEF_EVIDENCE)$/.test(
              message,
            )
              ? message
              : 'BRIEF_FAILED';
          await this.repository.fail(input.id, token, code);
          result.failed++;
          result.status = 'partial';
          result.error = code;
          // Stop the batch on API/quota failures rather than burning remaining quota.
          if (code !== 'INVALID_BRIEF' && code !== 'INVALID_BRIEF_EVIDENCE')
            break;
        }
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
