const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const commonConfig = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  define: {
    'process.env.WS_URL': JSON.stringify(process.env.WS_URL || 'ws://localhost:9222'),
  },
};

/**
 * Copy static files (HTML, CSS, manifest) to dist
 */
function copyStaticFiles() {
  const distDir = path.join(__dirname, 'dist');
  const popupDir = path.join(__dirname, 'src', 'popup');

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy manifest.json
  fs.copyFileSync(
    path.join(__dirname, 'manifest.json'),
    path.join(distDir, 'manifest.json')
  );

  // Copy popup.html
  fs.copyFileSync(
    path.join(popupDir, 'popup.html'),
    path.join(distDir, 'popup.html')
  );

  // Copy popup.css
  fs.copyFileSync(
    path.join(popupDir, 'popup.css'),
    path.join(distDir, 'popup.css')
  );

  console.log('Static files copied.');
}

async function build() {
  // Background service worker
  const backgroundCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/background/index.ts'],
    outfile: 'dist/background.js',
  });

  // Content script
  const contentCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/content/index.ts'],
    outfile: 'dist/content.js',
  });

  // Popup script
  const popupCtx = await esbuild.context({
    ...commonConfig,
    entryPoints: ['src/popup/index.ts'],
    outfile: 'dist/popup.js',
  });

  if (isWatch) {
    await backgroundCtx.watch();
    await contentCtx.watch();
    await popupCtx.watch();
    copyStaticFiles();
    console.log('Watching for changes...');
  } else {
    await backgroundCtx.rebuild();
    await contentCtx.rebuild();
    await popupCtx.rebuild();
    await backgroundCtx.dispose();
    await contentCtx.dispose();
    await popupCtx.dispose();
    copyStaticFiles();
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
