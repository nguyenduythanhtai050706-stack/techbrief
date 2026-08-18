import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListArticlesDto } from './list-articles.dto';

const validationErrors = async (input: object) =>
  validate(plainToInstance(ListArticlesDto, input));

describe('ListArticlesDto', () => {
  it('applies valid defaults for an omitted query', async () => {
    const dto = plainToInstance(ListArticlesDto, {});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ limit: '101' }, 'limit'],
    [{ sourceId: '1.5' }, 'sourceId'],
    [{ from: 'not-a-date' }, 'from'],
    [{ to: 'not-a-date' }, 'to'],
  ])('rejects an invalid %s query field', async (input, property) => {
    const errors = await validationErrors(input);

    expect(errors.map((error) => error.property)).toContain(property);
  });

  it('converts valid numeric query strings to numbers', async () => {
    const dto = plainToInstance(ListArticlesDto, {
      page: '2',
      limit: '50',
      sourceId: '7',
    });

    expect(dto).toMatchObject({ page: 2, limit: 50, sourceId: 7 });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
