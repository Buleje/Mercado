"use client";

import dynamic from "next/dynamic";
import { Brain } from "lucide-react";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AICommandCenter = dynamic(
  () => import("@/components/admin/ai-center/AICommandCenter"),
  { loading: S }
);

export default function AICommandModule() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-extrabold text-gray-900 dark:text-foreground">AI Command Center</h1>
        <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-bold">IA</span>
      </div>
      <AICommandCenter />
    </div>
  );
}
