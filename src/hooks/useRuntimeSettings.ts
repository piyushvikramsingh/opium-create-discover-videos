import { useMemo } from "react";
import { useUserSettings } from "@/hooks/useData";

type ThemePreference = "light" | "dark" | "system";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

export function useRuntimeSettings() {
  const { data: userSettings } = useUserSettings();

  return useMemo(() => {
    const app = asRecord(userSettings?.app);
    const content = asRecord(userSettings?.content);
    const accessibility = asRecord(userSettings?.accessibility);

    const hasDarkModePreference = typeof app.dark_mode === "boolean";
    const themePreference: ThemePreference = hasDarkModePreference
      ? app.dark_mode
        ? "dark"
        : "light"
      : "system";

    return {
      themePreference,
      autoplayVideos: app.autoplay_videos !== false,
      autoplaySound: !!app.autoplay_sound,
      loopVideos: app.loop_videos !== false,
      hideLikeCount: !!content.hide_like_count,
      hideViewCount: !!content.hide_view_count,
      reduceMotion: !!accessibility.reduce_motion,
    };
  }, [userSettings]);
}