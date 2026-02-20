import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View, Image, ActivityIndicator } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type VideoItem = {
  id: string;
  description: string | null;
  thumbnail_url: string | null;
  profiles?: {
    username?: string | null;
  } | null;
};

export default function HomeScreen() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVideos = async () => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("videos")
        .select("id, description, thumbnail_url, profiles:profiles!videos_user_id_fkey(username)")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.warn("Home fetch error", error.message);
        setVideos([]);
      } else {
        setVideos((data as VideoItem[]) || []);
      }
      setLoading(false);
    };

    loadVideos();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Supabase not configured</Text>
        <Text style={styles.subtitle}>Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!videos.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No videos yet</Text>
        <Text style={styles.subtitle}>Upload from web Create tab and they will appear here.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={videos}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.placeholderText}>No Thumbnail</Text>
            </View>
          )}
          <Text style={styles.cardTitle}>@{item.profiles?.username || "user"}</Text>
          <Text style={styles.cardDesc} numberOfLines={2}>
            {item.description || "No description"}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  list: {
    padding: 12,
    backgroundColor: "#0f172a",
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 10,
  },
  thumb: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f2937",
  },
  placeholderText: {
    color: "#9ca3af",
  },
  cardTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 4,
  },
  cardDesc: {
    color: "#d1d5db",
    fontSize: 13,
  },
});
