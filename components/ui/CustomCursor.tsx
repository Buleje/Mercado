"use client";

import { useEffect, useRef, useState } from "react";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -200, y: -200 });
  const haloPos = useRef({ x: -200, y: -200 });
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const isPointerDevice = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

  useEffect(() => {
    if (!isPointerDevice) return;

    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after { cursor: none !important; }
    `;
    document.head.appendChild(style);

    const onMove = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${e.clientX - 6}px, ${e.clientY - 6}px)`;
      }
    };

    let raf: number;
    const lerpHalo = () => {
      haloPos.current.x += (pos.current.x - haloPos.current.x) * 0.1;
      haloPos.current.y += (pos.current.y - haloPos.current.y) * 0.1;
      if (haloRef.current) {
        haloRef.current.style.transform = `translate(${haloPos.current.x - 20}px, ${haloPos.current.y - 20}px)`;
      }
      raf = requestAnimationFrame(lerpHalo);
    };
    raf = requestAnimationFrame(lerpHalo);

    const onOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest("a, button, [role='button'], input, select, textarea, [data-hover]")) {
        setHover(true);
      }
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest("a, button, [role='button'], input, select, textarea, [data-hover]")) {
        setHover(false);
      }
    };
    const onDown = () => setClicking(true);
    const onUp = () => setClicking(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);

    return () => {
      document.head.removeChild(style);
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isPointerDevice]);

  if (!isPointerDevice) return null;

  return (
    <>
      {/* Inner dot */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9999,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: hover ? "#f59e0b" : "#00B4A6",
          pointerEvents: "none",
          willChange: "transform",
          transform: "translate(-200px, -200px)",
          transition: "background 0.25s, width 0.2s, height 0.2s",
          scale: clicking ? "0.6" : "1",
          mixBlendMode: "difference",
        }}
      />
      {/* Outer halo (lerped) */}
      <div
        ref={haloRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 9998,
          width: hover ? 52 : 40,
          height: hover ? 52 : 40,
          borderRadius: "50%",
          border: `1.5px solid ${hover ? "rgba(245,158,11,0.6)" : "rgba(45,106,79,0.5)"}`,
          pointerEvents: "none",
          willChange: "transform",
          transform: "translate(-200px,-200px)",
          transition: "border-color 0.3s, width 0.3s, height 0.3s",
          backdropFilter: hover ? "invert(0.05)" : "none",
        }}
      />
    </>
  );
}
