import { useEffect, useState, useRef } from "react";

interface CoinBalanceProps {
  amount: number;
  size?: "sm" | "md" | "lg";
}

export function CoinBalance({ amount, size = "md" }: CoinBalanceProps) {
  const [displayAmount, setDisplayAmount] = useState(amount);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevAmount = useRef(amount);

  useEffect(() => {
    if (amount !== prevAmount.current) {
      setIsAnimating(true);
      const diff = amount - prevAmount.current;
      const steps = Math.min(Math.abs(diff), 20);
      const stepSize = diff / steps;
      let current = prevAmount.current;
      let step = 0;

      const interval = setInterval(() => {
        step++;
        current += stepSize;
        setDisplayAmount(Math.round(current));
        if (step >= steps) {
          clearInterval(interval);
          setDisplayAmount(amount);
          setIsAnimating(false);
        }
      }, 30);

      prevAmount.current = amount;
      return () => clearInterval(interval);
    }
  }, [amount]);

  const sizeClasses = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
  };

  return (
    <span
      className={`font-bold ${sizeClasses[size]} ${
        isAnimating ? "animate-coin-tick" : ""
      }`}
    >
      {displayAmount.toLocaleString()} 🪙
    </span>
  );
}
