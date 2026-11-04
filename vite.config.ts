import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function ogmPackageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function ogmGitSha(): string {
  const env = (process.env.OGM_GIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || '').trim();
  if (env) return env.replace(/^v/, '').slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const DEV_SW_BUILD_ID = 'dev-local';

function ogmServiceWorkerBuildIdPlugin() {
  let buildId = DEV_SW_BUILD_ID;

  const injectSw = (template: string) =>
    template.replaceAll('__OGM_BUILD_ID__', buildId);

  return {
    name: 'ogm-sw-build-id',
    config(_config: unknown, { command }: { command: 'build' | 'serve' }) {
      if (command === 'build') {
        buildId =
          process.env.OGM_BUILD_ID ||
          `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
      } else {
        buildId = DEV_SW_BUILD_ID;
      }
      return {
        define: {
          __OGM_BUILD_ID__: JSON.stringify(buildId),
        },
      };
    },
    transformIndexHtml(html: string) {
      return html.replaceAll('__OGM_BUILD_ID__', buildId);
    },
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/' || url === '/index.html') {
          const origEnd = res.end.bind(res);
          res.end = (...args: unknown[]) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            return origEnd(...args);
          };
        }
        next();
      });
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/sw.js') {
          const template = fs.readFileSync(
            path.resolve(__dirname, 'public/sw.js'),
            'utf8'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(injectSw(template));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const template = fs.readFileSync(
        path.resolve(__dirname, 'public/sw.js'),
        'utf8'
      );
      fs.writeFileSync(
        path.resolve(__dirname, 'dist/sw.js'),
        injectSw(template),
        'utf8'
      );
    },
  };
}

export default defineConfig(() => {
  const ogmPublicBase =
    process.env.VITE_OGM_PUBLIC_BASE_URL?.trim() ||
    process.env.OGM_PUBLIC_BASE_URL?.trim() ||
    'https://open-grace-music2.onrender.com';

  return {
    plugins: [react(), tailwindcss(), ogmServiceWorkerBuildIdPlugin()],
    define: {
      'import.meta.env.VITE_OGM_PUBLIC_BASE_URL': JSON.stringify(ogmPublicBase),
      __OGM_VERSION__: JSON.stringify(ogmPackageVersion()),
      __OGM_GIT_SHA__: JSON.stringify(ogmGitSha()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
