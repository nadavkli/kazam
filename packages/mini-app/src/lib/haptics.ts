import { getWebApp } from "./telegram";

export function hapticImpact(style: "light" | "medium" | "heavy" = "medium") {
  try {
    getWebApp()?.HapticFeedback.impactOccurred(style);
  } catch {
    // Haptics not available
  }
}

export function hapticSuccess() {
  try {
    getWebApp()?.HapticFeedback.notificationOccurred("success");
  } catch {
    // Haptics not available
  }
}

export function hapticError() {
  try {
    getWebApp()?.HapticFeedback.notificationOccurred("error");
  } catch {
    // Haptics not available
  }
}

export function hapticSelection() {
  try {
    getWebApp()?.HapticFeedback.selectionChanged();
  } catch {
    // Haptics not available
  }
}
