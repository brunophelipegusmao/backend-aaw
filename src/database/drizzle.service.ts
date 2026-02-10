import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  readonly client: Sql;
  readonly db: Db;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.getOrThrow<string>('DATABASE_URL');

    this.client = postgres(connectionString, {
      max: 10,
      ssl: connectionString.includes('neon.tech') ? 'require' : undefined,
      prepare: false,
    });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
