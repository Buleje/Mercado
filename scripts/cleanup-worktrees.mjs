import { rm, readdir } from "node:fs/promises";
import { join } from "node:path";

const WORKTREES_DIR = ".claude/worktrees";

async function main() {
  let items;
  try {
    items = await readdir(WORKTREES_DIR);
  } catch {
    console.log("No worktrees dir");
    return;
  }
  for (const name of items) {
    const p = join(WORKTREES_DIR, name);
    try {
      await rm(p, { recursive: true, force: true });
      console.log(`removed ${p}`);
    } catch (e) {
      console.log(`skip ${p}: ${String(e.message).slice(0, 80)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
