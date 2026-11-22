import "@leaningtech/cheerpx";

// Present in the official WebVM client, but missing from the 1.4.0 npm typings.
// https://github.com/leaningtech/webvm/blob/main/src/lib/WebVM.svelte
declare module "@leaningtech/cheerpx" {
  interface Linux {
    setKmsCanvas(canvas: HTMLCanvasElement, width: number, height: number): void;
    networkLogin(): unknown;
  }
}
