#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const f = "components/admin/inicio/MarketplaceAdvancedCharts.tsx";
let src = readFileSync(f, "utf8");

// 1. hideHeader in all <DashboardSection>
if (!src.includes("hideHeader")) {
  const count = (src.match(/<DashboardSection\n/g) || []).length;
  src = src.replace(/<DashboardSection\n/g, "<DashboardSection\n          hideHeader\n");
  console.log(`patched ${count} DashboardSection with hideHeader`);
}

// 2. span: "full" for charts needing width
const FULL = ["ingresos-6m", "top-productos-marketplace", "heatmap-marketplace"];
let spanCount = 0;
for (const id of FULL) {
  const re = new RegExp(`(id:\\s*"${id}",)(\\s*\\n\\s*span:)?`, "g");
  src = src.replace(re, (m, idPart, hasSpan) => {
    if (hasSpan) return m;
    spanCount++;
    return `${idPart}\n      span: "full",`;
  });
}
console.log(`patched ${spanCount} spans`);

// 3. layout="grid"
const before = src;
src = src.replace(
  /return <DraggableSections items=\{sections\} storageKey="marketplace-advanced-order" \/>/,
  'return <DraggableSections items={sections} storageKey="marketplace-advanced-order" layout="grid" />',
);
if (src !== before) console.log("layout=grid applied");

writeFileSync(f, src);
console.log("done:", f);
