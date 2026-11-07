# Video real de la planta en el sistema

> Para Brandon · 05-10-2026 · Contrato técnico: ADR-470.
> La cámara solar 4G (DS-2CFSP4/4G) sigue para donde no hay luz: sólo habla con Hik-Connect, no entrega video a otro sistema.
> Para la planta: cámaras con cable que sí lo entreguen (RTSP/ONVIF), un grabador o equipo puente en el sitio, y el sistema muestra ese video.

## 1. La prueba sin comprar nada

Simulé una cámara Hikvision en la PC: MediaMTX hace de cámara y publica una imagen de prueba con la hora quemada, en la misma dirección que usa una Hikvision (`/Streaming/Channels/102`, 640×360, 25 cuadros/s, 0,56 Mbps). Después la miré en la pestaña Cámaras con el visor del panel. No se escribió nada en la base: el navegador ve una cámara de mentira agregada a la lista.

| Qué se midió | Resultado |
|---|---|
| Desde que el visor pide el video hasta que se ve la imagen | **4,5 s** (el servidor tarda 3,7-4,5 s en tener el primer pedazo de 2 s) |
| Desde que se abre la pestaña hasta que se ve la imagen | 10,7 s (incluye cargar el panel) |
| Retraso contra la hora real | **~4 s** (el cuadro marcaba 13:05:31 y se sacó a las 13:05:34,8) |
| CPU y memoria del ffmpeg que convierte el video | **0,5 % de un núcleo y 51 MB** (no recomprime, sólo empaqueta) |
| 3 pestañas mirando la misma cámara | **1 solo ffmpeg**; 62 pedidos por minuto por pestaña |
| Pestaña al fondo | el ffmpeg se apaga a los 31,5 s; al volver, el video vuelve en 3,8 s |
| Cerrar la vista | el ffmpeg se apaga a los 36 s; no queda ningún proceso |

### Lo que estaba roto y ya arreglé (servidor)

| Antes | Ahora | Ejemplo |
|---|---|---|
| Con el ffmpeg de esta PC (versión 6.1) el video **no salía nunca**, y decía «esa ruta de video no existe en la cámara» | Se usa la opción que entiende cada versión | Lo que veías como cámara mal configurada era el sistema |
| 2 pestañas o 2 cámaras: a los ~50 s el video se cortaba (límite de 100 pedidos por minuto) | Límite propio de 600 por minuto para el video | Medido: 130 pedidos en 60 s, ninguno rebotado (antes 30 rebotaban) |
| Dos pedidos a la vez abrían **dos** conexiones a la cámara y una quedaba colgada para siempre | Una sola por cámara | La cámara tiene tope de conexiones: dos o tres colgadas y el celular ya no la ve |
| Pestaña al fondo más de 30 s → al volver, fotos para siempre | Vuelve el video solo | Mirar otra pestaña y regresar |
| Cámara caída: el error quedaba pegado aunque volviera | Se reintenta pasados 5 s | Se reinicia la cámara por un corte de luz |

### Lo que falta para verlo en tu Chrome (lo hace otro, ya avisado)

| Problema | Arreglo |
|---|---|
| La seguridad del panel bloquea el reproductor de video (se baja de internet) y el video que arma | Permitir ese reproductor (o incluirlo en el sistema) y el video interno del navegador |
| Chrome dice que sabe reproducir este video por su cuenta pero no puede: pantalla negra y pide la lista 320 veces por segundo | El visor usa el reproductor del sistema (como Firefox), y el de Chrome sólo en iPhone |
| Con el video andando, abajo dice «Detenido» | Que el pie mire el video y no las fotos |
| En producción, el tope general de 60 pedidos por minuto corta el video con una sola pestaña | Darle al video el mismo cupo que ya tienen las fotos en vivo |

Con esos arreglos simulados en la prueba: **imagen real, 4 s de retraso, 1 ffmpeg para 3 pestañas**.

## 2. ¿El sistema graba hoy?

**No.** Los pedazos de video se borran solos (quedan los últimos 8 s) y la carpeta se borra al cerrar. Lo único que se guarda son las fotos.

### Propuesta (todavía sin construir)

