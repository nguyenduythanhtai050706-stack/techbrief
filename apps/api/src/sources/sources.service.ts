import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateSourceInput, Source } from './source.types';

interface DatabaseError {
  code?: string;
}

@Injectable()
export class SourcesService {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<Source[]> {
    const result = await this.database.query<Source>(
      'SELECT id, name, url, created_at FROM sources ORDER BY created_at DESC',
    );
    return result.rows;
  }

  async create(input: CreateSourceInput): Promise<Source> {
    try {
      const result = await this.database.query<Source>(
        `INSERT INTO sources (name, url)
         VALUES ($1, $2)
         RETURNING id, name, url, created_at`,
        [input.name, input.url],
      );
      return result.rows[0];
    } catch (error: unknown) {
      if ((error as DatabaseError).code === '23505') {
        throw new ConflictException(
          'A source with this URL already exists',
        );
      }
      throw error;
    }
  }
}
