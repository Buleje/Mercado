"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import type { PlanId } from "@/lib/superadmin-types";

interface PlanSelectProps {
  slug: string;
  current: PlanId;
  onChanged: (newPlan: PlanId) => void;
}

export function PlanSelect({ slug, current, onChanged }: PlanSelectProps) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (plan: PlanId) => {
    if (plan === current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) onChanged(plan);
    } finally {
      setSaving(false);
    }
  };

  if (saving) return <Loader2 className="w-4 h-4 animate-spin text-teal-500" />;

  return (
    <div className="relative">
      <select
        value={current}
        onChange={(e) => void handleChange(e.target.value as PlanId)}
        className="appearance-none bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 pr-6 text-xs text-gray-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40"
      >
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="business">Business</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}
