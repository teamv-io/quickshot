// electron-vite resolves `*?asset` imports to a runtime path that resolves
// correctly both in dev (project root) and in packaged builds (next to the
// app bundle). Declare the types here so the main-process bundle compiles.
declare module '*?asset' {
  const src: string
  export default src
}
