# SESSION HANDOFF — 2026-09-24 (mañana): crédito de la nube + plan «patio por permiso» y rediseño de Consumos/Saldos

**Estado:** árbol limpio, push al día (`d09b6bfca`). Límite semanal al **99 % hasta las 16:00 del 24-09** → Brandon eligió construir AQUÍ después de esa hora.

**Hecho hoy:**
- Crédito de la nube reclamado: quedan ~USD 247 de 250 y **vence el 05-11**. Se usa por la **web** (claude.ai/code → Mercado → rama); el `claude --cloud` del CLI da un falso «set up GitHub». Memoria `credito-nube-250-2026-09`.
- 2 ramas de la nube **revisadas y con tests locales verdes, SIN mergear:** `nube/selector-permiso-activo` (`202f4406c`, 5/5) · `nube/permiso-filtra` (`cc1c8ef4f`, 15/15 + typecheck; **no toca el patio**).
- `7a22231a9` gitignore `scripts/tmp-*.mjs` + `main-data.json` · `d09b6bfca` radar: 2 «pendientes» ya estaban hechos (gate `e6ca252cf`, reserva vencida `2c334edcd`).

**A las 16:00, en orden** (Brandon eligió las 4 opciones + texto libre = prioridad 1):
0. Leer el informe final de la sesión de la nube «Filtro de permiso en libro CTP» (qué pantallas quedaron sin filtrar y por qué).
1. Navegador claro/oscuro 1280/400 de las 2 ramas → merge (primero `permiso-filtra`: toca `CTPLibroOperaciones` y `wood-entries`).
2. **TEXTO LIBRE:** «mejorar las páginas ya creadas: diseño más ordenado y distribuido, cambios de alto nivel y profundos en diseño, UX, accesibilidad». Ámbito: pestañas **Consumos** (`CtpConsumosView`, 1 184 líneas) y **Saldos** (`CtpSaldosView`, 916 líneas, 15 `useState`) del LO-CTP, ambas con más de 300 líneas. Arrancar con capturas (`node scripts/qa-capturas.mjs`) + axe + mapa de bloques; diseño con la skill `bsm-design-system`.
3. **Resumen por permiso:** una fila por permiso (trozas · m³ · guías · especies · la más vieja); clic = filtra.
4. **«Solo este permiso»** de la banda también en el patio (`/api/admin/forestal/trozas/patio` + `CtpPatio*`).
5. **Filtros de alto valor:** días en el patio, rango de diámetro/largo, sin código («-»), CITES. Hoy hay 0 de 4 (`CtpPatioFiltros` trae especie, guía, permiso, proveedor, resolución, soloLibres y texto).
6. **Exportar el patio por permiso** a Excel (`exportToExcel` = 1 archivo por llamada).

**Decisión de diseño que hay que validar con capturas:** «¿cuántas trozas me quedan?» hoy se responde en **Consumos** (cuya ayuda dice «Qué madera entró a la sierra»), y la edad del patio está en **Saldos**. Propuesta: el resumen por permiso va en Saldos (el balance), con salto a Consumos ya filtrado para elegir trozas. Nada de página nueva.

**Datos reales** (Blas, 24-09, SQL de solo lectura, `scripts/tmp-patio-por-permiso.mjs`): **77 trozas / 155,65 m³ en 2 permisos.** `10-HUA-PUE/PER-FMP-2026-007` 46 trozas / 135,59 m³ / 8 guías / 7 especies · `19-SEC/REG-PLT-2021-017` 31 trozas / 20,06 m³ / 1 guía / 1 especie · 0 sin contrato · la más vieja del 08-09. Criterio: no consumida, no despachada, sin retrozos. **NO descuenta las guías sin recepcionar**: cruzarlo contra el KPI «Trozas en el patio» antes de presentarlo como el dato.

**Cómo construir:** INITIATIVE (5+ archivos, 2 áreas) → workflow por fases, o `frontend` + `backend` con archivos disjuntos + `reviewer` con contexto fresco. Nunca worktree.

**Siguen del 23-09:** avisos de plazos caídos (WhatsApp 401 + Resend) · reserva de Juancho vencida (la decide Brandon) · reiniciar Chrome · probar el audio real del cubicador · «Reinicio gratis» de Opus 5.5 hasta el 22-10 (lo decide Brandon).

---

> Entradas anteriores: `docs/handoff-archivo.md`.
