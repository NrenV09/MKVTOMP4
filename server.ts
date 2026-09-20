import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add headers for SharedArrayBuffer support in ffmpeg.wasm across all routes
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    if (req.path === '/sw.js' || req.path === '/registerSW.js') {
      res.setHeader("Cache-Control", "no-cache");
    }
    next();
  });

  app.use(express.json({ limit: "150mb" }));

  // API routes can go here if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Server-side genuine RAR 5.0 / 4.0 compression endpoint
  app.post("/api/compress-rar", async (req, res) => {
    try {
      const { RarWriter } = await import("@bitplane/rars");
      const { files, options } = req.body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const format = options?.format === "rar40" ? "rar40" : "rar50";
      const level = Math.min(5, Math.max(0, options?.level ?? 3)) as 0 | 1 | 2 | 3 | 4 | 5;
      const solid = options?.solid !== false;
      const password = options?.password || undefined;
      const encryptHeaders = !!options?.encryptHeaders && !!password;
      const recoveryPercent =
        typeof options?.recoveryPercent === "number" && options.recoveryPercent > 0
          ? options.recoveryPercent
          : undefined;

      const isSplit = !!(options?.splitBytes && options.splitBytes > 0);
      const writer = new RarWriter({
        format,
        level,
        solid,
        password,
        encryptHeaders,
        recoveryPercent,
        comment: isSplit ? undefined : (options?.comment || "Created with Genuine WinRAR Engine"),
      });

      for (const f of files) {
        const raw = f.dataBase64 || f.data || "";
        const buf = Buffer.from(raw, "base64");
        writer.add(f.name, buf, {
          modifiedAt: f.mtime ? new Date(f.mtime) : new Date(),
        });
      }

      if (options?.splitBytes && options.splitBytes > 0) {
        const rawVolumes = await writer.volumes(options.splitBytes);
        const volumes = rawVolumes.map((volBytes, idx) => ({
          name: idx === 0 ? "archive.part1.rar" : `archive.part${idx + 1}.rar`,
          dataBase64: Buffer.from(volBytes).toString("base64"),
          size: volBytes.length,
        }));
        return res.json({
          dataBase64: Buffer.from(rawVolumes[0]).toString("base64"),
          volumes,
          format,
        });
      }

      const archiveBytes = await writer.bytes();
      return res.json({
        dataBase64: Buffer.from(archiveBytes).toString("base64"),
        size: archiveBytes.length,
        format,
      });
    } catch (err: any) {
      console.error("Error in /api/compress-rar:", err);
      return res.status(500).json({ error: err.message || "Failed to create RAR archive" });
    }
  });

  // Serve public static assets (including local ffmpeg.wasm binaries)
  const publicPath = path.join(process.cwd(), 'public');
  app.use(express.static(publicPath, {
    maxAge: '365d',
    setHeaders: (res, filePath) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      if (filePath.includes('ffmpeg') || filePath.endsWith('.wasm')) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '365d',
      setHeaders: (res, filePath) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        if (filePath.includes('ffmpeg') || filePath.endsWith('.wasm')) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
