# Puente de cámaras desde la PC (Hik-Connect → panel)

> ADR-466 · 2026-10-03. Para la cámara de la oficina (DS-2CFSP4-4G), que va solo por 4G y solo se ve en Hik-Connect.

**Qué hace.** En tu PC, Hik-Connect corre dentro de BlueStacks (o usas el iVMS-4200). Un script captura esa ventana cada segundo y la manda al panel. En **Cámaras** la ves casi en vivo, y el panel guarda una foto (que la IA lee) solo cuando la imagen cambia.

## Lo que necesitas

- BlueStacks con Hik-Connect (o el iVMS-4200), con tu cuenta.
- Tres archivos en una carpeta, por ejemplo `C:\PuenteCamaras\`:
  - `camaras-puente-pc.ps1` y `camaras-puente-pc.cmd`: cópialos desde `\\wsl.localhost\Ubuntu\home\usuario\proyectos\Mercado\scripts\`.
  - `camaras-puente-pc.json`: lo descargas del panel (paso 2).

No hay que instalar nada: usa el PowerShell que ya trae Windows.

## Pasos

1. **Abre la cámara en Hik-Connect.** En BlueStacks entra a la cámara en vivo, de preferencia en horizontal y a pantalla completa. La ventana puede quedar **detrás** de otras mientras usas la PC, pero **no minimizada**.
2. **En el panel:** Cámaras → en la cámara, **Conectar** → **Puente desde la PC**.
   - Elige el programa (BlueStacks o iVMS-4200).
   - Toca **Descargar configuración** y guarda `camaras-puente-pc.json` en `C:\PuenteCamaras\`.
   - Toca **Usar el puente**.
3. **Prueba que agarra la ventana correcta** (opcional): en PowerShell, `cd C:\PuenteCamaras` y luego `powershell -ExecutionPolicy Bypass -File camaras-puente-pc.ps1 -Probar`. Te deja `camaras-puente-prueba.jpg` en la carpeta y no manda nada.
4. **Arráncalo:** doble clic en `camaras-puente-pc.cmd`. Se abre una consola que dice qué está pasando. Ctrl+C para pararlo.
   - Sin el archivo `.json`: pega en PowerShell el comando que copiaste con **Copiar comando** (parado en la carpeta).
5. **Marca el recorte:** vuelve a **Conectar → Puente desde la PC** y arrastra un rectángulo sobre la imagen para quedarte solo con el video (sin la barra ni los botones de Hik-Connect). Con la vista de 4 cámaras, elige el cuadrante. **Guardar cambios**.

## Qué dice la consola

| Mensaje | Qué significa |
|---|---|
| `enviado · guardada (cambio)` | La imagen cambió: quedó una foto en el historial y la IA la lee. |
| `enviado · guardada (intervalo)` | No cambió nada, pero tocaba una foto de control. |
| `enviado · sin cambio` | Se ve en vivo en el panel, no se guarda nada (gratis). |
| `hoy ya se guardó el máximo de fotos` | Llegó al tope del día: se sigue viendo en vivo, sin guardar. |
| `No encuentro ninguna ventana…` | BlueStacks está cerrado o el título no tiene ese texto. |
| `está minimizada` | Ábrela: puede quedar detrás de otras, minimizada no. |
| `La captura sale negra` | En BlueStacks, Configuración → Gráficos: prueba el otro motor (DirectX/OpenGL). |
| `El panel no reconoce la clave` | Le cambiaste la dirección a la cámara: descarga la configuración de nuevo. |
| `No llegó: … Reintento en N s` | Se cortó la red o el panel está apagado; reintenta solo (1, 2, 4… hasta 30 s). |

## Que arranque solo con Windows

1. `Win + R` → escribe `shell:startup` → Enter.
2. En esa carpeta, clic derecho → **Nuevo → Acceso directo** → elige `C:\PuenteCamaras\camaras-puente-pc.cmd`.
3. Que BlueStacks también abra solo (si tu versión tiene esa opción en Configuración) y deja Hik-Connect en la cámara.
4. En Configuración → Sistema → Energía, que la PC **no se suspenda**. Si con la pantalla apagada el cuadro se congela, pon también la pantalla en «Nunca».

## Costo y datos

- **IA:** cada foto guardada ≈ US$0,01. El tope por día lo eliges en el panel (por defecto 60 fotos ≈ US$0,60 al día). Los cuadros sin cambio no se leen.
- **Internet:** si el panel es `buleje.pe`, el puente sube ~70-100 KB por segundo (≈ 6-8 GB al día). Para la mitad, agrega `-CadaSeg 2`. Con el panel en `localhost`, no gasta internet.

## Seguridad

- **La clave de la cámara va en texto plano** en `camaras-puente-pc.json` y en el comando. Con ellos cualquiera puede mandar imágenes como si fuera la cámara: **no los compartas** (ni por WhatsApp, ni en el drive). Déjalos solo en la PC del puente.
- Si se filtraron: en el panel, **Cambiar la dirección** de la cámara (el botón de las flechas). La clave vieja deja de entrar; descarga la configuración nueva.
- Solo admin o dueño ve la dirección y la clave en el panel.
- El script solo fotografía la ventana cuyo título contiene el texto elegido (por defecto «BlueStacks») y la manda a tu panel. Es un archivo de texto: lo puedes abrir con el Bloc de notas y leerlo.
