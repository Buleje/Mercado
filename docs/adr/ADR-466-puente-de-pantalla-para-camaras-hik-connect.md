# ADR-466 — Puente de pantalla para cámaras Hik-Connect: la PC manda cuadros, la IA lee sólo lo que cambia

- **Estado:** aceptado (2026-10-03). Servidor construido y probado en `main` (curl: 3 cuadros → `cambio`, `sin_cambio`, `cambio`; GET del cuadro 204 → 200). La pantalla (`components/admin/forestal/camaras/**`) y el script de la PC (`scripts/camaras-puente-pc*`) los construye otro agente en paralelo contra este contrato. Sin cambio de schema.
- **Relacionados:** ADR-411 (cámaras del patio, «sin video»), ADR-456 (lectura del patio y túnel), ADR-022 (rate limit distribuido con Upstash), ADR-445 (`PlatformSettingsDB.actualizar`).
- **Pedido (Brandon, 03-10):** ver en `tab=camaras` lo que muestra la app Hik-Connect y que la IA y los avisos trabajen sobre eso. Su cámara 1 (oficina, Hikvision DS-2CFSP4-4G) va sólo por 4G.

## Contexto (medido)

- La DS-2CFSP4-4G está detrás de **CGNAT**: no hay dirección a la que el servidor pueda llamar. Hik-Connect cifra el RTSP local y **no tiene API pública** (Hik-Partner Pro pide cuenta partner; EZVIZ Open ≠ Hik-Connect). Ni ISAPI ni HLS (los caminos de ADR-456) la alcanzan.
- La web en el celular **no puede compartir pantalla**: los navegadores móviles no tienen `getDisplayMedia`. Capacitor no tiene plataforma Android instalada (la app es una ventana a buleje.pe).
- En la PC de Brandon ya corre **BlueStacks** (y se puede instalar iVMS-4200): ahí Hik-Connect sí muestra la cámara en vivo.
- La entrada de fotos `POST /api/webhooks/camara?k=<token>` ya hace todo lo de después: sharp → webp, storage, historial, IA (`camara-vision.ts`, ~US$ 0,01 por foto), cruces, pila y avisos. El portero del túnel (`scripts/camaras-tunel.mjs`) compara la **ruta exacta**.
- Leer con la IA 1 cuadro/s serían 86.400 lecturas ≈ **US$ 864 por día y cámara**; el tope de cámaras es US$ 20/mes (`cost-control.ts`).
- El techo general del middleware para `/api/*` es **60/min por negocio + IP** (Upstash): una sola cámara a 1 cuadro/s lo agota.

## Decisión

