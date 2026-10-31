# Funciones de las DS-2CFSP4/4G desde el panel

> Medido el **05-10-2026 (19:50-20:15, hora de Pucallpa)** con las dos cámaras reales de Blas: «Patio de trozas» (serie …3619) y «Entrada» (…3717), firmware V5.9.20 build 260319.
> Script: `scripts/camaras-probar-funciones.ts` (lee las claves guardadas con la misma librería del panel; nunca imprime claves, tokens ni URLs firmadas). Contrato: ADR-472.

## Lo que se descubrió

La API de Hik-Connect for Teams (OpenAPI V2.11.800) no trae mover, armar ni alarma. Pero el **permiso de video** que entrega (`streamtoken/get` → `appToken`, `at.…`) es un permiso de **EZVIZ Open**, y con él responden las APIs de dispositivo de EZVIZ en `https://isaopen.ezvizlife.com` (región América del Sur, la de la cuenta) **y el ISAPI de la cámara por la nube** (`/api/hikvision/ISAPI/...`). Así se ve la cámara por dentro sin ir al aserradero.

## Tabla

| Función | La cámara la soporta | Probada con la cámara real | Endpoint (dominio `isaopen.ezvizlife.com`) | Respuesta medida |
|---|---|---|---|---|
| Capacidades | — | Sí, las 2 | `POST /api/lapp/device/capacity` | `support_ptz 1`, `ptz_left_right 1`, `ptz_top_bottom 1`, `ptz_45 1`, `ptz_preset 1`, `support_defence 1`, `support_talk 1`, `support_capture 1`, `support_active_defense 1`, `support_audio_onoff 1`, `support_alarm_voice 1` (0,2-0,7 s) |
| Mover (PTZ) | Sí: 4 direcciones + diagonales + posiciones guardadas | **Sí**, «Entrada»: derecha 1 s y vuelta a la izquierda 1 s, dos veces | `POST /api/lapp/device/ptz/start` (`direction` 0-3, `speed` 1) y `/ptz/stop` | `{"code":"200","msg":"Operation succeeded"}`; start 1,2-1,6 s, stop 0,9-2,4 s por 4G |
| Detección (armado) | Sí | **Sí**, «Entrada»: 1 → 0 → **1** (quedó como estaba) | `POST /api/lapp/device/defence/set` (`isDefence` 1/0); estado en `POST /api/lapp/device/info` → `defence` | 200 en 1,5 s. Leer `info` **al instante** devuelve el estado viejo; a los 1,5 s el nuevo |
| Micrófono de la cámara | Sí | **Sí**, «Entrada»: 1 → 0 → **1** (quedó como estaba) | `POST /api/lapp/camera/video/sound/set` (`enable`); estado `.../sound/status` | 200 en 3,5-4,5 s |
| Escuchar el vivo | Sí: el canal trae audio G.711µ | Sí (lectura) | ISAPI `GET /ISAPI/Streaming/channels/101` → `<Audio><enabled>true</enabled>` | Se prende en el reproductor (`openSound`); no toca la cámara |
| Hablar por el parlante | La cámara sí (`support_talk 1`, ISAPI `TwoWayAudio` G.711µ) | **No funciona con este permiso** | `POST /api/lapp/live/talk/url` (lo que usa EZUIKit para hablar) | `{"code":"20018","msg":"The user doesn't own the device."}` — el permiso de Teams no abre la voz. Se habla desde la app Hik-Connect |
| Alarma (sirena + luz) | Sí: «defensa activa» (`support_active_defense 1`); ISAPI lista audios «Siren», «Danger! Please keep away»… y luz blanca | **Sólo el APAGAR** (`status 1`), en «Entrada». **No se disparó** (de noche en el aserradero) | `POST /api/v3/device/defence`, headers `accessToken` + `deviceSerial`, form `status` 2 = sonar, 1 = apagar | `{"meta":{"code":200,"message":"Operation succeeded"}}` al apagar → el permiso sirve para esta ruta. **Falta oír la primera alarma de verdad** |
| Foto de la cámara | Sí | **Sí en «Patio»** (768×432, JPEG); **«Entrada» no** | `POST /api/lapp/device/capture` → `picUrl` en `https://pmssa1.ezvizlife.com:8444/…` (firmada, 2 h) | Patio: 200 en 3,7 s, JPEG ya descifrado. Entrada: `60017 Failed to capture picture`, 3 de 3 veces; por Teams (`resource/v1/device/capturePic`) tampoco: sin respuesta en 8 s. El panel cae al cuadro del video |
| Foto por Teams | Sí | Sí en «Patio» | `POST https://isa.hikcentralconnect.com/api/hccgw/resource/v1/device/capturePic` | `captureUrl` en S3 `sa-east-1`, `isEncrypted: 1`: llega **cifrada** (`hikencodepicture`) y se abre con el código de verificación (AES-128-CBC, probado: sale el mismo JPEG 768×432) |
| Batería | Sí | Sí | `POST /api/lapp/device/status/get` → `battryStatus` | Patio 94 %, Entrada 92-93 % |
| microSD | Sí | Sí | mismo → `diskState` | **Patio `2` = SIN FORMATEAR** (no graba: «Ver grabación» no va a encontrar nada); Entrada `0` = bien |
| Códec (ver) | — | Sí, por ISAPI | ISAPI `GET /ISAPI/Streaming/channels/101` y `/102` | Las dos y en los dos canales: **H.265**, 1280×720, VBR tope 256 kb/s, 10 cuadros/s. `GET /api/v3/das/device/video/encode` → 404 en esta región |
| Códec (cambiar) | Sí | **No se tocó** (lo cambia Brandon en la app) | (ISAPI `PUT` existe, no se usa) | — |
| Luz por movimiento | — | Sí (lectura) | `GET /api/v3/device/switchStatus/get?type=301` | `60020 the device does not support the signaling`. La luz blanca va por el modo de la cámara: Patio `eventIntelligence` (prende con personas), Entrada `irLight` |

