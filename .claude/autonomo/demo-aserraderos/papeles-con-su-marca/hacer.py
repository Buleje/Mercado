"""Demo «papeles con su marca» (Brandon 04-11, menú 16:05): proforma + cubicación con el logo, los colores y la
numeración de cada aserradero, armadas con el MISMO molde de Blas (`blas.typ`, `--input empresa=<json>`).

Uso: python3 hacer.py <carpeta de salida>
Sale, por marca, «Muestra - papeles con su marca - <Nombre>.pdf» (2 hojas) + PNG de cada hoja para el folleto.
Todo en estado MUESTRA (marca de agua y «datos de ejemplo»): no gasta números de Blas ni manda nada al panel.
Datos de los clientes = públicos (SUNAT y su web, traspaso 16:05); compradores, piezas y precios INVENTADOS.
«Maderera El Bosque» es la marca inventada del folleto (el folleto va a los dos: ninguno ve el logo del otro).
"""
import json, subprocess, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, "/home/usuario/.local/share/blas-papeles")
import blas_papeles as bp  # noqa: E402

FECHA = "2026-11-04"
NOTA_PT = "Precios por pie tablar (pt), salvo que el ítem diga otra unidad."
SIN_CUENTA = [{"banco": "Su banco", "cta": "(su número de cuenta)", "cci": "", "titular": ""}]

MARCAS = {
    "Inforhuay": {
        "razon_social": "Industria Forestal Huayruro S.A.C.",
        "ruc": "20352166007",
        "domicilio": "Car. Federico Basadre Km 12, Cas. Dos de Mayo (interior 500 m)",
        "domicilio_corto": "Yarinacocha, Coronel Portillo — Ucayali",
        "telefono": "Cel. 997 847 059",
        "correo": "inforhuaywood@inforhuay.com",
        "firma_nombre": "Javier Navarro Vásquez",
        "frase": "Industria forestal · Yarinacocha, Ucayali",
        "logo": "logo-inforhuay.png",
        "prefijo": "INFH",
        "colores": {"oscuro": "#1d1d1f", "medio": "#c4161c", "suave": "#fdeeee", "claro": "#f3c4c6",
                    "acento": "#e30613", "acento-suave": "#fff2f2"},
        "comprador": {"nombre": "Constructora Ejemplo S.A.C.", "doc": "RUC 20000000001",
                      "contacto": "Atención: Sra. Ana Torres · Cel. 900 000 000", "direccion": "Av. Ejemplo 456, Lima"},
        "items": [("Shihuahuaco aserrado 2\" × 6\" × 10'", "pt", "1200", "7.80"),
                  ("Estoraque aserrado 2\" × 4\" × 8'", "pt", "800", "8.20"),
                  ("Capirona aserrada 3\" × 3\" × 10'", "pt", "600", "4.60")],
        "pago": "50 % al confirmar y 50 % antes del despacho",
        "entrega": "En planta Yarinacocha, 10 días hábiles",
        "piezas": [("Shihuahuaco", "Primera", "2", "6", "10", "120", "7.80"),
                   ("Shihuahuaco", "Primera", "2", "8", "12", "45", "7.80"),
                   ("Estoraque", "Primera", "2", "4", "8", "150", "8.20"),
                   ("Estoraque", "Segunda", "1.5", "4", "8", "60", "7.20")],
    },
    "COPESA": {
        "razon_social": "Corporación Maderera Copesa E.I.R.L.",
        "ruc": "20607294543",
        "domicilio": "Jr. Simón Bolívar 121",
        "domicilio_corto": "Cercado de Pucallpa, Callería — Ucayali",
        "telefono": "Cel. 990 024 933",
        "correo": "grupoprevca@gmail.com",
        "firma_nombre": "Gerencia General",
        "frase": "Madera aserrada · Pucallpa, Ucayali",
        "logo": "logo-copesa.png",
        "prefijo": "COPE",
        "colores": {"oscuro": "#1f3a5f", "medio": "#2d5486", "suave": "#eaf0f7", "claro": "#c9d6e8",
                    "acento": "#8a5a2b", "acento-suave": "#f6efe6"},
        "comprador": {"nombre": "Ferretería Ejemplo E.I.R.L.", "doc": "RUC 20000000002",
                      "contacto": "Atención: Sr. Carlos Ríos · Cel. 900 000 000", "direccion": "Av. Ejemplo 789, Lima"},
        "items": [("Tornillo comercial 2\" × 8\" × 12'", "pt", "1500", "5.60"),
                  ("Cumala 1\" × 8\" × 10'", "pt", "1000", "3.20"),
                  ("Capirona 2\" × 4\" × 10'", "pt", "400", "4.40")],
        "pago": "Contado al despacho",
        "entrega": "En Pucallpa, 7 días hábiles",
        "piezas": [("Tornillo", "Comercial", "2", "8", "12", "95", "5.60"),
                   ("Tornillo", "Corta", "2", "4", "8", "120", "4.10"),
                   ("Cumala", "Comercial", "1", "8", "10", "150", "3.20"),
                   ("Cumala", "Comercial", "1", "6", "10", "80", "3.20")],
    },
    "Maderera El Bosque": {
        "razon_social": "Maderera El Bosque S.A.C.",
        "ruc": "20000000000",
        "domicilio": "Av. Ejemplo 100",
        "domicilio_corto": "Pucallpa — Ucayali",
        "telefono": "Cel. 900 000 000",
        "correo": "ventas@ejemplo.pe",
        "firma_nombre": "Gerencia General",
        "frase": "Madera aserrada · Pucallpa, Ucayali",
        "logo": "logo-el-bosque.png",
        "prefijo": "BOSQ",
        "colores": {"oscuro": "#0b4f49", "medio": "#0f766d", "suave": "#e6f4f1", "claro": "#c3e3dd",
                    "acento": "#b7791f", "acento-suave": "#fbf3e4"},
        "comprador": {"nombre": "Constructora Ejemplo S.A.C.", "doc": "RUC 20000000001",
                      "contacto": "Atención: Sra. Ana Torres · Cel. 900 000 000", "direccion": "Av. Ejemplo 456, Lima"},
        "items": [("Tornillo comercial 2\" × 8\" × 12'", "pt", "1500", "5.90"),
                  ("Cumala 1\" × 8\" × 10'", "pt", "1000", "3.20"),
                  ("Capirona 2\" × 4\" × 10'", "pt", "400", "4.40")],
        "pago": "A convenir",
        "entrega": "A coordinar",
        "piezas": [("Tornillo", "Comercial", "2", "8", "12", "95", "5.90"),
                   ("Tornillo", "Corta", "2", "4", "8", "120", "4.10"),
                   ("Cumala", "Comercial", "1", "8", "10", "150", "3.20")],
    },
}


