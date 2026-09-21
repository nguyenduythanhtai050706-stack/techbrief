import { Injectable } from '@nestjs/common';
import { normalizeSourceText } from './source-text';

@Injectable()
export class ArticleContentExtractor {
  extract(html: string): string | null {
    const cleaned = html
      .replace(
        /<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        ' ',
      )
      .replace(
        /<[^>]+(?:class|id)=["'][^"']*(?:advert|promo|related|newsletter|social)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
        ' ',
      );
    const main =
      cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i)?.[1] ??
      cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ??
      cleaned.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ??
      cleaned;
    return normalizeSourceText(main);
  }
}
