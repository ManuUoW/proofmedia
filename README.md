# ProofMedia

> **Tamper-proof media authentication anchored to Bitcoin — for free.**

ProofMedia is a mobile-first PWA (Progressive Web App) that cryptographically proves a photo or video is a genuine, live camera capture — not AI-generated, not a screenshot, not a re-photograph of a screen. Every proof is mined into a local proof-of-work blockchain and timestamped on the Bitcoin blockchain via [OpenTimestamps](https://opentimestamps.org/) at zero cost.

---

## Live Demo

- **Render:** [proofmedia.onrender.com](https://proofmedia.onrender.com) *(free tier — 60s cold start)*
- **Install as app:** Open in Safari on iPhone → Share → Add to Home Screen

---

## How It Works

```
User (KYC verified)
  │
  ├─ 1. GPS confirmed on-device
  │
  ├─ 2. Native camera opens (photo or video)
  │       └─ NO file uploads, NO gallery access
  │
  ├─ 3. 5-Layer AI Detection runs server-side
  │       ├─ EXIF Metadata Analysis
  │       ├─ Frequency Pattern Analysis (DCT artifacts)
  │       ├─ PRNU Sensor Fingerprinting
  │       ├─ Screen Recapture Detection
  │       └─ Environmental Consistency Check
  │
  ├─ 4. SHA-256 content hash computed
  │
  ├─ 5. Block mined into local proof-of-work chain (difficulty 2)
  │       └─ Merkle root of content hashes per block
  │
  └─ 6. Hash submitted to OpenTimestamps calendar servers
          └─ Anchored to Bitcoin blockchain within 1–4 hours
             (permanent, free, tamper-proof)
```

Anyone can verify a capture's authenticity by pasting its SHA-256 hash into the Verify tab — no account needed.

---

## Features

| Feature | Description |
|---|---|
| **Live Camera Only** | Uses `<input capture="environment">` — opens the native iPhone/Android camera. No file uploads, no gallery, no AI image injection |
| **GPS Verification** | GPS coordinates are confirmed before the camera opens and embedded in the proof |
| **5-Layer AI Detection** | EXIF, frequency analysis, PRNU sensor fingerprint, screen recapture, environment consistency |
| **KYC Identity** | Users must be identity-verified before capturing proofs (simulated; swap in Sumsub/Onfido for production) |
| **Proof-of-Work Chain** | Custom SHA-256 blockchain with difficulty-2 mining and Merkle roots |
| **Bitcoin Timestamping** | Every capture hash is submitted to OpenTimestamps — free, permanent, Bitcoin-anchored |
| **Hash Verification** | Paste any SHA-256 content hash to verify authenticity — no file upload needed |
| **Chain Explorer** | Browse every block and proof in the blockchain |
| **Installable PWA** | Full service worker + manifest — add to iPhone/Android home screen for native-like experience |
| **Video Support** | Record video clips via native camera with the same proof pipeline |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript + Tailwind CSS v3 + shadcn/ui |
| **Backend** | Express.js v5 + Node.js |
| **Build** | Vite 7 (frontend) + esbuild (backend → CJS bundle) |
| **Blockchain** | Custom proof-of-work chain (SHA-256, difficulty 2, Merkle tree) |
| **Bitcoin Anchoring** | [OpenTimestamps](https://opentimestamps.org/) — free, no API key |
| **AI Detection** | 5-layer pipeline: EXIF · frequency · PRNU · screen · environment |
| **PWA** | Service worker + Web App Manifest (iOS installable) |
| **Storage** | In-memory (resets on restart) — swap in PostgreSQL for persistence |
| **Routing** | Wouter with hash-based routing (`#/`) |

---

## Project Structure

```
proofmedia/
├── client/                   # React frontend (Vite)
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json     # PWA manifest
│   │   ├── sw.js             # Service worker
│   │   └── icon-*.png        # App icons (192 & 512)
│   └── src/
│       ├── App.tsx           # Router + layout
│       ├── pages/
│       │   ├── Dashboard.tsx # Home — stats, recent proofs, Bitcoin status
│       │   ├── Capture.tsx   # Camera capture flow (GPS → camera → proof)
│       │   ├── Verify.tsx    # Hash verification page
│       │   ├── Explorer.tsx  # Blockchain block explorer
│       │   └── Profile.tsx   # User profile & KYC status
│       ├── components/
│       │   ├── MobileLayout.tsx   # Bottom tab bar
│       │   ├── CopyableHash.tsx   # Tap-to-copy hash display
│       │   └── MediaViewer.tsx    # Image/video fullscreen viewer
│       └── lib/
│           └── queryClient.ts    # TanStack Query + API base
│
├── server/                   # Express backend (esbuild → dist/index.cjs)
│   ├── index.ts              # Entry point, port binding
│   ├── routes.ts             # All API routes
│   ├── blockchain.ts         # SHA-256 chain, mining, geohash, KYC sim
│   ├── ai-detection.ts       # 5-layer detection pipeline
│   ├── opentimestamps.ts     # Bitcoin timestamping via OpenTimestamps
│   ├── storage.ts            # In-memory storage layer (IStorage interface)
│   └── static.ts             # Serves built frontend
│
├── shared/
│   └── schema.ts             # Drizzle ORM schema (User, Proof, Block, Verification)
│
├── script/
│   └── build.ts              # esbuild script (bundles server to CJS)
│
├── railway.json              # Railway deploy config
├── render.yaml               # Render deploy config
├── Procfile                  # Process start command
└── package.json
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (Express + Vite on same port)
npm run dev
```

The dev server starts on **http://localhost:5000** with hot module replacement for the frontend and automatic server restarts.

> **Testing camera on desktop:** The capture page requires GPS and the native camera. On desktop, the browser will ask for location permission and open your webcam. For full mobile testing, access the dev server from your iPhone using your machine's local IP (e.g., `http://192.168.1.x:5000`).

---

## Production Build

```bash
# Build frontend (Vite) + backend (esbuild → CJS)
npm run build

# Start production server
NODE_ENV=production node dist/index.cjs
```

---

## Deployment

### Render (Free Tier)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ManuUoW/proofmedia)

Or manually:
1. Fork this repo
2. Go to [render.com](https://render.com) → New > Web Service
3. Connect your GitHub, select this repo
4. Build command: `npm install && npm run build`
5. Start command: `NODE_ENV=production node dist/index.cjs`
6. Click Deploy

> Free tier sleeps after 15 minutes of inactivity — expect a 30–60s cold start.

### Railway

1. Go to [railway.app](https://railway.app) → New Project > Deploy from GitHub Repo
2. Select this repository — Railway auto-reads `railway.json`
3. Go to **Settings > Networking > Generate Domain** to get your public URL
4. Railway auto-deploys on every push to `main`

### Any Node.js Host (VPS, Fly.io, etc.)

```bash
npm install
npm run build
NODE_ENV=production node dist/index.cjs
```

Set the `PORT` environment variable if needed (defaults to 5000).

---

## API Reference

### Stats & Chain

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Dashboard stats + chain validity + Bitcoin OTS info |
| `GET` | `/api/chain/validate` | Validate full chain integrity |
| `GET` | `/api/blocks` | All blocks |
| `GET` | `/api/blocks/:index` | Single block with embedded proofs |

### Capture & Verify

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/capture` | Submit a live camera capture for proof creation |
| `POST` | `/api/verify` | Verify a content hash |

**POST `/api/capture`** body:
```json
{
  "imageData": "data:image/jpeg;base64,...",
  "uploaderId": "usr_001",
  "latitude": 36.1408,
  "longitude": -5.3536,
  "captureTimestamp": "2026-03-18T12:00:00Z",
  "deviceMetadata": {},
  "mediaType": "photo"
}
```

**POST `/api/verify`** body:
```json
{
  "contentHash": "sha256hexstring"
}
```

### Proofs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/proofs` | All proofs |
| `GET` | `/api/proofs/:id` | Single proof |
| `GET` | `/api/proofs/user/:userId` | Proofs by user |
| `GET` | `/api/proofs/:id/video` | Video data for a proof |

### Users / KYC

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | All users |
| `POST` | `/api/users/register` | Register a new user |
| `POST` | `/api/users/:id/kyc` | Submit KYC documents |

### Bitcoin / OpenTimestamps

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bitcoin/info` | OTS service status + counts |
| `GET` | `/api/bitcoin/status/:proofId` | Check Bitcoin confirmation status |
| `GET` | `/api/bitcoin/proof/:proofId` | Download raw `.ots` proof file |
| `POST` | `/api/bitcoin/verify` | Verify a hash against Bitcoin |

---

## OpenTimestamps — How Bitcoin Anchoring Works

1. On each successful capture, the content hash is submitted to free OpenTimestamps calendar servers
2. Calendar servers batch thousands of hashes per hour into a single Merkle tree
3. The Merkle root is embedded in a Bitcoin transaction (one per calendar per ~hour)
4. After 1–4 hours, the timestamp is confirmed and retrievable as a `.ots` proof file
5. The `.ots` file can be verified by anyone using the [OpenTimestamps client](https://opentimestamps.org/) — no trust required

No API key. No gas fees. No wallet. Completely free.

---

## Roadmap

- [ ] **PostgreSQL persistence** — replace in-memory storage so proofs survive server restarts
- [ ] **Real KYC** — integrate [Sumsub](https://sumsub.com/) or [Onfido](https://onfido.com/) for production identity verification
- [ ] **Real IPFS** — pin captures to [Pinata](https://pinata.cloud/) or [Infura IPFS](https://docs.infura.io/networks/ipfs)
- [ ] **User auth** — login/signup flow with email or wallet
- [ ] **OTS upgrade polling** — background cron to check Bitcoin confirmation status every hour
- [ ] **`.ots` download UI** — let users download their Bitcoin proof file from the Verify page
- [ ] **Share proof card** — generate a shareable image card with proof details and QR code
- [ ] **Native app** — React Native wrapper or Capacitor for App Store / Play Store distribution

---

## Why Not Polygon / Ethereum?

Ethereum and Polygon require gas fees for every on-chain transaction. With OpenTimestamps on Bitcoin:

- **Free** — calendar servers pay the Bitcoin tx fee collectively
- **Permanent** — Bitcoin has the highest security and longest track record of any blockchain
- **No wallet needed** — zero user friction
- **Cryptographically sound** — SHA-256 Merkle proofs, no trusted intermediary

---

## Contributing

Pull requests welcome. Please:
1. Fork the repo and create a feature branch
2. Run `npm run check` (TypeScript type checking) before submitting
3. Keep PRs focused — one feature/fix per PR

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with [Perplexity Computer](https://www.perplexity.ai/computer)*
