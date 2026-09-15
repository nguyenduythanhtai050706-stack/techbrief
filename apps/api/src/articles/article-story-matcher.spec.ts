import { isLikelySameStory } from './article-story-matcher';

describe('isLikelySameStory', () => {
  it.each([
    [
      'Volvo increases the batteries for 2028 XC60 and XC90 plug-in refresh',
      '2028 Volvo XC60 and XC90 first look: Double the range and smarter safety, too',
    ],
    [
      'Volvo increases the batteries for 2028 XC60 and XC90 plug-in refresh',
      'Volvo’s plug-in hybrid XC60 and XC90 can really go the distance',
    ],
    [
      'Apple releases iOS 27, macOS Golden Gate 27 with Siri AI and Liquid Glass refinements',
      'Siri AI is here as Apple releases iOS 27, macOS Golden Gate and other major OS updates',
    ],
  ])('recognizes different headlines about the same event', (left, right) => {
    expect(isLikelySameStory(left, right)).toBe(true);
  });

  it.each([
    [
      'Volvo increases the batteries for 2028 XC60 and XC90 plug-in refresh',
      'New corners, new lights for 2028 Volvo XC40',
    ],
    [
      'Apple Home security camera features cost as much as $60 a month',
      'Apple releases iOS 27 with Siri AI',
    ],
    ['The best soundbars to buy', 'The best air purifiers for every room'],
  ])('keeps separate events apart', (left, right) => {
    expect(isLikelySameStory(left, right)).toBe(false);
  });
});
