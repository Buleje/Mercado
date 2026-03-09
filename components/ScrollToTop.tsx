"use client";

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setProgress(Math.min((window.scrollY / docHeight) * 100, 100));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center h-12 w-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary-dark hover:scale-110 active:scale-95 transition-all duration-200 animate-[fadeUp_0.3s_ease-out]"
    >
      {/* Progress ring */}
      <svg className="absolute inset-0 -rotate-90 h-12 w-12" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20" fill="none" strokeWidth="2.5" className="stroke-white/20" />
        <circle
          cx="24" cy="24" r="20" fill="none" strokeWidth="2.5"
          className="stroke-secondary transition-all duration-200"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <ArrowUp className="h-5 w-5 relative z-10" />
    </button>
  );
}
