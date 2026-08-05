import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSourceDto } from './dto/create-source.dto';

describe('CreateSourceDto', () => {
  it('rejects URLs that do not use HTTP or HTTPS', async () => {
    const dto = plainToInstance(CreateSourceDto, {
      name: 'Invalid source',
      url: 'ftp://example.com/feed.xml',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('url');
  });
});
