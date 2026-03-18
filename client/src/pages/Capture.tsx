import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CopyableHash } from "@/components/CopyableHash";
import { MediaThumbnail } from "@/components/MediaViewer";
import {
  MapPin, Camera, Video, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Crosshair, RotateCcw, Hash
} from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type CaptureStep = "idle" | "locating" | "location_confirmed" | "analyzing" | "result";

interface DetectionLayer {
  score: number;
  details: string;
  passed: boolean;
}

interface CaptureResult {
  proof?: any;
  detection: {
    authentic: boolean;
    overallScore: number;
    layers: {
      exifAnalysis: DetectionLayer;
      frequencyAnalysis: DetectionLayer;
      prnuAnalysis: DetectionLayer;
      screenDetection: DetectionLayer;
      environmentCheck: DetectionLayer;
    };
  };
  block?: any;
  hashes?: any;
  polygonTx?: { txHash: string; explorerUrl: string } | null;
  error?: string;
  message?: string;
}

// Max base64 payload size (~900KB leaves room for the JSON wrapper under the ~1MB proxy limit)
const MAX_PAYLOAD_BYTES = 900_000;

// Load an image file into an HTMLImageElement
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load image")); };
    img.src = url;
  });
}

// Draw image to canvas at target dimensions and return JPEG dataUrl
function canvasCompress(source: HTMLImageElement | HTMLVideoElement, w: number, h: number, quality: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

// Iteratively compress until the base64 payload fits under MAX_PAYLOAD_BYTES
function compressToFit(
  source: HTMLImageElement | HTMLVideoElement,
  srcW: number,
  srcH: number
): { dataUrl: string; width: number; height: number } {
  // Start at 1600px max dimension, quality 0.8
  let maxDim = 1600;
  let quality = 0.8;

  for (let attempt = 0; attempt < 5; attempt++) {
    let w = srcW;
    let h = srcH;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const dataUrl = canvasCompress(source, w, h, quality);
    // base64 data URL: "data:image/jpeg;base64," prefix is ~23 chars, the rest is the payload
    const payloadSize = dataUrl.length * 0.75; // rough base64 → bytes
    if (payloadSize <= MAX_PAYLOAD_BYTES) {
      return { dataUrl, width: w, height: h };
    }
    // Too large — reduce further
    maxDim = Math.round(maxDim * 0.75);
    quality = Math.max(0.3, quality - 0.15);
  }
  // Final fallback: smaller thumbnail
  const fw = Math.min(srcW, 800);
  const fh = Math.round((fw / srcW) * srcH);
  return { dataUrl: canvasCompress(source, fw, fh, 0.5), width: fw, height: fh };
}

// Compress an image file with iterative size reduction
async function compressImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(file);
  return compressToFit(img, img.naturalWidth, img.naturalHeight);
}

// Extract a frame from a video file with timeout
function extractVideoFrame(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    // Timeout after 15 seconds
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        URL.revokeObjectURL(url);
        reject(new Error("Video processing timed out. Try a shorter clip."));
      }
    }, 15000);

    const extractFrame = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const result = compressToFit(video, video.videoWidth || 640, video.videoHeight || 480);
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.onloadeddata = () => {
      // Seek to 0.1s — small offset is faster than seeking far into the video
      video.currentTime = 0.1;
    };

    video.onseeked = extractFrame;

    video.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error("Could not process the video. Try taking a photo instead."));
      }
    };

    video.src = url;
    // Trigger load
    video.load();
  });
}


