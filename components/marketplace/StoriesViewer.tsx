"use client";

import { useEffect, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { m, AnimatePresence } from "framer-motion";

export interface StorySlide {
  id: string;
  headline: string;
  subheadline?: string;
  bg: string; // tailwind gradient class e.g. "from-rose-400 to-pink-500"
  emoji?: string;
  ctaLabel: string;
  ctaHref: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slides: StorySlide[];
  title?: string;
  autoAdvanceMs?: number;
}

const DEFAULT_AUTO_MS = 5000;

export default function StoriesViewer({
  open,
  onOpenChange,
  slides,
  title = "Destacados",
  autoAdvanceMs = DEFAULT_AUTO_MS,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const total = slides.length;

  const next = useCallback(() => {
    setIdx((i) => {
      if (i >= total - 1) {
        onOpenChange(false);
        return i;
      }
      return i + 1;
    });
    setProgress(0);
  }, [total, onOpenChange]);

  const prev = useCallback(() => {
    setIdx((i) => (i <= 0 ? 0 : i - 1));
    setProgress(0);
  }, []);

  // Reset on open
  useEffect(() => {
    if (!open) {
      setIdx(0);
      setProgress(0);
      setPaused(false);
    }
  }, [open]);

  // Progress tick
  useEffect(() => {
    if (!open || paused) return;
    const interval = 40; // ms
    const step = (interval / autoAdvanceMs) * 100;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return Math.min(p + step, 100);
      });
    }, interval);
    return () => clearInterval(id);
  }, [open, paused, idx, autoAdvanceMs, next]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev]);

  const slide = slides[idx];
  if (!slide) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-[61] flex items-center justify-center p-0 sm:p-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div
            className="relative w-full h-full sm:max-w-md sm:max-h-[90vh] sm:rounded-3xl overflow-hidden shadow-2xl"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => setPaused(false)}
            onPointerLeave={() => setPaused(false)}
          >
            {/* Progress bars */}
            <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
                >
                  <div
                    className="h-full bg-white transition-all duration-75"
                    style={{
                      width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Close */}
            <Dialog.Close className="absolute top-6 right-4 z-10 h-8 w-8 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30 transition-colors">
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>

            {/* Slide */}
            <AnimatePresence mode="wait">
              <m.div
                key={slide.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={cn(
                  "absolute inset-0 bg-linear-to-br flex flex-col justify-end p-10 text-white",
                  slide.bg,
                )}
              >
                {/* Subtle grid pattern overlay */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />

                {/* Index */}
                <m.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  transition={{ delay: 0.3 }}
                  className="relative text-xs font-bold uppercase tracking-[var(--ls-wider)]"
                >
                  {String(slides.findIndex((s) => s.id === slide.id) + 1).padStart(2, "0")}
                  <span className="mx-2 opacity-50">/</span>
                  {String(slides.length).padStart(2, "0")}
                </m.span>

                <m.h2
                  initial={{ y: 18, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.5 }}
                  className="relative mt-3 text-4xl sm:text-5xl font-extrabold leading-[1.05] tracking-tight max-w-sm"
                >
                  {slide.headline}
                </m.h2>

                {slide.subheadline && (
                  <m.p
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="relative mt-3 text-base text-white/75 max-w-sm leading-relaxed"
                  >
                    {slide.subheadline}
                  </m.p>
                )}

                <m.div
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  className="relative mt-7"
                >
                  <Link
                    href={slide.ctaHref}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-gray-900 text-sm font-bold hover:bg-gray-100 transition-colors active:scale-95"
                  >
                    {slide.ctaLabel}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </Link>
                </m.div>
              </m.div>
            </AnimatePresence>

            {/* Prev / Next navigation zones */}
            <button
              type="button"
              onClick={prev}
              aria-label="Anterior"
              className="absolute left-0 top-16 bottom-16 w-1/3 z-[5] flex items-center justify-start pl-2 opacity-0 hover:opacity-100 transition-opacity"
            >
              <ChevronLeft className="h-6 w-6 text-white/80" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Siguiente"
              className="absolute right-0 top-16 bottom-16 w-1/3 z-[5] flex items-center justify-end pr-2 opacity-0 hover:opacity-100 transition-opacity"
            >
              <ChevronRight className="h-6 w-6 text-white/80" />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
