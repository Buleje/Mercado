import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressiveImage, ProgressiveImageGrid, ProgressiveBackgroundImage } from "@/components/ProgressiveImage";

// Mock useOptimizedImage hook
vi.mock("@/hooks/use-optimized-image", () => ({
  useOptimizedImage: vi.fn((src) => ({
    ref: { current: null },
    isLoading: false,
    isLoaded: true,
    hasError: false,
    src,
  })),
}));

describe("ProgressiveImage", () => {
  it("renders image with alt text", () => {
    render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
      />
    );

    const image = screen.getByAltText("Test Image");
    expect(image).toBeInTheDocument();
  });

  it("applies custom className to container", () => {
    const { container } = render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        className="custom-class"
      />
    );

    const imageContainer = container.firstChild as HTMLElement;
    expect(imageContainer).toHaveClass("custom-class");
  });

  it("sets aspect ratio when width and height are provided", () => {
    const { container } = render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        width={400}
        height={300}
      />
    );

    const imageContainer = container.firstChild as HTMLElement;
    expect(imageContainer).toHaveStyle({ aspectRatio: "400 / 300" });
  });

  it("applies object-fit style to image", () => {
    render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        objectFit="contain"
      />
    );

    const image = screen.getByAltText("Test Image");
    expect(image).toHaveStyle({ objectFit: "contain" });
  });

  it("renders with default shimmer placeholder", () => {
    const { container } = render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
      />
    );

    // Placeholder should be present (as hidden img element with aria-hidden)
    const placeholders = container.querySelectorAll('img[aria-hidden="true"]');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("uses custom placeholder when provided", () => {
    const customPlaceholder = "data:image/svg+xml;base64,custom";
    
    const { container } = render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        placeholder={customPlaceholder}
      />
    );

    const placeholderImg = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
    expect(placeholderImg?.src).toContain("custom");
  });

  it("sets lazy loading attribute", () => {
    render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        lazy={true}
      />
    );

    const image = screen.getByAltText("Test Image");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("sets eager loading when lazy is false", () => {
    render(
      <ProgressiveImage
        src="/test-image.jpg"
        alt="Test Image"
        lazy={false}
      />
    );

    const image = screen.getByAltText("Test Image");
    expect(image).toHaveAttribute("loading", "eager");
  });
});

describe("ProgressiveImageGrid", () => {
  const mockImages = [
    { src: "/img1.jpg", alt: "Image 1" },
    { src: "/img2.jpg", alt: "Image 2" },
    { src: "/img3.jpg", alt: "Image 3" },
  ];

  it("renders all images", () => {
    render(<ProgressiveImageGrid images={mockImages} />);

    expect(screen.getByAltText("Image 1")).toBeInTheDocument();
    expect(screen.getByAltText("Image 2")).toBeInTheDocument();
    expect(screen.getByAltText("Image 3")).toBeInTheDocument();
  });

  it("applies grid layout with correct columns", () => {
    const { container } = render(
      <ProgressiveImageGrid images={mockImages} columns={3} />
    );

    const gridContainer = container.firstChild as HTMLElement;
    expect(gridContainer).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    });
  });

  it("applies custom gap", () => {
    const { container } = render(
      <ProgressiveImageGrid images={mockImages} gap={6} />
    );

    const gridContainer = container.firstChild as HTMLElement;
    expect(gridContainer).toHaveStyle({ gap: "1.5rem" }); // 6 * 0.25 = 1.5
  });

  it("applies custom aspect ratio to images", () => {
    const { container } = render(
      <ProgressiveImageGrid
        images={mockImages}
        aspectRatio="16/9"
      />
    );

    const imageContainers = container.querySelectorAll(".relative");
    imageContainers.forEach((img) => {
      expect(img).toHaveStyle({ aspectRatio: "16/9" });
    });
  });
});

describe("ProgressiveBackgroundImage", () => {
  it("renders background image", () => {
    render(
      <ProgressiveBackgroundImage
        src="/bg.jpg"
        alt="Background"
      />
    );

    expect(screen.getByAltText("Background")).toBeInTheDocument();
  });

  it("renders children content", () => {
    render(
      <ProgressiveBackgroundImage
        src="/bg.jpg"
        alt="Background"
      >
        <h1>Hero Title</h1>
      </ProgressiveBackgroundImage>
    );

    expect(screen.getByText("Hero Title")).toBeInTheDocument();
  });

  it("applies custom className to container", () => {
    const { container } = render(
      <ProgressiveBackgroundImage
        src="/bg.jpg"
        alt="Background"
        className="h-96"
      />
    );

    expect(container.firstChild).toHaveClass("h-96");
  });

  it("applies overlay className to children wrapper", () => {
    const { container } = render(
      <ProgressiveBackgroundImage
        src="/bg.jpg"
        alt="Background"
        overlayClassName="bg-black/50"
      >
        <h1>Content</h1>
      </ProgressiveBackgroundImage>
    );

    const overlay = container.querySelector(".bg-black\\/50");
    expect(overlay).toBeInTheDocument();
  });
});
