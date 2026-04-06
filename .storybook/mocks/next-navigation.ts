// Stubs de next/navigation para Storybook
export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
  refresh: () => {},
});

export const usePathname = () => "/";

export const useSearchParams = () => ({
  get: () => null,
  getAll: () => [],
  has: () => false,
  toString: () => "",
});

export const useParams = () => ({});

export const redirect = () => {};
export const permanentRedirect = () => {};
export const notFound = () => {};
