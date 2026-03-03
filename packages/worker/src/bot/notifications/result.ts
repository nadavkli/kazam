export function formatWinMessage(
  marketQuestion: string,
  optionLabel: string,
  payout: number,
): string {
  return (
    `⚡ *Kazam! ניצחת!*\n\n` +
    `🎯 ${marketQuestion}\n` +
    `✅ תשובה נכונה: ${optionLabel}\n` +
    `💰 +${payout} מטבעות\n\n` +
    `You called it! 🔥`
  );
}

export function formatLossMessage(
  marketQuestion: string,
  correctOptionLabel: string,
): string {
  return (
    `😔 *לא הפעם...*\n\n` +
    `🎯 ${marketQuestion}\n` +
    `❌ התשובה הנכונה: ${correctOptionLabel}\n\n` +
    `נסה שוב! בפעם הבאה תצליח 💪`
  );
}
