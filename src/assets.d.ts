// Déclaration de module pour les imports d'assets binaires (Vite les résout en
// URL au build). Premier asset binaire du projet — cf. CLAUDE.md, P2 sprites.
declare module "*.png" {
  const url: string;
  export default url;
}
