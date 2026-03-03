import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "@kazam/db/queries";
import { registerUser } from "../../services/user.js";
import { REFERRAL_BONUS } from "@kazam/shared/constants";

export async function handleRefer(ctx: BotContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  let user = await getUserByTelegramId(ctx.db, from.id);
  if (!user) {
    user = await registerUser(ctx.db, {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    });
  }

  const botUsername = ctx.me.username;
  const referralLink = `https://t.me/${botUsername}?start=ref_${user.referral_code}`;

  await ctx.reply(
    `🤝 *הזמן חברים ל-Kazam!*\n\n` +
      `שלח את הלינק הזה לחברים:\n` +
      `\`${referralLink}\`\n\n` +
      `💰 כל אחד מקבל *${REFERRAL_BONUS} מטבעות* בונוס!\n` +
      `📋 קוד ההפניה שלך: \`${user.referral_code}\``,
    { parse_mode: "Markdown" },
  );
}
