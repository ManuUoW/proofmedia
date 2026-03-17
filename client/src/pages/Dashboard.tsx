import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyableHash } from "@/components/CopyableHash";
import { MediaThumbnail } from "@/components/MediaViewer";
import { Shield, Blocks, Users, CheckCircle2, TrendingUp, AlertTriangle, Camera as CameraIcon } from "lucide-react";
import type { Proof } from "@shared/schema";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stats");
      return res.json();
    },
  });

  const { data: proofs, isLoading: proofsLoading } = useQuery<Proof[]>({
    queryKey: ["/api/proofs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/proofs");
      return res.json();
    },
  });

  return (
    <div className="px-4 pt-4 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight" data-testid="text-title">ProofMedia</h1>
          <p className="text-xs text-muted-foreground">Blockchain-verified media authenticity</p>
        </div>
        <div className="flex flex-col gap-1 items-end">
          {stats && (
            <Badge
              variant={stats.chainValid ? "default" : "destructive"}
              className="text-[10px] px-2 py-0.5"
              data-testid="badge-chain-status"
            >
              {stats.chainValid ? "Chain Valid" : "Chain Error"}
            </Badge>
          )}
          {stats?.polygon && (
            <Badge
              variant={stats.polygon.active ? "default" : "outline"}
              className={`text-[10px] px-2 py-0.5 ${stats.polygon.active ? "bg-violet-600 hover:bg-violet-700" : ""}`}
              data-testid="badge-polygon-status"
            >
              {stats.polygon.active ? "Polygon Live" : "Polygon Ready"}
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {statsLoading ? (
          <>
            <Skeleton className="h-[88px] rounded-xl" />
            <Skeleton className="h-[88px] rounded-xl" />
            <Skeleton className="h-[88px] rounded-xl" />
            <Skeleton className="h-[88px] rounded-xl" />
          </>
        ) : stats ? (
          <>
            <StatCard
              icon={<Shield className="w-4 h-4 text-emerald-500" />}
              label="Proofs"
              value={stats.totalProofs}
              testId="stat-proofs"
            />
            <StatCard
              icon={<Blocks className="w-4 h-4 text-blue-500" />}
              label="Blocks"
              value={stats.totalBlocks}
              testId="stat-blocks"
            />
            <StatCard
              icon={<Users className="w-4 h-4 text-violet-500" />}
              label="Verified Users"
              value={`${stats.verifiedUsers}/${stats.totalUsers}`}
              testId="stat-users"
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4 text-amber-500" />}
              label="Avg Score"
              value={`${stats.averageAuthenticityScore}%`}
              testId="stat-avg-score"
            />
          </>
        ) : null}
      </div>

      {/* AI Detection Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">5-Layer AI Detection</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Every capture is analyzed through EXIF metadata, frequency analysis, PRNU sensor fingerprinting, 
            screen recapture detection, and environmental consistency — ensuring only authentic, 
            live camera captures are registered on-chain.
          </p>
        </CardContent>
      </Card>

      {/* Recent Proofs */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Recent Proofs</h2>
        {proofsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-[72px] rounded-xl" />
            <Skeleton className="h-[72px] rounded-xl" />
          </div>
        ) : proofs && proofs.length > 0 ? (
          <div className="space-y-2">
            {proofs.slice(0, 5).map((proof) => (
              <ProofCard key={proof.id} proof={proof} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <CameraIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No proofs yet. Capture your first proof.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string | number; testId: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3.5" data-testid={testId}>
        <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-[11px] text-muted-foreground font-medium">{label}</span></div>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ProofCard({ proof }: { proof: Proof }) {
  const date = new Date(proof.timestamp);
  const timeAgo = getTimeAgo(date);

  return (
    <Card className="overflow-hidden" data-testid={`card-proof-${proof.id}`}>
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          {proof.thumbnail ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
              <MediaThumbnail src={proof.thumbnail} alt="" mediaType={proof.mediaType || "photo"} proofId={proof.id} className="w-full h-full" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <CameraIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              {proof.authenticityScore >= 70 ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <span className="text-xs font-medium truncate">
                {proof.captureMode === "live_camera" ? "Live Capture" : "Upload"} — Block #{proof.blockIndex}
              </span>
            </div>
            <CopyableHash
              value={proof.contentHash}
              label="Content hash"
              testId={`hash-proof-${proof.id}`}
              className="text-muted-foreground"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground">{proof.geohash.slice(0, 5)}</span>
            </div>
          </div>
          <div className="shrink-0">
            <ScoreBadge score={proof.authenticityScore} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
    : score >= 60 ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
    : "text-red-500 bg-red-500/10 border-red-500/20";

  return (
    <div className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border ${color}`}>
      <span className="text-lg font-bold tabular-nums leading-none">{score}</span>
      <span className="text-[8px] font-medium uppercase tracking-wider mt-0.5">Score</span>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
