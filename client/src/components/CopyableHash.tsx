import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CopyableHashProps {
  value: string;
  label?: string;
  truncate?: boolean;
  className?: string;
  testId?: string;
}

export function CopyableHash({ value, label, truncate = true, className = "", testId }: CopyableHashProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied", description: label ? `${label} copied to clipboard` : "Hash copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.left = "-999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      toast({ title: "Copied", description: label ? `${label} copied to clipboard` : "Hash copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value, label, toast]);

  const displayValue = truncate && value.length > 24
    ? `${value.slice(0, 12)}...${value.slice(-10)}`
    : value;

  return (
    <button
      onClick={handleCopy}
      className={`group flex items-center gap-1.5 text-left font-mono text-[10px] break-all rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-primary/10 active:bg-primary/20 ${className}`}
      data-testid={testId}
      title="Tap to copy full hash"
    >
      <span className="flex-1 min-w-0">{displayValue}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      )}
    </button>
  );
}
