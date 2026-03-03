import { useState } from "react";
import { useUser, useClaimDaily } from "../api/hooks";
import { CoinBalance } from "../components/CoinBalance";
import { StreakBadge } from "../components/StreakBadge";
import { Achievement } from "../components/Achievement";
import { ACHIEVEMENT_TYPES } from "@kazam/shared/constants";
import { hapticImpact, hapticSuccess } from "../lib/haptics";

export function Profile() {
  const { data, isLoading } = useUser();
  const claimDaily = useClaimDaily();

  const user = data?.user as {
    first_name: string;
    username: string | null;
    coins: number;
    total_earned: number;
    total_wagered: number;
    correct_predictions: number;
    total_predictions: number;
    current_streak: number;
    longest_streak: number;
    score: number;
    rank: number | null;
    referral_code: string;
    achievements: string[];
    last_daily_claim_at: string | null;
  } | undefined;

  if (isLoading || !user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-text-muted">⏳ טוען...</div>
      </div>
    );
  }

  const accuracy =
    user.total_predictions > 0
      ? Math.round((user.correct_predictions / user.total_predictions) * 100)
      : 0;

  async function handleClaimDaily() {
    hapticImpact("heavy");
    try {
      await claimDaily.mutateAsync();
      hapticSuccess();
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="flex-1 px-4 pt-4">
      {/* Profile header */}
      <div className="glass-card mb-4 text-center">
        <div className="mb-2 text-4xl">👤</div>
        <h1 className="text-lg font-black">{user.first_name}</h1>
        {user.username && (
          <div className="text-sm text-text-muted">@{user.username}</div>
        )}
        <div className="mt-2 flex items-center justify-center gap-2">
          <CoinBalance amount={user.coins} size="lg" />
          <StreakBadge streak={user.current_streak} />
        </div>
        {user.rank && (
          <div className="mt-1 text-sm text-accent-purple">
            דירוג #{user.rank}
          </div>
        )}
      </div>

      {/* Daily claim */}
      <button
        onClick={handleClaimDaily}
        disabled={claimDaily.isPending}
        className="mb-4 w-full rounded-xl bg-gradient-to-l from-accent-purple to-accent-pink py-3 text-center font-bold text-white transition-all active:scale-95 disabled:opacity-50"
      >
        {claimDaily.isPending
          ? "⏳ אוסף..."
          : claimDaily.isSuccess
            ? `🎁 +${(claimDaily.data as { coins_awarded: number })?.coins_awarded ?? 0} מטבעות!`
            : claimDaily.isError
              ? "⏰ כבר אספת היום"
              : "🎁 אסוף בונוס יומי"}
      </button>

      {/* Stats grid */}
      <h2 className="mb-3 text-base font-bold">📊 סטטיסטיקות</h2>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          { label: "ניחושים", value: `${user.correct_predictions}/${user.total_predictions}`, emoji: "🎯" },
          { label: "דיוק", value: `${accuracy}%`, emoji: "📈" },
          { label: "רצף נוכחי", value: String(user.current_streak), emoji: "🔥" },
          { label: "שיא רצף", value: String(user.longest_streak), emoji: "⭐" },
          { label: "סה\"כ הרוויח", value: user.total_earned.toLocaleString(), emoji: "💰" },
          { label: "סה\"כ הימר", value: user.total_wagered.toLocaleString(), emoji: "🎰" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-white/5 p-3 text-center"
          >
            <div className="text-lg">{stat.emoji}</div>
            <div className="text-sm font-bold">{stat.value}</div>
            <div className="text-[10px] text-text-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <h2 className="mb-3 text-base font-bold">🏅 הישגים</h2>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {ACHIEVEMENT_TYPES.map((type) => (
          <Achievement
            key={type}
            type={type}
            unlocked={user.achievements.includes(type)}
          />
        ))}
      </div>

      {/* Referral */}
      <ReferralSection referralCode={user.referral_code} />
    </div>
  );
}

function ReferralSection({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  const referralLink = `https://t.me/kazam_alerts_bot?start=ref_${referralCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  }

  function handleShare() {
    const shareText = `⚡ בוא לשחק ב-Kazam! נחש איפה ומתי תהיה האזעקה הבאה\n💰 שנינו נקבל 200 מטבעות בונוס!\n\n`;
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
    window.open(telegramShareUrl, "_blank");
  }

  return (
    <div className="glass-card mb-4 text-center">
      <div className="mb-1 text-sm font-bold">🤝 הזמן חברים</div>
      <div className="text-xs text-text-muted">
        שניכם תקבלו 200 מטבעות!
      </div>
      <div className="mt-2 rounded-lg bg-white/10 p-2 font-mono text-xs break-all">
        {referralLink}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-bold transition-all active:scale-95"
        >
          {copied ? "✅ הועתק!" : "📋 העתק לינק"}
        </button>
        <button
          onClick={handleShare}
          className="flex-1 rounded-xl bg-gradient-to-l from-accent-purple to-accent-cyan py-2 text-sm font-bold text-white transition-all active:scale-95"
        >
          📤 שתף בטלגרם
        </button>
      </div>
    </div>
  );
}
