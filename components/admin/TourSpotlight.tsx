"use client";

import React, { useEffect, useState, useCallback } from "react";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourSpotlightProps {
  targetSelector: string;
  padding?: number;
  borderRadius?: number;
  children: React.ReactNode;
}

export function TourSpotlight({
  targetSelector,
  padding = 8,
  borderRadius = 16,
  children,
}: TourSpotlightProps) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector(targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - padding,
      left: r.left - padding,
      width: r.width + padding * 2,
      height: r.height + padding * 2,
    });
  }, [targetSelector, padding]);

  useEffect(() => {
    // Initial measure after a small delay so DOM settles
    const t = setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // Scroll target into view when selector changes
  useEffect(() => {
    const el = document.querySelector(targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Re-measure after scroll
      const t = setTimeout(measure, 300);
      return () => clearTimeout(t);
    }
  }, [targetSelector, measure]);

  return (
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: "none" }}>
      {/* SVG overlay with cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "auto" }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx={borderRadius}
                ry={borderRadius}
                fill="black"
                style={{
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Spotlight highlight ring */}
      {rect && (
        <div
          className="absolute border-2 border-white/30 pointer-events-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius,
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 0 0 4px rgba(45, 106, 79, 0.3)",
          }}
        />
      )}

      {/* Tooltip container positioned relative to spotlight */}
      {rect && (
        <TooltipPositioner rect={rect}>{children}</TooltipPositioner>
      )}
    </div>
  );
}

function TooltipPositioner({
  rect,
  children,
}: {
  rect: SpotlightRect;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    arrowSide: "left" | "top" | "bottom";
  }>({ top: 0, left: 0, arrowSide: "left" });

  useEffect(() => {
    const tooltipWidth = 340;
    const tooltipHeight = 260;
    const gap = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer to the right of the element
    let left = rect.left + rect.width + gap;
    let top = rect.top + rect.height / 2 - tooltipHeight / 2;
    let arrowSide: "left" | "top" | "bottom" = "left";

    // If overflows right, put below
    if (left + tooltipWidth > vw - 16) {
      left = Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2);
      top = rect.top + rect.height + gap;
      arrowSide = "top";
    }

    // If overflows bottom, put above
    if (top + tooltipHeight > vh - 16) {
      if (arrowSide === "top") {
        top = rect.top - tooltipHeight - gap;
        arrowSide = "bottom";
      } else {
        top = Math.max(16, vh - tooltipHeight - 16);
      }
    }

    // Ensure not off-screen top
    if (top < 16) top = 16;
    if (left < 16) left = 16;

    setPosition({ top, left, arrowSide });
  }, [rect]);

  return (
    <div
      className="absolute"
      style={{
        top: position.top,
        left: position.left,
        pointerEvents: "auto",
        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 61,
      }}
    >
      {/* Arrow */}
      {position.arrowSide === "left" && (
        <div
          className="absolute w-3 h-3 bg-white dark:bg-[#1e293b] rotate-45"
          style={{
            left: -6,
            top: "50%",
            marginTop: -6,
          }}
        />
      )}
      {position.arrowSide === "top" && (
        <div
          className="absolute w-3 h-3 bg-white dark:bg-[#1e293b] rotate-45"
          style={{
            top: -6,
            left: 32,
          }}
        />
      )}
      {position.arrowSide === "bottom" && (
        <div
          className="absolute w-3 h-3 bg-white dark:bg-[#1e293b] rotate-45"
          style={{
            bottom: -6,
            left: 32,
          }}
        />
      )}
      {children}
    </div>
  );
}
