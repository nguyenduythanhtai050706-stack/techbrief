import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ArticleIdDto } from './article-id.dto';

describe('ArticleIdDto', () => {
  it('converts a positive ID to a number', async () => {
    const dto = plainToInstance(ArticleIdDto, { id: '42' });

    expect(dto.id).toBe(42);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['0', '-1', '1.5', 'article-42'])('rejects invalid ID %s', async (id) => {
    const errors = await validate(plainToInstance(ArticleIdDto, { id }));

    expect(errors.map((error) => error.property)).toContain('id');
  });
});
