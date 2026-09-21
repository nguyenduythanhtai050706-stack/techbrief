import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type {
  BriefCategory,
  LocalizedBriefV2,
} from '../src/articles/article-brief.types';
import { validateBriefV2 } from '../src/articles/article-brief.types';
import { ArticleEvidenceService } from '../src/articles/article-evidence.service';
import { DatabaseService } from '../src/database/database.service';
import { DatabaseModule } from '../src/database/database.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  providers: [ArticleEvidenceService],
})
class EvaluationModule {}

interface StoredBriefV2 {
  schemaVersion: 2;
  en: LocalizedBriefV2;
  vi: LocalizedBriefV2;
  evidenceLevel: 'rich' | 'limited';
}

interface EvaluationRow {
  id: number;
  title: string;
  categories: BriefCategory[];
  translations: StoredBriefV2;
  source_names: string[];
  source_text_kinds: string[];
}

const wordCount = (value: string) =>
  value.trim().split(/\s+/u).filter(Boolean).length;

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EvaluationModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  try {
    const database = app.get(DatabaseService);
    const evidence = app.get(ArticleEvidenceService);
    const result = await database.query<EvaluationRow>(
      `SELECT article.id, article.title,
        article.effective_categories AS categories,
        article.translations,
        array_agg(DISTINCT source.name ORDER BY source.name) AS source_names,
        array_agg(DISTINCT provenance.source_text_kind ORDER BY provenance.source_text_kind) AS source_text_kinds
       FROM articles article
       JOIN article_sources provenance ON provenance.article_id = article.id
       JOIN sources source ON source.id = provenance.source_id
       WHERE article.translations->>'schemaVersion' = '2'
       GROUP BY article.id
       ORDER BY COALESCE(article.published_at, article.created_at) DESC, article.id DESC
       LIMIT 20`,
    );

    if (result.rows.length < 12) {
      throw new Error(`EVALUATION_SAMPLE_TOO_SMALL:${result.rows.length}`);
    }
    const sourceNames = new Set(result.rows.flatMap((row) => row.source_names));
    if (sourceNames.size < 4) {
      throw new Error(
        `EVALUATION_SOURCE_COVERAGE_TOO_SMALL:${sourceNames.size}`,
      );
    }

    const report = [];
    let failed = false;
    for (const row of result.rows) {
      const packet = await evidence.create(row.id, row.title);
      try {
        const validated = validateBriefV2(
          {
            schemaVersion: 2,
            en: row.translations.en,
            vi: row.translations.vi,
            categories: row.categories,
          },
          { evidenceLevel: packet.evidenceLevel, evidence: packet.chunks },
        );
        report.push({
          articleId: row.id,
          status: 'pass',
          evidenceLevel: validated.evidenceLevel,
          enFeedWords: wordCount(validated.en.feedSummary),
          viFeedWords: wordCount(validated.vi.feedSummary),
          enDetailWords: wordCount(validated.en.summary),
          viDetailWords: wordCount(validated.vi.summary),
          enKeyPoints: validated.en.keyPoints.length,
          viKeyPoints: validated.vi.keyPoints.length,
          evidenceLinks: validated.evidence.length,
          evidenceKinds: row.source_text_kinds,
          sources: row.source_names,
          manualReview: [
            'attribution',
            'unsupported non-numeric claims',
            'EN/VI meaning',
          ],
        });
      } catch (error: unknown) {
        failed = true;
        report.push({
          articleId: row.id,
          status: 'fail',
          error: error instanceof Error ? error.message : 'UNKNOWN',
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          sampleSize: result.rows.length,
          sourceCount: sourceNames.size,
          articles: report,
        },
        null,
        2,
      ),
    );
    if (failed) throw new Error('EVALUATION_VALIDATION_FAILED');
  } finally {
    await app.close();
  }
}

run().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'EVALUATION_FAILED';
  console.error(code);
  process.exitCode = 1;
});