1. **La PC captura la ventana y manda cuadros por la MISMA entrada**: `POST /api/webhooks/camara?k=<token>&modo=vivo`, JPEG/WebP ≤ 1 MB, crudo (`content-type: image/jpeg`) o multipart (`file`). Misma ruta para que el portero del túnel no cambie. Responde `{ ok: true, guardada: boolean, motivo: "cambio" | "intervalo" | "sin_cambio" | "tope_del_dia" }`. Token y modo con Zod `safeParse`; un `modo` desconocido es 400 `modo_invalido`, un token malo 401 `{ ok: false }` como siempre.
2. **Sólo el último cuadro vive, 60 s.** Recortado y re-codificado (webp ≤ 1280 px, q70) en Upstash con clave `camaras:vivo:cuadro:<tenantId>:<camaraId>` y `EX 60`. No va al historial ni a la IA. `GET /api/admin/camaras/[id]/cuadro` (admin/owner/almacenero) lo sirve con `Cache-Control: no-store` y `X-Cuadro-Ts` (ISO 8601), o **204** si no llegó nada en 60 s; la cámara se busca en el negocio de la sesión (404 si es de otro) y el `tenantId` va en la clave. Sin Upstash (dev, tests) un `Map` del proceso hace de respaldo; con varias instancias Upstash es obligatorio.
3. **La IA lee sólo cuando cambia o pasa el intervalo, con tope diario.** Huella 32×32 en gris (sharp); diferencia media contra la **última guardada** (no contra el cuadro anterior: un cambio lento se acumula en vez de perderse). Pasa al historial como foto `programada` —y la IA la lee por el camino de siempre— si cambió más de `umbralPct` (8 %), o pasaron `cadaMin` (15) minutos, y nunca más de `maxDia` (60) por **día de Lima**. La huella, la hora y la cuenta del día viven en `camaras:vivo:estado:<tenantId>:<camaraId>` (3 días). Un candado `SET NX EX 60` evita que dos cuadros del mismo cambio entren los dos; con el candado se relee el estado y se vuelve a decidir. Si guardar falla, la huella no se mueve.
4. **Datos por cámara sin migración**, en la lista que ya guarda el KV `camaras:<tenantId>`: `fuente?: "isapi" | "webhook" | "puente_pc"` (informativo), `recorte?: { x, y, w, h }` (fracciones 0–1, ≥ 5 % por lado, dentro de la imagen) y `vivo?: { umbralPct?, cadaMin?, maxDia? }`. Se editan con `PATCH /api/admin/camaras { id, accion: "puente", fuente?, recorte?, vivo? }` (admin/owner, CSRF; `null` = quitar; `vivo` se mezcla con lo guardado).
5. **El recorte se aplica en el servidor** (`sharp().rotate().extract()`) al cuadro y a la foto, **sólo en `modo=vivo`**: describe la ventana de la PC (saca los botones de Hik-Connect o elige un cuadrante de la vista de 4); una foto subida desde el celular tiene otra forma.
6. **Topes propios.** En la ruta: 300/min por IP antes del token y 20 cada 10 s por cámara (≈ 2/s), en memoria de la instancia para no gastar comandos de Upstash por cuadro. En el middleware: un cupo aparte `mw:camara-vivo` de 300/min por negocio + IP para `POST /api/webhooks/camara?modo=vivo` y `GET /api/admin/camaras/<id>/cuadro` (el resto de `/api` sigue en 60/min).

## Consecuencias

- **ADR-411 pasa de «sin video» a «casi en vivo por cuadros»**: sigue sin haber stream ni transcodificación; el panel ve una imagen de hace ≤ 1–2 s mientras la PC esté prendida con la app abierta. Sin PC, la cámara vuelve a ser lo de siempre (fotos que empuje alguien).
- Costo de IA acotado por cámara: ≤ 60 lecturas/día ≈ US$ 0,60/día, dentro del tope mensual que igual corta `cost-control.ts`. Con 15 min de intervalo, el intervalo solo llega a 60 guardadas a las 15 h: de noche el tope se gasta en fotos iguales salvo que se suba `cadaMin`.
- Costo de Upstash: 2 comandos por cuadro (+3 cuando se guarda) ≈ 173 mil/día por cámara a 1 cuadro/s, más ~100 KB por cuadro de ancho de banda. El script de la PC debería no mandar cuadros idénticos más de una vez cada ~30 s (el cuadro vence a los 60).
- La diferencia media no ve cambios chicos: una persona que ocupa el 5 % de la imagen mueve ~2–3 %. Para una vista amplia conviene bajar `umbralPct` o recortar a la zona que importa.
- Toca `lib/middleware-utils.ts` (cupo del rate limit global): pide pasada de `security`.

## Alternativas descartadas

- **App Android propia con MediaProjection**: captura la pantalla del celular sin PC, pero es una app nativa nueva (Capacitor sin Android, permisos de captura que el usuario reconfirma, publicación). Queda como último recurso si la PC no alcanza.
- **Nube de Hikvision (Hik-Partner Pro / OpenAPI)**: pide cuenta partner y contrato; no hay API para la cuenta de un usuario de Hik-Connect.
- **El celular como cámara (`getUserMedia`)**: sirve para apuntar el celular a algo, no para ver lo que muestra Hik-Connect. Puede sumarse por la misma entrada.
- **Mandar cada cuadro a la IA**: US$ 864/día por cámara.
- **Guardar cada cuadro en el historial**: 86.400 por día contra un historial de 800; se perdería todo lo demás en 15 minutos.
