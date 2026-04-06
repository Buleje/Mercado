import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Next.js metadata image: auto-linked as <link rel="icon"> in <head>
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "linear-gradient(145deg, #00B4A6, #009690)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: "#ffffff",
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: "Arial Black, Arial, sans-serif",
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size }
  );
}
