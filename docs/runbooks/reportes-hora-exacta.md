# Runbook — Reportes diarios forestales a la hora exacta (ADR-439)

> Escrito 2026-09-26. **No aplicado.** Es una acción sobre producción: la aprueba el dueño.

## Por qué

El plan de Vercel sólo permite crons diarios: los reportes salen en 4 momentos fijos (7, 13, 18 y 21 h, `vercel.json`) y cada uno cae en cualquier minuto de su hora. El endpoint es idempotente por (reporte, día), así que un disparador externo cada 30 min hace que cada reporte salga a la hora elegida (p. ej. 18:30). Cada disparo a `/api/cron/reportes-diarios/hora-exacta` deja una marca de vida: si la última tiene < 65 min, el editor dice «Llega a las 18:30.»; si el job muere, vuelve solo a la ventana de Vercel.

## Antes de aplicar (bloqueos medidos el 26-09)

| Bloqueo | Medido | Qué hacer |
|---|---|---|
| Producción no tiene el endpoint | `https://mercado-brandon-luis-projects-9cf56555.vercel.app` sirve un build de `master` del 09-05; `/api/cron/reportes-diarios` da **404**. La rama de trabajo va ~2 861 commits por delante de `master` y sus previews fallan | Desplegar la rama (merge a `master` o promover) |
| Correo caído | 0 de 20 envíos: «buleje.pe not verified» en Resend; `buleje.pe` **no existe en DNS** | Registrar el dominio (o usar uno propio ya registrado) y verificarlo en Resend |
| WhatsApp caído | «401 Cannot parse access token» | Token nuevo de Meta en `TWILIO_*`/WhatsApp según canal |

Comprobar: `curl -s -o /dev/null -w "%{http_code}" https://<DOMINIO>/api/cron/reportes-diarios/hora-exacta` sin token debe dar **401** (existe y pide secreto), no 404.

## Aplicar (Supabase: pg_cron + pg_net + Vault)

`pg_cron` y `pg_net` están disponibles sin instalar; Vault ya está instalado. GitHub Actions no sirve: `schedule` sólo corre desde la rama por defecto y GitHub lo demora al inicio de cada hora.

```sql
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- El secreto NO va en texto plano en el job: queda en Vault.
select vault.create_secret('<CRON_SECRET de Vercel Production>', 'reportes_diarios_cron_secret', 'ADR-439');

select cron.schedule('reportes-diarios-hora-exacta', '*/30 * * * *', $job$
  select net.http_get(
    url := 'https://<DOMINIO>/api/cron/reportes-diarios/hora-exacta',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'reportes_diarios_cron_secret')),
    timeout_milliseconds := 290000  -- el default de pg_net (2 s) cortaría la respuesta
  );
$job$);
```

## Verificar

```sql
select status_code, left(content, 300), created
from net._http_response order by created desc limit 5;
```

- `200` con `"disparo":"hora-exacta"` = funciona.
- `401` = el secreto de Vault no es el `CRON_SECRET` de Vercel Production.
- `404` = el endpoint no está desplegado.

En pantalla: Libro CTP → Acciones → Reportes diarios dice «Llega a las 18:30.».

## Apagar

```sql
select cron.unschedule('reportes-diarios-hora-exacta');
delete from vault.secrets where name = 'reportes_diarios_cron_secret';
```

En ≤ 65 min la pantalla vuelve sola a la ventana de Vercel y siguen los 4 crons de `vercel.json`.

## Plan B

cron-job.org cada 30 min, zona America/Lima, con el mismo header `Authorization: Bearer <CRON_SECRET>`. Necesita una cuenta del dueño y pegar el secreto en un tercero.
