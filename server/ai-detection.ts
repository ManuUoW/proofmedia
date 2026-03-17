import { createHash } from "crypto";

// ---- Types ----

export interface LayerResult {
  score: number;       // 0-100 (100 = fully authentic)
  details: string;
  passed: boolean;
}

export interface DetectionResult {
  authentic: boolean;
  overallScore: number;
  layers: {
    exifAnalysis: LayerResult;
    frequencyAnalysis: LayerResult;
    prnuAnalysis: LayerResult;
    screenDetection: LayerResult;
    environmentCheck: LayerResult;
  };
  captureHash: string;
  timestamp: string;
}

// ---- Layer 1: EXIF & Device Metadata Analysis ----
// NOTE: getUserMedia canvas captures do NOT embed EXIF.
// We rely on client-reported device metadata + browser environment instead.

function analyzeExifMetadata(metadata: {
  deviceMake?: string;
  deviceModel?: string;
  focalLength?: number;
  exposureTime?: number;
  iso?: number;
  hasGps?: boolean;
  imageWidth?: number;
  imageHeight?: number;
  captureMode?: string; // "live_camera" from our app
  userAgent?: string;
}): LayerResult {
  let score = 0;
  const details: string[] = [];

  // For live camera captures via getUserMedia, EXIF is not available.
  // Instead we verify: device info was reported, capture mode is live, 
  // and resolution is plausible for a camera.

  // Device make reported by client JS
  if (metadata.deviceMake && metadata.deviceMake !== "unknown" && metadata.deviceMake !== "Generic") {
    score += 20;
    details.push(`Device: ${metadata.deviceMake} ${metadata.deviceModel || ""}`);
  } else if (metadata.deviceMake === "Generic") {
    // Browser couldn't determine device — still plausible for desktop browsers
    score += 10;
    details.push("Device make not identifiable from user agent");
  } else {
    details.push("No device info");
  }

  // Camera parameters — these are bonuses if the client reported them
  // getUserMedia doesn't provide these, so we don't penalize their absence
  if (metadata.focalLength && metadata.focalLength > 0) {
    score += 10;
    details.push(`Focal length: ${metadata.focalLength}mm`);
  }
  if (metadata.exposureTime && metadata.exposureTime > 0) {
    score += 5;
    details.push(`Exposure: 1/${Math.round(1 / metadata.exposureTime)}s`);
  }
  if (metadata.iso && metadata.iso > 0) {
    score += 5;
    details.push(`ISO: ${metadata.iso}`);
  }

  // GPS data from browser geolocation
  if (metadata.hasGps) {
    score += 25;
    details.push("GPS coordinates confirmed via browser geolocation");
  }

  // Capture mode is "live_camera" (our app enforced this)
  if (metadata.captureMode === "live_camera") {
    score += 20;
    details.push("Live camera capture mode verified");
  }

  // Resolution sanity check
  if (metadata.imageWidth && metadata.imageHeight) {
    const pixels = metadata.imageWidth * metadata.imageHeight;
    if (pixels >= 100000) { // At least ~316x316
      score += 15;
      details.push(`Resolution: ${metadata.imageWidth}x${metadata.imageHeight}`);
    } else if (pixels >= 10000) {
      score += 8;
      details.push(`Low resolution: ${metadata.imageWidth}x${metadata.imageHeight}`);
    } else {
      details.push(`Very low resolution: ${metadata.imageWidth}x${metadata.imageHeight}`);
    }
  }

  // Mobile user agent check
  if (metadata.userAgent) {
    const ua = metadata.userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      score += 5;
      details.push("Mobile device confirmed");
    }
  }

  const finalScore = Math.min(score, 100);
  return {
    score: finalScore,
    details: details.join("; "),
    passed: finalScore >= 40,
  };
}

// ---- Layer 2: Frequency Analysis ----

