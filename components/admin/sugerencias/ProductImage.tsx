"use client";

import { cn } from "@/lib/utils";
import { Package } from "@buleje/design-system/icons";

interface Props {
  name: string;
  imageUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  rounded?: "md" | "lg" | "xl" | "2xl";
  showIcon?: boolean;
}

const SIZES = {
  xs: { box: "h-9 w-9", text: "text-[length:var(--ts-2xs)]", icon: "h-4 w-4" },
  sm: { box: "h-12 w-12", text: "text-xs", icon: "h-5 w-5" },
  md: { box: "h-16 w-16", text: "text-sm", icon: "h-6 w-6" },
  lg: { box: "h-24 w-24", text: "text-lg", icon: "h-8 w-8" },
  xl: { box: "h-32 w-32 sm:h-40 sm:w-40", text: "text-2xl", icon: "h-10 w-10" },
} as const;

const ROUNDED = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
} as const;

const PALETTES = [
  { bg: "#0F1B2D", fg: "#E2E8F0" },
  { bg: "#1F3A5F", fg: "#DBEAFE" },
  { bg: "#3D2C2E", fg: "#FECACA" },
  { bg: "#243B36", fg: "#A7F3D0" },
  { bg: "#3B2F1F", fg: "#FED7AA" },
  { bg: "#2D1B3D", fg: "#DDD6FE" },
  { bg: "#1F3F3D", fg: "#A5F3FC" },
  { bg: "#3D2D1F", fg: "#FDE68A" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "·";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ProductImage({
  name,
  imageUrl,
  size = "md",
  className,
  rounded = "lg",
  showIcon = false,
}: Props) {
  const dim = SIZES[size];
  const radius = ROUNDED[rounded];
  const palette = PALETTES[hashString(name) % PALETTES.length];
  const initials = getInitials(name);

  if (imageUrl) {
    return (
      <div
        className={cn(
          dim.box,
          radius,
          "shrink-0 overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        dim.box,
        radius,
        "shrink-0 flex items-center justify-center font-extrabold tabular-nums tracking-tight relative overflow-hidden border border-black/5",
        className,
      )}
      style={{ backgroundColor: palette.bg, color: palette.fg }}
      aria-label={name}
      title={name}
    >
      {showIcon ? (
        <Package className={cn("opacity-30 absolute", dim.icon)} />
      ) : null}
      <span className={cn(dim.text, "relative z-10")}>{initials}</span>
    </div>
  );
}
