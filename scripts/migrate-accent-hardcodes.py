#!/usr/bin/env python3
"""
Migra hardcoded teal/accent colors a tokens del design system para herencia 100%.

Patrones reemplazados:
  rgba(0,180,166, X)    → color-mix(in oklab, var(--accent) Y%, transparent)
  rgba(52,212,190, X)   → color-mix(in oklab, var(--accent) Y%, transparent) (variant clara)
  #00B4A6 / #00b4a6     → var(--accent)
  #00D4C8               → var(--accent)
  #009690 / #00998d     → var(--accent-dark)
  #007f74               → color-mix(in oklab, var(--accent) 75%, black)
  #33C4B8               → color-mix(in oklab, var(--accent) 70%, white)
  #34d4be               → color-mix(in oklab, var(--accent) 70%, white)
  #5eead4               → color-mix(in oklab, var(--accent) 60%, white)

Excluye:
  - PDFs (CatalogPDFGenerator, PurchaseOrderPDF, *PDF*.tsx)
  - Emails (OrderEmailTemplates) — inline CSS tradicional
  - chart-theme.ts (charts necesitan colors estables)
  - types.ts files (constantes referenciales no css)

Reporta archivos modificados y conteos por pattern.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Para herencia 100% en TODO el storefront/admin/superadmin, scopear a components/ y app/.
ADMIN_DIRS = [ROOT / "components", ROOT / "app"]
EXCLUDE_PATTERNS = [
    "PDF.tsx",
    "PurchaseOrderPDF",
    "CatalogPDFGenerator",
    "OrderEmailTemplates",
    "chart-theme",
    "ChatTab/types.ts",
    "DeliveryTab/types.ts",
    # Estos son colores fijos de marca (logo svg, brand mark) — no deben cambiar
    "/illustrations/",
    "BulejeMark",
    "BulejeIcons",
    "/superadmin/",  # superadmin tiene su propia paleta brand-purple
]

# Hex literal replacements — order matters (longer first)
HEX_REPLACEMENTS = [
    # accent darker
    (re.compile(r'#007f74\b', re.IGNORECASE), 'color-mix(in oklab, var(--accent) 75%, black)'),
    (re.compile(r'#009690\b', re.IGNORECASE), 'var(--accent-dark)'),
    (re.compile(r'#00998d\b', re.IGNORECASE), 'var(--accent-dark)'),
    # accent base
    (re.compile(r'#00B4A6\b', re.IGNORECASE), 'var(--accent)'),
    (re.compile(r'#00D4C8\b', re.IGNORECASE), 'var(--accent)'),
    # accent lighter
    (re.compile(r'#33C4B8\b', re.IGNORECASE), 'color-mix(in oklab, var(--accent) 70%, white)'),
    (re.compile(r'#34d4be\b', re.IGNORECASE), 'color-mix(in oklab, var(--accent) 70%, white)'),
    (re.compile(r'#5eead4\b', re.IGNORECASE), 'color-mix(in oklab, var(--accent) 60%, white)'),
]


def replace_rgba(text: str, r: int, g: int, b: int) -> tuple[str, int]:
    """Reemplaza rgba(r,g,b,X) con color-mix tomando X como porcentaje."""
    pattern = re.compile(
        r'rgba\(\s*' + str(r) + r'\s*,\s*' + str(g) + r'\s*,\s*' + str(b) + r'\s*,\s*([0-9.]+)\s*\)'
    )

    def to_color_mix(m: re.Match) -> str:
        opacity = float(m.group(1))
        # opacity 0.0 - 1.0 → percent 0 - 100
        pct = round(opacity * 100, 1)
        # int si es número entero
        pct_str = str(int(pct)) if pct == int(pct) else str(pct)
        return f'color-mix(in oklab, var(--accent) {pct_str}%, transparent)'

    return pattern.subn(to_color_mix, text)


def process_file(filepath: Path, apply: bool = True) -> dict:
    """Procesa un archivo. Devuelve dict con cambios por pattern."""
    text = filepath.read_text(encoding="utf-8")
    original = text
    counts: dict[str, int] = {}

    # rgba teal
    text, n = replace_rgba(text, 0, 180, 166)
    if n: counts["rgba(0,180,166)"] = n
    text, n = replace_rgba(text, 52, 212, 190)
    if n: counts["rgba(52,212,190)"] = n

    # hex
    for pattern, repl in HEX_REPLACEMENTS:
        new_text, n = pattern.subn(repl, text)
        if n:
            key = pattern.pattern.replace(r'\b', '')
            counts[key] = counts.get(key, 0) + n
            text = new_text

    if apply and text != original:
        filepath.write_text(text, encoding="utf-8")

    return counts


def main():
    apply = "--apply" in sys.argv
    files_changed = 0
    total_changes: dict[str, int] = {}

    for admin_dir in ADMIN_DIRS:
        for filepath in admin_dir.rglob("*.tsx"):
            rel = str(filepath.relative_to(ROOT))
            if any(pat in rel for pat in EXCLUDE_PATTERNS):
                continue
            counts = process_file(filepath, apply=apply)
            if counts:
                files_changed += 1
                line = " · ".join(f"{k}={v}" for k, v in counts.items())
                print(f"  {rel}: {line}")
                for k, v in counts.items():
                    total_changes[k] = total_changes.get(k, 0) + v
        # también .ts (excluyendo types/chart-theme)
        for filepath in admin_dir.rglob("*.ts"):
            rel = str(filepath.relative_to(ROOT))
            if any(pat in rel for pat in EXCLUDE_PATTERNS):
                continue
            if rel.endswith(".d.ts"):
                continue
            counts = process_file(filepath, apply=apply)
            if counts:
                files_changed += 1
                line = " · ".join(f"{k}={v}" for k, v in counts.items())
                print(f"  {rel}: {line}")
                for k, v in counts.items():
                    total_changes[k] = total_changes.get(k, 0) + v

    print()
    print(f"Files {'modified' if apply else 'would change'}: {files_changed}")
    print("Pattern summary:")
    for k, v in sorted(total_changes.items(), key=lambda kv: -kv[1]):
        print(f"  {k:30s} {v:4d}")


if __name__ == "__main__":
    main()
