#!/usr/bin/env python3
"""
Migra Tailwind classes teal-500/600/700 a var(--accent) para herencia.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADMIN_DIRS = [ROOT / "components", ROOT / "app"]
EXCLUDE_PATTERNS = [
    "PDF.tsx",
    "PurchaseOrderPDF",
    "CatalogPDFGenerator",
    "OrderEmailTemplates",
    "chart-theme",
]

PROPERTIES = ["bg", "text", "border", "ring", "from", "to", "via", "fill", "stroke", "hover:bg", "hover:text", "hover:border", "dark:bg", "dark:text", "dark:hover:bg"]

# Map teal-500/600/700 → tokens
SHADE_TO_TOKEN = {
    "500": "--accent",
    "600": "--accent-dark",
    "700": "--accent-dark",
}


def build_replacements():
    replacements = []
    for shade, token in SHADE_TO_TOKEN.items():
        for prop in PROPERTIES:
            # Con opacity
            pattern_op = re.compile(r'\b' + re.escape(prop) + r'-teal-' + shade + r'/(\d+)\b')
            replacements.append((pattern_op, lambda m, p=prop, t=token: f'{p}-[var({t})]/{m.group(1)}'))
            # Sin opacity
            pattern = re.compile(r'\b' + re.escape(prop) + r'-teal-' + shade + r'\b(?!/)')
            replacements.append((pattern, lambda m, p=prop, t=token: f'{p}-[var({t})]'))
    return replacements


REPLACEMENTS = build_replacements()


def process_file(filepath: Path, apply: bool = True) -> int:
    text = filepath.read_text(encoding="utf-8")
    original = text
    total = 0
    for pattern, replacer in REPLACEMENTS:
        text, n = pattern.subn(replacer, text)
        total += n
    if apply and text != original:
        filepath.write_text(text, encoding="utf-8")
    return total


def main():
    apply = "--apply" in sys.argv
    files_changed = 0
    total = 0
    for admin_dir in ADMIN_DIRS:
        for filepath in list(admin_dir.rglob("*.tsx")) + list(admin_dir.rglob("*.ts")):
            rel = str(filepath.relative_to(ROOT))
            if any(pat in rel for pat in EXCLUDE_PATTERNS):
                continue
            if rel.endswith(".d.ts"):
                continue
            n = process_file(filepath, apply=apply)
            if n:
                files_changed += 1
                total += n
                print(f"  {rel}: {n}")
    print()
    print(f"Files {'modified' if apply else 'would change'}: {files_changed}")
    print(f"Total replacements: {total}")


if __name__ == "__main__":
    main()