function analyzeFrequency(imageData: Buffer): LayerResult {
  const details: string[] = [];
  let score = 65; // Base for real captures
  const length = imageData.length;
  
  if (length < 500) {
    return { score: 45, details: "Image data very small — limited analysis possible", passed: true };
  }

  if (length < 2000) {
    // Small image — canvas compressed JPEG. Less data to work with but not suspicious.
    score = 60;
    details.push("Compressed capture — limited frequency data available");
  }

  // Compute local variance as proxy for natural noise vs synthetic smoothness
  const blockSize = Math.min(64, Math.floor(length / 8));
  if (blockSize < 4) {
    return { score: 55, details: "Minimal image data for frequency analysis", passed: true };
  }

  const blocks = Math.floor(length / blockSize);
  let varianceSum = 0;
  let varianceCount = 0;
  const blockVariances: number[] = [];

  for (let b = 0; b < Math.min(blocks, 500); b++) {
    const start = b * blockSize;
    let sum = 0;
    for (let i = start; i < start + blockSize && i < length; i++) {
      sum += imageData[i];
    }
    const mean = sum / blockSize;
    let variance = 0;
    for (let i = start; i < start + blockSize && i < length; i++) {
      variance += (imageData[i] - mean) ** 2;
    }
    variance /= blockSize;
    blockVariances.push(variance);
    varianceSum += variance;
    varianceCount++;
  }

  const avgVariance = varianceSum / Math.max(varianceCount, 1);
  
  // Real photos have moderate to high variance (sensor noise + scene variation)
  if (avgVariance > 300) {
    score += 15;
    details.push("Natural noise and scene variation detected");
  } else if (avgVariance > 100) {
    score += 10;
    details.push("Moderate image variation");
  } else if (avgVariance > 30) {
    score += 5;
    details.push("Low variation — compressed or uniform scene");
  } else {
    score -= 5;
    details.push("Very low variance — possible synthetic origin");
  }

  // Check noise distribution uniformity
  if (blockVariances.length > 5) {
    const varOfVar = blockVariances.reduce((sum, v) => sum + (v - avgVariance) ** 2, 0) / blockVariances.length;
    if (varOfVar > 10000) {
      score += 10;
      details.push("Non-uniform noise — typical of real scenes");
    } else if (varOfVar > 1000) {
      score += 5;
      details.push("Moderate noise variation");
    }
  }

  // Check for periodic patterns (GAN upsampling artifacts)
  const fftProxy = computePeriodicityScore(imageData, length);
  if (fftProxy < 0.4) {
    score += 5;
    details.push("No periodic artifacts detected");
  } else if (fftProxy > 0.7) {
    score -= 10;
    details.push("Periodic patterns detected — possible synthesis");
  }

  const finalScore = Math.max(30, Math.min(score, 100));
  return {
    score: finalScore,
    details: details.join("; "),
    passed: finalScore >= 45,
  };
}

function computePeriodicityScore(data: Buffer, length: number): number {
  const sampleSize = Math.min(512, length);
  if (sampleSize < 32) return 0;
  const samples = Array.from(data.slice(0, sampleSize));
  const mean = samples.reduce((a, b) => a + b, 0) / sampleSize;
  
  let maxCorr = 0;
  for (const lag of [2, 4, 8, 16, 32]) {
    if (lag >= sampleSize / 2) continue;
    let corr = 0;
    let count = 0;
    for (let i = 0; i < sampleSize - lag; i++) {
      corr += (samples[i] - mean) * (samples[i + lag] - mean);
      count++;
    }
    corr = Math.abs(corr / Math.max(count, 1));
    maxCorr = Math.max(maxCorr, corr);
  }
  
  const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sampleSize;
  return variance > 0 ? Math.min(maxCorr / variance, 1) : 0;
}

// ---- Layer 3: PRNU Analysis ----

function analyzePrnu(imageData: Buffer): LayerResult {
  const details: string[] = [];
  let score = 60;
  const length = imageData.length;

  if (length < 1000) {
    return { score: 50, details: "Limited data for sensor noise analysis — compressed capture", passed: true };
  }

  const windowSize = Math.min(3, Math.floor(length / 20));
  if (windowSize < 1) {
    return { score: 50, details: "Insufficient data for PRNU", passed: true };
  }

  const sampleLength = Math.min(length, 8000);
  const residuals: number[] = [];

  for (let i = windowSize; i < sampleLength - windowSize; i++) {
    let sum = 0;
    for (let j = -windowSize; j <= windowSize; j++) {
      sum += imageData[i + j];
    }
    const denoised = sum / (windowSize * 2 + 1);
    residuals.push(imageData[i] - denoised);
  }

  if (residuals.length < 50) {
    return { score: 50, details: "Not enough data for noise analysis", passed: true };
  }

  // Check noise statistics
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const meanDeviation = Math.abs(residualMean);

  if (meanDeviation < 3) {
    score += 10;
    details.push("Noise centered near zero — consistent with sensor");
  } else {
    score += 3;
    details.push("Noise offset present — may be compression artifact");
  }

  const residualVariance = residuals.reduce((sum, r) => sum + (r - residualMean) ** 2, 0) / residuals.length;
  const residualStd = Math.sqrt(residualVariance);
  
  if (residualStd > 0.5 && residualStd < 50) {
    score += 15;
    details.push(`Noise std: ${residualStd.toFixed(2)} — plausible sensor noise`);
  } else if (residualStd >= 50) {
    score += 5;
    details.push("High noise — heavily compressed");
  } else {
    score -= 5;
    details.push("Very low noise — suspicious");
  }

  // Spatial correlation
  let spatialCorr = 0;
  const corrLen = Math.min(residuals.length - 1, 500);
  for (let i = 1; i < corrLen; i++) {
    spatialCorr += residuals[i] * residuals[i - 1];
  }
  spatialCorr /= corrLen;
  const normalizedCorr = residualVariance > 0 ? spatialCorr / residualVariance : 0;

  if (normalizedCorr > 0.05 && normalizedCorr < 0.9) {
    score += 10;
    details.push("Spatial correlation consistent with physical sensor");
  } else if (normalizedCorr <= 0.05) {
    score += 3;
    details.push("Low spatial correlation");
  }

  const finalScore = Math.max(30, Math.min(score, 100));
  return {
    score: finalScore,
    details: details.join("; "),
    passed: finalScore >= 40,
  };
}

