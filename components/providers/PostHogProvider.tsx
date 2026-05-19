"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// PERF 2026-05-12 (audit Performance P1): PostHog lazy import.
// Antes `import posthog from "posthog-js"` era estático en cada bundle
// cliente (~80KB gzip). Ahora carga con dynamic import después de
// requestIdleCallback — TTI -150ms en 3G de Pucallpa.

type PostHogClient = {
  init: (key: string, opts: Record<string, unknown>) => void;
  capture: (event: string, props?: Record<string, unknown>) => void;
};

let phClient: PostHogClient | null = null;
let phLoadPromise: Promise<PostHogClient | null> | null = null;

async function loadPostHog(): Promise<PostHogClient | null> {
  if (phClient) return phClient;
  if (phLoadPromise) return phLoadPromise;
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  phLoadPromise = import("posthog-js")
    .then((mod) => {
      const ph = mod.default as PostHogClient;
      ph.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        capture_pageview: false,
        capture_pageleave: true,
      });
      phClient = ph;
      return ph;
    })
    .catch(() => null);
  return phLoadPromise;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phReady, setPhReady] = useState(false);

  useEffect(() => {
    // Cargar PostHog en idle time (no compite con LCP/TTI)
    const idleCallback = (
      window as Window & { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));

    const handle = idleCallback(() => {
      loadPostHog().then((ph) => {
        if (ph) setPhReady(true);
      });
    });

    return () => {
      const cancelIdle = (
        window as Window & { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback;
      if (cancelIdle && typeof handle === "number") cancelIdle(handle);
    };
  }, []);

  useEffect(() => {
    if (!phReady || !pathname) return;
    loadPostHog().then((ph) => {
      if (!ph) return;
      let url = window.origin + pathname;
      const search = searchParams?.toString();
      if (search) url += `?${search}`;
      ph.capture("$pageview", { $current_url: url });
    });
  }, [pathname, searchParams, phReady]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <>
      <PostHogPageView />
      {children}
    </>
  );
}
