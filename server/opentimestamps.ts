/**
 * OpenTimestamps Integration for ProofMedia.
 *
 * Anchors proof hashes to the Bitcoin blockchain for FREE using
 * the OpenTimestamps protocol. No wallet, no gas fees, no tokens needed.
 *
 * How it works:
 *   1. When a proof is created, we submit the SHA-256 content hash
 *      to OpenTimestamps calendar servers (free, no API key needed).
 *   2. The calendar servers aggregate many hashes into a Merkle tree
 *      and anchor the root in a single Bitcoin transaction.
 *   3. This takes ~1-4 hours to confirm on Bitcoin.
 *   4. The .ots proof file can be independently verified by anyone.
 *
 * The proof is cryptographic: given the .ots file and the original hash,
 * anyone can verify it was timestamped at a specific Bitcoin block height.
 */

// javascript-opentimestamps is a CJS module marked as external in the esbuild config,
// so it's loaded via Node's native require() at runtime — no bundling needed.
let OpenTimestamps: any;
let OTSOps: any;
let OTSDetachedTimestampFile: any;

try {
  // esbuild externalizes this, so native require() handles it in the CJS output
  const ots = require("javascript-opentimestamps");
  OpenTimestamps = ots;
  OTSOps = ots.Ops;
  OTSDetachedTimestampFile = ots.DetachedTimestampFile;
} catch (e) {
  console.warn("[ots] javascript-opentimestamps not available:", (e as Error).message);
}

// In-memory store: proofId -> { otsBytes, status, bitcoinBlock?, bitcoinTimestamp? }
interface OTSRecord {
  otsBytes: Buffer;           // Serialized .ots proof
  contentHash: string;        // The hash that was timestamped
  status: "pending" | "confirmed";
  bitcoinBlock?: number;
  bitcoinTimestamp?: number;  // Unix timestamp of the Bitcoin block
  submittedAt: string;        // ISO timestamp of submission
}

const otsStore = new Map<string, OTSRecord>();

/**
 * Check if OpenTimestamps is available.
 */
export function isOTSAvailable(): boolean {
  return !!OpenTimestamps;
}

/**
 * Submit a SHA-256 hash to OpenTimestamps calendar servers.
 * Returns the serialized .ots proof bytes (initially pending).
 */
export async function stampHash(proofId: string, sha256Hash: string): Promise<{
  success: boolean;
  status: string;
  message: string;
}> {
  if (!OpenTimestamps) {
    return { success: false, status: "unavailable", message: "OpenTimestamps library not loaded" };
  }

  try {
    // Convert hex hash to Buffer
    const hashBuffer = Buffer.from(sha256Hash, "hex");

    // Create a detached timestamp from the hash directly
    const detached = OTSDetachedTimestampFile.fromHash(new OTSOps.OpSHA256(), hashBuffer);

    // Submit to calendar servers (this is FREE, no auth needed)
    await OpenTimestamps.stamp(detached);

    // Serialize the proof
    const otsBytes = Buffer.from(detached.serializeToBytes());

    // Store it
    otsStore.set(proofId, {
      otsBytes,
      contentHash: sha256Hash,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });

    console.log(`[ots] Hash ${sha256Hash.substring(0, 16)}... submitted to Bitcoin calendar servers`);

    return {
      success: true,
      status: "pending",
      message: "Hash submitted to Bitcoin blockchain. Confirmation takes 1-4 hours.",
    };
  } catch (err: any) {
    console.error("[ots] Stamp failed:", err.message);
    return {
      success: false,
      status: "error",
      message: `Timestamping failed: ${err.message}`,
    };
  }
}

/**
 * Try to upgrade a pending timestamp (check if Bitcoin has confirmed it).
 */
