/**
 * Teach Remotion's webpack to resolve this repo's import specifiers.
 *
 * Every package here compiles under TypeScript's NodeNext resolution, which
 * requires import specifiers to carry the EMITTED extension — so `Root.tsx` is
 * imported as `./Root.js`. Webpack takes that literally, looks for a file
 * called `Root.js`, and fails the bundle with "Can't resolve './Root.js'".
 *
 * `extensionAlias` is the resolution rule for exactly this: a request ending
 * `.js` may be satisfied by `.ts` or `.tsx`. The alternative — writing
 * extensionless imports just in this package — would make it the one package
 * that does not typecheck under the shared tsconfig.
 *
 * Used by both the renderer and the studio, so a bundle built by `npm run
 * studio` resolves modules identically to one built by the server.
 */
import type { WebpackOverrideFn } from '@remotion/bundler';

export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...config.resolve?.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs']
    }
  }
});