| Opción | Cómo | Bueno | Malo |
|---|---|---|---|
| **A. Graba el NVR** (recomendada) | El grabador Hikvision graba 24/7 en su disco, en H.265 | Sin programar nada; si se cae internet, sigue grabando | Para ver lo grabado desde el panel hay que pedírselo al NVR (siguiente paso) |
| B. Graba el puente | MediaMTX en la mini PC guarda pedazos de 1 min y borra los de más de N días | Lo grabado queda al alcance del panel | La PC tiene que estar prendida y con disco grande |
| C. Sólo eventos | Se guardan 30 s antes y después de cada aviso (persona, placa) | Mucho menos disco | Se pierde el contexto: lo que pasó sin aviso no existe |

Probé la B con la cámara simulada: graba pedazos de 10 s de 0,65 MB cada uno, con 1,1 % de CPU y 43 MB de memoria.

### Cuánto disco

**Fórmula:** GB por día = Mbps × 10,8 (24 h × 3 600 s ÷ 8 bits ÷ 1 000).
El número de Mbps sale de la cámara: Configuración → Video → Tasa de bits máxima.

| Cámara | Mbps | GB/día por cámara | 4 cámaras por día | Días con 4 TB | Días con 2 TB |
|---|---|---|---|---|---|
| 1080p H.265 | 2 | 21,6 | 86 GB | 44 | 22 |
| 1080p H.265+ | 1 | 10,8 | 43 GB | 88 | 44 |
| 4MP H.265 (tope de fábrica) | 4 | 43,2 | 173 GB | 22 | 11 |
| 4MP H.265+ | 2 | 21,6 | 86 GB | 44 | 22 |

Sólo eventos: 1 Mbps es 0,45 GB por hora con movimiento. Ejemplo: una 4MP a 4 Mbps con 6 h de movimiento al día usa 10,8 GB en vez de 43,2.

## 3. Lista de compra (4 cámaras)

Precios de la web consultados el **05-10-2026**. En tienda de Pucallpa o con un distribuidor pueden variar.

