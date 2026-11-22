// The documented ESM HMR API provided by webpack, used only in development.
interface ImportMeta {
  readonly webpackHot?: { dispose(callback: () => void): void };
}
