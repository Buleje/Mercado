# Baseline DS Standardization — 2026-04-17

## TSC
- Errores pre-sprint: 0 (verified)

## Violations scan (pre-sprint)
- **text-gray-{300..900}** en components/admin: ~1,858 hits (220 archivos)
- **from "lucide-react"** en components/admin: 271 archivos
- **style={{...}}** inline en components/admin: 643 hits (220 archivos)
- **Hex literals** en admin: ~1,858
- **Heads h1/h2/h3 locales**: 624

## Estado del DS (pre)
- Existe: PrimaryButton, IconBadge, Text, Chip, tokens.ts, undoToast, hooks
- FALTAN (lo que crea este sprint):
  1. typography.tsx (PageTitle, SectionTitle, CardTitle, BodyText, Caption, Label, Kicker)
  2. layout.tsx (AdminPage, AdminSection, AdminGrid, AdminCenter)
  3. feedback.tsx (InfoAlert, WarningAlert, ErrorAlert, SuccessAlert, EmptyState, LoadingState)
  4. data-display.tsx (StatCard, ChartWrapper, DataTable, BadgeStatus)
  5. icons.ts (re-export único)
