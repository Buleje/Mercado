"use client";

import { useEffect } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function sendToGA(metric: Metric) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_value: metric.value,
    metric_delta: metric.delta,
    metric_rating: metric.rating,
    non_interaction: true,
  });
}

export default function WebVitalsReporter() {
  useEffect(() => {
    onCLS(sendToGA);
    onFCP(sendToGA);
    onINP(sendToGA);
    onLCP(sendToGA);
    onTTFB(sendToGA);
  }, []);

  return null;
}
