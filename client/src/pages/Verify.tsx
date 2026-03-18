import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CopyableHash } from "@/components/CopyableHash";
import { MediaThumbnail } from "@/components/MediaViewer";
import {
  Search, CheckCircle2, XCircle, Shield, MapPin, Blocks,
  Clock, Hash, Fingerprint, Loader2, Image as ImageIcon, Download
} from "lucide-react";

interface BitcoinVerification {
  verified: boolean;
  status: "confirmed" | "pending" | "not_found";
  bitcoinBlock?: number;
  bitcoinTimestamp?: number;
  message: string;
}

interface VerifyResult {
  verified: boolean;
  contentHash: string;
  proof: any;
  locationMatch: any;
  verification: any;
  bitcoin?: BitcoinVerification | null;
}

export default function Verify() {
  const [hashInput, setHashInput] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async (contentHash: string) => {
      const res = await apiRequest("POST", "/api/verify", { contentHash });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Verification failed");
      }
      return await res.json() as VerifyResult;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleVerify = () => {
    if (!hashInput.trim()) {
      toast({ title: "Enter a hash", description: "Paste a content hash to verify", variant: "destructive" });
      return;
    }
    verifyMutation.mutate(hashInput.trim());
  };

  // Allow paste + auto-submit
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").trim();
    if (text.length >= 32) {
      // Auto verify on paste of a full hash
      setTimeout(() => {
        setHashInput(text);
        verifyMutation.mutate(text);
      }, 100);
    }
  };

  return (
    <div className="px-4 pt-4 space-y-4 pb-24">
      <div>
        <h1 className="text-lg font-bold" data-testid="text-verify-title">Verify Proof</h1>
        <p className="text-xs text-muted-foreground">Check authenticity by content hash — no file uploads</p>
      </div>

      {/* Search input */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">Content Hash</span>
          </div>
          <Input
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="Paste SHA-256 content hash..."
            className="font-mono text-xs"
            data-testid="input-hash"
          />
          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={verifyMutation.isPending}
            data-testid="button-verify"
          >
            {verifyMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Verify
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Status banner */}
          <Card className={result.verified ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {result.verified ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-500 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-bold" data-testid="text-verify-result">
                    {result.verified ? "Authenticated" : "Not Found"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.verified
                      ? "This content has a valid proof anchored to Bitcoin"
                      : "No matching proof found"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {result.verified && result.proof && (
            <>
              {/* Captured image preview */}
              {result.proof.thumbnail && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{result.proof.mediaType === "video" ? "Captured Video" : "Captured Image"}</span>
                    </div>
                    <div className="rounded-xl overflow-hidden bg-black aspect-video">
                      <MediaThumbnail
                        src={result.proof.thumbnail}
                        alt="Verified proof"
                        mediaType={result.proof.mediaType || "photo"}
                        proofId={result.proof.id}
                        className="w-full h-full"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Authenticity Score */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Authenticity Score</span>
                    </div>
                    <span className={`text-xl font-bold tabular-nums ${
                      result.proof.authenticityScore >= 70 ? "text-emerald-500"
                        : result.proof.authenticityScore >= 50 ? "text-amber-500"
                        : "text-red-500"
                    }`} data-testid="text-auth-score">
                      {result.proof.authenticityScore}/100
                    </span>
                  </div>
                  <Progress value={result.proof.authenticityScore} className="h-2" />

                  {/* Detection layers */}
                  {result.proof.detectionLayers && (
                    <div className="space-y-2 pt-2">
                      {Object.entries(JSON.parse(result.proof.detectionLayers) as Record<string, { score: number; details: string; passed: boolean }>).map(([key, layer]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            {layer.passed ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-500" />
                            )}
                            <span className="text-muted-foreground">{formatLayerName(key)}</span>
                          </div>
                          <span className="font-medium tabular-nums">{layer.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bitcoin Timestamp Status */}
              {result.bitcoin && (
                <Card className="border-orange-500/30 bg-orange-500/5">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">₿</span>
                      <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400">Bitcoin Timestamp</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{result.bitcoin.message}</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${result.bitcoin.status === "confirmed" ? "bg-green-500" : result.bitcoin.status === "pending" ? "bg-orange-400 animate-pulse" : "bg-muted"}`} />
                      <span className="text-[10px] font-medium">
                        {result.bitcoin.status === "confirmed"
                          ? `Confirmed on Bitcoin block #${result.bitcoin.bitcoinBlock}`
                          : result.bitcoin.status === "pending"
                          ? "Pending Bitcoin confirmation (1-4 hours)"
                          : "Not timestamped"}
                      </span>
                    </div>
                    {result.bitcoin.status === "confirmed" && result.bitcoin.bitcoinTimestamp && (
                      <p className="text-[10px] text-muted-foreground">
                        Bitcoin block time: {new Date(result.bitcoin.bitcoinTimestamp * 1000).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Proof details with copyable hashes */}
              <Card>
                <CardContent className="p-4 space-y-2.5">
                  <h3 className="text-sm font-semibold mb-2">Proof Details</h3>
                  <DetailRow icon={<Blocks className="w-3.5 h-3.5" />} label="Block" value={`#${result.proof.blockIndex}`} />
                  <DetailRowCopyable icon={<Hash className="w-3.5 h-3.5" />} label="Block Hash" value={result.proof.blockHash} />
                  <DetailRowCopyable icon={<Fingerprint className="w-3.5 h-3.5" />} label="Content Hash" value={result.proof.contentHash} />
                  <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={`${result.proof.latitude}, ${result.proof.longitude}`} />
                  <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Timestamp" value={new Date(result.proof.timestamp).toLocaleString()} />
                  <DetailRow icon={<Shield className="w-3.5 h-3.5" />} label="Capture Mode" value={result.proof.captureMode === "live_camera" ? "Live Camera" : result.proof.captureMode} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Hint for demo */}
      {!result && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              Tip: Tap any hash in the Dashboard or Explorer to copy it, then paste here to verify.
              Only hash-based verification is supported — no file uploads allowed to prevent spoofing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs">{value}</p>
      </div>
    </div>
  );
}

function DetailRowCopyable({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <CopyableHash value={value} label={label} />
      </div>
    </div>
  );
}

function formatLayerName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
