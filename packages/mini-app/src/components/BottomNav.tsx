import { useLocation, useNavigate } from "react-router-dom";
import { hapticSelection } from "../lib/haptics";

const tabs = [
  { path: "/", label: "בית", icon: "🏠" },
  { path: "/leaderboard", label: "דירוג", icon: "🏆" },
  { path: "/profile", label: "פרופיל", icon: "👤" },
  { path: "/history", label: "היסטוריה", icon: "📋" },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-bg-primary/90 backdrop-blur-lg">
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map((tab) => {
          const isActive =
            tab.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.path);

          return (
            <button
              key={tab.path}
              onClick={() => {
                hapticSelection();
                navigate(tab.path);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 transition-all ${
                isActive
                  ? "text-accent-purple"
                  : "text-text-muted"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