export default function Capture() {
  const [step, setStep] = useState<CaptureStep>("idle");
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [captureHash, setCaptureHash] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [capturedMediaType, setCapturedMediaType] = useState<"photo" | "video">("photo");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activeUserId = "usr_001";

  // Step 1: Request geolocation
  const requestLocation = useCallback(() => {
    setStep("locating");
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your device.");
      setStep("idle");
      return;
    }

    // On iOS Safari, if the user previously denied permission, the prompt won't
    // appear again — the error callback fires instantly with code 1.
    // We detect that and give the user clear instructions to fix it.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        const ts = new Date().toISOString();
        const hashInput = `${activeUserId}:${pos.coords.latitude}:${pos.coords.longitude}:${ts}`;
        generateHash(hashInput).then((hash) => {
          setCaptureHash(hash);
          setStep("location_confirmed");
        });
      },
      (err) => {
        if (err.code === 1) {
          // Permission denied — on iOS this means the user tapped "Don't Allow"
          // previously, or Location Services are off for Safari.
          setLocationError(
            "Location permission was denied. To fix this on iPhone:\n" +
            "1. Open Settings → Privacy & Security → Location Services\n" +
            "2. Make sure Location Services is ON\n" +
            "3. Scroll down to Safari Websites → set to \"While Using\"\n" +
            "4. Come back here and tap the button again"
          );
        } else if (err.code === 2) {
          setLocationError("Location unavailable. Make sure GPS is enabled in Settings → Privacy & Security → Location Services.");
        } else {
          setLocationError("Location request timed out. Please make sure you're in an area with GPS signal and try again.");
        }
        setStep("idle");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // Open native camera for photo
  const openPhotoCamera = useCallback(() => {
    photoInputRef.current?.click();
  }, []);

  // Open native camera for video
  const openVideoCamera = useCallback(() => {
    videoInputRef.current?.click();
  }, []);

  // Handle photo captured from native camera
  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStep("analyzing");
      setCapturedMediaType("photo");
      const { dataUrl, width, height } = await compressImageFile(file);
      setCapturedImage(dataUrl);
      captureMutation.mutate({ imageData: dataUrl, mediaType: "photo", w: width, h: height });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to process photo", variant: "destructive" });
      setStep("location_confirmed");
    }

    // Reset input so the same file can be re-selected
    e.target.value = "";
  }, [toast]);

  // Handle video captured from native camera
  const handleVideoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStep("analyzing");
      setCapturedMediaType("video");
      const { dataUrl, width, height } = await extractVideoFrame(file);
      setCapturedImage(dataUrl);

      // Create a local blob URL for video playback in the fullscreen viewer
      const videoBlobUrl = URL.createObjectURL(file);
      setCapturedVideoUrl(videoBlobUrl);

      captureMutation.mutate({ imageData: dataUrl, mediaType: "video", w: width, h: height });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to process video", variant: "destructive" });
      setStep("location_confirmed");
    }

    e.target.value = "";
  }, [toast]);

  // Mutation: send capture to server
  const captureMutation = useMutation({
    mutationFn: async ({ imageData, mediaType, w, h }: { imageData: string; mediaType: string; w: number; h: number }) => {
      const res = await fetch(`${API_BASE}/api/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData,
          uploaderId: activeUserId,
          latitude: location!.lat,
          longitude: location!.lon,
          captureTimestamp: new Date().toISOString(),
          mediaType,
          deviceMetadata: {
            deviceMake: getDeviceMake(),
            deviceModel: getDeviceModel(),
            imageWidth: w,
            imageHeight: h,
            hasGps: true,
            captureMode: "live_camera",
          },
        }),
      });

      if (res.status === 422) {
        const data = await res.json();
        return { ...data, rejected: true } as CaptureResult & { rejected: boolean };
      }

      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("Image too large even after compression. Please try again.");
        }
        let errMsg = "Capture failed";
        try {
          const errJson = await res.json();
          errMsg = errJson.error || errJson.message || errMsg;
        } catch {
          errMsg = `Server error (${res.status})`;
        }
        throw new Error(errMsg);
      }

      return await res.json() as CaptureResult;
    },
    onSuccess: (data: any) => {
      setResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/proofs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Capture Failed", description: err.message, variant: "destructive" });
      setStep("location_confirmed");
    },
  });

  // Reset flow
  const resetCapture = () => {
    setStep("idle");
    setLocation(null);
    setCaptureHash(null);
    setCapturedImage(null);
    if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    setCapturedVideoUrl(null);
    setResult(null);
    setLocationError(null);
    setCapturedMediaType("photo");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hidden native camera inputs — these open the REAL phone camera */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
        data-testid="input-photo-capture"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleVideoCapture}
        data-testid="input-video-capture"
      />

      {/* Step: Idle */}
      {step === "idle" && (
        <div className="px-4 pt-4 space-y-4 flex-1">
          <div>
            <h1 className="text-lg font-bold" data-testid="text-capture-title">Capture Proof</h1>
            <p className="text-xs text-muted-foreground">Live camera only — no uploads, no gallery</p>
          </div>
          <StepIndicator step={step} />
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Step 1: Confirm Location</p>
                  <p className="text-xs text-muted-foreground">GPS coordinates are required before capture</p>
                </div>
              </div>

              {locationError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive whitespace-pre-line">{locationError}</p>
                </div>
              )}

              <Button className="w-full" onClick={requestLocation} data-testid="button-start-capture">
                <Crosshair className="w-4 h-4 mr-2" />
                Enable GPS & Start
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Locating */}
      {step === "locating" && (
        <div className="px-4 pt-4 space-y-4 flex-1">
          <StepIndicator step={step} />
          <Card>
            <CardContent className="p-5 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium">Acquiring GPS signal...</p>
              <p className="text-xs text-muted-foreground">Please wait — high accuracy mode</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Location Confirmed — Take Photo or Video */}
      {step === "location_confirmed" && location && (
        <div className="px-4 pt-4 space-y-3 flex-1">
          <StepIndicator step={step} />
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Location Confirmed</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Latitude</span>
                  <p className="font-mono font-medium tabular-nums" data-testid="text-latitude">{location.lat.toFixed(6)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Longitude</span>
                  <p className="font-mono font-medium tabular-nums" data-testid="text-longitude">{location.lon.toFixed(6)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {captureHash && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Pre-Capture Hash</span>
                </div>
                <CopyableHash value={captureHash} label="Pre-capture hash" truncate={false} testId="text-capture-hash" className="text-muted-foreground" />
              </CardContent>
            </Card>
          )}

          {/* Two buttons: Take Photo / Record Video — each opens the native camera */}
          <div className="space-y-2 pt-1">
            <Button className="w-full h-14 text-base" onClick={openPhotoCamera} data-testid="button-take-photo">
              <Camera className="w-5 h-5 mr-2" />
              Take Photo
            </Button>
            <Button className="w-full h-14 text-base" variant="outline" onClick={openVideoCamera} data-testid="button-record-video">
              <Video className="w-5 h-5 mr-2" />
              Record Video
            </Button>
          </div>
        </div>
      )}

      {/* Step: Analyzing */}
      {step === "analyzing" && (
        <div className="px-4 pt-4 space-y-4 flex-1">
          <StepIndicator step={step} />
          {capturedImage && (
            <div className="rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-48">
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover opacity-60" />
            </div>
          )}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="text-sm font-semibold">Running AI Detection Pipeline...</span>
              </div>
              <div className="space-y-2">
                {["EXIF Metadata Analysis", "Frequency Analysis (DCT)", "PRNU Sensor Fingerprint", "Screen Recapture Detection", "Environmental Consistency"].map((name) => (
                  <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Result */}
      {step === "result" && result && (
        <div className="px-4 pt-4 space-y-3 pb-4">
          <StepIndicator step={step} />

          {capturedImage && (
            <div className="rounded-2xl overflow-hidden bg-black aspect-video">
              <MediaThumbnail
                src={capturedImage}
                alt="Captured proof"
                mediaType={result?.proof?.mediaType || capturedMediaType}
                proofId={result?.proof?.id}
                videoUrl={capturedVideoUrl || undefined}
                className="w-full h-full"
              />
            </div>
          )}

          <Card className={result.detection.authentic ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.detection.authentic ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-bold" data-testid="text-result-status">
                      {result.detection.authentic ? "Authentic — Proof Registered" : "Rejected"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {result.detection.authentic
                        ? "Mined to blockchain"
                        : result.message || "Image did not pass AI detection"}
                    </p>
                  </div>
                </div>
                <div className={`text-2xl font-bold tabular-nums ${result.detection.overallScore >= 70 ? "text-emerald-500" : result.detection.overallScore >= 50 ? "text-amber-500" : "text-red-500"}`}
                  data-testid="text-overall-score">
                  {result.detection.overallScore}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Detection Layers</h3>
              <LayerRow label="EXIF Metadata" layer={result.detection.layers.exifAnalysis} />
              <LayerRow label="Frequency Analysis" layer={result.detection.layers.frequencyAnalysis} />
              <LayerRow label="PRNU Sensor" layer={result.detection.layers.prnuAnalysis} />
              <LayerRow label="Screen Detection" layer={result.detection.layers.screenDetection} />
              <LayerRow label="Environment" layer={result.detection.layers.environmentCheck} />
            </CardContent>
          </Card>

          {result.proof && result.block && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold">Blockchain Record</h3>
                <InfoRow label="Block #" value={`${result.block.index}`} />
                <InfoRowCopyable label="Block Hash" value={result.block.hash} />
                <InfoRowCopyable label="Content Hash" value={result.hashes?.contentHash} />
                <InfoRowCopyable label="IPFS CID" value={result.proof.ipfsCid} />
                <InfoRowCopyable label="Geohash" value={result.proof.geohash} />
              </CardContent>
            </Card>
          )}

          {result.polygonTx && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-violet-600 dark:text-violet-400">Polygon On-Chain</h3>
                <InfoRowCopyable label="Tx Hash" value={result.polygonTx.txHash} />
                <a
                  href={result.polygonTx.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-violet-600 dark:text-violet-400 underline"
                >
                  View on PolygonScan →
                </a>
              </CardContent>
            </Card>
          )}

          <Button className="w-full" onClick={resetCapture} data-testid="button-new-capture">
            <RotateCcw className="w-4 h-4 mr-2" />
            New Capture
          </Button>
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: CaptureStep }) {
  const steps = ["Location", "Camera", "Analyze", "Result"];
  const currentIndex = step === "idle" || step === "locating" ? 0
    : step === "location_confirmed" ? 1
    : step === "analyzing" ? 2 : 3;

  return (
    <div className="flex items-center gap-1.5" data-testid="step-indicator">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5 flex-1">
          <div className={`h-1 flex-1 rounded-full transition-colors ${i <= currentIndex ? "bg-primary" : "bg-muted"}`} />
        </div>
      ))}
    </div>
  );
}

function LayerRow({ label, layer }: { label: string; layer: DetectionLayer }) {
  return (
    <div className="space-y-1" data-testid={`layer-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {layer.passed ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <XCircle className="w-3 h-3 text-red-500" />
          )}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className={`text-xs font-bold tabular-nums ${layer.score >= 70 ? "text-emerald-500" : layer.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
          {layer.score}/100
        </span>
      </div>
      <Progress value={layer.score} className="h-1" />
      <p className="text-[10px] text-muted-foreground leading-relaxed">{layer.details}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-[10px]">{value}</span>
    </div>
  );
}

function InfoRowCopyable({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <CopyableHash value={value} label={label} />
    </div>
  );
}

async function generateHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getDeviceMake(): string {
  const ua = navigator.userAgent;
  if (ua.includes("iPhone") || ua.includes("iPad")) return "Apple";
  if (ua.includes("Samsung")) return "Samsung";
  if (ua.includes("Pixel")) return "Google";
  if (ua.includes("Huawei")) return "Huawei";
  if (ua.includes("Xiaomi")) return "Xiaomi";
  return "Generic";
}

function getDeviceModel(): string {
  const ua = navigator.userAgent;
  const match = ua.match(/\(([^)]+)\)/);
  return match ? match[1].split(";").pop()?.trim() || "Unknown" : "Unknown";
}
