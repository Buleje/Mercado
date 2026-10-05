# ADR-471 — Video de Hik-Connect en el panel por la OpenAPI de Hik-Connect for Teams + EZUIKit

- **Estado:** aceptado (2026-10-05). Construido y probado SIN claves reales (tests con las respuestas medidas, ruta real con clave falsa, visor con la respuesta simulada). Falta la prueba con la AppKey de Brandon.
- **Reemplaza:** ADR-411 §Contexto 3 y §Alternativas «Consumir la nube de Hikvision» («Hik-Connect no abre API a un tercero sin cuenta de partner»), y la misma frase en ADR-466 §Contexto. El resto de ADR-411 (fotos por webhook) y ADR-466 (puente de pantalla) siguen vigentes.
- **Relacionados:** ADR-470 (video RTSP→HLS, cámaras con cable), ADR-445 (`PlatformSettingsDB.actualizar`), ADR-308 §4 (KV en vez de tablas).
- **Pedido (Brandon, 05-10):** «quiero que se vincule y se muestre el video en vivo de la cámara en mi sistema». Cámara: Hikvision **DS-2CFSP4/4G** (solar + batería, 4G con chip, sólo Hik-Connect, sin RTSP). Hoy la ve en la app Hik-Connect de su celular (cuenta personal).

## Contexto (verificado el 05-10-2026)

