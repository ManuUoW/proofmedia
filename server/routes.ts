import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import {
  sha256,
  computeMetadataHash,
  encodeGeohash,
  computeLocationHash,
  computeDeviceFingerprint,
  simulateIpfsUpload,
  simulateKycVerification,
  mineBlock,
  validateChain,
  geohashDistance,
} from "./blockchain";
import { runDetectionPipeline } from "./ai-detection";
import { isPolygonActive, getPolygonInfo, registerProofOnChain, verifyProofOnChain } from "./polygon";

// In-memory video storage (maps proof ID to video data URL)
const videoStore = new Map<string, string>();
// Maps proof ID to polygon tx info
const polygonTxStore = new Map<string, { txHash: string; explorerUrl: string }>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Increase body size limit for base64 image data
  app.use(require("express").json({ limit: "50mb" }));

  // ---- Dashboard Stats ----
  app.get("/api/stats", async (_req, res) => {
    const stats = await storage.getStats();
    const chainStatus = await validateChain();
    const polygonInfo = getPolygonInfo();
    res.json({ ...stats, chainValid: chainStatus.valid, chainErrors: chainStatus.errors, polygon: polygonInfo });
  });

  // ---- Users / KYC ----
  app.get("/api/users", async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get("/api/users/:id", async (req, res) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });

  app.post("/api/users/register", async (req, res) => {
    const { walletAddress, displayName } = req.body;
    if (!walletAddress || !displayName) {
      return res.status(400).json({ error: "walletAddress and displayName required" });
    }
    const existing = await storage.getUserByWallet(walletAddress);
    if (existing) return res.status(409).json({ error: "Wallet already registered" });

    const user = await storage.createUser({
      walletAddress,
      displayName,
      kycStatus: "pending",
      kycDocType: null,
      kycHash: null,
      soulboundTokenId: null,
    });
    res.status(201).json(user);
  });

  app.post("/api/users/:id/kyc", async (req, res) => {
    const { docType, docNumber } = req.body;
    if (!docType || !docNumber) {
      return res.status(400).json({ error: "docType and docNumber required" });
    }

    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = simulateKycVerification(docType, docNumber);
    const updated = await storage.updateUserKyc(
      user.id,
      result.verified ? "verified" : "rejected",
      docType,
      result.kycHash,
      result.tokenId
    );
    res.json({
      user: updated,
      kyc: {
        verified: result.verified,
        kycHash: result.kycHash,
        soulboundToken: result.tokenId,
      },
    });
  });

  // ---- Live Camera Capture & Proof Creation ----
  // This replaces the old /api/upload endpoint — no file uploads allowed
  app.post("/api/capture", async (req, res) => {
    try {
      const { imageData, uploaderId, latitude, longitude, captureTimestamp, deviceMetadata, mediaType, videoData } = req.body;

      if (!imageData || !uploaderId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "imageData (base64), uploaderId, latitude, longitude required" });
      }

      // Verify user is KYC'd
      const user = await storage.getUser(uploaderId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.kycStatus !== "verified") {
        return res.status(403).json({ error: "KYC verification required before capturing proofs" });
      }

      // Decode base64 image
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "").replace(/^data:video\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Compute content hash
      const contentHash = sha256(imageBuffer.toString("base64"));

      // Check for duplicate
      const existing = await storage.getProofByContentHash(contentHash);
      if (existing) {
        return res.status(409).json({ error: "This capture has already been registered", existingProofId: existing.id });
      }

      // Run AI detection pipeline
      const detection = runDetectionPipeline({
        imageBuffer,
        metadata: deviceMetadata || {},
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        captureTimestamp: captureTimestamp || new Date().toISOString(),
        userAgent: req.headers["user-agent"] || "unknown",
      });

      // If detection fails, reject with user-friendly error
      if (!detection.authentic) {
        const failedLayers = Object.entries(detection.layers)
          .filter(([_, layer]) => !layer.passed)
          .map(([key]) => {
            const names: Record<string, string> = {
              exifAnalysis: "Device Metadata",
              frequencyAnalysis: "Frequency Pattern",
              prnuAnalysis: "Sensor Fingerprint",
              screenDetection: "Screen Recapture",
              environmentCheck: "Environment Check",
            };
            return names[key] || key;
          });

        let userMessage = "The image could not be verified as authentic.";
        if (detection.overallScore < 30) {
          userMessage = "This image appears to be AI-generated or heavily manipulated. Only live camera captures are accepted.";
        } else if (failedLayers.length > 0) {
          userMessage = `Verification failed on: ${failedLayers.join(", ")}. Try capturing in better lighting with a steady hand.`;
        }

        return res.status(422).json({
          error: "Authenticity verification failed",
          detection: {
            authentic: false,
            overallScore: detection.overallScore,
            layers: detection.layers,
          },
          message: userMessage,
        });
      }

      // Compute all hashes
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const geohash = encodeGeohash(lat, lon);
      const timestamp = new Date().toISOString();
      const locationHash = computeLocationHash(geohash, timestamp);
      const deviceFingerprint = computeDeviceFingerprint(req.headers["user-agent"] || "unknown");
      const metadataHash = computeMetadataHash({
        fileType: "image/jpeg",
        fileSize: imageBuffer.length,
        deviceFingerprint,
        latitude: lat,
        longitude: lon,
        authenticityScore: detection.overallScore,
      });

      // Simulate IPFS upload
      const ipfsCid = simulateIpfsUpload(contentHash, `capture_${Date.now()}.jpg`);

      // Pre-capture hash
      const captureHash = sha256(`${user.id}:${geohash}:${captureTimestamp || timestamp}`);

      // Store the full compressed image data URL as thumbnail
      const thumbnailData = imageData;

      // Create proof record
      const proof = await storage.createProof({
        contentHash,
        metadataHash,
        locationHash,
        geohash,
        latitude: lat.toString(),
        longitude: lon.toString(),
        ipfsCid,
        captureMode: "live_camera",
        fileType: mediaType === "video" ? "video/webm" : "image/jpeg",
        fileSize: imageBuffer.length,
        deviceFingerprint,
        captureHash,
        authenticityScore: detection.overallScore,
        detectionLayers: JSON.stringify(detection.layers),
        uploaderId: user.id,
        uploaderWallet: user.walletAddress,
        timestamp,
        thumbnail: thumbnailData,
        mediaType: mediaType || "photo",
      });

      // Store video data if provided
      if (videoData) {
        videoStore.set(proof.id, videoData);
      }

      // Mine block (local chain)
      const block = await mineBlock([proof.id]);

      // Also register on Polygon if configured
      let polygonTx: { txHash: string; explorerUrl: string } | null = null;
      if (isPolygonActive()) {
        polygonTx = await registerProofOnChain({
          contentHash,
          metadataHash,
          locationHash,
          geohash,
          authenticityScore: detection.overallScore,
          ipfsCid,
          uploaderWallet: user.walletAddress,
        });
        if (polygonTx) {
          polygonTxStore.set(proof.id, polygonTx);
        }
      }

      // Get updated proof
      const updatedProof = await storage.getProof(proof.id);

      res.status(201).json({
        proof: updatedProof,
        hasVideo: !!videoData,
        polygonTx,
        detection: {
          authentic: true,
          overallScore: detection.overallScore,
          layers: detection.layers,
        },
        block: {
          index: block.index,
          hash: block.hash,
          nonce: block.nonce,
          previousHash: block.previousHash,
        },
        ipfs: { cid: ipfsCid },
        hashes: {
          contentHash,
          metadataHash,
          locationHash,
          geohash,
          captureHash,
          deviceFingerprint,
        },
      });
    } catch (err: any) {
      console.error("Capture error:", err);
      res.status(500).json({ error: "Something went wrong during capture. Please try again." });
    }
  });

  // ---- Verification (hash-only, no file upload) ----
  app.post("/api/verify", async (req, res) => {
    try {
      const { contentHash, latitude, longitude } = req.body;

      if (!contentHash) {
        return res.status(400).json({ error: "Provide a contentHash to verify" });
      }

      const proof = await storage.getProofByContentHash(contentHash);
      const claimedLat = latitude ? parseFloat(latitude) : null;
      const claimedLon = longitude ? parseFloat(longitude) : null;

      let locationMatch = null;
      if (proof && claimedLat !== null && claimedLon !== null) {
        const claimedGeohash = encodeGeohash(claimedLat, claimedLon);
        const distance = geohashDistance(proof.geohash, claimedGeohash);
        locationMatch = {
          claimedGeohash,
          originalGeohash: proof.geohash,
          distanceKm: Math.round(distance * 1000) / 1000,
          withinThreshold: distance < 1,
        };
      }

      const matchDetails: any = {};
      if (proof) {
        matchDetails.proofId = proof.id;
        matchDetails.captureMode = proof.captureMode;
        matchDetails.authenticityScore = proof.authenticityScore;
        matchDetails.uploadedBy = proof.uploaderWallet;
        matchDetails.timestamp = proof.timestamp;
        matchDetails.blockIndex = proof.blockIndex;
        matchDetails.blockHash = proof.blockHash;
        matchDetails.ipfsCid = proof.ipfsCid;
        matchDetails.geohash = proof.geohash;
        matchDetails.kycVerified = true;
        if (locationMatch) matchDetails.locationMatch = locationMatch;
      }

      const verification = await storage.createVerification({
        contentHash,
        found: !!proof,
        matchDetails: JSON.stringify(matchDetails),
        timestamp: new Date().toISOString(),
      });

      res.json({
        verified: !!proof,
        contentHash,
        proof: proof || null,
        locationMatch,
        verification,
      });
    } catch (err: any) {
      console.error("Verify error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Proofs ----
  app.get("/api/proofs", async (_req, res) => {
    const proofs = await storage.getAllProofs();
    res.json(proofs);
  });

  app.get("/api/proofs/:id", async (req, res) => {
    const proof = await storage.getProof(req.params.id);
    if (!proof) return res.status(404).json({ error: "Proof not found" });
    res.json(proof);
  });

  app.get("/api/proofs/user/:userId", async (req, res) => {
    const proofs = await storage.getProofsByUser(req.params.userId);
    res.json(proofs);
  });

  app.get("/api/proofs/:id/video", (req, res) => {
    const videoData = videoStore.get(req.params.id);
    if (!videoData) return res.status(404).json({ error: "No video found" });
    res.json({ videoData });
  });

  // ---- Blockchain Explorer ----
  app.get("/api/blocks", async (_req, res) => {
    const blocks = await storage.getAllBlocks();
    res.json(blocks);
  });

  app.get("/api/blocks/:index", async (req, res) => {
    const block = await storage.getBlock(parseInt(req.params.index));
    if (!block) return res.status(404).json({ error: "Block not found" });

    const proofIds: string[] = JSON.parse(block.proofIds);
    const proofs = [];
    for (const pid of proofIds) {
      const p = await storage.getProof(pid);
      if (p) proofs.push(p);
    }

    res.json({ ...block, proofs });
  });

  app.get("/api/chain/validate", async (_req, res) => {
    const result = await validateChain();
    res.json(result);
  });

  // ---- Polygon Network Info ----
  app.get("/api/polygon/info", (_req, res) => {
    res.json(getPolygonInfo());
  });

  app.get("/api/polygon/tx/:proofId", (req, res) => {
    const tx = polygonTxStore.get(req.params.proofId);
    res.json(tx || { txHash: null, explorerUrl: null });
  });

  // ---- Verifications History ----
  app.get("/api/verifications", async (_req, res) => {
    const vList = await storage.getRecentVerifications();
    res.json(vList);
  });

  return httpServer;
}
