import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function ProfileScreen() {
  const [videoCount, setVideoCount] = useState<number>(0);

  useEffect(() => {
    const loadCount = async () => {
      if (!isSupabaseConfigured) return;

      const { count } = await supabase
        .from("videos")
        .select("id", { count: "exact", head: true });

      setVideoCount(count || 0);
    };

    loadCount();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Shared data with web app</Text>
      <Text style={styles.count}>Total videos in backend: {videoCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    color: "#9ca3af",
  },
  count: {
    marginTop: 12,
    color: "#d1d5db",
  },
});