1. **Hay API, y la dan sin ser partner.** Hik-Connect for Teams (HikCentral Connect) publica una OpenAPI (V2.11.800). Las claves:
   - Portal de Hik-Connect → **Team Management → Team Configuration → API Integration**: «Account (API Key)» y «Password (API Secret)» (README de [Frens98/hikconnect-nvr](https://github.com/Frens98/hikconnect-nvr)); «Every user can generate those keys inside TeamManagement → Api Integration» ([pergolafabio/Hikvision-Addons#282](https://github.com/pergolafabio/Hikvision-Addons/issues/282), comentario del 05-05-2026).
   - Si la opción no aparece: [TPP «Hik-Connect Integration»](https://tpp.hikvision.com/products/HC-Integration), paso 02 «Provide registered Hik-Connect email address to Hikvision for API Key application» (leído el 05-10 con un navegador; a curl le da 403).
2. **Forma real de la API** (no toda la documentación pública coincide):
   - Token: `POST {región}/api/hccgw/platform/v1/token/get` `{appKey, secretKey}` → `data.accessToken`, `data.expireTime` (segundos epoch) y `data.areaDomain` (a dónde van los pedidos siguientes). Header `Token:` (no Bearer). Fuente: `api.py` de Frens98 + [Syscom](https://hikconnectapi.syscom.mx/).
   - Cámaras: `POST /api/hccgw/resource/v1/areas/cameras/get` `{pageIndex, pageSize, filter:{areaID:"-1", includeSubArea:"1"}}` → `data.camera[]` (`id`, `name`, `device.devInfo.serialNo`). Syscom documenta otra forma (`data.list`, `cameraName`): se leen las dos.
   - Video: `POST /api/hccgw/video/v1/live/address/get` `{resourceId, deviceSerial, type, code:"0", protocol:"1", quality}`; `type` 1 vivo · 2 nube · 3 microSD; `protocol` 1 = EZOPEN, el único para video cifrado (HLS/FLV → EVZ60019); fechas «YYYY-MM-DD HH:MM:SS».
   - Para reproducir: `GET /api/hccgw/platform/v1/streamtoken/get` → `appToken` + `streamAreaDomain`; EZUIKit (`ezuikit-js`) con `accessToken = appToken`, `env.domain = streamAreaDomain` (sin él va a China y falla callado).
   - **Errores medidos** con claves falsas contra `isa/ius/ieu/isgp.hikcentralconnect.com`: HTTP 200 y `{"errorCode":"OPEN000001","message":"AK_NOT_FOUND{OPEN000001}"}`; sin secretKey → `OPEN000010`; token inventado → `OPEN000006 TOKEN_NOT_FOUND`; sin token → `OPEN000007 TOKEN_ERROR`. La tabla «0x2001…» de Syscom **no** es lo que contesta el servidor.
3. **Video cifrado:** el código de verificación (6 letras de la etiqueta) va dentro de la URL, `ezopen://CODIGO@host/…` (así la arma `ezuikit-js` 9.0.23); error 5 del reproductor = código incorrecto.
4. **Regiones:** los 4 dominios de API responden; los de video por región salen del README de `ezuikit-js` (América del Sur = `isaopen.ezvizlife.com`).

## Decisión

- **Puro / red / datos separados:** `lib/camaras/hik-connect-api.ts` (pedidos, lectura de respuestas, errores en español), `lib/camaras/hik-connect-api.server.ts` (fetch con timeout de 8 s, token en memoria por tenant + huella de la AppKey, renovación 5 min antes, UN reintento si Hikvision lo da por vencido), `lib/db/camaras-hik-connect.db.ts` (KV `interno:camaras-hik-connect:<tenantId>`: fuera de `getAll()` del layout).
- **Credenciales cifradas** con `cifrarSecreto` (AES-256-GCM sobre `AUTH_SECRET`, la misma de la clave ISAPI). A la pantalla sólo llega «vinculado, región, últimos 4». El código de verificación de cada cámara, también cifrado.
- **Vincular prueba antes de guardar:** se pide un token; con «Automática» se prueba América del Sur → Norteamérica → Europa → Asia **sólo mientras** Hikvision diga `AK_NOT_FOUND`. Clave falsa = error traducido y nada guardado.
- **Enlazar** toma nombre y serie de la lista de Hikvision, nunca del pedido; la cámara del sistema tiene que ser del tenant.
- **Dominios que vienen en respuestas** (`areaDomain`, `streamAreaDomain`) sólo se usan si son https de `*.hikcentralconnect.com` / `*.ezvizlife.com`; si no, el de la región (anti-SSRF).
- **Rutas:** `GET/POST/PATCH/DELETE /api/admin/camaras/hik-connect` (escribir: admin/dueño con `soloAdminODueno`), `GET …/hik-connect/camaras` (admin/dueño), `POST /api/admin/camaras/[id]/en-vivo-nube` (admin/dueño/almacenero, como ver cámaras; POST + `no-store` porque lleva el permiso de video). CSRF y cupo en todas; 401 sin sesión; errores de Hikvision como 422/502/429, nunca 401/403 (sacarían del panel).
- **Pantalla:** «Video de Hik-Connect» en la vista Cámaras (pasos + claves + lista para enlazar); el botón «En vivo» abre el visor del panel si la cámara está enlazada (orden: visor propio ISAPI/puente > nube > app). El visor usa EZUIKit con plantilla `simple` y controles propios (SD/HD, foto, pantalla completa, grabación de la microSD por fecha y hora, 1 h). `ezuikit-js` se carga con `import()` al abrir el visor.
- **Decodificadores autohospedados:** `scripts/copy-ezuikit-assets.mjs` (postinstall, como tesseract) copia `libSystemTransformWASM.js` + `PlayCtrlWasm/**` (16 MB, gitignored) a `public/ezuikit_static`; el visor pasa `staticPath` ABSOLUTO (el worker de EZUIKit ignora uno relativo y vuelve al CDN). Medido el 05-10: el CDN por defecto (`openstatic.ys7.com`, en China) colgó 20 s uno de 3 pedidos y dentro del panel dio «importScripts … Decoder.js failed to load».
- **Si EZUIKit no avisa** (pasa con un permiso inválido: quedó «cargando» sin llamar a `handleError`), a los 45 s el visor lo destruye y dice que la cámara no mandó video, con «Reintentar».
- **CSP (`lib/middleware-utils.ts`), sólo en `/admin`:** `connect-src` + `i{sa,us,eu,sgp}open.ezvizlife.com` y `{sa,us,eu,sgp}log.ezvizlife.com` + `wss://*.ezvizlife.com:*` (el servidor de medios llega en runtime con host y puerto variables); `media-src`/`worker-src` + `blob:`. `script-src` sin cambios.

## Riesgos y consecuencias

- **Dependencia de la nube de Hikvision/EZVIZ:** si cambian la API o los dominios, el visor deja de andar. Las fotos por webhook (ADR-411) no dependen de esto. Al subir `ezuikit-js`, el postinstall copia los decodificadores nuevos (comparan tamaño).
- **Batería de la cámara solar:** el vivo la despierta. El visor avisa en una línea, arranca en **SD** y se corta solo a los **5 min sin tocar**; cerrar la ventana lo corta.
- **Datos del chip:** ~0,4 GB/h en SD a ~3,6 GB/h en HD (1–8 Mbps). Grabación por rango de 1 h, no continua.
- **Latencia:** 4G + relevo de EZVIZ: arranque de 10–20 s esperable (sin medir: falta la clave real).
- **El `appToken` y el código de verificación llegan al navegador** de quien mira (el reproductor descifra ahí). Un almacenero con la consola abierta podría copiarlos mientras dure el `appToken` (vida no publicada). Se limita a quien ya ve las cámaras, por POST sin caché; no hay forma de evitarlo con EZOPEN.
- **Comodín `wss://*.ezvizlife.com:*`:** acotado al dominio de EZVIZ y a wss. Achicarlo con lo que registre `/api/csp-report` en la primera prueba real.
- **Token en memoria por instancia:** en serverless cada instancia pide el suyo (tope de Hikvision: 5 pedidos/s); si uno invalida al otro, el reintento único lo cubre.

## Alternativas descartadas

- **HLS de la API (`protocol` 2) + hls.js propio:** lo usa Frens98, pero las cámaras con video cifrado contestan EVZ60019 y la DS-2CFSP4/4G sale cifrada de fábrica. Queda como opción si Brandon apaga el cifrado y EZUIKit diera problemas.
- **Guardar la cuenta en columnas Prisma:** pide migración (zona de peligro) para una fila por negocio; el KV con candado alcanza.
- **Pasar el video por nuestro servidor:** EZOPEN se decodifica en el navegador; re-emitirlo pediría ffmpeg y la clave del video en el servidor (Vercel no tiene ffmpeg, ADR-470).

## Revisión de seguridad (05-10) — riesgos aceptados y pendientes

- **Hecho antes de commitear:** Sentry tacha `accessToken=`/`appToken=` en migas y en Replay (`sentry.client.config.ts`); los dominios de EZVIZ y `blob:` se abren sólo en `/admin`, no en `/superadmin` (`lib/middleware-utils.ts`, test `csp-ezviz-admin`).
- **El appToken llega al navegador de quien mira** (admin, encargado, almacenero). Probablemente sirve para TODAS las cámaras de la cuenta de Teams y desvincular sólo lo borra de nuestro lado. **Medir su duración con la clave real**; regla operativa: si una persona con acceso deja de trabajar, **regenerar el API Secret** en el portal de Hik-Connect (Team Configuration → API Integration).
- **El reproductor es de terceros** (código ofuscado, dependencias beta `player-ezopen 9.0.9-beta.5`, `control-aichat 0.1.1-beta.1`) y corre dentro de `/admin` con la sesión; con `'strict-dynamic'` la CSP de producción no impide que cargue otros scripts: que no use el CDN de China depende de `staticPath` absoluto (`use-visor-nube.ts`). **Siguiente paso:** aislar el visor en un `iframe sandbox="allow-scripts"` de otro origen o sin cookies.
- **Ley 29733 (sugerencia):** registrar quién miró el video (`logActivity("camara.video_nube_ver")`, uno cada 5 min por persona y cámara). El visor ISAPI tampoco lo registra hoy.