def empresa_json(m: dict, d: Path) -> Path:
    e = {k: m[k] for k in ("razon_social", "ruc", "domicilio", "domicilio_corto", "telefono", "correo",
                           "firma_nombre", "frase", "prefijo", "colores")}
    e.update({"logo": str(AQUI / m["logo"]), "igv_por_defecto": "incluido", "validez_dias": 7, "pago": m["pago"],
              "entrega": m["entrega"], "notas": [NOTA_PT], "cuentas": [dict(c, titular=m["razon_social"]) for c in SIN_CUENTA],
              "cuentas_extra": []})
    p = d / "empresa.json"
    p.write_text(json.dumps(e, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def datos_proforma(m: dict) -> dict:
    return {"para": m["comprador"], "igv": "incluido", "validez_dias": 7, "pago": m["pago"], "entrega": m["entrega"],
            "notas": [], "yape": False,
            "items": [{"descripcion": a, "unidad": u, "cantidad": c, "precio": p} for a, u, c, p in m["items"]]}


def datos_cubicacion(m: dict) -> dict:
    corto = m["razon_social"].split(" S.A.C")[0].split(" E.I.R.L")[0]
    return {"cliente": m["comprador"], "guia_gtf": "GTF 0000123", "guia_gre": "EG01-0000123", "placa": "XYZ-000",
            "conductor": "Pedro Ejemplo Ramos", "destino": "Lima", "fecha_despacho": FECHA, "decimales_pt": 0,
            "piezas": [{"especie": e, "calidad": q, "espesor": es, "ancho": an, "largo": la, "cantidad": c, "precio": p}
                       for e, q, es, an, la, c, p in m["piezas"]],
            "observaciones": ["Carga contada pieza por pieza antes de salir.",
                              "La madera viaja amarrada en paquetes de 50 piezas."],
            "cubica": {"nombre": "Responsable de despacho", "doc": "DNI ________", "cargo": "Cubicó · " + corto},
            "recibe": {"nombre": "Recibe conforme", "doc": "DNI ________", "cargo": m["comprador"]["nombre"]}}


def main(salida: Path):
    salida.mkdir(parents=True, exist_ok=True)
    for nombre, m in MARCAS.items():
        d = salida / "trabajo" / nombre.replace(" ", "-").lower()
        d.mkdir(parents=True, exist_ok=True)
        emp = empresa_json(m, d)
        hojas = []
        for tipo, serie, datos in (("proforma", "PRO", datos_proforma(m)), ("cubicacion", "CUB", datos_cubicacion(m))):
            dj = d / f"{tipo}.json"
            dj.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
            pdf = d / f"{tipo}.pdf"
            num = f"{serie}-0001"
            res = bp.compilar(bp.MOLDES / f"{tipo}.typ", pdf, num, FECHA, "muestra", f"{m['prefijo']}-{num}-MUES", dj,
                              None, emp)
            print(nombre, tipo, res)
            hojas.append(pdf)
            subprocess.run(["mutool", "draw", "-q", "-r", "110", "-o", str(salida / f"{nombre} - {tipo}.png"), str(pdf), "1"],
                           check=True)
        final = salida / f"Muestra - papeles con su marca - {nombre}.pdf"
        subprocess.run(["qpdf", "--empty", "--pages", *map(str, hojas), "--", str(final)], check=True)
        print("→", final, round(final.stat().st_size / 1024), "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
