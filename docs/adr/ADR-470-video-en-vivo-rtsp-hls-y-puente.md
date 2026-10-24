# ADR-470 — Video en vivo: la ruta `vivo` revive el stream, cupo propio y un ffmpeg por cámara; la planta mira por un puente

- **Estado:** aceptado (2026-10-05) para la ruta y `lib/camaras/hls.ts`; **propuesto** (no construido) para el puente de la planta y la grabación.
- **Relacionados:** ADR-411 (cámaras del patio), ADR-456 (lectura del patio y túnel), ADR-466 (puente de pantalla Hik-Connect). El código citaba «ADR-421» para el video, pero ese número es otro tema: este ADR es el del video.
- **Pedido (Brandon, 05-10):** «video real en el sistema». La cámara 4G (DS-2CFSP4/4G) no da RTSP; para la planta, cámaras con cable que sí lo den, un equipo puente y que el sistema muestre (y después grabe) ese video.

## Contexto (medido el 05-10 con una cámara simulada: MediaMTX + ffmpeg, `scripts/camaras-prueba-video.ts`)

1. **El video no salía nunca con ffmpeg ≥ 5.** `hls.ts` pasaba `-stimeout`, que ffmpeg 5 renombró a `-timeout`. Con el 6.1 de Ubuntu 24.04: «Unrecognized option 'stimeout' … Option not found», salida 8, y el motivo que veía el operario era «Esa ruta de video no existe en la cámara» (el clasificador matcheaba «not found»).
2. **Cupo:** un reproductor HLS hace 62 pedidos/min (medido, 3 pestañas = 185/min). La ruta usaba `GENEROUS` (100/min por IP): 130 pedidos en 57 s → 100 pasan, 30 rebotan con 429. Dos pestañas o dos cámaras cortaban el video.
3. **Dos ffmpeg por cámara:** dos pedidos juntos (el doble efecto de React en desarrollo, dos pestañas) lanzaban dos procesos; el registro se quedaba con uno y el otro quedaba huérfano, ocupando una conexión de la cámara para siempre.
4. **Pestaña de fondo > 30 s:** el barrido apaga el ffmpeg (bien), pero al volver el reproductor pedía la misma lista → 404 → «el video se cortó» → fotos para siempre.
5. **Navegador (fuera de este ADR, en archivos de otros):** la CSP del panel bloquea hls.js (CDN fuera de `script-src`; `blob:` fuera de `media-src` y `worker-src`), y Chrome 149 dice «maybe» al HLS nativo pero no lo reproduce (`DEMUXER_ERROR_COULD_NOT_PARSE` con `.ts` y con fMP4; dentro del panel, 3 187 pedidos de la lista en 10 s con el cuadro negro). Con la CSP ajustada y hls.js: video real, 4 s de retraso.

## Decisión

- `argumentos()` elige `-timeout` (ffmpeg ≥ 5 o versión ilegible) o `-stimeout` (4.x, donde `-timeout` es modo servidor). La versión sale de `ffmpeg -version` una vez.
- «Unrecognized option / Option not found» se traduce como problema de la máquina, no de la cámara.
- `asegurarStream` es de un arranque a la vez por cámara (promesa en curso compartida).
- Un stream **caído** se reintenta pasados 5 s; antes de eso se contesta el motivo sin lanzar otro ffmpeg (sin la pausa, cada recarga de la lista sería un ffmpeg nuevo).
- **El pedido de la LISTA revive el stream** si el barrido lo apagó (`leerOReabrir`); un segmento suelto nunca revive. La clave de la cámara se descifra sólo si hay que revivir.
- **Cupo propio** para lista y segmentos: 600/min por IP (4 cámaras × 2 pantallas con margen). El arranque sigue con `GENEROUS`.
- Contrato de URLs **sin cambios** (`GET …/vivo`, `…/vivo/vivo.m3u8`, `…/vivo/sNNN.ts`).

## Consecuencias

- Tests: `__tests__/camaras-hls.test.ts` (versión, línea, motivo, ffmpeg real contra un puerto cerrado), `camaras-hls-revivir.test.ts` (revivir, carrera, caída), `camaras-ruta-vivo.test.ts` (401, tenant ajeno 404, cupo).
- Pendiente fuera de estos archivos (pedido a quien corresponda):
  - CSP (`lib/middleware-utils.ts`, zona de peligro): `script-src` + `https://cdnjs.cloudflare.com` (o empaquetar hls.js), `media-src 'self' blob:`, `worker-src 'self' blob:`.
  - Visor (`use-visor-camara.ts`): preferir hls.js cuando hay MSE y usar el nativo sólo sin MSE (iOS); el nativo hoy no tiene manejador de error. `VisorEnVivo`: el pie dice «Detenido» con el video andando (hereda el estado de las fotos).
  - Producción (`proxy.ts` → `checkRateLimit`): fuera de desarrollo, `/api/admin/camaras/<id>/vivo/*` cae en el tope global de 60/min — una sola pestaña lo agota. Sumar esa ruta a `esCamaraEnVivo`.
- **Propuesto (no construido):** en la planta, NVR o puente con MediaMTX que graba en segmentos y sirve el video por el túnel con un permiso firmado por el panel (detalle y compra en `docs/camaras/video-real.md`). Vercel no tiene ffmpeg: sin puente, buleje.pe sigue con fotos.

## Alternativas descartadas

- **Siempre `-timeout`:** rompe ffmpeg 4.x (escucharía en vez de llamar).
- **Revivir también con los segmentos:** un segmento viejo de una pestaña dormida levantaría un ffmpeg sin que nadie pida la lista; el reproductor ya vuelve a pedir la lista tras un 404.
- **Sin cupo para lista/segmentos:** son lecturas baratas, pero un bucle (como el del HLS nativo de Chrome: 320 pedidos/s) tumbaría el servidor; 600/min lo frena.
