"use client";

import { useEffect, useState } from "react";

export default function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      setPct(scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 200,
        height: 3,
        width: `${pct}%`,
        background: "linear-gradient(90deg, #00B4A6 0%, #33C4B8 40%, #f59e0b 100%)",
        boxShadow: "0 0 10px rgba(45,106,79,0.7), 0 0 20px rgba(45,106,79,0.3)",
        transition: "width 0.1s linear",
        pointerEvents: "none",
        borderRadius: "0 2px 2px 0",
      }}
    />
  );
}
