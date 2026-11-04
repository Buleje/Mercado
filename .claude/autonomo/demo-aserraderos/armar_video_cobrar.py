"""Video «Quién te debe» (03-11, ~20 s, 800×1720) para la demo de aserraderos.

Uso: python3 armar_video_cobrar.py <dir con correo-c.png y whatsapp.png> <salida.mp4>
Las imágenes salen de armar-correo.mts (datos INVENTADOS). Cada cuadro es una
página HTML que Chrome fotografía a 400×860 escala 2; ffmpeg los une con fundidos.
"""
import base64, os, subprocess, sys

d, out = sys.argv[1:3]
CH = os.path.expanduser("~/.cache/ms-playwright/chromium-1226/chrome-linux64/chrome")
b64 = lambda f: "data:image/png;base64," + base64.b64encode(open(os.path.join(d, f), "rb").read()).decode()
CORREO, WA = b64("correo-c.png"), b64("whatsapp.png")
BASE = "margin:0;display:flow-root;width:400px;height:860px;overflow:hidden;font-family:system-ui,'Segoe UI',Roboto,sans-serif;position:relative"


def letrero(n, t):
    return (f'<div style="position:absolute;left:0;right:0;top:0;min-height:64px;display:flex;align-items:center;gap:10px;'
            f'padding:8px 14px;background:#0f766e;color:#fff;font-weight:700;font-size:17px;line-height:1.3;box-shadow:0 2px 10px rgba(0,0,0,.25)">'
            f'<span style="flex:none;width:30px;height:30px;border-radius:50%;background:#fff;color:#0f766e;display:grid;place-items:center;font-weight:800">{n}</span>'
            f'<span>{t}</span></div>')


def correo(marca=""):
    return (f'<body style="{BASE};background:#F6F8F9"><img src="{CORREO}" style="position:absolute;top:84px;left:0;width:400px">'
            f'{marca}')


cuadros = [
    ("1", 3.2, f'<body style="{BASE};background:linear-gradient(#1f2a33,#0d1419)">'
     '<div style="color:#fff;text-align:center;margin-top:170px;font-size:64px;font-weight:300">18:00</div>'
     '<div style="color:#cfd8dc;text-align:center;font-size:16px">martes 3 de noviembre</div>'
     '<div style="margin:60px 16px 0;background:rgba(255,255,255,.92);border-radius:16px;padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.35)">'
     '<div style="font-size:12px;color:#5B6670;display:flex;justify-content:space-between"><b style="color:#00A29C">CORREO</b><span>ahora</span></div>'
     '<div style="font-weight:700;font-size:15px;color:#12181E;margin-top:4px">Parte del día — Maderera El Bosque</div>'
     '<div style="font-size:14px;color:#12181E;margin-top:2px">Quién te debe: te deben S/ 13,695.70 entre 5 personas</div></div>'
     + letrero("1", "Cada tarde te llega el parte solo, sin que nadie lo arme")),
    ("2", 4.2, correo() + letrero("2", "Quién te debe: el total y cada persona, de mayor a menor")),
    ("3", 4.2, correo('<div style="position:absolute;left:28px;right:14px;top:281px;height:42px;border:3px solid #f59e0b;border-radius:8px;'
                     'background:rgba(245,158,11,.12)"></div>') + letrero("3", "Adelantos y madera por separado: sabes qué cobrar")),
    ("4", 4.2, f'<body style="{BASE};background:#EFE7DD"><img src="{WA}" style="position:absolute;top:110px;left:0;width:400px">'
     + letrero("4", "También por WhatsApp: los que más deben")),
    ("5", 4.6, f'<body style="{BASE};background:#0f766e;color:#fff;text-align:center">'
     '<div style="margin-top:250px;font-size:30px;font-weight:800">Cobra a tiempo</div>'
     '<div style="margin:16px 30px 0;font-size:18px;line-height:1.4">Una deuda que nadie recuerda no se cobra.</div>'
     '<div style="margin-top:46px;font-size:22px;font-weight:700">Incluido en los S/ 349 al mes</div>'
     '<div style="margin-top:12px;font-size:18px">WhatsApp 917 013 738</div>'
     '<div style="position:absolute;bottom:26px;left:0;right:0;font-size:12px;opacity:.8">Datos de prueba</div>'),
]
pngs = []
for n, seg, html in cuadros:
    h = os.path.join(d, f"v{n}.html"); p = os.path.join(d, f"v{n}.png")
    open(h, "w").write(f"<!doctype html><html lang=es>{html}</body></html>")
    subprocess.run([CH, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    "--window-size=400,860", f"--screenshot={p}", "file://" + h], check=True, capture_output=True)
    pngs.append((p, seg))
F = 0.4
args = ["ffmpeg", "-y", "-loglevel", "error"]
for p, seg in pngs:
    args += ["-loop", "1", "-t", str(seg), "-i", p]
filt, prev, off = [], "0:v", 0.0
for i in range(1, len(pngs)):
    off += pngs[i - 1][1] - F
    filt.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={F}:offset={off:.2f}[x{i}]"); prev = f"x{i}"
args += ["-filter_complex", ";".join(filt), "-map", f"[{prev}]", "-r", "30", "-c:v", "libx264", "-crf", "20",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
subprocess.run(args, check=True)
print("ok", out)
