import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/lib/theme";
import MobileLayout from "@/components/MobileLayout";
import Dashboard from "@/pages/Dashboard";
import Capture from "@/pages/Capture";
import Verify from "@/pages/Verify";
import Explorer from "@/pages/Explorer";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  return (
    <MobileLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/capture" component={Capture} />
        <Route path="/verify" component={Verify} />
        <Route path="/explorer" component={Explorer} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </MobileLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Router hook={useHashLocation}>
          <AppRoutes />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
