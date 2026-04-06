import React from "react";

type LinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  rel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

// Stub de next/link para Storybook
export default function Link({ href, children, className, target, rel, onClick }: LinkProps) {
  return (
    <a href={href} className={className} target={target} rel={rel} onClick={onClick}>
      {children}
    </a>
  );
}
