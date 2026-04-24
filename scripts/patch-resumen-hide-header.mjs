#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const f = "components/admin/inicio/InicioMultiCharts.tsx";
let src = readFileSync(f, "utf8");
if (!src.includes("hideHeader")) {
  const count = (src.match(/<DashboardSection\n/g) || []).length;
  src = src.replace(/<DashboardSection\n/g, "<DashboardSection\n          hideHeader\n");
  writeFileSync(f, src);
  console.log(`patched ${count} in ${f}`);
} else {
  console.log("already patched:", f);
}
