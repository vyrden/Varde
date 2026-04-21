import { defineConfig } from 'drizzle-kit';

const url = process.env.VARDE_DATABASE_URL ?? 'postgres://varde:varde@localhost:5432/varde';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/pg.ts',
  out: './migrations/pg',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
