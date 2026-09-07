/**
 * Studio configuration — `npm run studio -w @qissa/video`.
 *
 * This file is read ONLY by the Remotion CLI. The server's render path does
 * not load it (renderMedia takes its options as arguments), which is why the
 * webpack override lives in its own module and is applied in both places
 * rather than only here — a bundle that resolved modules one way in the studio
 * and another way in production would be a genuinely confusing failure.
 */
import { Config } from '@remotion/cli/config';
import { webpackOverride } from './src/webpack-override.js';

Config.overrideWebpackConfig(webpackOverride);
Config.setVideoImageFormat('jpeg');
