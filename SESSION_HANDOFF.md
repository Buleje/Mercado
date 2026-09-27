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
