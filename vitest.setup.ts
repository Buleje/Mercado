import "@testing-library/jest-dom/vitest";

// Test environment env vars — satisfy lib/prisma.ts and lib/env.ts validation.
// Tests that touch Prisma mock the client, so this URL is never actually connected to.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-chars-long!!";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";
