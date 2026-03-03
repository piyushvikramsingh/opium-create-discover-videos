export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friends: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          community_type: string | null
          created_by: string | null
          created_at: string
          description: string | null
          disappearing_ttl_seconds: number | null
          id: string
          is_community: boolean
          is_paid: boolean
          is_public: boolean
          max_participants: number | null
          member_count: number
          membership_price_cents: number | null
          name: string | null
          type: string
          updated_at: string
          vanish_mode: boolean
        }
        Insert: {
          avatar_url?: string | null
          community_type?: string | null
          created_by?: string | null
          created_at?: string
          description?: string | null
          disappearing_ttl_seconds?: number | null
          id?: string
          is_community?: boolean
          is_paid?: boolean
          is_public?: boolean
          max_participants?: number | null
          member_count?: number
          membership_price_cents?: number | null
          name?: string | null
          type?: string
          updated_at?: string
          vanish_mode?: boolean
        }
        Update: {
          avatar_url?: string | null
          community_type?: string | null
          created_by?: string | null
          created_at?: string
          description?: string | null
          disappearing_ttl_seconds?: number | null
          id?: string
          is_community?: boolean
          is_paid?: boolean
          is_public?: boolean
          max_participants?: number | null
          member_count?: number
          membership_price_cents?: number | null
          name?: string | null
          type?: string
          updated_at?: string
          vanish_mode?: boolean
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_vanish: boolean
          is_snap: boolean
          media_type: string | null
          media_url: string | null
          sender_id: string
          snap_duration: number | null
          viewed: boolean
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_vanish?: boolean
          is_snap?: boolean
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          snap_duration?: number | null
          viewed?: boolean
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_vanish?: boolean
          is_snap?: boolean
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          snap_duration?: number | null
          viewed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          audience: string
          background_color: string | null
          caption: string | null
          created_at: string
          duration: number
          expires_at: string
          id: string
          media_type: string
          media_url: string
          thumbnail_url: string | null
          user_id: string
          view_count: number
        }
        Insert: {
          audience?: string
          background_color?: string | null
          caption?: string | null
          created_at?: string
          duration?: number
          expires_at?: string
          id?: string
          media_type?: string
          media_url: string
          thumbnail_url?: string | null
          user_id: string
          view_count?: number
        }
        Update: {
          audience?: string
          background_color?: string | null
          caption?: string | null
          created_at?: string
          duration?: number
          expires_at?: string
          id?: string
          media_type?: string
          media_url?: string
          thumbnail_url?: string | null
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      story_replies: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_replies_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_items: {
        Row: {
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          media_type: string
          media_url: string
          sort_order: number
          video_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type?: string
          media_url: string
          sort_order?: number
          video_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
          video_id?: string
          width?: number | null
        }
        Relationships: []
      }
      chat_streaks: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_interaction_at: string
          longest_streak: number
          streak_count: number
          user_a: string
          user_b: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_interaction_at?: string
          longest_streak?: number
          streak_count?: number
          user_a: string
          user_b: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_interaction_at?: string
          longest_streak?: number
          streak_count?: number
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          conversation_id: string
          id: string
          is_paid: boolean
          joined_at: string
          role: string
          subscription_expires_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_paid?: boolean
          joined_at?: string
          role?: string
          subscription_expires_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_paid?: boolean
          joined_at?: string
          role?: string
          subscription_expires_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      creator_auto_reply: {
        Row: {
          active_hours_end: string | null
          active_hours_start: string | null
          created_at: string
          delay_seconds: number
          enabled: boolean
          id: string
          message: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          message?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_hours_end?: string | null
          active_hours_start?: string | null
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          message?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disappearing_mode: {
        Row: {
          conversation_id: string
          duration_hours: number
          enabled: boolean
          enabled_at: string
          enabled_by: string
          id: string
        }
        Insert: {
          conversation_id: string
          duration_hours?: number
          enabled?: boolean
          enabled_at?: string
          enabled_by: string
          id?: string
        }
        Update: {
          conversation_id?: string
          duration_hours?: number
          enabled?: boolean
          enabled_at?: string
          enabled_by?: string
          id?: string
        }
        Relationships: []
      }
      group_admins: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          message_id: string
          pinned_by: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          message_id: string
          pinned_by: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          message_id?: string
          pinned_by?: string
        }
        Relationships: []
      }
      screenshot_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      sounds: {
        Row: {
          artist: string | null
          audio_url: string
          cover_url: string | null
          created_at: string
          duration_ms: number
          genre: string | null
          id: string
          is_original: boolean
          is_trending: boolean
          original_video_id: string | null
          title: string
          use_count: number
        }
        Insert: {
          artist?: string | null
          audio_url: string
          cover_url?: string | null
          created_at?: string
          duration_ms?: number
          genre?: string | null
          id?: string
          is_original?: boolean
          is_trending?: boolean
          original_video_id?: string | null
          title: string
          use_count?: number
        }
        Update: {
          artist?: string | null
          audio_url?: string
          cover_url?: string | null
          created_at?: string
          duration_ms?: number
          genre?: string | null
          id?: string
          is_original?: boolean
          is_trending?: boolean
          original_video_id?: string | null
          title?: string
          use_count?: number
        }
        Relationships: []
      }
      sticker_packs: {
        Row: {
          cover_url: string | null
          created_at: string
          creator_id: string | null
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          keywords: string[] | null
          pack_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          pack_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          pack_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      story_emoji_slider_votes: {
        Row: {
          created_at: string
          id: string
          sticker_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          sticker_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          sticker_id?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      story_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          sticker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          sticker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          sticker_id?: string
          user_id?: string
        }
        Relationships: []
      }
      story_question_responses: {
        Row: {
          created_at: string
          id: string
          response_text: string
          sticker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          response_text: string
          sticker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          response_text?: string
          sticker_id?: string
          user_id?: string
        }
        Relationships: []
      }
      story_quiz_answers: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          selected_index: number
          sticker_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          selected_index: number
          sticker_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          selected_index?: number
          sticker_id?: string
          user_id?: string
        }
        Relationships: []
      }
      story_stickers: {
        Row: {
          created_at: string
          id: string
          payload: Json
          position_x: number
          position_y: number
          rotation: number
          scale: number
          sticker_type: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          position_x?: number
          position_y?: number
          rotation?: number
          scale?: number
          sticker_type: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          position_x?: number
          position_y?: number
          rotation?: number
          scale?: number
          sticker_type?: string
          story_id?: string
        }
        Relationships: []
      }
      video_captions: {
        Row: {
          caption_url: string | null
          created_at: string
          id: string
          language: string
          segments: Json
          source: string
          status: string
          video_id: string
        }
        Insert: {
          caption_url?: string | null
          created_at?: string
          id?: string
          language?: string
          segments?: Json
          source?: string
          status?: string
          video_id: string
        }
        Update: {
          caption_url?: string | null
          created_at?: string
          id?: string
          language?: string
          segments?: Json
          source?: string
          status?: string
          video_id?: string
        }
        Relationships: []
      }
      video_remixes: {
        Row: {
          clip_end_ms: number | null
          clip_start_ms: number | null
          created_at: string
          id: string
          original_video_id: string
          remix_type: string
          remix_video_id: string
        }
        Insert: {
          clip_end_ms?: number | null
          clip_start_ms?: number | null
          created_at?: string
          id?: string
          original_video_id: string
          remix_type: string
          remix_video_id: string
        }
        Update: {
          clip_end_ms?: number | null
          clip_start_ms?: number | null
          created_at?: string
          id?: string
          original_video_id?: string
          remix_type?: string
          remix_video_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          allow_duet: boolean
          allow_remix: boolean
          allow_stitch: boolean
          bookmarks_count: number
          comments_count: number
          created_at: string
          description: string | null
          id: string
          likes_count: number
          media_urls: string[] | null
          music: string | null
          post_type: string
          shares_count: number
          sound_id: string | null
          thumbnail_url: string | null
          user_id: string
          video_url: string
        }
        Insert: {
          allow_duet?: boolean
          allow_remix?: boolean
          allow_stitch?: boolean
          bookmarks_count?: number
          comments_count?: number
          created_at?: string
          description?: string | null
          id?: string
          likes_count?: number
          media_urls?: string[] | null
          music?: string | null
          post_type?: string
          shares_count?: number
          sound_id?: string | null
          thumbnail_url?: string | null
          user_id: string
          video_url: string
        }
        Update: {
          allow_duet?: boolean
          allow_remix?: boolean
          allow_stitch?: boolean
          bookmarks_count?: number
          comments_count?: number
          created_at?: string
          description?: string | null
          id?: string
          likes_count?: number
          media_urls?: string[] | null
          music?: string | null
          post_type?: string
          shares_count?: number
          sound_id?: string | null
          thumbnail_url?: string | null
          user_id?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_group_chat: {
        Args: { p_member_ids: string[]; p_name: string }
        Returns: string
      }
      increment_story_view_count: {
        Args: { story_id: string }
        Returns: undefined
      }
      user_is_in_conversation: { Args: { conv_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