export async function upgradeTimestamp(proofId: string): Promise<{
  status: "pending" | "confirmed" | "not_found";
  bitcoinBlock?: number;
  bitcoinTimestamp?: number;
}> {
  if (!OpenTimestamps) {
    return { status: "not_found" };
  }

  const record = otsStore.get(proofId);
  if (!record) {
    return { status: "not_found" };
  }

  // Already confirmed
  if (record.status === "confirmed") {
    return {
      status: "confirmed",
      bitcoinBlock: record.bitcoinBlock,
      bitcoinTimestamp: record.bitcoinTimestamp,
    };
  }

  try {
    // Deserialize the stored proof
    const detachedOts = OTSDetachedTimestampFile.deserialize(record.otsBytes);

    // Try to upgrade (fetches the full path from calendar servers)
    const changed = await OpenTimestamps.upgrade(detachedOts);

    if (changed) {
      // Re-serialize with the upgrade
      const upgradedBytes = Buffer.from(detachedOts.serializeToBytes());
      record.otsBytes = upgradedBytes;

      // Try to verify to get the block number
      try {
        const hashBuffer = Buffer.from(record.contentHash, "hex");
        const detachedFile = OTSDetachedTimestampFile.fromHash(new OTSOps.OpSHA256(), hashBuffer);
        const verifyResult = await OpenTimestamps.verify(detachedOts, detachedFile, {
          ignoreBitcoinNode: true,
        });

        if (verifyResult && verifyResult.bitcoin) {
          record.status = "confirmed";
          record.bitcoinBlock = verifyResult.bitcoin.height;
          record.bitcoinTimestamp = verifyResult.bitcoin.timestamp;
          otsStore.set(proofId, record);

          console.log(`[ots] Proof ${proofId} confirmed at Bitcoin block ${verifyResult.bitcoin.height}`);
          return {
            status: "confirmed",
            bitcoinBlock: verifyResult.bitcoin.height,
            bitcoinTimestamp: verifyResult.bitcoin.timestamp,
          };
        }
      } catch {
        // Upgrade happened but verification not yet possible
      }
    }

    return { status: "pending" };
  } catch (err: any) {
    console.error("[ots] Upgrade check failed:", err.message);
    return { status: "pending" };
  }
}

/**
 * Verify a content hash against a stored OTS proof.
 */
export async function verifyHash(contentHash: string): Promise<{
  verified: boolean;
  status: "confirmed" | "pending" | "not_found";
  bitcoinBlock?: number;
  bitcoinTimestamp?: number;
  message: string;
}> {
  if (!OpenTimestamps) {
    return { verified: false, status: "not_found", message: "OpenTimestamps not available" };
  }

  // Find the record by content hash
  let record: OTSRecord | undefined;
  let proofId: string | undefined;
  for (const [id, rec] of otsStore.entries()) {
    if (rec.contentHash === contentHash) {
      record = rec;
      proofId = id;
      break;
    }
  }

  if (!record || !proofId) {
    return { verified: false, status: "not_found", message: "No Bitcoin timestamp found for this hash" };
  }

  // If already confirmed, return cached result
  if (record.status === "confirmed") {
    return {
      verified: true,
      status: "confirmed",
      bitcoinBlock: record.bitcoinBlock,
      bitcoinTimestamp: record.bitcoinTimestamp,
      message: `Verified on Bitcoin block #${record.bitcoinBlock}`,
    };
  }

  // Try to upgrade and verify
  const upgraded = await upgradeTimestamp(proofId);
  if (upgraded.status === "confirmed") {
    return {
      verified: true,
      status: "confirmed",
      bitcoinBlock: upgraded.bitcoinBlock,
      bitcoinTimestamp: upgraded.bitcoinTimestamp,
      message: `Verified on Bitcoin block #${upgraded.bitcoinBlock}`,
    };
  }

  return {
    verified: false,
    status: "pending",
    message: "Timestamp submitted to Bitcoin. Waiting for block confirmation (1-4 hours).",
  };
}

/**
 * Get the OTS proof bytes for download.
 */
export function getOTSProof(proofId: string): Buffer | null {
  const record = otsStore.get(proofId);
  return record ? record.otsBytes : null;
}

/**
 * Get OTS status for a proof.
 */
export function getOTSStatus(proofId: string): {
  available: boolean;
  status: "pending" | "confirmed" | "not_found";
  bitcoinBlock?: number;
  bitcoinTimestamp?: number;
  submittedAt?: string;
  contentHash?: string;
} {
  const record = otsStore.get(proofId);
  if (!record) {
    return { available: false, status: "not_found" };
  }

  return {
    available: true,
    status: record.status,
    bitcoinBlock: record.bitcoinBlock,
    bitcoinTimestamp: record.bitcoinTimestamp,
    submittedAt: record.submittedAt,
    contentHash: record.contentHash,
  };
}

/**
 * Get summary info for the dashboard.
 */
export function getOTSInfo(): {
  available: boolean;
  network: string;
  totalStamped: number;
  confirmed: number;
  pending: number;
} {
  let confirmed = 0;
  let pending = 0;
  for (const record of otsStore.values()) {
    if (record.status === "confirmed") confirmed++;
    else pending++;
  }

  return {
    available: isOTSAvailable(),
    network: "Bitcoin (via OpenTimestamps)",
    totalStamped: otsStore.size,
    confirmed,
    pending,
  };
}
