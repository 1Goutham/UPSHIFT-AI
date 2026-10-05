# UPSHIFT browser extension

**To install:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick **`extension/dist`**. Don't pick this folder: it is the source, and Chrome reports "Service worker registration failed" for it.

Then open the UPSHIFT popup, enter your UPSHIFT server address (e.g. `https://your-app.vercel.app`) and a token from Settings → Browser extension.

- `src/`: source (TypeScript). `manifest.base.json`: the manifest the build copies.
- `dist/`: ready-to-load production build, committed. Rebuild with `npm run ext:build` after changing `src/`.
- `dist-dev/`: local test build (`npm run ext:build:dev`), not committed.
