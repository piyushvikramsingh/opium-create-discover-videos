import { Camera, Image, Loader2, X, Music } from "lucide-react";
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const Create = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [music, setMusic] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      toast.error("File must be under 100MB");
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleUpload = async () => {
    if (!file || !user) {
      toast.error("Please select a video and sign in");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("videos")
        .upload(path, file, { contentType: file.type });

      if (storageError) throw storageError;

      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(path);

      const { error: dbError } = await supabase.from("videos").insert({
        user_id: user.id,
        video_url: urlData.publicUrl,
        description: description.trim() || null,
        music: music.trim() || null,
      });

      if (dbError) throw dbError;

      toast.success("Video posted!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 pb-20">
        <p className="text-muted-foreground mb-4">Sign in to create videos</p>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 pb-24 pt-6">
      <h1 className="mb-6 text-xl font-bold text-foreground">Create</h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {!file ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-[9/16] w-full max-w-sm mx-auto flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-secondary/50 transition-colors hover:bg-secondary"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Camera className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Select a video</p>
            <p className="mt-1 text-xs text-muted-foreground">
              MP4, MOV, WebM · Max 100MB
            </p>
          </div>
          <div className="flex gap-3">
            <span className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
              <Image className="h-3.5 w-3.5" />
              Choose File
            </span>
          </div>
        </button>
      ) : (
        <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black">
            <video
              src={preview!}
              className="h-full w-full object-contain"
              controls
              playsInline
            />
            <button
              onClick={clearFile}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Textarea
            placeholder="Write a caption..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            className="resize-none"
            rows={3}
          />

          <div className="relative">
            <Music className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Add music name (optional)"
              value={music}
              onChange={(e) => setMusic(e.target.value)}
              className="pl-9"
              maxLength={100}
            />
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full rounded-xl py-6 text-base font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              "Post"
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Create;
