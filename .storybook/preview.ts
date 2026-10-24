// Tipo desde @storybook/react (instalado); "@storybook/nextjs" NO está en
// package.json y solo resolvía por hoisting transitivo (hallazgo knip 2026-07-13).
import type { Preview } from "@storybook/react";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      options: {
        mobile: {
          name: "Mobile (375px)",
          styles: { width: "375px", height: "812px" },
          type: "mobile",
        },
        tablet: {
          name: "Tablet (768px)",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
        desktop: {
          name: "Desktop (1280px)",
          styles: { width: "1280px", height: "800px" },
          type: "desktop",
        },
      }
    },
    backgrounds: {
      options: {
        light: { name: "light", value: "#ffffff" },
        dark: { name: "dark", value: "#0a0f0e" },
        surface: { name: "surface", value: "#f8fafa" }
      }
    },
  },

  globalTypes: {
    theme: {
      description: "Tema global",
      defaultValue: "light",
      toolbar: {
        title: "Tema",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },

  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "light";
      // Aplica clase .dark en el html raíz para que las variables CSS funcionen
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      return Story();
    },
  ],

  initialGlobals: {
    viewport: {
      value: "desktop",
      isRotated: false
    },

    backgrounds: {
      value: "light"
    }
  }
};

export default preview;