Nada de esto cambió la base de Blas: el script sólo lee las claves (KV) y habla con Hikvision.

## Cómo se usa en el panel

En **Cámaras → En vivo** de una cámara enlazada (o en «Ver todas en vivo»), encima del video:

- **Flechas**: mantener apretado mueve, soltar frena. En la PC también con ←↑→↓. El cuadrado del medio frena siempre. Más de 8 s apretado frena solo.
- **Foto**: la saca la cámara y queda en Fotos como «del vivo». Si la cámara no puede (pasa con «Entrada»), se guarda el cuadro del video.
- **Detección**, **Micrófono** y **Alarma**: sólo admin y dueño. Apagar la detección o el micrófono avisa al dueño (panel + WhatsApp de la cámara si tiene). **La alarma está DESHABILITADA** (botón apagado con ⓘ; el servidor contesta 409) hasta medirla en el sitio con `PASO=sirena … --sirena` (ADR-472 § «Alarma: antes de habilitarla»).
- **Sin sonido / Sonido** (fila de abajo): escuchar el vivo. Arranca apagado.
- **Teatro**: el video a toda la ventana. **Pantalla completa**: la pantalla entera, con los controles adentro.

## Pasos para H.264 en la app (los hace Brandon)

El video llega en **H.265**; las rayas de colores abajo en «Entrada» pueden ser del decodificador H.265 por software. Para probar H.264:

1. App **Hik-Connect** en el celular (la cuenta donde están las cámaras) → toca la cámara → **⚙ Configuración** (arriba a la derecha).
2. **Configuración de video** / *Video Settings* (según la versión: «Imagen y video» → «Video»).
3. **Tipo de codificación** / *Video Encoding* → **H.264**. Guarda. Repetir con el otro flujo si la app muestra «Principal» y «Secundario».
4. Repetir en la otra cámara.
5. Avisar: lo verifico por ISAPI (`videoCodecType`) sin tocar nada.

No usar el formulario del portal web de Hik-Connect para esto: al guardar reescribe el código de verificación.

**Además, «Patio de trozas» tiene la microSD sin formatear**: en la app → la cámara → ⚙ → **Estado de almacenamiento** → **Formatear / Inicializar**. Sin eso no graba.