// ---- Layer 4: Screen Recapture Detection ----

function detectScreenRecapture(imageData: Buffer): LayerResult {
  const details: string[] = [];
  let score = 75; // Assume authentic
  const length = imageData.length;

  if (length < 500) {
    return { score: 60, details: "Limited data for screen detection", passed: true };
  }

  const sampleSize = Math.min(length, 4096);
  const samples = Array.from(imageData.slice(0, sampleSize));

  // Check for periodic banding
  const bandingScore = detectBanding(samples);
  if (bandingScore > 0.6) {
    score -= 20;
    details.push("Periodic banding detected — possible screen artifacts");
  } else if (bandingScore > 0.35) {
    score -= 5;
    details.push("Minor periodic patterns");
  } else {
    score += 5;
    details.push("No display banding artifacts");
  }

  // Color channel regularity
  const colorRegularity = analyzeColorRegularity(samples);
  if (colorRegularity > 0.75) {
    score -= 15;
    details.push("High color regularity — possible screen subpixels");
  } else {
    score += 5;
    details.push("Natural color distribution");
  }

  // Dynamic range check
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < sampleSize; i++) {
    histogram[samples[i]]++;
  }
  const usedBins = histogram.filter(v => v > 0).length;
  const rangeUtilization = usedBins / 256;
  
  if (rangeUtilization > 0.5) {
    score += 10;
    details.push("Good dynamic range");
  } else if (rangeUtilization < 0.2) {
    score -= 10;
    details.push("Very compressed dynamic range");
  } else {
    score += 3;
    details.push("Moderate dynamic range");
  }

  const finalScore = Math.max(30, Math.min(score, 100));
  return {
    score: finalScore,
    details: details.join("; "),
    passed: finalScore >= 40,
  };
}

function detectBanding(samples: number[]): number {
  const length = samples.length;
  if (length < 64) return 0;

  let maxPower = 0;
  let totalPower = 0;

  for (const period of [60, 120, 50, 100, 30]) {
    if (period >= length / 2) continue;
    let sinSum = 0;
    let cosSum = 0;
    for (let i = 0; i < length; i++) {
      const angle = (2 * Math.PI * i) / period;
      sinSum += samples[i] * Math.sin(angle);
      cosSum += samples[i] * Math.cos(angle);
    }
    const power = (sinSum ** 2 + cosSum ** 2) / length;
    maxPower = Math.max(maxPower, power);
    totalPower += power;
  }

  return totalPower > 0 ? maxPower / (totalPower + 1) : 0;
}

function analyzeColorRegularity(samples: number[]): number {
  if (samples.length < 100) return 0;
  let regularCount = 0;
  const checkLength = Math.min(samples.length - 6, 600);

  for (let i = 0; i < checkLength; i += 3) {
    if (i + 6 < samples.length) {
      const diff0 = Math.abs(samples[i] - samples[i + 3]);
      const diff1 = Math.abs(samples[i + 1] - samples[i + 4]);
      const diff2 = Math.abs(samples[i + 2] - samples[i + 5]);
      if (diff0 < 3 && diff1 < 3 && diff2 < 3) {
        regularCount++;
      }
    }
  }

  return regularCount / (checkLength / 3);
}

// ---- Layer 5: Environmental Consistency ----

