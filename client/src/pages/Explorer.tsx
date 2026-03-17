import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyableHash } from "@/components/CopyableHash";
import { Blocks, ChevronRight, Shield, Link2 } from "lucide-react";
import { useState } from "react";
import type { Block, Proof } from "@shared/schema";

export default function Explorer() {
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);

  const { data: blocks, isLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/blocks");
      return res.json();
    },
  });

  const { data: chainStatus } = useQuery({
    queryKey: ["/api/chain/validate"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/chain/validate");
      return res.json();
    },
  });

  const { data: blockDetail } = useQuery({
    queryKey: ["/api/blocks", selectedBlock],
    queryFn: async () => {
      if (selectedBlock === null) return null;
      const res = await apiRequest("GET", `/api/blocks/${selectedBlock}`);
      return res.json();
    },
    enabled: selectedBlock !== null,
  });

  return (
    <div className="px-4 pt-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" data-testid="text-explorer-title">Block Explorer</h1>
          <p className="text-xs text-muted-foreground">Browse the ProofMedia chain</p>
        </div>
        {chainStatus && (
          <Badge
            variant={chainStatus.valid ? "default" : "destructive"}
            className="text-[10px]"
            data-testid="badge-chain-valid"
          >
            {chainStatus.valid ? "Valid Chain" : "Invalid"}
          </Badge>
        )}
      </div>

      {/* Block detail */}
      {selectedBlock !== null && blockDetail && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Block #{blockDetail.index}</h3>
              <button
                onClick={() => setSelectedBlock(null)}
                className="text-xs text-primary"
                data-testid="button-close-detail"
              >
                Close
              </button>
            </div>
            <div className="space-y-2">
              <MiniRow label="Hash">
                <CopyableHash value={blockDetail.hash} label="Block hash" />
              </MiniRow>
              <MiniRow label="Prev Hash">
                <CopyableHash value={blockDetail.previousHash} label="Previous hash" />
              </MiniRow>
              <MiniRow label="Merkle Root">
                <CopyableHash value={blockDetail.merkleRoot} label="Merkle root" />
              </MiniRow>
              <MiniRow label="Nonce">
                <span className="text-[10px]">{blockDetail.nonce}</span>
              </MiniRow>
              <MiniRow label="Difficulty">
                <span className="text-[10px]">{blockDetail.difficulty}</span>
              </MiniRow>
              <MiniRow label="Timestamp">
                <span className="text-[10px]">{new Date(blockDetail.timestamp).toLocaleString()}</span>
              </MiniRow>
            </div>

            {blockDetail.proofs && blockDetail.proofs.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Proofs in block:</p>
                {blockDetail.proofs.map((p: Proof) => (
                  <div key={p.id} className="p-2.5 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <CopyableHash
                          value={p.contentHash}
                          label="Content hash"
                          testId={`hash-explorer-${p.id}`}
                          className="text-muted-foreground"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5">
                      <span>Score: {p.authenticityScore}</span>
                      <span>·</span>
                      <span>{p.geohash.slice(0, 5)}</span>
                      {p.thumbnail && (
                        <>
                          <span>·</span>
                          <span className="text-primary">Has image</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Blocks list */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-[80px] rounded-xl" />
          <Skeleton className="h-[80px] rounded-xl" />
          <Skeleton className="h-[80px] rounded-xl" />
        </div>
      ) : blocks && blocks.length > 0 ? (
        <div className="space-y-2">
          {blocks.map((block, i) => {
            const isGenesis = block.index === 0;
            const proofCount = isGenesis ? 0 : JSON.parse(block.proofIds).length;
            return (
              <Card
                key={block.index}
                className={`cursor-pointer transition-colors hover:border-primary/30 ${selectedBlock === block.index ? "border-primary/50" : ""}`}
                onClick={() => setSelectedBlock(block.index)}
                data-testid={`card-block-${block.index}`}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isGenesis ? "bg-violet-500/10" : "bg-primary/10"}`}>
                      <Blocks className={`w-4 h-4 ${isGenesis ? "text-violet-500" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Block #{block.index}</span>
                        {isGenesis && <Badge variant="outline" className="text-[8px] px-1.5 py-0">Genesis</Badge>}
                      </div>
                      <CopyableHash
                        value={block.hash}
                        label="Block hash"
                        testId={`hash-block-${block.index}`}
                        className="text-muted-foreground mt-0.5"
                      />
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>Nonce: {block.nonce}</span>
                        {!isGenesis && <span>{proofCount} proof{proofCount !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    {/* Chain link indicator */}
                    {i < blocks.length - 1 && (
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <Blocks className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No blocks in chain</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0 pt-0.5">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
