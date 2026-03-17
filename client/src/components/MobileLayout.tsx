import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { LayoutDashboard, Camera, Search, Blocks, User } from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

const tabs = [
  { path: "/", label: "Home", icon: LayoutDashboard },
  { path: "/capture", label: "Capture", icon: Camera },
  { path: "/verify", label: "Verify", icon: Search },
  { path: "/explorer", label: "Chain", icon: Blocks },
  { path: "/profile", label: "Profile", icon: User },
];

export default function MobileLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();

  return (
    <div className="flex flex-col h-[100dvh] max-w-[428px] mx-auto bg-background text-foreground overflow-hidden relative">
      {/* Status bar spacer */}
      <div className="h-[env(safe-area-inset-top,0px)] bg-background shrink-0" />
      
      {/* Main content */}
      <main className="flex-1 overflow-y-auto overscroll-y-contain pb-2 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
        <div className="px-4 py-3 shrink-0">
          <PerplexityAttribution />
        </div>
      </main>

      {/* Bottom tab bar */}
      <nav className="shrink-0 border-t border-border bg-card/95 backdrop-blur-lg" data-testid="bottom-nav">
        <div className="flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => {
            const active = location === tab.path;
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                data-testid={`nav-${tab.label.toLowerCase()}`}
                onClick={() => setLocation(tab.path)}
                className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-xl transition-all ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </nav>
    </div>
  );
}
