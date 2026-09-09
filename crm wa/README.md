# Arsalynk WhatsApp Gateway

> **Live 2-Way Chat Sync • Baileys Socket Engine • Serverless & Container Ready**

Arsalynk WhatsApp Gateway adalah microservice backend yang menghubungkan nomor WhatsApp bisnis dengan website/dashboard aplikasi secara real-time (2 arah). Gateway ini dibangun menggunakan engine Baileys (`@whiskeysockets/baileys`) dan Express.js, serta telah dioptimasi agar dapat berjalan mulus di lingkungan **Serverless (Vercel, AWS Lambda)**, **Container Cloud (Railway, Render, Fly.io, Cloud Run)**, maupun **VPS Linux**.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Tantangan Serverless & Solusi Arsitektur](#-tantangan-serverless--solusi-arsitektur)
3. [Daftar Endpoint API](#-daftar-endpoint-api)
4. [Panduan Konfigurasi Environment Variables (`.env`)](#-panduan-konfigurasi-environment-variables-env)
5. [Panduan Deployment ke Vercel (Serverless)](#-panduan-deployment-ke-vercel-serverless)
6. [Panduan Deployment ke Platform Container (Railway / Render / Fly.io / Cloud Run)](#-panduan-deployment-ke-platform-container-railway--render--flyio--cloud-run)
7. [Panduan Deployment ke Server VPS (PM2 / Docker)](#-panduan-deployment-ke-server-vps-pm2--docker)
8. [Menjalankan di Komputer Lokal](#-menjalankan-di-komputer-lokal)

---

## 🚀 Fitur Utama

* **2-Way Live Sync:** Meneruskan pesan masuk dari WhatsApp ke webhook Next.js/website Anda secara instan dengan mekanisme auto-retry.
* **Outbound Message API:** Mengirim pesan teks ke nomor WhatsApp mana saja via endpoint REST API (`/api/sendText`).
* **Web Control Center UI:** Antarmuka visual di `/` untuk scan QR Code, melihat status koneksi, memutuskan sesi, serta mengekspor token auth.
* **Serverless Resilience:** 
  * Auto-detect filesystem writable path (`/tmp` di Lambda/Vercel).
  * Dukungan restore session otomatis dari Environment Variable `WA_SESSION_BASE64`.
  * Tombol **Export Session** di dashboard untuk kemudahan backup sesi ke cloud environment.
* **Security Middleware:** Dukungan autentikasi Bearer Token / Header `x-gateway-secret` untuk mengamankan gateway dari akses tidak sah.
* **Health Check Telemetri:** Endpoint `/health` menyediakan data uptime, memori RSS, status socket, dan versi Node.js.

---

## ⚡ Tantangan Serverless & Solusi Arsitektur

### Karakteristik Baileys vs Serverless:
WhatsApp Baileys membutuhkan koneksi WebSocket persistent untuk menerima pesan masuk secara real-time. Di lingkungan serverless murni (seperti Vercel Serverless Function), serverless instance dapat *freeze* atau *sleep* saat tidak ada request HTTP masuk.

### Solusi yang Diterapkan:
1. **Dynamic Auth Storage (`AUTH_PATH`):** Sistem otomatis mendeteksi environment serverless (`process.env.VERCEL` / `AWS_LAMBDA`) dan mengarahkan penyimpanan sesi ke `os.tmpdir()` (`/tmp/auth_info_baileys`).
2. **Session Persistence via `WA_SESSION_BASE64`:** Anda dapat melakukan scan QR sekali, lalu menekan tombol **"Export Session (WA_SESSION_BASE64)"** di dashboard web. Salin string Base64 tersebut ke Environment Variable platform serverless Anda agar sesi tetap tersimpan meskipun serverless container mengalami cold-start atau di-redeploy.
3. **Container Deployment (Rekomendasi untuk 2-Way Listening):** Jika Anda memerlukan penerimaan pesan masuk 24/7 tanpa jeda, jalankan gateway di Docker/Railway/Render/VPS. File `Dockerfile`, `docker-compose.yml`, dan `vercel.json` sudah disediakan.

---

## 📡 Daftar Endpoint API

| Method | Endpoint | Deskripsi | Autentikasi |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Web Control Center (QR Code Scanner & Live Status) | Publik |
| `GET` | `/health` | Pemeriksaan kesehatan service, memori, & socket | Publik |
| `GET` | `/api/status` | JSON status gateway (connected, qr_ready, disconnected) | Publik |
| `POST` | `/api/sendText` | Mengirim pesan WhatsApp ke nomor tujuan | Bearer / `x-gateway-secret` |
| `GET` | `/api/session/export`| Mengekspor file `creds.json` ke Base64 string | Bearer / `x-gateway-secret` |
| `POST` | `/api/logout` | Memutuskan sesi WhatsApp dan membuat QR baru | Bearer / `x-gateway-secret` |

### Contoh Request Mengirim Pesan (`/api/sendText`):
```bash
curl -X POST http://localhost:3005/api/sendText \
  -H "Content-Type: application/json" \
  -H "x-gateway-secret: arsalynt-wa-secret-2026" \
  -d '{
    "phone": "6281234567890",
    "text": "Halo! Pesan konfirmasi dari sistem Arsalynk."
  }'
```

---

## 🔑 Panduan Konfigurasi Environment Variables (`.env`)

Buat file `.env` di folder root:

```env
# ── Server Configuration ───────────────────────────────────────────────
PORT=3005
NODE_ENV=production

# ── Security & Secret Token (Opsional) ─────────────────────────────────
GATEWAY_SECRET=arsalynt-wa-secret-2026
ALLOWED_ORIGINS=*

# ── Next.js Webhook Integration ────────────────────────────────────────
NEXTJS_WEBHOOK_URL=https://your-website.com/api/whatsapp/webhook

# ── Serverless Session Persistence ─────────────────────────────────────
# Diisi dengan hasil export Base64 dari dashboard gateway:
WA_SESSION_BASE64=
```

---

## 🌐 Panduan Deployment ke Vercel (Serverless)

1. **Deploy ke Vercel:**
   ```bash
   vercel
   ```
2. **Setup Environment Variables di Vercel Dashboard:**
   * `NODE_ENV`: `production`
   * `GATEWAY_SECRET`: `(Kunci rahasia Anda)`
   * `NEXTJS_WEBHOOK_URL`: `https://domain-website-anda.com/api/whatsapp/webhook`
3. **Scan QR & Simpan Session:**
   * Buka URL Vercel yang dihasilkan (misal `https://your-gateway.vercel.app`).
   * Scan QR Code menggunakan aplikasi WhatsApp di smartphone.
   * Setelah status berubah menjadi **"WhatsApp Terhubung & Aktif"**, klik tombol **"📦 Export Session (WA_SESSION_BASE64)"**.
   * Salin string Base64 yang muncul dan tambahkan ke Vercel Settings -> Environment Variables dengan nama `WA_SESSION_BASE64`.
   * Redeploy Vercel agar sesi login aktif secara permanen!

---

## 🐳 Panduan Deployment ke Platform Container (Railway / Render / Fly.io / Cloud Run)

Untuk koneksi 24/7 yang menerima pesan WhatsApp real-time sepanjang waktu:

### 1. Railway / Render:
* Hubungkan repository GitHub ini.
* Railway/Render akan otomatis mendeteksi [`Dockerfile`](file:///d:/projectku/Arsalynt/whatsapp-gateway/Dockerfile).
* Tambahkan Environment Variables `NEXTJS_WEBHOOK_URL` dan `GATEWAY_SECRET`.

### 2. Docker Compose (Lokal / VPS):
```bash
docker compose up -d --build
```

---

## 💻 Menjalankan di Komputer Lokal

```bash
# 1. Install dependencies
npm install

# 2. Jalankan development server
npm run dev

# 3. Buka browser:
# http://localhost:3005
```

---

## 📄 Lisensi
Hak Cipta © 2026 Arsalynt. Dikembangkan untuk integrasi WhatsApp Business yang tangguh dan fleksibel.
