# ADR-472 — Controles de la cámara (mover, detección, micrófono, alarma, foto) por EZVIZ Open con el permiso de Hik-Connect for Teams

- **Estado:** aceptado (2026-10-05). Probado con las dos DS-2CFSP4/4G de Blas (detalle y respuestas: `docs/camaras/funciones-hikvision.md`).
- **Relacionados:** ADR-471 (video de Hik-Connect for Teams en el panel), ADR-421 (PTZ por ISAPI directo), ADR-411 (fotos por webhook).
- **Pedido (Brandon, 05-10):** «integrar todas o la mayoría de funciones de Hikvision: mover la cámara, activar/desactivar el micrófono, activar la alarma, activar/desactivar la detección de movimiento y otras; y que el en vivo se vea más amplio».

## Contexto

- La OpenAPI de Hik-Connect for Teams (V2.11.800) no documenta PTZ, voz, sirena ni armado.
- El `appToken` que entrega `platform/v1/streamtoken/get` para el reproductor es un permiso de **EZVIZ Open**. Medido el 05-10: con él contestan 200 en `isaopen.ezvizlife.com` `device/capacity`, `device/info`, `device/status/get`, `ptz/start|stop`, `defence/set`, `camera/video/sound/set`, `device/capture`, `v3/device/defence` (apagar) y el ISAPI por la nube (`/api/hikvision/ISAPI/...`). La voz (`live/talk/url`) contesta **20018**.
- `ezuikit-js` 9.0.23 usa las mismas rutas `ptz/start|stop` con el mismo permiso desde el navegador.

## Decisión

1. **Todo control sale del servidor**, nunca del navegador: `GET/POST /api/admin/camaras/[id]/control`. El navegador ya tiene el `appToken` (lo necesita EZUIKit, riesgo aceptado en ADR-471), pero el panel no le agrega capacidades nuevas con él.
2. **Dominio fijo:** el permiso sólo viaja a `https://*.ezvizlife.com` (el `streamAreaDomain` ya filtrado por `dominioDe` en ADR-471, y re-chequeado antes de cada pedido). La foto se baja sólo de `https://*.ezvizlife.com`, `redirect: "error"`, tope 8 MB. **Sin proxy ISAPI genérico**: el ISAPI por la nube abre la configuración entera de la cámara (y de todas las de la cuenta); sólo lo usa el script de diagnóstico, en GET.
3. **Roles:** mover y foto = quienes ven el vivo (admin, dueño, almacenero; el encargado entra siempre por `requireAdmin`). Detección, micrófono y alarma = sólo admin/dueño (`soloAdminODueno`). Cajero, 403. El rol se mira **antes** del cupo (un pedido prohibido no gasta el cupo de nadie).
4. **Cupos compartidos entre instancias** (`createDistributedRateLimiter`, Upstash; sin Upstash, en memoria) y **por persona** (por 4G varios celulares comparten IP): mover 150/min, foto 10/min, **detección/micrófono 6 cada 10 min** (cada desarme avisa al dueño), alarma 3 cada 10 min por persona y por IP. **Apagar la alarma: sin cupo.**
5. **Auditoría (Ley 29733 / control interno):** `ActivityLog` `camara.ptz` (uno por persona y cámara cada 5 min), `camara.deteccion`, `camara.microfono`, `camara.alarma` (con `activa` y `duracion`), escritos con `after()` (un `void` suelto se puede perder al congelarse la función). Nunca el permiso, la serie ni el código. **Leerlo es sólo de admin/dueño**: `/api/activity-log` contesta 403 a `?entity=camara` / `?action=camara.*` para cajero, almacenero y encargado, y oculta las filas de cámaras de su listado general (igual que `/api/admin/camaras/miradas`).
6. **Alarma: DESHABILITADA** (security 05-10). `ALARMA_HABILITADA = false` en `lib/camaras/ezviz-control.ts`: el servidor contesta **409** «La alarma se habilita después de probarla en el sitio» a `activa: true`; `activa: false` (apagar) anda siempre. La pantalla muestra «Alarma» deshabilitado con ⓘ. Queda construido para cuando se habilite: confirmación (15/30/60 s; el servidor acepta 5-60 s), cuenta regresiva, «Apagar» que no se esconde hasta que el apagado contestó OK (3 intentos con espera), apagado con `fetch keepalive` al cerrar el visor/mosaico o la pestaña, «Apagar» visible aunque se caiga el video, y un «sonar» con falla dudosa (red, 20006, 20008, código desconocido) tratado como **«quizá sonando»** (`estado: "quiza_sonando"`): la pantalla ofrece «Apagar» y el servidor programa el apagado igual.
6b. **Desarmar avisa al dueño:** apagar la detección o el micrófono crea una notificación del panel (severidad HIGH: admin, dueño, encargado) y, si la cámara tiene WhatsApp de avisos (y no está en «nunca»), un WhatsApp por el canal de cámaras (`mandarWhatsAppDeCamara`). Si el WhatsApp está caído queda la del panel.
7. **Mover:** cola en el cliente (un pedido detrás del otro, como EZUIKit) porque por 4G cada pedido tarda 1-2,5 s y un «frenar» que llega antes que su «empezar» dejaría la cámara girando. Freno automático a los 8 s, al ir la pestaña al fondo y al cerrar.
8. **Estado tras cambiar:** vale el 200 de EZVIZ; releer `device/info` al instante devuelve el valor viejo (medido).
9. **Foto:** la de la cámara (`device/capture`), descifrada si llega con `hikencodepicture` (código de verificación), re-codificada a WebP por `sharpSeguro` y guardada con `guardarFoto` como «del vivo». Si la cámara no puede (60017 en «Entrada»), el visor guarda el cuadro del reproductor por `/foto`.
10. **Hablar por el parlante: no se construye** (20018). Sí «escuchar» el vivo (audio G.711µ del canal) con `openSound` del reproductor, que no toca la cámara. Sin micrófono del navegador → **sin cambios en `Permissions-Policy` ni en la CSP** (`lib/middleware-utils.ts` intacto).
11. **Vivo más amplio:** visor de una cámara a `min(96vw, (100dvh − 17rem)·16/9)`, «Teatro» (toda la ventana) y pantalla completa del marco (video + controles); mosaico a 96vw en 2 columnas desde 768 px. Se mantienen el corte a los 5 min sin tocar y el aviso de batería/datos.

