import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStaticPath from "ffmpeg-static";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStaticPath;
const python = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
const maxBody = 16 * 1024;
const maxDownloadBytes = 500 * 1024 * 1024;
const timeoutMs = 20 * 60 * 1000;
const maxConcurrentDownloads = Math.max(1, Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2));
let activeDownloads = 0;
const allowedHosts = ["youtube.com", "youtu.be", "youtube-nocookie.com", "tiktok.com", "fb.watch", "facebook.com", "fb.com"];
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml; charset=utf-8" };

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto === "https" || req.socket.encrypted ? "https" : "http";
  try { return new URL(configured || `${protocol}://${req.headers.host}`).origin; }
  catch { return `${protocol}://localhost:${port}`; }
}

function xmlEscape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function htmlEscape(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!allowedHosts.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
  return url;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) throw Object.assign(new Error("คำขอมีขนาดใหญ่เกินไป"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("กรุณาส่งข้อมูล JSON ที่ถูกต้อง"), { status: 400 }); }
}

function runYtDlp(args, res) {
  return new Promise((resolvePromise, reject) => {
    const isWindows = process.platform === "win32";
    const command = isWindows ? "py" : python;
    const commandArgs = isWindows ? ["-3", "-m", "yt_dlp", ...args] : ["-m", "yt_dlp", ...args];
    const child = spawn(command, commandArgs, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-5000); });
    child.on("error", () => { clearTimeout(timer); reject(new Error("ไม่พบ yt-dlp กรุณารันคำสั่งติดตั้งตาม README.md")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else if (code === null) reject(new Error("ใช้เวลาประมวลผลนานเกินไป กรุณาลองใหม่อีกครั้ง"));
      else reject(new Error(stderr.trim().split("\n").slice(-1)[0] || "ดาวน์โหลดไม่สำเร็จ ลิงก์อาจเป็นส่วนตัวหรือไม่รองรับ"));
    });
    res.once("close", () => { if (!res.writableEnded) child.kill(); });
  });
}

async function download(req, res) {
  let folder;
  try {
    const body = await readBody(req);
    const url = typeof body.url === "string" ? parseUrl(body.url) : null;
    const format = body.format;
    if (!url) return json(res, 400, { message: "ลิงก์ไม่ถูกต้อง หรือแพลตฟอร์มนี้ยังไม่รองรับ" });
    if (!["mp3", "mp4"].includes(format)) return json(res, 400, { message: "เลือกรูปแบบ MP3 หรือ MP4" });
    folder = await mkdtemp(join(tmpdir(), "load-dee-"));
    const output = join(folder, "%(id)s.%(ext)s");
    const args = ["--no-playlist", "--no-warnings", "--quiet", "--max-filesize", `${Math.floor(maxDownloadBytes / (1024 * 1024))}M`, "--ffmpeg-location", ffmpegPath, "-o", output];
    if (format === "mp3") args.push("-x", "--audio-format", "mp3", "--audio-quality", "192K");
    else args.push("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", "--merge-output-format", "mp4");
    args.push(url.href);
    await runYtDlp(args, res);

    const files = await readdir(folder);
    const filename = files.find((file) => extname(file).toLowerCase() === `.${format}`);
    if (!filename) throw new Error("แปลงไฟล์ไม่สำเร็จ กรุณาลองลิงก์อื่น");
    const path = resolve(folder, filename);
    if (basename(path) !== filename) throw new Error("ชื่อไฟล์ไม่ถูกต้อง");
    const info = await stat(path);
    res.writeHead(200, {
      "Content-Type": format === "mp3" ? "audio/mpeg" : "video/mp4",
      "Content-Length": info.size,
      "Content-Disposition": `attachment; filename="download.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    await new Promise((resolvePromise, reject) => {
      const stream = createReadStream(path);
      stream.on("error", reject);
      res.on("finish", resolvePromise);
      stream.pipe(res);
    });
  } catch (error) {
    if (!res.headersSent) json(res, error.status || 422, { message: error.message || "ดาวน์โหลดไม่สำเร็จ" });
    else if (!res.writableEnded) res.destroy(error);
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (req.method === "POST" && pathname === "/api/download") {
    if (activeDownloads >= maxConcurrentDownloads) return json(res, 429, { message: "มีรายการดาวน์โหลดเต็มชั่วคราว กรุณารอสักครู่แล้วลองอีกครั้ง" });
    activeDownloads++;
    try { return await download(req, res); }
    finally { activeDownloads--; }
  }
  if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true });
  if (req.method === "GET" && pathname === "/robots.txt") {
    const base = xmlEscape(publicBaseUrl(req));
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`);
  }
  if (req.method === "GET" && pathname === "/sitemap.xml") {
    const base = xmlEscape(publicBaseUrl(req));
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    return res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url></urlset>`);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { message: "Method not allowed" });
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const path = resolve(root, relative);
  if (!path.startsWith(resolve(root) + (process.platform === "win32" ? "\\" : "/"))) return json(res, 404, { message: "Not found" });
  try {
    const info = await stat(path);
    if (!info.isFile()) return json(res, 404, { message: "Not found" });
    if (pathname === "/" && req.method === "GET") {
      const html = (await readFile(path, "utf8")).replaceAll("%%PUBLIC_URL%%", htmlEscape(publicBaseUrl(req)));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(html), "X-Content-Type-Options": "nosniff" });
      return res.end(html);
    }
    res.writeHead(200, { "Content-Type": contentTypes[extname(path)] || "application/octet-stream", "Content-Length": info.size, "X-Content-Type-Options": "nosniff" });
    if (req.method === "HEAD") return res.end();
    createReadStream(path).pipe(res);
  } catch { json(res, 404, { message: "Not found" }); }
});

server.listen(port, host, () => console.log(`โหลดดีพร้อมใช้งานที่ http://${host}:${port}`));
