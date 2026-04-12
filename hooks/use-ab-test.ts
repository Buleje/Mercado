"use client";
import { useState, useEffect, useCallback, useRef } from "react";

type Variant = { id: string; label: string; weight: number };
type ABTest = { id: string; name: string; variants: Variant[]; active: boolean };

function getVisitorId(): string {
  const key = "buleje-visitor-id";
  let id = typeof window !== "undefined" ? localStorage.getItem(key) : null;
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem(key, id); } catch { /* */ }
  }
  return id;
}

function assignVariant(test: ABTest, visitorId: string): Variant {
  let hash = 0;
  const str = test.id + visitorId;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const totalWeight = test.variants.reduce((s, v) => s + v.weight, 0);
  let pick = Math.abs(hash) % totalWeight;
  for (const v of test.variants) {
    pick -= v.weight;
    if (pick < 0) return v;
  }
  return test.variants[0];
}

/** Use an A/B test by name. Returns assigned variant + tracking functions. */
export function useABTest(testName: string) {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [test, setTest] = useState<ABTest | null>(null);
  const visitorId = useRef<string>("");
  const tracked = useRef(false);

  useEffect(() => {
    visitorId.current = getVisitorId();
    fetch("/api/ab-tests?active=1")
      .then(r => r.ok ? r.json() : [])
      .then((tests: ABTest[]) => {
        const t = tests.find(t => t.name === testName);
        if (t) {
          setTest(t);
          setVariant(assignVariant(t, visitorId.current));
        }
      })
      .catch(() => {});
  }, [testName]);

  const trackImpression = useCallback(() => {
    if (!test || !variant || tracked.current) return;
    tracked.current = true;
    fetch("/api/ab-tests/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId: test.id, variantId: variant.id, visitorId: visitorId.current, event: "impression" }),
    }).catch(() => {});
  }, [test, variant]);

  const trackConversion = useCallback((value?: number) => {
    if (!test || !variant) return;
    fetch("/api/ab-tests/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId: test.id, variantId: variant.id, visitorId: visitorId.current, event: "conversion", value }),
    }).catch(() => {});
  }, [test, variant]);

  return { variant, trackImpression, trackConversion, isLoaded: !!test };
}
