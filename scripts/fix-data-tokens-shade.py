#!/usr/bin/env python3
"""
Fix-up: corrige el mapeo del shade de los tokens semánticos.

ANTES (bug):
  bg-emerald-500 → bg-[var(--data-success)]   ← --data-success aliased a -700 en :root
  bg-amber-500   → bg-[var(--data-warning)]   ← idem
  bg-red-500     → bg-[var(--data-error)]

AHORA (fix):
  bg-[var(--data-success)]/X → bg-[var(--data-success-500)]/X   (preserva opacity)
  bg-[var(--data-warning)]   → bg-[var(--data-warning-500)]
  bg-[var(--data-error)]     → bg-[var(--data-error-500)]

Idem para text, border, ring, from, to, via, fill, stroke, hover:bg, dark:bg, etc.

Excluye:
  - PDFs / emails / charts
  - Archivos donde el var(--data-X) se usa SIN modifier de prop (p.ej. boxShadow, gradient
    inline) porque ahí sí tiene sentido el alias 700 (intenso). Esos no llevan prefix.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIRS = [ROOT / "components", ROOT / "app"]
EXCLUDE = ["PDF.tsx", "PurchaseOrderPDF", "CatalogPDFGenerator", "OrderEmailTemplates", "chart-theme"]

PROPERTIES = ["bg", "text", "border", "ring", "from", "to", "via", "fill", "stroke",
              "hover:bg", "hover:text", "hover:border", "hover:ring",
              "dark:bg", "dark:text", "dark:border",
              "focus:ring", "focus:border",
              "before:bg", "after:bg",
              "decoration"]

TOKENS = ["data-success", "data-warning", "data-error", "data-info"]


def build_replacements():
    out = []
    for token in TOKENS:
        for prop in PROPERTIES:
            esc = re.escape(prop)
            # bg-[var(--data-warning)]/X → bg-[var(--data-warning-500)]/X
            p_op = re.compile(r'\b' + esc + r'-\[var\(--' + token + r'\)\]/(\d+)\b')
            out.append((p_op, lambda m, p=prop, t=token: f'{p}-[var(--{t}-500)]/{m.group(1)}'))
            # bg-[var(--data-warning)] → bg-[var(--data-warning-500)]
            p_no = re.compile(r'\b' + esc + r'-\[var\(--' + token + r'\)\](?!/)')
            out.append((p_no, lambda m, p=prop, t=token: f'{p}-[var(--{t}-500)]'))
    return out


REPS = build_replacements()


def process(filepath: Path, apply: bool) -> int:
    text = filepath.read_text(encoding="utf-8")
    orig = text
    n = 0
    for p, r in REPS:
        text, k = p.subn(r, text)
        n += k
    if apply and text != orig:
        filepath.write_text(text, encoding="utf-8")
    return n


def main():
    apply = "--apply" in sys.argv
    files = 0
    total = 0
    for d in DIRS:
        for fp in list(d.rglob("*.tsx")) + list(d.rglob("*.ts")):
            rel = str(fp.relative_to(ROOT))
            if any(x in rel for x in EXCLUDE):
                continue
            if rel.endswith(".d.ts"):
                continue
            n = process(fp, apply)
            if n:
                files += 1
                total += n
                print(f"  {rel}: {n}")
    print()
    print(f"Files {'modified' if apply else 'would change'}: {files}")
    print(f"Total replacements: {total}")


if __name__ == "__main__":
    main()
