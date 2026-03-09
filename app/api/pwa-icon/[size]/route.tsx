import { ImageResponse } from "next/og";

// Node.js runtime — edge runtime has issues with Turbopack in local dev

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size } = await params;
  const s = Math.min(Math.max(parseInt(size) || 192, 16), 1024);

  const titleSize = Math.round(s * 0.38);
  const subSize = Math.round(s * 0.12);
  const gap = Math.round(s * 0.02);

  return new ImageResponse(
    (
      <div
        style={{
          width: s,
          height: s,
          background: "linear-gradient(145deg, #2d6a4f, #1b4332)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: `${gap}px`,
        }}
      >
        <div
          style={{
            fontSize: titleSize,
            color: "#f4a261",
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: "Arial Black, Arial, sans-serif",
          }}
        >
          B
        </div>
        <div
          style={{
            fontSize: subSize,
            color: "rgba(255,255,255,0.9)",
            fontWeight: 700,
            letterSpacing: `${Math.round(s * 0.012)}px`,
            lineHeight: 1,
            fontFamily: "Arial, sans-serif",
          }}
        >
          SAN MARTÍN
        </div>
      </div>
    ),
    { width: s, height: s }
  );
}
