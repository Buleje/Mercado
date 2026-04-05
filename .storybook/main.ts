import type { StorybookConfig } from "@storybook/react-webpack5";
import path from "path";

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.stories.@(ts|tsx)",
    "../components/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "@storybook/react-webpack5",
    options: {
      builder: {
        useSWC: false,
      },
    },
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
  staticDirs: ["../public"],
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.module = webpackConfig.module ?? { rules: [] };

    // Alias @/ → raíz del proyecto (igual que tsconfig paths)
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias ?? {}),
      "@": path.resolve(__dirname, ".."),
      // Stubs de módulos Next.js
      "next/image": path.resolve(__dirname, "./mocks/next-image.tsx"),
      "next/link": path.resolve(__dirname, "./mocks/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./mocks/next-navigation.ts"),
      "next/font/google": path.resolve(__dirname, "./mocks/next-font.ts"),
      "server-only": path.resolve(__dirname, "./mocks/server-only.ts"),
    };

    // TypeScript/TSX con Babel
    webpackConfig.module.rules = webpackConfig.module.rules ?? [];
    webpackConfig.module.rules.push({
      test: /\.(ts|tsx)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: "babel-loader",
          options: {
            presets: [
              ["@babel/preset-env", { targets: { browsers: "last 2 versions" } }],
              ["@babel/preset-react", { runtime: "automatic" }],
              "@babel/preset-typescript",
            ],
          },
        },
      ],
    });

    // Eliminar regla CSS preexistente y reemplazar con PostCSS (Tailwind CSS 4)
    webpackConfig.module.rules = webpackConfig.module.rules.filter((rule) => {
      if (rule && typeof rule === "object" && "test" in rule) {
        const test = rule.test;
        return !(test instanceof RegExp && test.source.includes("css"));
      }
      return true;
    });

    webpackConfig.module.rules.push({
      test: /\.css$/,
      use: [
        "style-loader",
        { loader: "css-loader", options: { importLoaders: 1 } },
        {
          loader: "postcss-loader",
          options: {
            postcssOptions: {
              config: path.resolve(__dirname, "../postcss.config.mjs"),
            },
          },
        },
      ],
    });

    return webpackConfig;
  },
};

export default config;
