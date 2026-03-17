/**
 * Polygon Amoy Testnet Integration for ProofMedia.
 *
 * This module provides real on-chain proof registration when configured
 * with a funded deployer wallet. Without config, it gracefully falls back
 * to the local PoW chain (no-op on-chain calls).
 *
 * SETUP:
 *   1. Fund a wallet on Polygon Amoy (chain 80002) with POL from a faucet.
 *   2. Deploy MediaProof.sol using this module's deployContract() function.
 *   3. Set environment variables:
 *        POLYGON_PRIVATE_KEY=0x...
 *        POLYGON_CONTRACT_ADDRESS=0x...
 *   4. The app will automatically write proofs on-chain after local mining.
 */

import { ethers } from "ethers";

// Polygon Amoy testnet config
const AMOY_RPC = "https://rpc-amoy.polygon.technology/";
const AMOY_CHAIN_ID = 80002;
const AMOY_EXPLORER = "https://amoy.polygonscan.com";

// ABI for the MediaProof contract (only the functions we call)
const MEDIA_PROOF_ABI = [
  "function registerProof(bytes32 _contentHash, bytes32 _metadataHash, bytes32 _locationHash, string calldata _geohash, uint256 _authenticityScore, string calldata _ipfsCid, address _uploaderWallet) external",
  "function verify(bytes32 _contentHash) external view returns (bool exists, uint256 authenticityScore, string memory geohash, address uploaderWallet, uint256 timestamp, string memory ipfsCid)",
  "function proofCount() external view returns (uint256)",
  "event ProofRegistered(bytes32 indexed contentHash, address indexed uploader, string geohash, uint256 authenticityScore, uint256 timestamp)",
];

// Bytecode would be needed for deployment — for now, we compile externally or use Remix
// This module focuses on interacting with an already-deployed contract.

interface PolygonConfig {
  privateKey: string;
  contractAddress: string;
}

function getConfig(): PolygonConfig | null {
  const pk = process.env.POLYGON_PRIVATE_KEY;
  const addr = process.env.POLYGON_CONTRACT_ADDRESS;
  if (pk && addr) {
    return { privateKey: pk, contractAddress: addr };
  }
  return null;
}

function getProvider() {
  return new ethers.JsonRpcProvider(AMOY_RPC, {
    name: "polygon-amoy",
    chainId: AMOY_CHAIN_ID,
  });
}

function getWallet(config: PolygonConfig) {
  return new ethers.Wallet(config.privateKey, getProvider());
}

function getContract(config: PolygonConfig) {
  const wallet = getWallet(config);
  return new ethers.Contract(config.contractAddress, MEDIA_PROOF_ABI, wallet);
}

/**
 * Check if Polygon integration is active.
 */
export function isPolygonActive(): boolean {
  return getConfig() !== null;
}

/**
 * Get Polygon chain info for the frontend.
 */
export function getPolygonInfo(): {
  active: boolean;
  network: string;
  chainId: number;
  explorer: string;
  contractAddress: string | null;
  walletAddress: string | null;
} {
  const config = getConfig();
  if (!config) {
    return {
      active: false,
      network: "Polygon Amoy (not connected)",
      chainId: AMOY_CHAIN_ID,
      explorer: AMOY_EXPLORER,
      contractAddress: null,
      walletAddress: null,
    };
  }

  const wallet = getWallet(config);
  return {
    active: true,
    network: "Polygon Amoy Testnet",
    chainId: AMOY_CHAIN_ID,
    explorer: AMOY_EXPLORER,
    contractAddress: config.contractAddress,
    walletAddress: wallet.address,
  };
}

/**
 * Convert a hex string (e.g. SHA-256 hash) to bytes32.
 */
function toBytes32(hexHash: string): string {
  // Ensure it's 0x-prefixed and 64 hex chars (32 bytes)
  const clean = hexHash.startsWith("0x") ? hexHash : `0x${hexHash}`;
  if (clean.length !== 66) {
    throw new Error(`Invalid hash length for bytes32: ${clean.length}`);
  }
  return clean;
}

/**
 * Register a proof on-chain. Returns tx hash or null if not configured.
 */
export async function registerProofOnChain(params: {
  contentHash: string;
  metadataHash: string;
  locationHash: string;
  geohash: string;
  authenticityScore: number;
  ipfsCid: string;
  uploaderWallet: string;
}): Promise<{ txHash: string; explorerUrl: string } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const contract = getContract(config);
    const tx = await contract.registerProof(
      toBytes32(params.contentHash),
      toBytes32(params.metadataHash),
      toBytes32(params.locationHash),
      params.geohash,
      params.authenticityScore,
      params.ipfsCid,
      params.uploaderWallet
    );

    const receipt = await tx.wait();
    const txHash = receipt.hash;
    const explorerUrl = `${AMOY_EXPLORER}/tx/${txHash}`;

    console.log(`[polygon] Proof registered on-chain: ${explorerUrl}`);
    return { txHash, explorerUrl };
  } catch (err: any) {
    console.error("[polygon] On-chain registration failed:", err.message);
    // Don't throw — the local chain still has the proof
    return null;
  }
}

/**
 * Verify a proof on-chain. Returns on-chain data or null if not configured.
 */
export async function verifyProofOnChain(contentHash: string): Promise<{
  exists: boolean;
  authenticityScore: number;
  geohash: string;
  uploaderWallet: string;
  timestamp: number;
  ipfsCid: string;
} | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const contract = getContract(config);
    const result = await contract.verify(toBytes32(contentHash));
    return {
      exists: result[0],
      authenticityScore: Number(result[1]),
      geohash: result[2],
      uploaderWallet: result[3],
      timestamp: Number(result[4]),
      ipfsCid: result[5],
    };
  } catch (err: any) {
    console.error("[polygon] On-chain verification failed:", err.message);
    return null;
  }
}

/**
 * Get the on-chain proof count.
 */
export async function getOnChainProofCount(): Promise<number | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const contract = getContract(config);
    return Number(await contract.proofCount());
  } catch {
    return null;
  }
}
