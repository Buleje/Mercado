"use client";

import { useEffect, useRef } from "react";
import { useInView } from "@/hooks/use-in-view";

interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * AnimatedCounter — GSAP-powered number count-up.
 * Fires once when the element enters the viewport.
 */
export default function AnimatedCounter({
  end,
  duration = 2.2,
  prefix = "",
  suffix = "",
  className = "",
}: CountUpProps) {
  const [ref, inView] = useInView({ threshold: 0.3 });
  const numRef = useRef<HTMLSpanElement>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!inView || played.current) return;
    played.current = true;

    let start: number | null = null;
    const startVal = 0;
    const ms = duration * 1000;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / ms, 1);
      // Ease-out quart
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startVal + (end - startVal) * eased);
      if (numRef.current) numRef.current.textContent = current.toLocaleString("es-PE");
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, end, duration]);

  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={className}>
      {prefix}
      <span ref={numRef}>0</span>
      {suffix}
    </span>
  );
}
