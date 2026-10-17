# ADR-411 — Cámaras del patio: la cámara empuja, el sistema recibe

**Fecha:** 2026-09-11 · **Estado:** aceptado · **Pedido de Brandon:** *«quiero integrar mi cámara
Hikvision al sistema para tener imagen y después reconocimiento»*

## Contexto

La cámara del patio es **4G con SIM, panel solar y SD de 256 GB**, y se mira con **Hik-Connect**.
Tres hechos que definen la arquitectura y no son negociables:

1. **No hay a dónde conectarse.** Una SIM entrega IP privada (CGNAT). No existe dirección pública a
   la que el servidor pueda abrir un RTSP, un ONVIF o un ISAPI. Por eso esas cámaras funcionan con
   la nube del fabricante: es **la cámara la que sale**, no al revés.
2. **No hay energía ni datos para video continuo.** 1080p son 1–2 GB por hora; con panel solar, una
   cámara transmitiendo todo el día se apaga sola. Lo que el patio necesita no es un monitor: es
   **qué pasó y a qué hora**.
3. **Hik-Connect no abre API** a un tercero sin cuenta de partner (a diferencia de EZVIZ, que sí
   tiene plataforma abierta). Construir contra esa API sería construir contra una puerta cerrada.

## Decisión

**Una bandeja que recibe imágenes**, no un cliente que las va a buscar.

`POST /api/webhooks/camara?k=<token>` acepta una foto —multipart o el cuerpo crudo, que es como
postean algunos aparatos—, la re-codifica con sharp, la guarda en el storage propio y la anota en el
historial de esa cámara con **la hora del servidor** (una cámara en el campo puede tener el reloj
corrido, y el orden del historial es justo lo que se mira para reconstruir qué pasó).

Sirve para los caminos posibles sin casarse con ninguno: la cámara por HTTP, un FTP que reenvía, el
correo de alarma pasado por un webhook, o una persona desde el celular. **El día que haya API del
fabricante, ese conector deposita en el mismo lugar** y la pantalla no se entera.

### El token es del aparato, no del usuario

Quien empuja no tiene sesión y no puede mandar un header CSRF (un FTP o un correo no mandan
headers). Cada cámara lleva un token de 32 caracteres que viaja en la URL, bajo `/api/webhooks/`
—el prefijo que el guard global ya exime de CSRF—. A cambio:

- el endpoint **no devuelve datos**: ni el negocio, ni la lista de cámaras, ni el nombre. Sólo si
  entró o no, y con la **misma respuesta** para token inválido y cámara inexistente;
- se valida contra la cámara real, no sólo contra el índice: una cámara dada de baja o con el token
  rotado no entra aunque el token exista;
- rate limit, tope de 8 MB y allowlist de formatos;
- **la imagen se re-codifica**: lo que se guarda es un webp generado por nosotros, no el archivo que
  llegó de afuera.

Un token filtrado deja subir fotos basura a esa cámara —molesto, no grave— y se rota de un botón.

### KV y no tablas (por ahora)

Mismo criterio que la biblioteca de fotos de especies (ADR-308 §4): son pocas cámaras y cada captura
es una **referencia** de ~150 bytes (url + hora + motivo); la imagen vive en el storage. Tope de 800
capturas por negocio, y cuando se llena se caen las viejas **diciéndolo en el log**, en vez de crecer
sin techo. Promoverlo a Prisma el día que haga falta guardar años es leer el KV e insertar filas, sin
fabricar una migración que necesita DIRECT_URL.

## Consecuencias

- **La pantalla no promete video en vivo**, y lo dice con todas las letras: con panel solar y datos
  móviles, transmitir todo el día vacía la batería. Prometer un monitor sería prometer algo que se
  apaga el segundo día.
- **Se avisa cuando una cámara deja de mandar** (24 h). Dos días nublados la apagan y una SIM sin
  datos deja de subir sin decir nada: enterarse hoy es la diferencia con descubrirlo el día que pasó
  algo y no hay foto.
- La foto se puede borrar del historial una por una (entra una prueba, o la lona tapando el lente).
  Se borra la referencia; el archivo queda en el storage, porque borrarlo es otro pedido y más
  difícil de deshacer.
- **Lo que todavía NO hace:** reconocer qué hay en la foto. Esa es la fase siguiente y se apoya en
  esto: con las imágenes ya entrando y fechadas, leer una placa o comparar la pila de trozas es
  trabajo sobre datos propios, no sobre una cámara inalcanzable.

## Alternativas

- **Consumir la nube de Hikvision.** Es el camino natural… si hubiera acceso. Hik-Connect lo reserva
  a cuentas de partner; quedaría un sistema que depende de una puerta que no controlamos.
- **Levantar un servidor FTP.** Funciona, pero agrega un servicio más que mantener y asegurar para
  hacer exactamente lo que hace un POST.
- **Un puente local (NVR/Raspberry) que lea la cámara.** Razonable con luz y red estables; en un
  patio con panel solar es un segundo aparato que también se queda sin batería.
- **Esperar a tener video en vivo.** Sería no entregar nada: lo que resuelve el problema del patio
  —quién entró y a qué hora— no necesita streaming.
