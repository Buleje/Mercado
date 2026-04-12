# ADR-049 — Backup off-site cifrado client-side

**Fecha:** 2026-04-10
**Estado:** ✅ APPLIED (script + workflow) · ⏳ PENDING (secrets en GH + bucket)
**Bloque:** Seguridad y Compliance · #05 del backlog 2026-04-10

## Contexto
Hoy el único backup es el que Supabase hace automáticamente dentro de la misma plataforma. Si Supabase sufre un incidente (cuenta suspendida, región down, corruption), no hay copia independiente. El DR drill mensual (ADR-035) prueba el restore, pero usa backups locales de Supabase — no es un backup off-site real.

## Decisión
1. Script `scripts/backup-offsite.ts`:
   - `pg_dump --format=custom --compress=9` del `DATABASE_URL`
   - Cifrado **client-side AES-256-GCM** con `BACKUP_ENCRYPTION_KEY` (32 bytes b64)
   - Upload a **S3 o R2** vía `@aws-sdk/client-s3` (instalado on-demand en CI)
   - Flag `--verify` descarga + descifra + compara SHA-256 con el original
2. GitHub Actions workflow `.github/workflows/backup-offsite.yml`:
   - Cron diario `0 3 * * *` (03:00 UTC = 22:00 Lima)
   - `workflow_dispatch` para runs manuales
   - `concurrency: backup-offsite` evita runs solapados
   - Notificación Sentry on failure
3. Retención (a implementar en bucket lifecycle policy):
   - Diarios: 30 días
   - Mensuales (1º del mes): 12 meses
   - Anuales (1 enero): 3 años

## Consecuencias
- ✅ Primer backup off-site real. Supabase down ≠ pérdida total.
- ✅ Cifrado client-side: S3/R2 nunca ve datos en claro.
- ✅ GitHub Actions ya está wire-up con secrets Sentry.
- ⚠️ Brandon debe crear:
  - Bucket S3 o R2 (recomendado R2 por precio — egress gratis)
  - IAM user con `s3:PutObject` solo
  - Generar clave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  - Añadir secrets a GitHub: `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT` (solo R2), `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`
- ⚠️ Clave de cifrado debe vivir en password manager (NO en GitHub secrets únicamente — si GH se compromete, los backups también).

## Alternativas consideradas
- **Vercel Cron + pg_dump en Function** — descartado. `pg_dump` es binario de sistema (no disponible en Vercel Functions) y puede exceder 300s timeout.
- **Supabase wal-g** — requiere self-hosted Postgres. No aplica al plan actual.
- **Server-side encryption S3** — AWS tiene las claves, no cumple con "off-site cifrado" real.

## Comando para run manual
```bash
# Local (con pg_dump instalado):
npx tsx scripts/backup-offsite.ts --verify

# GitHub Actions:
gh workflow run backup-offsite.yml
```

## Referencias
- `scripts/backup-offsite.ts` (nuevo)
- `.github/workflows/backup-offsite.yml` (nuevo)
- ADR-035 DR drills
- AWS S3 / Cloudflare R2 docs
