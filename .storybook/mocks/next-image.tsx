import React from "react";

type ImageProps = {
  src: string | { src: string };
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  priority?: boolean;
  sizes?: string;
  style?: React.CSSProperties;
};

// Stub de next/image para Storybook — renderiza <img> nativo
export default function Image({ src, alt, width, height, fill, className, style }: ImageProps) {
  const resolvedSrc = typeof src === "object" && "src" in src ? src.src : src;
  const imgStyle: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }
    : style ?? {};

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={imgStyle}
    />
  );
}
