# ADR-456 — Cámaras: la cámara real entra, el túnel sólo abre su puerta y la IA lee el patio sin biometría

**Fecha:** 2026-10-01 · **Estado:** aceptado · **Extiende:** ADR-411 · **Pedido de Brandon:** *«ya instalé la
cámara Hikvision con chip y la veo en Hik-Connect; quiero mostrar esa imagen en el proyecto y que la IA
identifique cosas, personas, personal y operaciones»*

## Contexto (medido el 01-10)

| Hecho | Medición |
|---|---|
| La entrada de fotos rechazaba el formato real de Hikvision | aviso `EventNotificationAlert` + parte `fielddetectionImage` → **400 `sin_imagen`** |
| La dirección que el panel daba para copiar en la cámara | `window.location.origin` = `http://localhost:3000`: inalcanzable desde una SIM con CGNAT |
| La IA que lee las fotos | `ANTHROPIC_API_KEY` ausente en `.env.local` → toda lectura sale `sin_ia_configurada` |
| Cámaras reales dadas de alta | Blas: 0 · `main`: 1 de prueba |
| Placas cruzables en Blas | 2 guías + 3 fletes con placa · 0 vehículos en el directorio · 2 colaboradores |

## Decisión

### 1. El aviso se lee sobre los bytes (`lib/camaras/hikvision-push.ts`)
La cámara manda la alerta (XML o JSON) y la foto en partes con el nombre de su firmware, a veces sin
`filename` — y el parser del estándar convierte esas partes en texto y corrompe el JPEG. El multipart se
separa a mano, la foto se reconoce por tipo/extensión/firma y la alerta da el evento (blanco humano →
persona, vehículo → vehículo, intrusión/línea/VMD/PIR → movimiento). Alerta sin foto (el latido) → 200 sin
escribir, porque un error hace reintentar a la cámara y le gasta batería y datos. Topes: 32 partes, 64 KB
para interpretar la alerta, patrón lineal (el `\s*…\s*` ambiguo tardaba 19 s con 4 000 espacios).

### 2. Túnel con portero (`npm run camaras:tunel`)
Un túnel rápido de Cloudflare (gratis, sin cuenta) le da al panel una dirección pública. **No apunta al
panel**: apunta a un portero local (`127.0.0.1:3099`) que deja pasar sólo `GET|POST /api/webhooks/camara` y
contesta 404 a todo lo demás — el panel en modo desarrollo (login, APIs, trazas de error) no queda
publicado. Medido desde internet: la puerta de la cámara 200 (https y http), `/`, `/admin`,
`/api/admin/*`, `/api/auth/login`, otros webhooks y `..` → 404.

La dirección queda en `.camaras-tunel.json` (fuera de git) y la sirve `GET /api/admin/camaras/direccion`
(`CAMARAS_URL_PUBLICA` manda si existe). **La dirección de un túnel rápido cambia en cada reinicio**: la
pantalla muestra desde cuándo vale la actual. El mismo proceso dispara a las 19:00 de Lima el resumen del
día, porque el cron de Vercel no corre en la PC.

### 3. El personal se reconoce por el número del chaleco/casco, no por la cara
La IA lee números impresos; un mapa `número → colaborador` (KV `camaras-chalecos:<tenantId>`) lo cruza
con la persona y con su asistencia de ese día. **No se identifican rostros**, por tres razones:
- Claude no identifica personas por la cara, por diseño.
- La Ley 29733 trata el dato biométrico como sensible: requiere consentimiento expreso y por escrito de
  cada trabajador y declarar el banco de datos ante la autoridad.
- Una cámara de patio ve caras chicas y de costado: la precisión sería baja justo donde un error acusa a
  alguien.

Si algún día se quiere reconocimiento facial, es un motor aparte (local o en la nube) con su
consentimiento firmado, no una opción de este módulo.

### 4. Las operaciones son propuestas, no hechos
- **Placa ↔ guía/flete/vehículo** del día (±1): coincidencia exacta o «parecida» (un carácter que la
  cámara confunde: 0/O, 8/B…). Confirmar marca la captura; **no escribe en la guía** (ADR-411: el sistema
  propone, el que firma decide).
- **Pila de trozas**: sólo en cámaras marcadas, foto contra la anterior (≥30 min), y como mucho una
  comparación cada 30 min por cámara (una intrusión manda 3-4 fotos en segundos y cada comparación son
  dos imágenes al modelo). Si bajó y ese día **no hay despacho NI producción** anotados, WhatsApp (1 cada
  3 h por cámara). La producción cuenta porque la sierra también baja la pila: en Blas, 14 de 60 días
  tuvieron producción y ninguno despacho — mirando sólo el despacho, cada día de aserrío sería un aviso
  falso.
- **Gente por hora**: el máximo de personas visto en UNA foto de esa hora. Las fotos son por evento, no
  un conteo continuo, y la pantalla lo dice.
- **Resumen del día** por WhatsApp a las 19:00, idempotente por día.

## Consecuencias
- El historial sigue en KV (tope 800 capturas por negocio), ahora como `interno:camaras-capturas:<tenantId>`:
  con la lectura completa una foto pesa ~1,4 KB (800 ≈ 1,1 MB) y como clave de configuración viajaba en
  `getAll()` —que lee el layout de toda la plataforma— y cada foto invalidaba esa caché global. Con un patio movido (≈100 eventos/día) son
  ~8 días de historia y cada escritura reescribe el arreglo: con fotos reales entrando, medir el volumen
  y pasar a tabla cuando lo pida (leer el KV e insertar filas, ADR-411).
- La PC tiene que estar prendida con el panel y el túnel corriendo. Una dirección fija pide un dominio
  propio en Cloudflare (túnel con nombre) o producción.
- Sin `ANTHROPIC_API_KEY` la cámara guarda fotos pero no las lee: la pantalla tiene que decirlo.

## Alternativas descartadas
- **Túnel directo al panel**: publica el modo desarrollo entero.
- **ISUP (EHome) para video en vivo a través del CGNAT**: requiere el SDK nativo de Hikvision y un
  servidor propio siempre prendido; el en vivo sigue en Hik-Connect.
- **Reconocimiento facial con Claude**: no lo hace, y legalmente es otro proyecto (punto 3).

## Revisión adversarial (01-10, sin veto de seguridad)
- **Portero**: `new URL("//%zz/")` lanzaba y un solo pedido sin token tumbaba el túnel; un cuerpo por partes
  de más de 8 MB respondía dos veces y también lo tumbaba. Ahora se compara el texto de la ruta, cada
  respuesta sale una sola vez, `clientError` contesta 400 y el manejador entero está protegido. Medido
  local y desde internet: 404/400/413 y el proceso sigue vivo.
- **Token** con `crypto.getRandomValues` (antes `Math.random`): la puerta ahora está en internet.
- **Inyección desde la imagen**: un cartel en la foto podía meter texto en el WhatsApp al dueño. La
  descripción que viaja en el aviso pierde enlaces y números largos y se acota a 120 caracteres.
- **Pendiente (Ley 29733 / Directiva de videovigilancia)**: las fotos viven en un bucket público, borrar del
  historial no borra el archivo y no hay plazo de conservación. Siguiente paso: bucket privado con URL
  firmada y borrado automático pasado el plazo.
