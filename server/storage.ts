import type { User, InsertUser, Proof, InsertProof, Block, InsertBlock, Verification, InsertVerification } from "@shared/schema";
import { sha256, encodeGeohash, computeLocationHash, computeDeviceFingerprint, simulateIpfsUpload } from "./blockchain";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByWallet(wallet: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUserKyc(id: string, status: string, docType: string, kycHash: string, tokenId: string): Promise<User>;

  getProof(id: string): Promise<Proof | undefined>;
  getProofByContentHash(hash: string): Promise<Proof | undefined>;
  getAllProofs(): Promise<Proof[]>;
  getProofsByUser(userId: string): Promise<Proof[]>;
  createProof(proof: InsertProof): Promise<Proof>;
  updateProofBlock(proofId: string, blockIndex: number, blockHash: string): Promise<void>;

  getBlock(index: number): Promise<Block | undefined>;
  getAllBlocks(): Promise<Block[]>;
  getLatestBlock(): Promise<Block | undefined>;
  createBlock(block: InsertBlock): Promise<Block>;

  createVerification(v: InsertVerification): Promise<Verification>;
  getRecentVerifications(): Promise<Verification[]>;

  getStats(): Promise<{
    totalProofs: number;
    totalBlocks: number;
    totalUsers: number;
    verifiedUsers: number;
    averageAuthenticityScore: number;
  }>;
}

