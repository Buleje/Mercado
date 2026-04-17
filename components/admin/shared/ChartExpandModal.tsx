"use client";

import { X } from "lucide-react";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  height?: number;
}

export default function ChartExpandModal({ title, onClose, children, height = 500 }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-card p-8 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-foreground">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-surface rounded-lg transition-colors">
          <X className="h-5 w-5 text-gray-500 dark:text-muted" />
        </button>
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}