| Qué | Modelo | S/ | Fuente |
|---|---|---|---|
| 4 cámaras exterior, de color de noche | Hikvision **DS-2CD1047G2H-LIU** ColorVu 4MP PoE, RTSP/ONVIF | 4 × 314 = **1 256** | [Promart](https://www.promart.pe/colorvu-tubo-ip-4mp-2-8mm-ip67-smart-hybrid-light-up-hk-ds2cd1047g2h-liu-1001211102/p) |
| Grabador con PoE (da corriente a las cámaras por el mismo cable) | Hikvision **DS-7104NI-Q1/4P** (4 canales, 4 PoE, hasta 4MP, 1 disco hasta 6 TB) | **305** | [Promart](https://www.promart.pe/nvr-hikvision-hk-ds7104ni-q1-4p-4ch-poe-1-sata-hasta-6tb-1001003777/p) |
| Disco para cámaras | Seagate **SkyHawk 4 TB** | **839** | [Falabella](https://www.falabella.com.pe/falabella-pe/product/156338838) |
| Cable exterior (resiste sol) | Dixon **9041** Cat6 exterior UV, 305 m | **739** | [Falabella](https://www.falabella.com.pe/falabella-pe/product/157510546/cable-utp-dixon-9041-cat6-23awg-negro-exterior-uv-305m) |
| Equipo puente | **PC vieja** que ya tengas (Windows o Linux, 4 GB de RAM) | **0** | — |
| **Total** | | **S/ 3 139** | |

Variantes:

| Cambio | S/ | Fuente |
|---|---|---|
| Cámaras más baratas: Hikvision **DS-2CD1043G2-LIU** 4MP luz híbrida (de noche, blanco y negro salvo cuando prende su luz) | 4 × 257,60 = 1 030,40 → total **S/ 2 913,40** | [Promart](https://www.promart.pe/camara-hikvision-tubo-ip-4mp-smart-hybrid-light-2-8mm-h-265-ip67-30m-audio-p-n-hk-ds2cd1043g2-liu-1001200105/p) |
| Bajo techo: TP-Link **VIGI C240** domo 4MP PoE | 196 c/u | [Promart](https://www.promart.pe/camara-ip-vigi-c240-4mp-domo-full-color-poe-1001467720/p) |
| Puente nuevo en vez de la PC vieja: mini PC **Blackview MP100 Pro** i3, 16 GB, 512 GB | +1 859 → total **S/ 4 998** | [Promart](https://www.promart.pe/mini-pc-blackview-mp100-pro-2026-intel-core-i3-512gb-ssd-16gb-negro-negro-1001479453/p) |
| Sin NVR (graba el puente): switch **HiLook NS-0109P-60(B)**, 8 PoE | 169 (y el puente necesita disco grande) | [Promart](https://www.promart.pe/switch-poe-hilook-ns-0109p-60-b-no-administrado-9-puertos-100mps-1001332011/p) |

No incluido: conectores RJ45, cajas estancas, canaletas, instalación y una UPS (recomendada: sin luz no graba). Mini PC con Intel N100: no la encontré con precio verificable en tiendas peruanas.

**Por qué el NVR y no sólo un switch:** cuesta casi lo mismo que un switch PoE más disco aparte, graba aunque se caiga el puente o internet, y entrega el video de las 4 cámaras por su propia dirección (`rtsp://<NVR>:554/Streaming/Channels/101`, `102`, `201`…), que es justo el formato que el sistema ya sabe pedir.

## 4. Internet de subida (para ver desde fuera de la planta)

| Qué se mira | Subida |
|---|---|
| 1 cámara en calidad baja (medido en la prueba) | 0,56 Mbps por persona mirando |
| Las 4 cámaras en calidad baja, 1 persona | ~2,3 Mbps |
| + 1 cámara en calidad alta (4MP) para ver una placa | +4 Mbps |
| **Recomendado** | **≥ 10 Mbps de subida** (fibra) |

Con 4G también anda en calidad baja, pero cuenta los datos: 0,56 Mbps son **252 MB por hora por cámara** mirada.

## 5. Cómo se conecta todo (5 líneas)

1. **Cámaras** → cable → **NVR**: les da corriente y graba 24/7 en H.265.
2. **NVR** → red de la planta → **puente** con MediaMTX: toma el video del NVR sólo cuando alguien mira y lo entrega al navegador.
3. **Puente** → túnel de Cloudflare (sale hacia afuera: no hay que abrir puertos ni pelear con el CGNAT del 4G), con un portero que sólo deja pasar video con permiso.
4. **Panel** (buleje.pe) → da un permiso de 1 minuto para esa cámara → el navegador mira el video directo del puente.
5. **IA y avisos**: el puente saca 1 cuadro cada pocos segundos del mismo video y lo manda a la entrada de fotos que ya existe.

Hoy funciona tal cual el paso 2 si el panel corre en una PC de la misma red que el NVR (como en tu PC con `localhost`). Los pasos 3 y 4 (permiso + portero) son lo siguiente a construir: buleje.pe corre en Vercel, que no puede convertir video.

## 6. Pasos cuando llegue lo comprado

1. **Cámaras y NVR:** conectar cada cámara a un puerto PoE del NVR; el NVR las activa solo. Ponerle disco al NVR.
2. **En el NVR:** crear un usuario de sólo ver (Usuario u Operador, no `admin`) para el sistema.
3. **Calidad baja de cada cámara** (Configuración → Video → Secundario): **H.264**, 640×360, 15-25 cuadros/s, 512 kbps, intervalo de cuadro I = 2 × cuadros/s (cada 2 s). H.264 lo ve cualquier navegador; H.265 depende de la PC (el Chrome de la prueba no lo reproduce).
4. **Calidad alta** (Principal): H.265 o H.265+, 4 Mbps máx. Es la que se graba.
5. **Probar desde el puente** (antes de tocar el panel):
   ```bash
   CAMARA_RTSP='rtsp://<usuario>:<clave>@<IP-del-NVR>:554/Streaming/Channels/102' \
     npx tsx scripts/camaras-prueba-video.ts --sin-navegador
   ```
   Dice cuánto tarda el primer pedazo, si es H.264 o H.265, los Mbps reales y cuánta CPU usa.
6. **En el panel:** Cámaras → Conectar → dirección del NVR, usuario de sólo ver, canal 1 a 4.

## 7. Repetir la prueba simulada

```bash
# Una vez: MediaMTX a la carpeta del usuario (sin sudo)
# https://github.com/bluenviron/mediamtx/releases → mediamtx_vX_linux_amd64.tar.gz → ~/.local/opt/mediamtx/

npx tsx scripts/camaras-prueba-video.ts                                   # como está hoy
npx tsx scripts/camaras-prueba-video.ts --forzar-hlsjs --csp-arreglada   # con los arreglos del visor simulados
npx tsx scripts/camaras-prueba-video.ts --canal 101                      # la cámara manda H.265 en 1080p: ver qué hace tu navegador
```

Necesita el panel corriendo en `localhost:3000`. Saca un informe con todas las cifras de la tabla 1 y las capturas, y apaga MediaMTX y ffmpeg al terminar.
