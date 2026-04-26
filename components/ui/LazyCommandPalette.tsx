"use client";

import dynamic from "next/dynamic";

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), {});

export default function LazyCommandPalette() {
  return <CommandPalette />;
}
