// Copies the static web app into www/ for Capacitor.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "www");
const files = ["index.html", "config.js", "backend.js", "qrcode.js", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));
console.log(`Copied ${files.length} files to www/`);
