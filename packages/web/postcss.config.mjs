/**
 * Tailwind CSS v4 is wired as a PostCSS plugin. The dashboard slice's
 * `app/globals.css` uses `@import "tailwindcss";` + `@source`; this plugin
 * expands the utilities at build time. (Owned here so the shared package.json
 * carries the Tailwind deps for both concurrent web slices.)
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
