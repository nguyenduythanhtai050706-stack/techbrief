export const MAX_SOURCE_TEXT_LENGTH = 32_000;

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi,
    (entity, code: string) => {
      if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      return Number.isFinite(point) && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    },
  );
}

function replaceUnsafeControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
      ? ' '
      : character;
  }).join('');
}

export function normalizeSourceText(value: string | undefined): string | null {
  if (!value?.trim()) return null;

  const text = replaceUnsafeControlCharacters(
    decodeHtmlEntities(
      value
        .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<!--([\s\S]*?)-->/g, ' ')
        .replace(
          /<\/?(?:p|div|section|article|h[1-6]|li|blockquote|br|hr)\b[^>]*>/gi,
          ' ',
        )
        .replace(/<[^>]+>/g, ' '),
    ),
  )
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, MAX_SOURCE_TEXT_LENGTH).trim() : null;
}
