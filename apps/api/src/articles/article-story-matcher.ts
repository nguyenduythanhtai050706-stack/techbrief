const STOP_WORDS = new Set([
  'and',
  'are',
  'best',
  'first',
  'for',
  'from',
  'guide',
  'has',
  'how',
  'its',
  'latest',
  'look',
  'new',
  'really',
  'review',
  'that',
  'the',
  'this',
  'too',
  'was',
  'what',
  'when',
  'where',
  'why',
  'with',
  'you',
  'your',
]);

function titleTerms(title: string): Set<string> {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

  return new Set(
    normalized
      .split(/\s+/)
      .filter(
        (term) =>
          term.length >= 3 &&
          !STOP_WORDS.has(term) &&
          !/^20\d{2}$/.test(term),
      ),
  );
}

export function isLikelySameStory(leftTitle: string, rightTitle: string): boolean {
  const left = titleTerms(leftTitle);
  const right = titleTerms(rightTitle);
  const smallerSize = Math.min(left.size, right.size);
  if (smallerSize < 3) return false;

  const common = [...left].filter((term) => right.has(term));
  if (common.length < 3 || common.length / smallerSize < 0.4) return false;

  return common.some((term) => /\d/.test(term) || term.length >= 6);
}
