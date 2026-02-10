import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const migrationsDir = join(process.cwd(), 'src/database/migrations');

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ssl: databaseUrl.includes('neon.tech') ? 'require' : undefined,
    prepare: false,
  });

  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await sql<{ id: string }[]>`
      SELECT id FROM __migrations WHERE id = ${file} LIMIT 1
    `;

    if (alreadyApplied.length > 0) {
      continue;
    }

    const content = await readFile(join(migrationsDir, file), 'utf8');
    await sql.unsafe(content);
    await sql`INSERT INTO __migrations (id) VALUES (${file})`;

    console.log(`Applied migration ${file}`);
  }

  await sql.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
