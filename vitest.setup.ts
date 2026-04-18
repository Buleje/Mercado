import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Test environment env vars — satisfy lib/prisma.ts and lib/env.ts validation.
// Tests that touch Prisma mock the client, so this URL is never actually connected to.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-chars-long!!";
process.env.NEXT_PUBLIC_BASE_URL ??= "http://localhost:3000";

// Mock @sentry/nextjs globally so route imports don't try to load the Pages
// Router instrumentation (which fails in App Router projects on Next 16).
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setTags: vi.fn(),
  withScope: vi.fn((cb: (scope: unknown) => void) => cb({ setTag: vi.fn(), setContext: vi.fn() })),
  addBreadcrumb: vi.fn(),
  init: vi.fn(),
  getCurrentHub: vi.fn(() => ({ getScope: () => ({ setTag: vi.fn() }) })),
}));
