import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "./pages/Home";
import { Market } from "./pages/Market";
import { Leaderboard } from "./pages/Leaderboard";
import { Profile } from "./pages/Profile";
import { History } from "./pages/History";
import { BottomNav } from "./components/BottomNav";
import { initTelegram } from "./lib/telegram";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 2,
    },
  },
});

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initTelegram();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-2xl font-bold text-accent-purple">⚡ Kazam</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col bg-bg-primary pb-20">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/market/:id" element={<Market />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<History />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