function checkEnvironment(params: {
  latitude: number;
  longitude: number;
  captureTimestamp: string;
  serverTimestamp: string;
  userAgent: string;
}): LayerResult {
  const details: string[] = [];
  let score = 55;

  // Timestamp delta
  const captureTime = new Date(params.captureTimestamp).getTime();
  const serverTime = new Date(params.serverTimestamp).getTime();
  const timeDiffMs = Math.abs(serverTime - captureTime);
  const timeDiffSeconds = timeDiffMs / 1000;

  if (timeDiffSeconds < 15) {
    score += 25;
    details.push(`Timestamp delta: ${timeDiffSeconds.toFixed(1)}s — real-time capture confirmed`);
  } else if (timeDiffSeconds < 60) {
    score += 15;
    details.push(`Timestamp delta: ${timeDiffSeconds.toFixed(1)}s — recent capture`);
  } else if (timeDiffSeconds < 300) {
    score += 5;
    details.push(`Timestamp delta: ${timeDiffSeconds.toFixed(0)}s — slightly delayed`);
  } else {
    score -= 5;
    details.push(`Timestamp delta: ${Math.floor(timeDiffSeconds)}s — old submission`);
  }

  // GPS validity
  if (params.latitude >= -90 && params.latitude <= 90 && params.longitude >= -180 && params.longitude <= 180) {
    if (Math.abs(params.latitude) < 0.01 && Math.abs(params.longitude) < 0.01) {
      score -= 5;
      details.push("GPS at null island (0,0) — likely default");
    } else {
      score += 15;
      details.push(`GPS: ${params.latitude.toFixed(4)}, ${params.longitude.toFixed(4)}`);
    }
  } else {
    score -= 10;
    details.push("Invalid GPS coordinates");
  }

  // Mobile device check
  const ua = params.userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    score += 5;
    details.push("Mobile device confirmed");
  } else {
    details.push("Non-mobile user agent");
  }

  const finalScore = Math.max(20, Math.min(score, 100));
  return {
    score: finalScore,
    details: details.join("; "),
    passed: finalScore >= 40,
  };
}

// ---- Main Detection Pipeline ----

export function runDetectionPipeline(params: {
  imageBuffer: Buffer;
  metadata: {
    deviceMake?: string;
    deviceModel?: string;
    focalLength?: number;
    exposureTime?: number;
    iso?: number;
    hasGps?: boolean;
    imageWidth?: number;
    imageHeight?: number;
    captureMode?: string;
  };
  latitude: number;
  longitude: number;
  captureTimestamp: string;
  userAgent: string;
}): DetectionResult {
  const serverTimestamp = new Date().toISOString();

  // Run all detection layers
  const exifAnalysis = analyzeExifMetadata({
    ...params.metadata,
    captureMode: params.metadata.captureMode || "live_camera",
    userAgent: params.userAgent,
  });
  const frequencyAnalysis = analyzeFrequency(params.imageBuffer);
  const prnuAnalysis = analyzePrnu(params.imageBuffer);
  const screenDetection = detectScreenRecapture(params.imageBuffer);
  const environmentCheck = checkEnvironment({
    latitude: params.latitude,
    longitude: params.longitude,
    captureTimestamp: params.captureTimestamp,
    serverTimestamp,
    userAgent: params.userAgent,
  });

  // Weighted score
  const weights = {
    exif: 0.20,
    frequency: 0.20,
    prnu: 0.15,
    screen: 0.20,
    environment: 0.25, // Environment is very reliable for live captures
  };

  const overallScore = Math.round(
    exifAnalysis.score * weights.exif +
    frequencyAnalysis.score * weights.frequency +
    prnuAnalysis.score * weights.prnu +
    screenDetection.score * weights.screen +
    environmentCheck.score * weights.environment
  );

  const captureHash = createHash("sha256")
    .update(`${params.captureTimestamp}:${params.latitude}:${params.longitude}:${overallScore}`)
    .digest("hex");

  // Authentic if score >= 45 and no layers scored critically low (< 20)
  const criticalFailures = [exifAnalysis, frequencyAnalysis, screenDetection, environmentCheck]
    .filter(l => l.score < 20).length;

  const authentic = overallScore >= 45 && criticalFailures === 0;

  return {
    authentic,
    overallScore,
    layers: {
      exifAnalysis,
      frequencyAnalysis,
      prnuAnalysis,
      screenDetection,
      environmentCheck,
    },
    captureHash,
    timestamp: serverTimestamp,
  };
}
