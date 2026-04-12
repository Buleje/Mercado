# Acciones manuales pendientes

**Fecha:** 2026-04-06

Estas son las acciones que **solo Brandon puede hacer** porque requieren acceso a dashboards externos. Cada bloque tiene los pasos exactos y links directos.

---

## 1. Activar Rolling Releases en Vercel (2 minutos)

✅ Config ya está en `vercel.json` (10% → 50% → 100% manual approval)
❌ Falta el toggle del feature en el dashboard

### Pasos

1. Abrir https://vercel.com/dashboard
2. Seleccionar proyecto **Buleje**
3. **Settings** → **General** → **Rolling Releases**
4. Activar **"Enable Rolling Releases"**
5. Confirmar que detecte la config de `vercel.json`

### Verificación

En el próximo deploy a producción, el dashboard de Vercel debe mostrar el progreso por stages (10% → 50% → 100%).

---

## 2. Crear las 4 reglas de alerta en Sentry (15 minutos)

✅ `lib/sentry-alerts.ts` ya tiene los helpers programáticos
✅ `docs/sentry-alert-setup.md` documenta las 4 reglas
❌ Faltan crear las reglas en el dashboard

### Pasos

Ir a https://sentry.io → proyecto Buleje → **Alerts** → **Create Alert Rule**

| # | Tipo | Nombre | Condición |
|---|---|---|---|
| 1 | Issue Alert | `Buleje — Error Rate Alto` | "Number of events > 10 in 1 hour" + `is:unresolved` |
| 2 | Metric Alert | `Buleje — Latencia Alta (P95)` | `transaction.duration` P95 > 500ms warning, > 1000ms critical |
| 3 | Issue Alert | `Buleje — Excepción No Manejada` | "A new issue is created" + `handled:no` |
| 4 | Metric Alert | `Buleje — Tasa de Fallos Crítica` | `transaction.failure_rate` > 5% warning, > 10% critical |

Acción para todas: enviar email + Slack al canal `#alertas-bsm`.

Detalles completos en `docs/sentry-alert-setup.md`.

---

## 3. Configurar Doppler (Fase 1 — primeros 30 minutos)

✅ Plan completo en `docs/doppler.md`
❌ Cuenta y CLI no instalados

### Setup inicial (acciones humanas)

- [ ] Crear cuenta en https://doppler.com (plan **Team gratis** hasta 5 usuarios)
- [ ] Crear proyecto `bodega-san-martin`
- [ ] Crear 3 configs: `dev`, `stg`, `prd`
- [ ] Instalar CLI:
  ```bash
  scoop install doppler
  # o: npm install -g @dopplerhq/cli
  ```
- [ ] `doppler login`
- [ ] Importar `.env.local` actual:
  ```bash
  cd bodega-san-martin
  doppler setup --project bodega-san-martin --config dev
  doppler secrets upload .env.local
  ```

Las Fases 2–6 (integración con Vercel, GitHub Actions, limpieza) están en `docs/doppler.md`.

---

## 4. Verificar que release-please cree su primer PR (1 minuto)

✅ Workflow corregido en esta sesión (`config-file` y `manifest-file` apuntan al subdirectorio)
❌ Falta verificar que funcione en GitHub

### Pasos

1. Después del próximo `git push` a `master`, ir a https://github.com/Buleje/[repo]/actions
2. Confirmar que el workflow **"Release Please"** corrió sin error
3. Ir a la pestaña **Pull Requests** — debe haber un PR nuevo titulado `chore(main): release X.Y.Z` listo para merge
4. Hacer merge del PR → release-please creará el tag y la release de GitHub automáticamente

### Si falla

- Revisar logs del workflow en Actions
- Verificar que `bodega-san-martin/release-please-config.json` y `bodega-san-martin/.release-please-manifest.json` existen
- Confirmar permisos `contents: write` y `pull-requests: write` en el workflow

---

## Resumen del impacto

| Acción | Tiempo | Cierra brecha del audit |
|---|---|---|
| Rolling Releases | 2 min | #29 (Blue-Green/Canary) → ✅ |
| Reglas Sentry | 15 min | #31 (APM + alertas) → ✅ completo |
| Doppler Fase 1 | 30 min | #21 (Secret Management) → desbloquea progreso |
| Verificar release-please | 1 min | #14 (CHANGELOG automático) → ✅ verificado |

**Total: ~50 minutos para cerrar 3 brechas del audit doc.**
