# LESSONS.md — Aprendizajes acumulados del SWARM

> El agente `scribe` actualiza este archivo al cerrar cada ola.
> El agente `optimizer` lo lee antes de cada ola para sugerir mejoras.

---

## Ola 1 — 2026-04-10 (pre-SWARM, sistema Waves)

### Que funciono bien
- **3 terminales paralelas** completaron 8 items sin conflictos de archivos
- **Fire-and-forget** en WhatsApp/email evito bloqueos en el happy path
- **TSC como gate final** detecto 1 error (ZodError.errors → .issues) que se fixeo en <1 min
- **Reusar componentes existentes** (RFMSegmentationPanel) ahorro crear desde cero

### Que salio mal
- **`claude -p` headless no persiste escrituras en Windows** — perdio tiempo. Solucion: usar Agent subagents background
- **Bug #2 y #6 ya estaban arreglados** — el roadmap no reflejaba estado real. Solucion: verificar estado actual antes de asignar
- **Sin contratos formales** — front trabajo bien porque los items eran independientes, pero en Ola 2 (#9 cupones) front necesita el endpoint de back

### Regla nueva
- Antes de asignar un item, verificar con `grep` si ya esta implementado
- Preferir Agent(..., run_in_background=true) sobre `claude -p` headless en Windows
