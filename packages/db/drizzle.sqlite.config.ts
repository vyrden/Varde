import { defineConfig } from 'drizzle-kit';

const url = process.env.VARDE_DATABASE_URL ?? './varde.sqlite';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/sqlite.ts',
  out: './migrations/sqlite',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
