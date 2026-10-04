# SESSION HANDOFF — 2026-10-04: Configuración en 8 secciones, mezcla de dos sesiones, cupo/T6 del importador, seguridad del Drive, Documentos del plan

**Estado:** ✅ TODO COMMITEADO Y SUBIDO (último `6ce5d15a5`, rama `audit/storefront-mejoras-verificadas-2026-06-15`). Árbol limpio salvo `.claude/` sin versionar. Typecheck 0; suite completa en verde al cierre (las 2 fallas que dio, corregidas).

**Hecho:**
1. **Configuración (`?tab=config`)**: 20 tarjetas → 8 secciones con `?vista=` y buscador por campo; fuera 36 de 91 campos sin lector; sin datos de ejemplo de Buleje; bloqueo si `/api/settings` falla; «Te falta» con datos reales; Mi panel y Tienda web plegables (memoria `ajustes-auditoria-2026-10-04`).
2. **Mezcla** de la rama remota (28 commits de otra sesión, Libro TH/cámaras) con la local (117): 18 conflictos resueltos conservando las dos (`4e449f940`). El arranque ahora avisa si GitHub va adelante.
3. **Libro TH**: cupo T9 también al agrandar talas en el importador; vista previa con T9/T6 y motivo; **T6 con motivo** para guías verificadas en SERFOR (ADR-468); Control del permiso con un solo selector; plan cargado 1 vez.
4. **Seguridad Drive (CRÍTICO, ya existía)**: permisos por toda la cadena de carpetas en todas las rutas, `/api/api-keys` solo admin/dueño, carpetas de otro negocio y ciclos rechazados (`6e0105ded`, `bfd2774b8`; memoria `drive-permisos-por-rol-2026-10-04`).
5. **Documentos del plan de manejo** rescatado de un stash olvidado del 30-09 (ADR-467). Stash y ramas de respaldo borrados; `.claude/autonomo/plan-2026-09-29.md` restaurado (solo vivía en el stash).
6. Herramientas: pre-commit corre los 13 tests guardianes y los que leen el fuente; `scripts/dev-helpers/rol-probe.mjs --todos` (usuarios QA por rol: memoria `qa-usuarios-por-rol`); paso `fallar` en `qa-capturas`.

**PENDIENTE (decisiones de Brandon):**
- Importador: dos guías del mismo árbol con el interruptor de talas apagado en una (caso raro, anotado por el agente).
- La capa `z-10` del menú «Copiar» del plan sigue disparando el aviso informativo `ds-no-z-arbitrary-admin` (cambiarla taparía el desplegable del directorio).
- El tenant QA forestal responde 403 en `/api/tenants/resolve` (está marcado inactivo).

---

# SESSION HANDOFF — 2026-09-27 (noche): PC + monitor, despacho ADR-444, guía rediseñada, días de producción ADR-445

**Estado:** ⚠️ **SIN COMMIT** — ~204 archivos (esta sesión + las 5 rondas de la anterior). Gates verdes al cierre: typecheck ✅ · eslint (168 archivos tocados) exit 0 · 13 archivos de test del área 149/149 · base real ADR-444 13/13. Brandon NO pidió commitear: **primera decisión de mañana** (sugerido: commits por ronda con el método de `commit-aislado-exportar-el-indice`).

**Hecho (sin commit):**
1. **ADR-444 — un paquete en UNA guía vigente + despacho atómico** (`docs/adr/ADR-444-…`). Registrar la guía (borrador o emitida) saca el paquete de Productos disponibles y del selector; una 2.ª guía con el mismo paquete da 409 sin grabar; anular lo devuelve; un 422 ya no deja la línea grabada. Revisado (2 defectos corregidos: código de troza = código de paquete; producto «de cualquier paquete»). Verificado en el navegador con PQ-001 en `main`. Memoria `despacho-paquete-una-guia-adr444`.
2. **Blas SL-681:** anuladas las líneas de despacho #2 y #3 (duplicadas por el bug), con motivo en la auditoría. #1 (SL-680, GTF 19-00000-000001) intacta. SL-681 libre para registrarse UNA vez.
3. **Rediseño de «Datos de la guía de transporte forestal»** (`CtpGuiaDatosTab.tsx`, `ctp-guia-bloques.tsx`, `ctp-guia-piezas.tsx`): dos columnas en el orden del papel, Ficha como resumen, «Faltan N» por bloque, ⓘ en vez de párrafos; 1390 → 1000 px. El pie del modal ya no cuenta «Fecha de inicio del traslado».
4. **Disponibles sin «0» al cargar** (y Trozas disponibles + gráficos): esqueleto mientras carga.
5. **ADR-445 — días de «Producir sin lote» con origen y salida** (`docs/adr/ADR-445-…`, `lib/forestal/origen-y-salida-del-dia.ts`): marca cubicado/por tipo/mixto/por declarar y salida (guías, borrador, sin guía, en patio); chips de la semana; «Agregar cubicación» con cuadre por especie+tipo contra TODAS las corridas atadas; cubicaciones leídas de la base (el caché de PlatformSettings es por instancia) con bloqueo y 409 por versión. Revisado (5 defectos corregidos). Blas: 63,5 % del m³ por tipo, 4 días (76,66 m³) salieron sin guía. Memoria `ctp-dias-origen-salida-adr445`. Datos QA en `main`: cubicaciones «QA ADR-445 …» (el 14/08 sigue por tipo para probar).
6. **PC de Brandon** (memoria `pc-ronda-2026-09-27-monitor-apps`): 13 apps fuera, +38 GB, monitor ASUS VG249QM5F verificado (RGB 8 bits 240 Hz por HDMI), batería tope 80 %, «modo trabajo» del panel (`~/.local/bin/panel-trabajo` / `panel-desarrollo` + íconos en el Escritorio: 0,64 GB y 0,12 s por consulta), tareas «Cazar congelamiento» y «Compactar Ubuntu de madrugada» (03:00, **se salta si Claude está abierto**). Congelamientos: 70 % en partidas de LoL; la opción UMA (2 GB) existe en la BIOS pero está oculta — escribirla es firmware, **sin OK de Brandon no se toca**.

