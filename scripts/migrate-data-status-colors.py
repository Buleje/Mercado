#!/usr/bin/env python3
"""
Migra Tailwind classes de status (emerald/amber/red 500-700) a tokens semánticos
del design system para que hereden con cualquier preset.

Reglas:
  bg-emerald-500    → bg-[var(--data-success)]
  text-emerald-500  → text-[var(--data-success)]
  border-emerald-500→ border-[var(--data-success)]
  ring-emerald-500  → ring-[var(--data-success)]
  bg-emerald-500/30 → bg-[var(--data-success)]/30   (preserva opacity modifier)

Idem para:
  amber-* → --data-warning
  red-*   → --data-error

NO toca:
  - emerald-50 / 100 / 200 (esos son backgrounds suaves, hereda via globals.css)
  - amber-50/100/200, red-50/100/200
  - chart libraries (Recharts files)
  - PDFs / emails
  - status pills de fixed-state (preservamos red-50 etc para mantener delta visual)
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
    # Charts: usan colors directos para series (legibilidad fija)
    "/charts/",
]

PROPERTIES = ["bg", "text", "border", "ring", "from", "to", "via", "fill", "stroke"]

# Token destinations
STATUS_MAP = {
    "emerald": "--data-success",
    "amber":   "--data-warning",
    "red":     "--data-error",
}

# Shades 500/600/700 sólo (50/100/200 son derivados que ya existen como --data-X-50 etc)
SHADES = ["500", "600", "700"]


def build_replacements():
    replacements = []
    for color, token in STATUS_MAP.items():
        for shade in SHADES:
            for prop in PROPERTIES:
                # Con opacity modifier: bg-emerald-500/30 → bg-[var(...)]/30
                pattern_op = re.compile(
                    r'\b' + prop + r'-' + color + r'-' + shade + r'/(\d+)\b'
                )
                replacements.append((pattern_op, lambda m, p=prop, t=token: f'{p}-[var({t})]/{m.group(1)}'))
                # Sin opacity: bg-emerald-500 → bg-[var(...)]
                pattern = re.compile(
                    r'\b' + prop + r'-' + color + r'-' + shade + r'\b(?!/)'
                )
                # Para shade 600/700 usar -600/-700 variants
                if shade == "500":
                    target_token = token
                elif shade == "600":
                    target_token = token + "-600"
                else:  # 700
                    target_token = token + "-700"
                replacements.append((pattern, lambda m, p=prop, t=target_token: f'{p}-[var({t})]'))
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
