# MKV to MP4 Converter (Browser WASM)

A fast, private, and 100% in-browser video converter that converts `.mkv` files to `.mp4` using WebAssembly (FFmpeg WASM). No video is uploaded to any server—everything processes directly on your local device.

---

## 🚀 How to Publish to GitHub Pages

This project is pre-configured with **GitHub Actions** and **`coi-serviceworker`** so it works smoothly on GitHub Pages out of the box.

### Step 1: Push the Code to GitHub

Initialize git (if not already done) and push to your repository:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Enable GitHub Pages with GitHub Actions

1. In your GitHub repository, click on the **Settings** tab.
2. In the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment**:
   - Set **Source** to **GitHub Actions**.
4. That's it! The pre-configured `.github/workflows/deploy.yml` workflow will automatically run, build the static site, and deploy it to `https://<your-username>.github.io/<your-repo-name>/`.

---

## 🛠️ Features & Architecture

- **100% Offline & Private**: Video files never leave your computer.
- **Dual Conversion Modes**:
  - **Remux (Stream Copy)**: Instant container swap (`-c copy`). Preserves exact video/audio stream quality without re-encoding.
  - **Transcode (H.264 / AAC)**: Re-encodes streams (`-c:v libx264 -c:a aac`) to guarantee maximum compatibility with all browsers and media players.
- **Cross-Origin Isolation via Service Worker**: Includes `coi-serviceworker.js` so that `SharedArrayBuffer` and WebAssembly multi-threading function on static hosting providers like GitHub Pages that do not support custom HTTP headers.
- **Relative Base URL**: Configured with `base: './'` in `vite.config.ts` so the application works whether served from the root domain or a repository subfolder.

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Build for production
npm run build
```