**PENDIENTE (decisiones de Brandon):**
- Commitear (ver arriba).
- Registrar las salidas «sin guía» de Blas desde su Anexo 04 (puente anexo→despacho, ver `flujo-ingreso-despacho-blas-27-09`) — la recomendada.
- Marcas del día con texto; Consumos sin «0» al cargar (mismo patrón que Disponibles, `CtpConsumosSeccion2Kpis.tsx`).
- ADR-444 §Pendientes: apartar no rechaza en servidor un paquete ya en guía; `buscarPaquetes` no dice en qué guía va; consumos de `create` en tx aparte.
- CLAUDE.md desactualizado: 1.262 endpoints (dice 1.230) y 260 modelos (dice 254); tamaño total medido 1,27 M líneas de código.

---

# SESSION HANDOFF — 2026-09-27: guías guardadas (ADR-442), lotes (ADR-443), Trozas y Productos disponibles, mapa del flujo

**Estado:** ⚠️ **SIN COMMIT** — ~131 archivos de cinco rondas (Brandon no pidió commitear todavía; no mezclar con otra tarea). Gates verdes al cierre de cada ronda: typecheck, eslint 0, tokens 0, tests propios + `vitest related`. Migración aplicada a mano y marcada: `20260927_guias_guardadas_adr442` (tabla nueva `ForestGuiaGuardada`, EXPAND). Dev server reiniciado tras `prisma generate`.

**Hecho (sin commit):**
1. **ADR-442 Guías guardadas antes del ingreso**: guardar la guía (N° registro + GTF + 6 casilleros) antes del camión; el ingreso ve los papeles solo (etiqueta `gtf:`); «ingresada» se deduce; carpeta Drive `Guías forestales (GTF)/titular/permiso/GTF N°`; ronda 2: vencimiento a la vista, leer de una foto (`gtf-ocr` + `numeroRegistro`; **en local no hay clave de visión: lectura real NO medida**), ordenar papeles viejos (Blas: 3, botón lo aprieta Brandon), `contratoDelTenant`/`contratoPropio` (permiso de otro negocio rechazado en ingresos, gastos, adelantos, fletes, corridas).
2. **ADR-443 Lotes**: propuesta de lotes por especie+permiso (Blas 11 lotes/46 trozas), tarjetas simples, 3 lotes de Blas reparados (auditados; SQL de reversión en el ADR/transcript), reabrir pide confirmación, «¿De qué trozas salió?» (dos actos, bandeja por motivo; Blas 44/44 sin origen, 0 vinculables hasta arreglar Ingresos).
3. **Pestaña «Trozas disponibles»** (`?vista=trozas-disponibles`): por permiso con sus especies, por especie, por troza, KPIs, 3 gráficos, Excel; salió de Consumos (queda una línea con enlace). Un criterio: en el patio; sin recepcionar aparte. Revisada y corregida.

4. **Productos disponibles** rehecha con el formato de Trozas disponibles (revisada y corregida: cifras con el saldo del libro).
5. **Mapa del flujo ingreso→despacho** (memoria `flujo-ingreso-despacho-blas-27-09`): Blas despacha con 10 Anexos 04 (99 m³) fuera del libro, 0 despachos; lo único que falta construir es el puente Anexo 04 → despacho (+ registrar las 9 salidas pasadas + salida de madera de servicio). NO cerrar agosto antes del puente.

**PENDIENTE (decisiones de Brandon):** commitear (sugerido: 3 commits, uno por ronda); cerrar agosto en Blas antes de vincular en masa; corregir llegada de 7 guías y acomodar trozas en Ingresos para destrabar ~21 producciones; probar la lectura de GTF por foto donde haya clave de visión.

---

