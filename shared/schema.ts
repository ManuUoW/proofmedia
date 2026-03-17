import { pgTable, text, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users with KYC status
export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name").notNull(),
  kycStatus: text("kyc_status").notNull().default("pending"), // pending | verified | rejected
  kycDocType: text("kyc_doc_type"), // passport | national_id | drivers_license
  kycHash: text("kyc_hash"), // SHA-256 of KYC data (never raw PII)
  soulboundTokenId: text("soulbound_token_id"),
  createdAt: text("created_at").notNull(),
});

// Media proof records — capture-only (no file uploads)
export const proofs = pgTable("proofs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contentHash: text("content_hash").notNull().unique(),
  metadataHash: text("metadata_hash").notNull(),
  locationHash: text("location_hash").notNull(),
  geohash: text("geohash").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  ipfsCid: text("ipfs_cid").notNull(),
  captureMode: text("capture_mode").notNull().default("live_camera"), // always live_camera
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  deviceFingerprint: text("device_fingerprint").notNull(),
  captureHash: text("capture_hash").notNull(), // pre-capture hash: userID + geo + timestamp
  authenticityScore: integer("authenticity_score").notNull(), // 0-100
  detectionLayers: text("detection_layers").notNull(), // JSON of layer results
  uploaderId: varchar("uploader_id", { length: 64 }).notNull(),
  uploaderWallet: text("uploader_wallet").notNull(),
  blockIndex: integer("block_index"),
  blockHash: text("block_hash"),
  timestamp: text("timestamp").notNull(),
  verified: boolean("verified").notNull().default(false),
  thumbnail: text("thumbnail"), // base64 data URL of captured image (small preview)
  mediaType: text("media_type").default("photo"), // "photo" | "video"
});

// Blockchain blocks
export const blocks = pgTable("blocks", {
  index: integer("index").primaryKey(),
  hash: text("hash").notNull().unique(),
  previousHash: text("previous_hash").notNull(),
  timestamp: text("timestamp").notNull(),
  nonce: integer("nonce").notNull(),
  difficulty: integer("difficulty").notNull(),
  proofIds: text("proof_ids").notNull(), // JSON array of proof IDs
  merkleRoot: text("merkle_root").notNull(),
});

// Verification attempts
export const verifications = pgTable("verifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contentHash: text("content_hash").notNull(),
  found: boolean("found").notNull(),
  matchDetails: text("match_details"), // JSON
  timestamp: text("timestamp").notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProofSchema = createInsertSchema(proofs).omit({ id: true, blockIndex: true, blockHash: true, verified: true });
export const insertBlockSchema = createInsertSchema(blocks);
export const insertVerificationSchema = createInsertSchema(verifications).omit({ id: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Proof = typeof proofs.$inferSelect;
export type InsertProof = z.infer<typeof insertProofSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Verification = typeof verifications.$inferSelect;
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
