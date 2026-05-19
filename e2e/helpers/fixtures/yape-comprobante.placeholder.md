# Fixture: yape-comprobante.jpg

Los specs E2E de checkout (`checkout-yape-full.spec.ts`) necesitan una imagen
JPG real de comprobante para el test de upload de comprobante Yape.

## Cómo colocar el archivo real

1. Guarda cualquier imagen JPG (ej. captura de pantalla de Yape) con el nombre:
   ```
   e2e/helpers/fixtures/yape-comprobante.jpg
   ```

2. El archivo debe ser un JPG válido (no importa el contenido visual).
   Tamaño recomendado: entre 10KB y 500KB.

3. Si no tienes un comprobante real, puedes generar uno con ImageMagick:
   ```bash
   convert -size 400x600 xc:white \
     -font "DejaVu-Sans" -pointsize 20 \
     -draw "text 50,100 'YAPE - Operación: 12345678'" \
     -draw "text 50,140 'Monto: S/ 25.00'" \
     -draw "text 50,180 'Fecha: 2026-05-18'" \
     e2e/helpers/fixtures/yape-comprobante.jpg
   ```

4. Este archivo NO debe commitearse al repo (está en .gitignore).
   Solo existe localmente para los tests E2E.

## Specs que usan este fixture

- `e2e/checkout-yape-full.spec.ts` — test 2: upload de comprobante
  ```ts
  const tmpFile = path.join(process.cwd(), "e2e", "helpers", "yape-comprobante-test.png");
  if (uploadVisible && fs.existsSync(tmpFile)) {
    await modal.locator('input[type="file"]').setInputFiles(tmpFile);
  }
  ```

> Nota: el spec también acepta `yape-comprobante-test.png` en esa ubicación.
> Puedes colocar cualquiera de los dos nombres.