# SESSION HANDOFF — 2026-09-26 (noche): QR de ficha, lotes por especie, cubicación Oxapampa, pago por PT, WhatsApp del negocio

**Estado:** push al día (`f914f7278`). Árbol limpio. Commits de la sesión: `2800f6bd8` (QR ficha + lotes por especie), `9bb4cc551` (Oxapampa, medir escaneando, acta del conteo, tarjeta de troza), `849854759` (WhatsApp del negocio), `f914f7278` (pago madera/flete por PT Oxapampa).

**PENDIENTE — decisiones de Brandon antes de pasar a producción** (runbook `docs/runbooks/deploy-rama-a-produccion.md`):
1. Producción = deploy por CLI del 16-07 (rama `prod`, commit `7774f5ca`), no `master`. Los previews fallan por `DATABASE_URL` de **Preview** en Vercel: host `aws-0` y usuario `app_user` → debe ser `postgres.<ref>@aws-1-us-east-2.pooler.supabase.com:6543`. Revisar también `DIRECT_URL`/`AUTH_SECRET` en Preview y Production.
2. Riesgos al desplegar: caja de Blas abierta desde el 11-06 (el cierre automático la cerraría sin conteo a las 18:00); 13 crons nuevos (3 mandan WhatsApp de madrugada); 10 migraciones aplicadas a mano sin marcar (NUNCA `prisma migrate deploy` sin `migrate resolve --applied`); backup off-site 0/167; simulacro DR hace 130 días; Rolling Releases no disponible. Rollback: Instant Rollback a `dpl_EWnizDb4JVE2JPkqG7FYnmQ6VmM2`.
3. Un `vercel login` de un agente entró a otra cuenta (`bulejelauea-9406`): revisar.

**PENDIENTE — canales** (Brandon, en Meta): agregar su número a la lista permitida del número de prueba; crear plantilla `aviso_libro_ctp` (Utilidad, español, con texto fijo alrededor de {{1}}: «Aviso del Libro CTP: {{1}}. Detalle en el panel.»). Correo: `RESEND_FROM_EMAIL` con `onboarding@resend.dev` sólo entrega al dueño; en Vercel Production hay que ponerla también. `buleje.pe` no existe en DNS. Reportes a la hora exacta: runbook `docs/runbooks/reportes-hora-exacta.md` (pg_cron + pg_net + Vault), no aplicado.

**Otros:** «hoy» en UTC en 21 archivos de `components/admin/forestal` (a las 19:00 Lima proponen mañana; sólo se arregló el alta de flete). `CtpPatioBandeja.tsx` usa `text-xs`/`ts-2xs`.

---

# SESSION HANDOFF — 2026-09-24 (cierre): colores del logo, indicadores en la barra y filtros en el encabezado

**Estado:** push al día. Árbol limpio salvo `.claude/improvement-radar.md` (ruido del hook de co-edición; no se commitea).

**Hecho en esta ronda (commits `74bb8a06f`, `68703a7a1`, `7ddf9d01f`; gates verdes: typecheck, eslint 0 avisos, anidado, vitest 969 relacionados):**
- **Colores del logo** (turquesa #00A29C + tinta #12181E, medidos en `public/brand/buleje-logo.png`). El verde salía del preset «emerald» (hue 175), del `Btn primary` = verde de éxito y del estilo «ejecutivo» con coral. ~80 botones de acción a la marca; estados siguen verdes. Oscuro: fondos con texto blanco 4,86:1. Memoria `colores-del-logo-no-verde`.
- **Indicadores en la barra** (`components/admin/forestal/kpis-plegables.tsx`): Ingresos, GTF, Producción, Despacho, Lotes, Disponibles, Consumos (Patio y S2) sin fila propia.
- **Filtros en el `<th>`** en 17 pantallas (forestal + admin), con copia `sm:hidden` para el celular y «Quitar filtros» cuando el filtro deja 0.

**PENDIENTE para la próxima sesión (en orden):**
1. **Decisión de Brandon — producción:** `PlatformSetting brand.primaryColor = #00B4A6` pinta tiendas y la raíz del admin (sidebar, portales). Pasarlo a `#00A29C` (1 valor en /superadmin o SQL). Hoy el panel ya es #00A29C porque el preset define toda la escala.
2. Tienda / marketplace: 159 botones con verde de éxito como CTA (fuera del admin, no se tocaron).
3. `AdminModal` no acepta ⓘ junto al título (prop `ayuda`).
4. Resto del admin fuera del forestal con texto de ayuda a la vista: 1 399 palabras en 62 pestañas (peores: Compras 104, Canales 89, Rendimiento 89) — `node scripts/medir-orden-admin.mjs`.
5. Navegador de toda la ronda en 1280 px (se verificó 1600 y 400).
6. Siguen del 23-09: avisos de plazos caídos (WhatsApp 401 + Resend) · reserva de Juancho vencida · audio real del cubicador.

---

> Entradas anteriores: `docs/handoff-archivo.md`.