class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private proofs: Map<string, Proof> = new Map();
  private blocks: Map<number, Block> = new Map();
  private verifications: Map<string, Verification> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    const now = new Date();

    // Seed users
    const user1: User = {
      id: "usr_001",
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      displayName: "Elena Torres",
      kycStatus: "verified",
      kycDocType: "passport",
      kycHash: sha256("kyc:passport:elena_doc:seed"),
      soulboundTokenId: "SBT-a1b2c3d4",
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const user2: User = {
      id: "usr_002",
      walletAddress: "0x8ba1f109551bD432803012645Hac136c22C37bD3",
      displayName: "Marcus Chen",
      kycStatus: "verified",
      kycDocType: "national_id",
      kycHash: sha256("kyc:national_id:marcus_doc:seed"),
      soulboundTokenId: "SBT-e5f6g7h8",
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const user3: User = {
      id: "usr_003",
      walletAddress: "0xAb5801a7D398351b8bE11C439e05C5b3259aEC9B",
      displayName: "Sofia Nakamura",
      kycStatus: "pending",
      kycDocType: null,
      kycHash: null,
      soulboundTokenId: null,
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.users.set(user1.id, user1);
    this.users.set(user2.id, user2);
    this.users.set(user3.id, user3);

    // Genesis block
    const genesisTimestamp = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const genesisMerkleRoot = sha256("genesis");
    let genesisNonce = 0;
    let genesisHash = "";
    while (true) {
      genesisHash = sha256(`0:0000000000000000:${genesisTimestamp}:${genesisMerkleRoot}:${genesisNonce}`);
      if (genesisHash.startsWith("00")) break;
      genesisNonce++;
      if (genesisNonce > 1000000) break;
    }

    const genesis: Block = {
      index: 0,
      hash: genesisHash,
      previousHash: "0000000000000000",
      timestamp: genesisTimestamp,
      nonce: genesisNonce,
      difficulty: 2,
      proofIds: "[]",
      merkleRoot: genesisMerkleRoot,
    };
    this.blocks.set(0, genesis);

    // Seed proof 1 — live camera capture from Elena in Gibraltar
    const proof1ContentHash = sha256("seed_image_data_gibraltar_rock");
    const proof1Geo = encodeGeohash(36.1408, -5.3536);
    const proof1Timestamp = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const proof1LocationHash = computeLocationHash(proof1Geo, proof1Timestamp);
    const proof1DeviceFp = computeDeviceFingerprint("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    const proof1IpfsCid = simulateIpfsUpload(proof1ContentHash, "capture_001.jpg");
    const proof1CaptureHash = sha256(`${user1.id}:${proof1Geo}:${proof1Timestamp}`);

    const proof1: Proof = {
      id: "prf_001",
      contentHash: proof1ContentHash,
      metadataHash: sha256(JSON.stringify({ deviceFp: proof1DeviceFp, geo: proof1Geo })),
      locationHash: proof1LocationHash,
      geohash: proof1Geo,
      latitude: "36.1408",
      longitude: "-5.3536",
      ipfsCid: proof1IpfsCid,
      captureMode: "live_camera",
      fileType: "image/jpeg",
      fileSize: 3200000,
      deviceFingerprint: proof1DeviceFp,
      captureHash: proof1CaptureHash,
      authenticityScore: 87,
      detectionLayers: JSON.stringify({
        exifAnalysis: { score: 85, details: "Device: Apple iPhone 15 Pro; Focal length: 6.86mm; Exposure: 1/120s; ISO: 64; GPS data embedded", passed: true },
        frequencyAnalysis: { score: 88, details: "Natural sensor noise detected; Non-uniform noise distribution; No periodic artifacts", passed: true },
        prnuAnalysis: { score: 82, details: "Noise residuals centered near zero; Sensor noise std: 8.23 — within expected range; Spatial noise correlation consistent with physical sensor", passed: true },
        screenDetection: { score: 92, details: "No display banding artifacts; Natural color distribution; Full dynamic range", passed: true },
        environmentCheck: { score: 90, details: "Timestamp delta: 1.2s — real-time capture confirmed; GPS: 36.1408, -5.3536; Mobile device confirmed", passed: true },
      }),
      uploaderId: user1.id,
      uploaderWallet: user1.walletAddress,
      blockIndex: null,
      blockHash: null,
      timestamp: proof1Timestamp,
      verified: true,
      thumbnail: null,
      mediaType: "photo",
    };

    // Seed proof 2 — Marcus captures in Tokyo
    const proof2ContentHash = sha256("seed_image_data_tokyo_tower");
    const proof2Geo = encodeGeohash(35.6586, 139.7454);
    const proof2Timestamp = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const proof2LocationHash = computeLocationHash(proof2Geo, proof2Timestamp);
    const proof2DeviceFp = computeDeviceFingerprint("Mozilla/5.0 (Linux; Android 14; Pixel 8)");
    const proof2IpfsCid = simulateIpfsUpload(proof2ContentHash, "capture_002.jpg");
    const proof2CaptureHash = sha256(`${user2.id}:${proof2Geo}:${proof2Timestamp}`);

    const proof2: Proof = {
      id: "prf_002",
      contentHash: proof2ContentHash,
      metadataHash: sha256(JSON.stringify({ deviceFp: proof2DeviceFp, geo: proof2Geo })),
      locationHash: proof2LocationHash,
      geohash: proof2Geo,
      latitude: "35.6586",
      longitude: "139.7454",
      ipfsCid: proof2IpfsCid,
      captureMode: "live_camera",
      fileType: "image/jpeg",
      fileSize: 4100000,
      deviceFingerprint: proof2DeviceFp,
      captureHash: proof2CaptureHash,
      authenticityScore: 91,
      detectionLayers: JSON.stringify({
        exifAnalysis: { score: 90, details: "Device: Google Pixel 8; Focal length: 6.81mm; Exposure: 1/250s; ISO: 100; GPS data embedded", passed: true },
        frequencyAnalysis: { score: 92, details: "Natural sensor noise detected; Non-uniform noise distribution; No periodic artifacts", passed: true },
        prnuAnalysis: { score: 88, details: "Noise residuals centered near zero; Sensor noise std: 6.15; Spatial correlation consistent", passed: true },
        screenDetection: { score: 95, details: "No banding; Natural color distribution; Full dynamic range", passed: true },
        environmentCheck: { score: 85, details: "Timestamp delta: 2.1s; GPS: 35.6586, 139.7454; Mobile device confirmed", passed: true },
      }),
      uploaderId: user2.id,
      uploaderWallet: user2.walletAddress,
      blockIndex: null,
      blockHash: null,
      timestamp: proof2Timestamp,
      verified: true,
      thumbnail: null,
      mediaType: "photo",
    };

    this.proofs.set(proof1.id, proof1);
    this.proofs.set(proof2.id, proof2);

    // Mine block 1 with proof1
    const block1MerkleRoot = proof1ContentHash;
    const block1Timestamp = proof1Timestamp;
    let block1Nonce = 0;
    let block1Hash = "";
    while (true) {
      block1Hash = sha256(`1:${genesisHash}:${block1Timestamp}:${block1MerkleRoot}:${block1Nonce}`);
      if (block1Hash.startsWith("00")) break;
      block1Nonce++;
      if (block1Nonce > 1000000) break;
    }
    const block1: Block = {
      index: 1,
      hash: block1Hash,
      previousHash: genesisHash,
      timestamp: block1Timestamp,
      nonce: block1Nonce,
      difficulty: 2,
      proofIds: JSON.stringify(["prf_001"]),
      merkleRoot: block1MerkleRoot,
    };
    this.blocks.set(1, block1);
    proof1.blockIndex = 1;
    proof1.blockHash = block1Hash;

    // Mine block 2 with proof2
    const block2MerkleRoot = proof2ContentHash;
    const block2Timestamp = proof2Timestamp;
    let block2Nonce = 0;
    let block2Hash = "";
    while (true) {
      block2Hash = sha256(`2:${block1Hash}:${block2Timestamp}:${block2MerkleRoot}:${block2Nonce}`);
      if (block2Hash.startsWith("00")) break;
      block2Nonce++;
      if (block2Nonce > 1000000) break;
    }
    const block2: Block = {
      index: 2,
      hash: block2Hash,
      previousHash: block1Hash,
      timestamp: block2Timestamp,
      nonce: block2Nonce,
      difficulty: 2,
      proofIds: JSON.stringify(["prf_002"]),
      merkleRoot: block2MerkleRoot,
    };
    this.blocks.set(2, block2);
    proof2.blockIndex = 2;
    proof2.blockHash = block2Hash;
  }

  async getUser(id: string) { return this.users.get(id); }
  async getUserByWallet(wallet: string) { return [...this.users.values()].find(u => u.walletAddress === wallet); }
  async getAllUsers() { return [...this.users.values()]; }
  async createUser(data: InsertUser): Promise<User> {
    const id = `usr_${Date.now().toString(36)}`;
    const user: User = { ...data, id, createdAt: new Date().toISOString() };
    this.users.set(id, user);
    return user;
  }
  async updateUserKyc(id: string, status: string, docType: string, kycHash: string, tokenId: string) {
    const user = this.users.get(id)!;
    user.kycStatus = status;
    user.kycDocType = docType;
    user.kycHash = kycHash;
    user.soulboundTokenId = tokenId;
    return user;
  }

  async getProof(id: string) { return this.proofs.get(id); }
  async getProofByContentHash(hash: string) { return [...this.proofs.values()].find(p => p.contentHash === hash); }
  async getAllProofs() { return [...this.proofs.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); }
  async getProofsByUser(userId: string) { return [...this.proofs.values()].filter(p => p.uploaderId === userId); }
  async createProof(data: InsertProof): Promise<Proof> {
    const id = `prf_${Date.now().toString(36)}`;
    const proof: Proof = { ...data, id, blockIndex: null, blockHash: null, verified: false, thumbnail: data.thumbnail || null, mediaType: data.mediaType || "photo" };
    this.proofs.set(id, proof);
    return proof;
  }
  async updateProofBlock(proofId: string, blockIndex: number, blockHash: string) {
    const proof = this.proofs.get(proofId);
    if (proof) {
      proof.blockIndex = blockIndex;
      proof.blockHash = blockHash;
      proof.verified = true;
    }
  }

  async getBlock(index: number) { return this.blocks.get(index); }
  async getAllBlocks() { return [...this.blocks.values()].sort((a, b) => b.index - a.index); }
  async getLatestBlock() {
    const all = [...this.blocks.values()];
    return all.sort((a, b) => b.index - a.index)[0];
  }
  async createBlock(data: InsertBlock): Promise<Block> {
    const block: Block = { ...data };
    this.blocks.set(block.index, block);
    return block;
  }

  async createVerification(data: InsertVerification): Promise<Verification> {
    const id = `ver_${Date.now().toString(36)}`;
    const v: Verification = { ...data, id };
    this.verifications.set(id, v);
    return v;
  }
  async getRecentVerifications() {
    return [...this.verifications.values()]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }

  async getStats() {
    const allProofs = [...this.proofs.values()];
    const avgScore = allProofs.length > 0
      ? Math.round(allProofs.reduce((sum, p) => sum + p.authenticityScore, 0) / allProofs.length)
      : 0;
    return {
      totalProofs: this.proofs.size,
      totalBlocks: this.blocks.size,
      totalUsers: this.users.size,
      verifiedUsers: [...this.users.values()].filter(u => u.kycStatus === "verified").length,
      averageAuthenticityScore: avgScore,
    };
  }
}

export const storage = new MemStorage();
