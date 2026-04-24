import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";

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

// Global framer-motion mock — components across the app import `m` (LazyMotion
// variant) and `motion`. Keeping a single shared mock avoids cascading missing-
// export failures when individual tests forget to stub it.
vi.mock("framer-motion", () => {
  const passthrough = new Proxy(
    {},
    {
      get: (_t, tag: string) =>
        React.forwardRef<HTMLElement, Record<string, unknown>>(function MotionTag(
          { children, ...rest },
          ref,
        ) {
          return React.createElement(
            typeof tag === "string" ? tag : "div",
            { ...rest, ref },
            children as React.ReactNode,
          );
        }),
    },
  );
  return {
    motion: passthrough,
    m: passthrough,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    LazyMotion: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    MotionConfig: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    domAnimation: {},
    domMax: {},
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn(), set: vi.fn() }),
    useMotionValue: (initial: unknown) => ({ get: () => initial, set: vi.fn(), on: vi.fn() }),
    useTransform: (_v: unknown, _input: unknown, output: unknown[]) => output?.[0],
    useScroll: () => ({ scrollY: { get: () => 0 }, scrollYProgress: { get: () => 0 } }),
    useSpring: (initial: unknown) => ({ get: () => initial, set: vi.fn() }),
    useInView: () => true,
    useReducedMotion: () => false,
  };
});
