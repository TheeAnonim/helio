# 🚀 Helios Testnet Automation v1.0

## 🧠 Deskripsi

Script ini digunakan untuk **otomatisasi onboarding Helios Testnet** secara massal menggunakan banyak wallet. Mendukung rotasi proxy, verifikasi wallet, pendaftaran, klaim faucet, eksekusi task onboarding, dan klaim reward.

---

## 📦 Fitur Utama

### 🔐 Manajemen Wallet
- Membaca banyak private key dari file `privatekeys.txt`
- Mendapatkan address wallet dari private key
- Mengecek saldo awal dan akhir wallet

### 🌐 Proxy Rotator
- Mendukung file `proxies.txt`
- Format proxy yang didukung: `ip:port`, `http://user:pass@ip:port`, dll
- Rotasi otomatis pada setiap request
- Support fallback ke koneksi langsung jika proxy gagal

### 📲 Autentikasi & Registrasi
- Sign message untuk membuktikan kepemilikan wallet
- Login otomatis menggunakan signature
- Jika wallet belum terdaftar, sistem akan register (dengan atau tanpa invite code)

### 🧩 Onboarding Task Otomatis
- Mendapatkan status progres onboarding
- Menjalankan task onboarding:
  - `add_helios_network`
  - `claim_from_faucet`
  - `mint_early_bird_nft`
- Verifikasi setiap step dengan evidence
- Klaim reward onboarding setelah seluruh task selesai

### 💰 Faucet Integration
- Claim token `HLS` dari faucet testnet secara otomatis
- Mendukung retry + exponential backoff untuk error 429/5xx

### 📈 Monitoring & Logging
- Print balance awal dan akhir
- Hitung selisih token didapat
- Log semua status dan error per wallet
- Menampilkan informasi user dan referral code jika tersedia

### ⚙️ Setup dan Instalasi

1.  **Kloning Repositori:**
    ```bash
    git clone https://github.com/TheAnonim/helio
    cd helio
    ```

2.  **Instal Dependensi:**
    ```bash
    npm install axios web3 https-proxy-agent
    ```

### ▶️ Cara Menjalankan

Setelah konfigurasi selesai, jalankan skrip menggunakan Node.js:

```bash
node main.js
```
---   


