import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { CopyableHash } from "@/components/CopyableHash";
import {
  User, Shield, Wallet, FileCheck, Award, Moon, Sun,
  CheckCircle2, Loader2, AlertCircle, Camera as CameraIcon
} from "lucide-react";
import type { User as UserType, Proof } from "@shared/schema";

export default function Profile() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // For demo, active user
  const activeUserId = "usr_001";

  const { data: user, isLoading: userLoading } = useQuery<UserType>({
    queryKey: ["/api/users", activeUserId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${activeUserId}`);
      return res.json();
    },
  });

  const { data: userProofs, isLoading: proofsLoading } = useQuery<Proof[]>({
    queryKey: ["/api/proofs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/proofs");
      const all = await res.json();
      return (all as Proof[]).filter((p: Proof) => p.uploaderId === activeUserId);
    },
  });

  // KYC form state
  const [showKycForm, setShowKycForm] = useState(false);
  const [kycDocType, setKycDocType] = useState("");
  const [kycDocNumber, setKycDocNumber] = useState("");

  const kycMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/users/${activeUserId}/kyc`, {
        docType: kycDocType,
        docNumber: kycDocNumber,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "KYC Verified", description: "Your identity has been confirmed. SBT minted." });
      queryClient.invalidateQueries({ queryKey: ["/api/users", activeUserId] });
      setShowKycForm(false);
    },
    onError: (err: Error) => {
      toast({ title: "KYC Failed", description: err.message, variant: "destructive" });
    },
  });

  // Registration form
  const [showRegForm, setShowRegForm] = useState(false);
  const [regWallet, setRegWallet] = useState("");
  const [regName, setRegName] = useState("");

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users/register", {
        walletAddress: regWallet,
        displayName: regName,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Registered", description: `Welcome, ${data.displayName}` });
      setShowRegForm(false);
    },
    onError: (err: Error) => {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    },
  });

  if (userLoading) {
    return (
      <div className="px-4 pt-4 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold" data-testid="text-profile-title">Profile</h1>
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
          data-testid="button-toggle-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {user ? (
        <>
          {/* User card */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" data-testid="text-user-name">{user.displayName}</p>
                  <CopyableHash
                    value={user.walletAddress}
                    label="Wallet address"
                    testId="text-wallet"
                    className="text-muted-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">KYC Status</span>
                  </div>
                  <Badge
                    variant={user.kycStatus === "verified" ? "default" : user.kycStatus === "pending" ? "secondary" : "destructive"}
                    className="text-[10px]"
                    data-testid="badge-kyc-status"
                  >
                    {user.kycStatus === "verified" ? "Verified" : user.kycStatus === "pending" ? "Pending" : "Rejected"}
                  </Badge>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Award className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-[10px] text-muted-foreground">SBT</span>
                  </div>
                  <p className="text-xs font-mono font-medium" data-testid="text-sbt-id">
                    {user.soulboundTokenId || "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KYC section */}
          {user.kycStatus !== "verified" && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold">KYC Required</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Complete identity verification to capture proofs and receive your Soulbound Token.
                </p>

                {showKycForm ? (
                  <div className="space-y-2">
                    <Select value={kycDocType} onValueChange={setKycDocType}>
                      <SelectTrigger className="text-xs" data-testid="select-doc-type">
                        <SelectValue placeholder="Document type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="national_id">National ID</SelectItem>
                        <SelectItem value="drivers_license">Driver's License</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={kycDocNumber}
                      onChange={(e) => setKycDocNumber(e.target.value)}
                      placeholder="Document number"
                      className="text-xs"
                      data-testid="input-doc-number"
                    />
                    <Button
                      className="w-full"
                      onClick={() => kycMutation.mutate()}
                      disabled={!kycDocType || !kycDocNumber || kycMutation.isPending}
                      data-testid="button-submit-kyc"
                    >
                      {kycMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
                      Verify Identity
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setShowKycForm(true)} data-testid="button-start-kyc">
                    Start KYC
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* User's proofs */}
          <div>
            <h2 className="text-sm font-semibold mb-2">My Proofs</h2>
            {proofsLoading ? (
              <Skeleton className="h-[60px] rounded-xl" />
            ) : userProofs && userProofs.length > 0 ? (
              <div className="space-y-2">
                {userProofs.map((proof) => (
                  <Card key={proof.id} data-testid={`card-my-proof-${proof.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail */}
                        {proof.thumbnail ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                            <img src={proof.thumbnail} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                            <CameraIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-xs font-medium">Score: {proof.authenticityScore} · Block #{proof.blockIndex}</span>
                          </div>
                          <CopyableHash
                            value={proof.contentHash}
                            label="Content hash"
                            testId={`hash-my-proof-${proof.id}`}
                            className="text-muted-foreground"
                          />
                        </div>
                        <Badge variant="outline" className="text-[8px] shrink-0">{proof.captureMode === "live_camera" ? "Live" : "Upload"}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">No proofs yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        /* Registration */
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Register Account</p>
                <p className="text-xs text-muted-foreground">Connect your wallet to get started</p>
              </div>
            </div>
            <Input
              value={regWallet}
              onChange={(e) => setRegWallet(e.target.value)}
              placeholder="Wallet address (0x...)"
              className="font-mono text-xs"
              data-testid="input-wallet"
            />
            <Input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="Display name"
              className="text-xs"
              data-testid="input-display-name"
            />
            <Button
              className="w-full"
              onClick={() => registerMutation.mutate()}
              disabled={!regWallet || !regName || registerMutation.isPending}
              data-testid="button-register"
            >
              {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <User className="w-4 h-4 mr-2" />}
              Register
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
