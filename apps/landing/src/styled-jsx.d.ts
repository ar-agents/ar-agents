// Ambient augmentation for `<style jsx>` / `<style jsx global>` (styled-jsx,
// bundled inside Next.js and used by a couple of pages for local @keyframes).
//
// styled-jsx ships its own `jsx`/`global` prop typing via `styled-jsx/global.d.ts`,
// but this repo's tsconfig uses `"moduleResolution": "bundler"` in a pnpm
// workspace, and styled-jsx is only a transitive dependency of `next` here
// (not a direct dependency of apps/landing), so that ambient augmentation
// never gets pulled into this project's type graph. Declaring it locally is
// the standard workaround (see vercel/next.js#19533 and styled-jsx/styled-jsx
// issues for the same "Property 'jsx' does not exist" error under strict
// pnpm hoisting). Without this, `pnpm typecheck` / `next build` fail on the
// two pages that use `<style jsx global>` for local @keyframes.
import "react";

declare module "react" {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
