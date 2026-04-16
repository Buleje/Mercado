import React from "react";
import { cn } from "@/lib/utils";

interface AdminTableProps {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

function AdminTable({ headers, children, className }: AdminTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-zinc-800/50">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-left text-xs text-gray-500 dark:text-zinc-400 uppercase tracking-wider font-medium"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-zinc-800">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export { AdminTable };
export default React.memo(AdminTable);
