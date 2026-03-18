# ProofMedia

Blockchain-verified media authenticity. A mobile PWA that ensures photos and videos are authentic live captures — not AI-generated or manipulated.

## Features

- **Live Camera Only** — No uploads allowed. Photos and videos must be captured on the spot using the device's native camera
- **GPS Verification** — Location is confirmed before capture and embedded in the proof
- **5-Layer AI Detection** — EXIF metadata, frequency analysis, PRNU sensor fingerprinting, screen recapture detection, and environmental consistency checks
- **Proof-of-Work Blockchain** — Every verified capture is mined into a local blockchain
- **Polygon Integration** — Optional on-chain registration on Polygon Amoy testnet
- **Hash Verification** — Anyone can verify a capture's authenticity by pasting its SHA-256 hash
- **KYC Verification** — Users must be identity-verified before capturing proofs
- **Installable PWA** — Add to home screen on iPhone/Android for a native app experience

## Deploy to Render (Free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ManuUoW/proofmedia)

Or manually:
1. Fork this repo
2. Go to [render.com](https://render.com), sign up free
3. Click **New > Web Service**, connect your GitHub, select this repo
4. Settings: Build `npm install && npm run build`, Start `NODE_ENV=production node dist/index.cjs`
5. Click **Deploy**

## Deploy to Railway (Free)

1. Go to [railway.app](https://railway.app), sign up with GitHub
2. Click **New Project > Deploy from GitHub Repo**
3. Select this repository
4. Railway auto-detects the config — click Deploy
5. Go to **Settings > Networking > Generate Domain** to get your public URL

## Local Development

```bash
npm install
npm run dev
```

## Tech Stack

- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Node.js
- **Blockchain**: Custom proof-of-work chain + Polygon Amoy (ethers.js v6)
- **AI Detection**: 5-layer pipeline (EXIF, frequency, PRNU, screen recapture, environment)
- **PWA**: Service worker + Web App Manifest for installability

## Environment Variables (Optional)

For Polygon on-chain registration:
- `POLYGON_PRIVATE_KEY` — Wallet private key for Polygon Amoy
- `POLYGON_CONTRACT_ADDRESS` — Deployed MediaProof.sol contract address

