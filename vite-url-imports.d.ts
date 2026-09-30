// Vite's `?url` suffix resolves an asset (here a pdf.js worker) to its served URL.
declare module '*?url' {
  const url: string;
  export default url;
}