## Alarma: antes de habilitarla

El apagado del servidor espera dentro de `after()`, y en Vercel `app/api/**` corta a los 30 s (`vercel.json`): con 30/60 s **nunca corre**. Las cámaras tienen `AudioAlarm.alarmTimes = 5` (leído el 05-10), pero no se midió si el disparo manual lo respeta. Pasos, en orden, con Brandon en el sitio:

1. **Medir** con `PASO=sirena CAMARAS=<id> npx tsx --env-file=.env.local scripts/camaras-probar-funciones.ts --sirena` (doble llave: `PASO` y `--sirena`; una sola cámara; tope `SIRENA_MAX_SEG`, 20 s por defecto, máx. 60; Enter = «dejó de sonar»; apaga siempre al final, con Ctrl+C o error, 3 intentos).
2. **Si se calla sola** (respeta `alarmTimes` o una duración): la duración vive en la cámara; el apagado del servidor queda como redundancia y basta con que la duración del dispositivo sea ≤ la elegida en pantalla.
3. **Si NO se calla sola:** apagado persistente que sobreviva a la función. No hay QStash en el proyecto (`grep -rn QSTASH lib .env.example` = 0) y todos los cron de `vercel.json` son diarios o más espaciados (un cron por minuto pide plan Pro). Diseño: (a) antes de disparar, anotar en Upstash `camaras:alarma:apagar:<tenant>:<camara>` con `hasta` y vencimiento; (b) entrada propia en `vercel.json` `functions` para esta ruta (glob `app/api/admin/camaras/*/control/route.ts`, sin corchetes: en un glob `[id]` es una clase de caracteres) con `maxDuration` ≥ duración máxima + 3 reintentos (≈ 120 s); (c) el `after()` espera, apaga con 3 reintentos y borra la marca; (d) un barrido (cron o QStash con retraso si se agrega) apaga toda marca vencida que siga ahí.
4. Recién entonces `ALARMA_HABILITADA = true`, con su test y una segunda pasada de `security`.

## Riesgos

- **API no contratada:** EZVIZ podría cerrar estas rutas al permiso de Teams sin aviso. Si pasa, los botones dan un error en español y el video sigue (son independientes). Las capacidades se cachean 30 min por instancia.
- **El permiso abre TODAS las cámaras de la cuenta del equipo**: por eso la ruta resuelve la serie desde el enlace del tenant (nunca del pedido) y la cámara tiene que ser del tenant (404 si no).
- **Alarma sin probar sonando:** se probó sólo el apagado. Por eso queda deshabilitada (409) hasta los pasos de arriba.
- **Batería:** cada control despierta la radio 4G. La detección apagada puede dejar de grabar por evento (la cámara a batería graba por evento).
- **Revisión de seguridad 05-10:** veto por la alarma (apagado en `after()` que no corre en Vercel, «Apagar» que se escondía antes de confirmar, sin apagado al cerrar) y por el registro de cámaras legible por cajero/almacenero vía `/api/activity-log`. Corregido como se describe en 3-6b; la alarma, deshabilitada. Habilitarla pide otra pasada.
