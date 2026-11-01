import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDirs = ['2v2', '3v3', 'divisions'];

// Serves/copies the icon folders that live at the repository root so the site reuses them directly.
function repoIcons(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'repo-icons',
    configResolved(c) {
      config = c;
    },
    configureServer(server) {
      server.middlewares.use('/icons', (req, res, next) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(repoRoot, rel);
        const top = rel.split('/')[0];
        if (!iconDirs.includes(top) || !file.startsWith(repoRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next();
        }
        res.setHeader('Content-Type', 'image/png');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (config.command !== 'build') return;
      const out = path.resolve(config.root, config.build.outDir, 'icons');
      for (const d of iconDirs) {
        fs.cpSync(path.join(repoRoot, d), path.join(out, d), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [repoIcons()],
  build: { outDir: 'dist', emptyOutDir: true },
});
