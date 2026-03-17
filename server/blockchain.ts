import { createHash } from "crypto";
import { storage } from "./storage";
import type { Proof, Block } from "@shared/schema";

// ---- Hashing Utilities ----

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function computeContentHash(fileBuffer: Buffer): string {
  return sha256(fileBuffer);
}

export function computeMetadataHash(metadata: Record<string, any>): string {
  const sorted = JSON.stringify(metadata, Object.keys(metadata).sort());
  return sha256(sorted);
}

// ---- Geohash Engine ----

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision: number = 7): string {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isEven = true;
  let bit = 0;
  let ch = 0;
  let geohash = "";

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch |= (1 << (4 - bit));
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

export function decodeGeohash(geohash: string): { lat: number; lon: number } {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isEven = true;

  for (const c of geohash) {
    const cd = BASE32.indexOf(c);
    for (let mask = 16; mask >= 1; mask >>= 1) {
      if (isEven) {
        if (cd & mask) lonMin = (lonMin + lonMax) / 2;
        else lonMax = (lonMin + lonMax) / 2;
      } else {
        if (cd & mask) latMin = (latMin + latMax) / 2;
        else latMax = (latMin + latMax) / 2;
      }
      isEven = !isEven;
    }
  }
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

export function geohashDistance(gh1: string, gh2: string): number {
  const p1 = decodeGeohash(gh1);
  const p2 = decodeGeohash(gh2);
  return haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeLocationHash(geohash: string, timestamp: string): string {
  return sha256(`${geohash}:${timestamp}`);
}

// ---- Device Fingerprint ----

export function computeDeviceFingerprint(userAgent: string): string {
  return sha256(userAgent).slice(0, 16);
}

// ---- IPFS Simulation ----

export function simulateIpfsUpload(contentHash: string, fileName: string): string {
  // Simulate CID generation (in production, this calls Pinata/Infura)
  const cidHash = sha256(`ipfs:${contentHash}:${fileName}`);
  return `Qm${cidHash.slice(0, 44)}`;
}

// ---- KYC Simulation ----

export function simulateKycVerification(docType: string, docData: string): {
  verified: boolean;
  kycHash: string;
  tokenId: string;
} {
  const kycHash = sha256(`kyc:${docType}:${docData}:${Date.now()}`);
  const tokenId = `SBT-${kycHash.slice(0, 8)}`;
  return { verified: true, kycHash, tokenId };
}

// ---- Proof-of-Work Mining ----

function computeBlockHash(index: number, previousHash: string, timestamp: string, merkleRoot: string, nonce: number): string {
  return sha256(`${index}:${previousHash}:${timestamp}:${merkleRoot}:${nonce}`);
}

export async function mineBlock(proofIds: string[]): Promise<Block> {
  const latestBlock = await storage.getLatestBlock();
  if (!latestBlock) throw new Error("No genesis block found");

  const index = latestBlock.index + 1;
  const previousHash = latestBlock.hash;
  const timestamp = new Date().toISOString();
  const difficulty = 2; // number of leading zeros

  // Compute merkle root from proof content hashes
  const proofHashes: string[] = [];
  for (const pid of proofIds) {
    const proof = await storage.getProof(pid);
    if (proof) proofHashes.push(proof.contentHash);
  }
  const merkleRoot = computeMerkleRoot(proofHashes);

  // Mine with proof-of-work
  let nonce = 0;
  let hash = "";
  const prefix = "0".repeat(difficulty);
  while (true) {
    hash = computeBlockHash(index, previousHash, timestamp, merkleRoot, nonce);
    if (hash.startsWith(prefix)) break;
    nonce++;
    if (nonce > 1000000) {
      // Safety valve - shouldn't hit this with difficulty 2
      break;
    }
  }

  const block = await storage.createBlock({
    index,
    hash,
    previousHash,
    timestamp,
    nonce,
    difficulty,
    proofIds: JSON.stringify(proofIds),
    merkleRoot,
  });

  // Update proofs with block info
  for (const pid of proofIds) {
    await storage.updateProofBlock(pid, index, hash);
  }

  return block;
}

function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return sha256("empty");
  if (hashes.length === 1) return hashes[0];

  const nextLevel: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = i + 1 < hashes.length ? hashes[i + 1] : left;
    nextLevel.push(sha256(left + right));
  }
  return computeMerkleRoot(nextLevel);
}

// ---- Chain Validation ----

export async function validateChain(): Promise<{ valid: boolean; errors: string[] }> {
  const blocks = await storage.getAllBlocks();
  const sorted = blocks.sort((a, b) => a.index - b.index);
  const errors: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = sorted[i - 1];

    if (current.previousHash !== previous.hash) {
      errors.push(`Block ${current.index}: previousHash mismatch`);
    }

    const recomputed = computeBlockHash(
      current.index, current.previousHash, current.timestamp, current.merkleRoot, current.nonce
    );
    if (recomputed !== current.hash) {
      errors.push(`Block ${current.index}: hash integrity check failed`);
    }

    if (!current.hash.startsWith("0".repeat(current.difficulty))) {
      errors.push(`Block ${current.index}: doesn't meet difficulty requirement`);
    }
  }

  return { valid: errors.length === 0, errors };
}
