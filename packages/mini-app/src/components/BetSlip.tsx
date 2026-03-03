import { useState } from "react";
import { hapticImpact, hapticSuccess, hapticError } from "../lib/haptics";
import { usePlaceBet } from "../api/hooks";

interface BetSlipProps {
  marketId: number;
  optionId: number;
  optionLabel: string;
  odds: number;
  userBalance: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const PRESETS = [10, 25, 50, 100, 250, 500];

export function BetSlip({
  marketId,
  optionId,
  optionLabel,
  odds,
  userBalance,
  onSuccess,
  onCancel,
}: BetSlipProps) {
  const [amount, setAmount] = useState(0);
  const placeBet = usePlaceBet();

  const potentialPayout = Math.floor(amount * odds);
  const canBet = amount >= 10 && amount <= 500 && amount <= userBalance;

  async function handleConfirm() {
    if (!canBet) return;
    hapticImpact("heavy");

    try {
      await placeBet.mutateAsync({ marketId, optionId, amount });
      hapticSuccess();
      onSuccess();
    } catch {
      hapticError();
    }
  }

  return (
    <div className="animate-slide-up glass-card mx-4 mb-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={onCancel}
          className="text-sm text-text-muted"
        >
          ✕ ביטול
        </button>
        <h3 className="text-sm font-bold">🎯 הימור על: {optionLabel}</h3>
      </div>

      {/* Amount presets */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              hapticImpact("light");
              setAmount(preset);
            }}
            disabled={preset > userBalance}
            className={`rounded-lg py-2 text-sm font-bold transition-all ${
              amount === preset
                ? "bg-accent-purple text-white"
                : preset > userBalance
                  ? "bg-white/5 text-text-muted/50"
                  : "bg-white/10 text-white active:scale-95"
            }`}
          >
            {preset} 🪙
          </button>
        ))}
      </div>

      {/* Payout preview */}
      {amount > 0 && (
        <div className="mb-3 rounded-lg bg-white/5 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">סכום</span>
            <span className="font-bold">{amount} 🪙</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">מכפיל</span>
            <span className="font-bold text-accent-cyan">x{odds.toFixed(1)}</span>
          </div>
          <div className="mt-1 border-t border-white/10 pt-1">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">רווח פוטנציאלי</span>
              <span className="font-bold text-accent-green">
                ~{potentialPayout} 🪙
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {placeBet.isError && (
        <div className="mb-3 rounded-lg bg-accent-red/10 p-2 text-center text-xs text-accent-red">
          {(placeBet.error as Error).message}
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={!canBet || placeBet.isPending}
        className={`w-full rounded-xl py-3 text-center font-bold transition-all ${
          canBet && !placeBet.isPending
            ? "bg-accent-purple text-white active:scale-95"
            : "bg-white/10 text-text-muted"
        }`}
      >
        {placeBet.isPending
          ? "⏳ מעבד..."
          : canBet
            ? `⚡ הימור ${amount} מטבעות`
            : "בחר סכום"}
      </button>
    </div>
  );
}
