import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Film,
  Hash,
  Image,
  Loader2,
  MapPin,
  Music,
  Plus,
  Save,
  ShieldAlert,
  Users,
  Volume2,
  VolumeX,
  X,
  MoreHorizontal,
  SwitchCamera,
  Zap,
  ZapOff,
  Grid3X3,
  ImageIcon,
  Clapperboard,
  CircleDot,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase as _supabase } from "@/integrations/supabase/client";
const supabase: any = _supabase;
import { useAuth } from "@/hooks/useAuth";
import { useCreateStory } from "@/hooks/useStories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_DIRECT_UPLOAD_SIZE = 30 * 1024 * 1024;
const ENABLE_MUX_STREAMING = import.meta.env.VITE_ENABLE_MUX_STREAMING === "true";
const DB_NAME = "opium-create-drafts";
const DB_STORE = "drafts";

interface EncodeProfile {
  maxWidth: number;
  maxHeight: number;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
}

const HD_PROFILE: EncodeProfile = {
  maxWidth: 1080,
  maxHeight: 1920,
  fps: 30,
  videoBitrate: 4_500_000,
  audioBitrate: 160_000,
};

const BALANCED_PROFILE: EncodeProfile = {
  maxWidth: 720,
  maxHeight: 1280,
  fps: 30,
  videoBitrate: 2_800_000,
  audioBitrate: 128_000,
};

type Step = "select" | "edit" | "share" | "success";
type Audience = "public" | "followers";
type Visibility = "everyone" | "close_friends" | "age_18_plus";
type CreateIntent = "post" | "reel";

interface ClipItem {
  id: string;
  file: File;
  url: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  coverTime: number;
  brightness: number;
  contrast: number;
  saturation: number;
  muteOriginal: boolean;
  thumbnailText: string;
  filterStack: string[];
}

interface DraftClipRecord {
  id: string;
  file: File;
  duration: number;
  trimStart: number;
  trimEnd: number;
  coverTime: number;
  brightness: number;
  contrast: number;
  saturation: number;
  muteOriginal: boolean;
  thumbnailText: string;
  filterStack: string[];
}

interface MusicOverlaySettings {
  enabled: boolean;
  file: File | null;
  fileUrl: string | null;
  trackName: string;
  start: number;
  volume: number;
}

const FILTER_PRESETS: Array<{ id: string; label: string; css: string }> = [
  { id: "warm", label: "Warm", css: "sepia(0.2) saturate(1.15)" },
  { id: "cool", label: "Cool", css: "hue-rotate(12deg) saturate(0.9)" },
  { id: "mono", label: "Mono", css: "grayscale(0.95)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.35) contrast(1.08)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.08)" },
  { id: "soft", label: "Soft", css: "brightness(1.05) contrast(0.92)" },
];

const getPresetCss = (filterStack: string[]) =>
  filterStack
    .map((id) => FILTER_PRESETS.find((preset) => preset.id === id)?.css)
    .filter(Boolean)
    .join(" ");

const getClipFilterCss = (clip: ClipItem) => {
  const presetCss = getPresetCss(clip.filterStack);
  const adjustmentCss = `brightness(${clip.brightness}%) contrast(${clip.contrast}%) saturate(${clip.saturation}%)`;
  return [presetCss, adjustmentCss].filter(Boolean).join(" ").trim();
};

const ensureMentionTargetsAllowMentions = async (mentionValues: string[]) => {
  const mentionUsernames = Array.from(
    new Set(mentionValues.map((value) => value.replace("@", "").toLowerCase())),
  );

  if (!mentionUsernames.length) return;

  const { data: mentionProfiles, error } = await supabase
    .from("profiles")
    .select("username, allow_mentions")
    .in("username", mentionUsernames);
  if (error) throw error;

  const disallowed = (mentionProfiles || [])
    .filter((profile: any) => profile.allow_mentions === false)
    .map((profile: any) => `@${profile.username}`);

  if (disallowed.length > 0) {
    throw new Error(`Mentions are restricted for: ${disallowed.join(", ")}`);
  }
};

interface DraftRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  clips: DraftClipRecord[];
  activeClipId: string | null;
  mergeClips: boolean;
  caption: string;
  musicName: string;
  musicStart: number;
  musicEnabled: boolean;
  musicVolume: number;
  musicFile: File | null;
  collaborators: string;
  taggedPeople: string;
  location: string;
  audience: Audience;
  commentsEnabled: boolean;
  scheduledAt: string;
  crossPostStory: boolean;
  crossPostReel: boolean;
  crossPostProfile: boolean;
  contentWarning: boolean;
  visibility: Visibility;
}

const openDraftDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const readDrafts = async (): Promise<DraftRecord[]> => {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as DraftRecord[]).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
};

const putDraft = async (draft: DraftRecord) => {
  const db = await openDraftDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(DB_STORE).put(draft);
  });
};

const removeDraftById = async (id: string) => {
  const db = await openDraftDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(DB_STORE).delete(id);
  });
};

const getDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(url);
      resolve(Math.max(duration, 1));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(1);
    };
    video.src = url;
  });

const asId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const chooseRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
};

const getTargetDimensions = (width: number, height: number, profile: EncodeProfile) => {
  const sourceWidth = width > 0 ? width : profile.maxWidth;
  const sourceHeight = height > 0 ? height : profile.maxHeight;
  const scale = Math.min(1, profile.maxWidth / sourceWidth, profile.maxHeight / sourceHeight);

  const scaledWidth = Math.max(2, Math.round((sourceWidth * scale) / 2) * 2);
  const scaledHeight = Math.max(2, Math.round((sourceHeight * scale) / 2) * 2);

  return { width: scaledWidth, height: scaledHeight };
};

const getRecorderOptions = (mimeType: string, profile: EncodeProfile): MediaRecorderOptions => {
  const options: MediaRecorderOptions = {
    videoBitsPerSecond: profile.videoBitrate,
    audioBitsPerSecond: profile.audioBitrate,
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  return options;
};

const getUploadEncodeProfile = (): EncodeProfile => {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;

  if (!connection) return HD_PROFILE;
  if (connection.saveData) return BALANCED_PROFILE;
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g" || connection.effectiveType === "3g") {
    return BALANCED_PROFILE;
  }
  return HD_PROFILE;
};

const isMissingColumnError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
};

const RETRYABLE_ERROR_MARKERS = [
  "network",
  "fetch",
  "timeout",
  "temporarily unavailable",
  "failed to fetch",
  "connection",
  "502",
  "503",
  "504",
  "429",
];

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isRetryableError = (error: unknown) => {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  if (message.includes("upload canceled")) return false;
  return RETRYABLE_ERROR_MARKERS.some((marker) => message.includes(marker));
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  const message = String((error as { message?: string })?.message || "").trim();
  return message || fallback;
};

const runWithRetry = async <T = any,>({
  task,
  attempts = 3,
  retryDelayMs = 500,
  shouldRetry = isRetryableError,
  onRetry,
}: {
  task: () => T | Promise<T>;
  attempts?: number;
  retryDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= attempts;
      if (isLastAttempt || !shouldRetry(error)) {
        break;
      }

      onRetry?.(attempt + 1, error);
      await wait(retryDelayMs * attempt);
    }
  }

  throw lastError;
};

const waitForMetadata = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {
      resolve();
      return;
    }
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to read video metadata"));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });

const waitForSeek = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to seek video"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

const isClipProcessingNeeded = (clip: ClipItem) =>
  clip.trimStart > 0 ||
  clip.trimEnd < clip.duration ||
  clip.brightness !== 100 ||
  clip.contrast !== 100 ||
  clip.saturation !== 100 ||
  clip.muteOriginal;

const processClipToFile = async (
  clip: ClipItem,
  fileNameSuffix: string,
  music: MusicOverlaySettings,
  encodeProfile: EncodeProfile,
  forceTranscode = false,
) => {
  if (!forceTranscode && !isClipProcessingNeeded(clip)) return clip.file;

  if (typeof MediaRecorder === "undefined") return clip.file;

  const video = document.createElement("video");
  video.src = clip.url;
  video.preload = "auto";
  video.playsInline = true;
  video.muted = clip.muteOriginal;

  await waitForMetadata(video);

  const canvas = document.createElement("canvas");
  const { width: targetWidth, height: targetHeight } = getTargetDimensions(
    video.videoWidth || encodeProfile.maxWidth,
    video.videoHeight || encodeProfile.maxHeight,
    encodeProfile,
  );
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return clip.file;

  const stream = canvas.captureStream(encodeProfile.fps);
  const sourceStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();

  let musicAudioElement: HTMLAudioElement | null = null;
  let audioContext: AudioContext | null = null;
  let mixedAudioDestination: MediaStreamAudioDestinationNode | null = null;

  const hasMusic = music.enabled && !!music.fileUrl;
  if ((!clip.muteOriginal && sourceStream) || hasMusic) {
    audioContext = new AudioContext();
    mixedAudioDestination = audioContext.createMediaStreamDestination();

    if (!clip.muteOriginal) {
      const videoAudioSource = audioContext.createMediaElementSource(video);
      const videoGain = audioContext.createGain();
      videoGain.gain.value = 1;
      videoAudioSource.connect(videoGain).connect(mixedAudioDestination);
    }

    if (hasMusic && music.fileUrl) {
      musicAudioElement = document.createElement("audio");
      musicAudioElement.src = music.fileUrl;
      musicAudioElement.preload = "auto";
      musicAudioElement.loop = true;
      musicAudioElement.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        musicAudioElement?.addEventListener("loadedmetadata", () => resolve(), { once: true });
        musicAudioElement?.addEventListener("error", () => reject(new Error("Could not load selected music")), {
          once: true,
        });
      });

      if (musicAudioElement.duration > 0) {
        const boundedStart = Math.max(0, Math.min(music.start, Math.max(0, musicAudioElement.duration - 0.1)));
        musicAudioElement.currentTime = boundedStart;
      }

      const musicSource = audioContext.createMediaElementSource(musicAudioElement);
      const musicGain = audioContext.createGain();
      musicGain.gain.value = Math.max(0, Math.min(1, music.volume));
      musicSource.connect(musicGain).connect(mixedAudioDestination);
    }

    mixedAudioDestination.stream
      .getAudioTracks()
      .forEach((audioTrack) => stream.addTrack(audioTrack));
  }

  const mimeType = chooseRecorderMimeType();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, getRecorderOptions(mimeType, encodeProfile));

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const recorderDone = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Failed to process clip"));
    recorder.onstop = () => {
      if (!chunks.length) {
        reject(new Error("No processed output generated"));
        return;
      }
      resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
    };
  });

  const start = Math.max(0, clip.trimStart);
  const end = Math.max(start + 0.1, Math.min(clip.trimEnd, video.duration || clip.trimEnd));

  video.currentTime = start;
  await waitForSeek(video);

  recorder.start(150);
  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }

  if (musicAudioElement) {
    await musicAudioElement.play();
  }
  await video.play();

  await new Promise<void>((resolve) => {
    let rafId = 0;
    const draw = () => {
      if (video.currentTime >= end || video.ended) {
        context.filter = "none";
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(rafId);
        video.pause();
        if (musicAudioElement) {
          musicAudioElement.pause();
        }
        if (recorder.state !== "inactive") recorder.stop();
        resolve();
        return;
      }

      context.filter = getClipFilterCss(clip);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      rafId = requestAnimationFrame(draw);
    };
    draw();
  });

  const processedBlob = await recorderDone;
  if (audioContext) {
    await audioContext.close();
  }
  return new File([processedBlob], `processed-${fileNameSuffix}.webm`, { type: processedBlob.type || "video/webm" });
};

const mergeClipsToSingleFile = async (clips: ClipItem[], music: MusicOverlaySettings, encodeProfile: EncodeProfile) => {
  if (clips.length === 1) {
    return processClipToFile(clips[0], clips[0].id, music, encodeProfile);
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Merge is not supported in this browser");
  }

  const firstVideo = document.createElement("video");
  firstVideo.src = clips[0].url;
  firstVideo.preload = "metadata";
  await waitForMetadata(firstVideo);

  const canvas = document.createElement("canvas");
  const { width: targetWidth, height: targetHeight } = getTargetDimensions(
    firstVideo.videoWidth || encodeProfile.maxWidth,
    firstVideo.videoHeight || encodeProfile.maxHeight,
    encodeProfile,
  );
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not initialize merge renderer");

  const stream = canvas.captureStream(encodeProfile.fps);
  const mimeType = chooseRecorderMimeType();
  const chunks: BlobPart[] = [];

  let audioContext: AudioContext | null = null;
  let destinationNode: MediaStreamAudioDestinationNode | null = null;
  let musicAudioElement: HTMLAudioElement | null = null;

  if (music.enabled && music.fileUrl) {
    audioContext = new AudioContext();
    destinationNode = audioContext.createMediaStreamDestination();
    musicAudioElement = document.createElement("audio");
    musicAudioElement.src = music.fileUrl;
    musicAudioElement.preload = "auto";
    musicAudioElement.loop = true;
    musicAudioElement.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      musicAudioElement?.addEventListener("loadedmetadata", () => resolve(), { once: true });
      musicAudioElement?.addEventListener("error", () => reject(new Error("Could not load selected music")), {
        once: true,
      });
    });

    if (musicAudioElement.duration > 0) {
      const boundedStart = Math.max(0, Math.min(music.start, Math.max(0, musicAudioElement.duration - 0.1)));
      musicAudioElement.currentTime = boundedStart;
    }

    const source = audioContext.createMediaElementSource(musicAudioElement);
    const gain = audioContext.createGain();
    gain.gain.value = Math.max(0, Math.min(1, music.volume));
    source.connect(gain).connect(destinationNode);
    destinationNode.stream.getAudioTracks().forEach((audioTrack) => stream.addTrack(audioTrack));
  }
  const recorder = new MediaRecorder(stream, getRecorderOptions(mimeType, encodeProfile));

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const recorderDone = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Merge recording failed"));
    recorder.onstop = () => {
      if (!chunks.length) {
        reject(new Error("No merged output generated"));
        return;
      }
      resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
    };
  });

  recorder.start(150);
  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }
  if (musicAudioElement) {
    await musicAudioElement.play();
  }

  for (const clip of clips) {
    const video = document.createElement("video");
    video.src = clip.url;
    video.preload = "auto";
    video.playsInline = true;
    video.muted = true;

    await waitForMetadata(video);
    const start = Math.max(0, clip.trimStart);
    const end = Math.max(start + 0.1, Math.min(clip.trimEnd, video.duration || clip.trimEnd));
    video.currentTime = start;
    await waitForSeek(video);
    await video.play();

    await new Promise<void>((resolve) => {
      let rafId = 0;
      const draw = () => {
        if (video.currentTime >= end || video.ended) {
          cancelAnimationFrame(rafId);
          video.pause();
          resolve();
          return;
        }
        context.filter = getClipFilterCss(clip);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        rafId = requestAnimationFrame(draw);
      };
      draw();
    });
  }

  if (musicAudioElement) {
    musicAudioElement.pause();
  }
  if (recorder.state !== "inactive") recorder.stop();
  const mergedBlob = await recorderDone;
  if (audioContext) {
    await audioContext.close();
  }
  return new File([mergedBlob], `merged-${Date.now()}.webm`, { type: mergedBlob.type || "video/webm" });
};

const Create = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const locationState = useLocation().state as { createType?: string } | null;
  const isStoryCreateMode = locationState?.createType === "story";
  const createStory = useCreateStory();

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);
  const activeMuxUploadAbortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>("select");
  const [createIntent, setCreateIntent] = useState<CreateIntent>("reel");
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [cropAspectRatio, setCropAspectRatio] = useState<"original" | "1:1" | "4:5" | "16:9">("original");
  const [mergeClips, setMergeClips] = useState(false);

  const [caption, setCaption] = useState("");
  const [musicName, setMusicName] = useState("");
  const [musicStart, setMusicStart] = useState(0);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.8);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicFileUrl, setMusicFileUrl] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState("");
  const [taggedPeople, setTaggedPeople] = useState("");
  const [location, setLocation] = useState("");

  const [audience, setAudience] = useState<Audience>("public");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");

  const [crossPostStory, setCrossPostStory] = useState(false);
  const [crossPostReel, setCrossPostReel] = useState(true);
  const [crossPostProfile, setCrossPostProfile] = useState(true);

  const [contentWarning, setContentWarning] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("everyone");

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>("Preparing…");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [lastCreatedVideoId, setLastCreatedVideoId] = useState<string | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const thumbnailPreviewRef = useRef<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("environment");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraFlash, setCameraFlash] = useState(false);
  const [cameraFilterIndex, setCameraFilterIndex] = useState(0);
  const [galleryThumbnails, setGalleryThumbnails] = useState<{ file: File; url: string }[]>([]);
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | null>(null);
  const [selectedGalleryIndices, setSelectedGalleryIndices] = useState<number[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectBottomTab, setSelectBottomTab] = useState<"post" | "story" | "reel">("post");
  const galleryGridInputRef = useRef<HTMLInputElement>(null);

  const CAMERA_FILTERS = [
    { id: "normal", label: "Normal", css: "none" },
    { id: "clarendon", label: "Clarendon", css: "contrast(1.2) saturate(1.35)" },
    { id: "gingham", label: "Gingham", css: "brightness(1.05) hue-rotate(-10deg)" },
    { id: "moon", label: "Moon", css: "grayscale(1) contrast(1.1) brightness(1.1)" },
    { id: "lark", label: "Lark", css: "contrast(0.9) saturate(1.2) brightness(1.1)" },
    { id: "reyes", label: "Reyes", css: "sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)" },
    { id: "juno", label: "Juno", css: "contrast(1.15) saturate(1.8) sepia(0.08)" },
    { id: "slumber", label: "Slumber", css: "saturate(0.66) brightness(1.05) sepia(0.15)" },
    { id: "aden", label: "Aden", css: "hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)" },
    { id: "perpetua", label: "Perpetua", css: "brightness(1.05) saturate(1.1)" },
  ];

  const toggleGallerySelection = (idx: number) => {
    if (!multiSelectMode) {
      setSelectedGalleryIndex(idx);
      return;
    }
    setSelectedGalleryIndices((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((i) => i !== idx);
      }
      if (prev.length >= 10) {
        toast("Maximum 10 items");
        return prev;
      }
      return [...prev, idx];
    });
    setSelectedGalleryIndex(idx);
  };

  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyPreviewUrl, setStoryPreviewUrl] = useState<string | null>(null);
  const [storyCaption, setStoryCaption] = useState("");
  const [storyAudience, setStoryAudience] = useState<"followers" | "close_friends">("followers");
  const [storyUploading, setStoryUploading] = useState(false);
  const [showCreateOverflow, setShowCreateOverflow] = useState(false);
  const isSelectStep = step === "select";
  const createOverflowRef = useRef<HTMLDivElement | null>(null);

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) ?? clips[0] ?? null,
    [clips, activeClipId],
  );

  const totalDuration = useMemo(
    () => clips.reduce((sum, clip) => sum + Math.max(0, clip.trimEnd - clip.trimStart), 0),
    [clips],
  );

  const hashtagCount = useMemo(() => (caption.match(/#[\w]+/g) ?? []).length, [caption]);
  const mentionCount = useMemo(() => (caption.match(/@[\w.]+/g) ?? []).length, [caption]);

  useEffect(() => {
    const init = async () => {
      try {
        const allDrafts = await readDrafts();
        setDrafts(allDrafts);
        if (allDrafts.length > 0) {
          await loadDraft(allDrafts[0]);
          toast.success("Last draft restored");
        }
      } catch {
        toast.error("Could not load drafts");
      }
    };
    init();
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      clips.forEach((clip) => URL.revokeObjectURL(clip.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cameraOpen || !cameraVideoRef.current || !cameraStream) return;
    cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraOpen, cameraStream]);

  useEffect(
    () => () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (musicFileUrl) {
        URL.revokeObjectURL(musicFileUrl);
      }
      if (storyPreviewUrl) {
        URL.revokeObjectURL(storyPreviewUrl);
      }
    },
    [cameraStream, musicFileUrl, storyPreviewUrl],
  );

  useEffect(() => {
    if (!showCreateOverflow) return;

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) return;
      if (createOverflowRef.current?.contains(targetNode)) return;
      setShowCreateOverflow(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCreateOverflow(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showCreateOverflow]);

  // Generate thumbnail preview when cover frame or filters change
  useEffect(() => {
    if (!activeClip) return;
    let cancelled = false;

    const generatePreview = async () => {
      try {
        const blob = await generateThumbnailBlob(activeClip);
        if (cancelled) return;
        if (thumbnailPreviewRef.current) URL.revokeObjectURL(thumbnailPreviewRef.current);
        const url = URL.createObjectURL(blob);
        thumbnailPreviewRef.current = url;
        setThumbnailPreviewUrl(url);
      } catch {
        // silently fail - preview is non-critical
      }
    };

    const timer = setTimeout(() => void generatePreview(), 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.coverTime, activeClip?.brightness, activeClip?.contrast, activeClip?.saturation, activeClip?.filterStack, activeClip?.thumbnailText]);

  const handleStoryFileSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Select an image or video for story");
      return;
    }

    if (storyPreviewUrl) URL.revokeObjectURL(storyPreviewUrl);
    setStoryFile(file);
    setStoryPreviewUrl(URL.createObjectURL(file));
  };

  const handleStoryUpload = async () => {
    if (!user) {
      toast.error("Sign in to post a story");
      return;
    }
    if (!storyFile) {
      toast.error("Choose media for your story");
      return;
    }

    const isVideo = storyFile.type.startsWith("video/");
    const extension = storyFile.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const mediaPath = `${user.id}/stories/${Date.now()}.${extension}`;

    try {
      setStoryUploading(true);

      await runWithRetry({
        attempts: 3,
        task: async () => {
          const { error: uploadError } = await supabase.storage
            .from("videos")
            .upload(mediaPath, storyFile, { contentType: storyFile.type || undefined, upsert: true });
          if (uploadError) throw uploadError;
        },
      });

      const { data: mediaPublic } = supabase.storage.from("videos").getPublicUrl(mediaPath);

      await runWithRetry({
        attempts: 2,
        task: () =>
          createStory.mutateAsync({
            media_url: mediaPublic.publicUrl,
            media_type: isVideo ? "video" : "image",
            caption: storyCaption.trim() || undefined,
            audience: storyAudience,
          }),
      });

      toast.success("Story posted");
      navigate("/");
    } catch (error) {
      toast.error(`Story upload failed: ${getErrorMessage(error, "Please try again")}`);
    } finally {
      setStoryUploading(false);
    }
  };

  const scheduleAutoSave = () => {
    if (!clips.length) return;
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveDraft(true);
    }, 1200);
  };

  useEffect(() => {
    scheduleAutoSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clips,
    activeClipId,
    mergeClips,
    caption,
    musicName,
    musicStart,
    musicEnabled,
    musicVolume,
    musicFile,
    collaborators,
    taggedPeople,
    location,
    audience,
    commentsEnabled,
    scheduledAt,
    crossPostStory,
    crossPostReel,
    crossPostProfile,
    contentWarning,
    visibility,
  ]);

  const updateActiveClip = (patch: Partial<ClipItem>) => {
    setClips((current) =>
      current.map((clip) => (clip.id === activeClip?.id ? { ...clip, ...patch } : clip)),
    );
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const selectedFiles = Array.from(fileList);
    const validFiles = selectedFiles.filter((file) => {
      if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
        toast.error(`${file.name}: only image and video files are supported`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: file must be under 100MB`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;

    const newClips = await Promise.all(
      validFiles.map(async (file) => {
        const isImage = file.type.startsWith("image/");
        const duration = isImage ? 0 : await getDuration(file);
        const id = asId();
        return {
          id,
          file,
          url: URL.createObjectURL(file),
          duration,
          trimStart: 0,
          trimEnd: duration,
          coverTime: 0,
          brightness: 100,
          contrast: 100,
          saturation: 100,
          muteOriginal: false,
          thumbnailText: "",
          filterStack: [],
        } as ClipItem;
      }),
    );

    setClips((prev) => [...prev, ...newClips]);
    setActiveClipId((prev) => prev ?? newClips[0]?.id ?? null);
    setStep("edit");
  };

  const addDirectFile = async (file: File) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    await addFiles(dataTransfer.files);
  };

  const closeCamera = () => {
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== "inactive") {
      cameraRecorderRef.current.stop();
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setCameraOpen(false);
    setCameraRecording(false);
    cameraChunksRef.current = [];
  };

  const startCamera = async (facingMode: "user" | "environment") => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera API not available in this browser");
      cameraInputRef.current?.click();
      return;
    }

    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });

      setCameraFacingMode(facingMode);
      setCameraStream(stream);
      setCameraOpen(true);
    } catch {
      toast.error("Could not access camera. Falling back to file picker.");
      cameraInputRef.current?.click();
    }
  };

  const toggleCameraFacing = async () => {
    if (cameraRecording) return;
    const nextMode = cameraFacingMode === "environment" ? "user" : "environment";
    await startCamera(nextMode);
  };

  const startRecording = () => {
    if (!cameraStream || cameraRecording) return;

    const mimeType = chooseRecorderMimeType() || "video/webm";
    cameraChunksRef.current = [];

    const recorder = new MediaRecorder(cameraStream, getRecorderOptions(mimeType, HD_PROFILE));
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        cameraChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      setCameraRecording(false);
      const blob = new Blob(cameraChunksRef.current, { type: mimeType });
      if (blob.size === 0) {
        toast.error("Recording failed. Try again.");
        return;
      }

      const file = new File([blob], `camera-${Date.now()}.webm`, { type: blob.type || "video/webm" });
      await addDirectFile(file);
      closeCamera();
    };

    cameraRecorderRef.current = recorder;
    recorder.start(200);
    setCameraRecording(true);
  };

  const stopRecording = () => {
    if (!cameraRecorderRef.current || cameraRecorderRef.current.state === "inactive") return;
    cameraRecorderRef.current.stop();
  };

  const clearAll = () => {
    clips.forEach((clip) => URL.revokeObjectURL(clip.url));
    setClips([]);
    setActiveClipId(null);
    setMergeClips(false);
    setCaption("");
    setMusicName("");
    setMusicStart(0);
    setMusicEnabled(false);
    setMusicVolume(0.8);
    setMusicFile(null);
    if (musicFileUrl) URL.revokeObjectURL(musicFileUrl);
    setMusicFileUrl(null);
    setCollaborators("");
    setTaggedPeople("");
    setLocation("");
    setAudience("public");
    setCommentsEnabled(true);
    setScheduledAt("");
    setCrossPostStory(false);
    setCrossPostReel(true);
    setCrossPostProfile(true);
    setContentWarning(false);
    setVisibility("everyone");
    setCurrentDraftId(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage("Preparing…");
    setSuccessCount(0);
    setLastCreatedVideoId(null);
    if (thumbnailPreviewRef.current) {
      URL.revokeObjectURL(thumbnailPreviewRef.current);
      thumbnailPreviewRef.current = null;
    }
    setThumbnailPreviewUrl(null);
    setStep("select");
    setShowCreateOverflow(false);
  };

  const applyCreateIntentPreset = (intent: CreateIntent) => {
    setCreateIntent(intent);

    if (intent === "post") {
      setMergeClips(false);
      setCrossPostReel(false);
      setCrossPostProfile(true);
      setCrossPostStory(false);
      setVisibility("everyone");
      return;
    }

    setCrossPostReel(true);
    setCrossPostProfile(true);
    setCrossPostStory(false);
    setVisibility("everyone");
  };

  const saveDraft = async (silent = false) => {
    if (!clips.length) return;

    const draftId = currentDraftId ?? asId();
    const record: DraftRecord = {
      id: draftId,
      createdAt: drafts.find((d) => d.id === draftId)?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: caption.trim().slice(0, 48) || `Draft ${new Date().toLocaleString()}`,
      clips: clips.map((clip) => ({
        id: clip.id,
        file: clip.file,
        duration: clip.duration,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        coverTime: clip.coverTime,
        brightness: clip.brightness,
        contrast: clip.contrast,
        saturation: clip.saturation,
        muteOriginal: clip.muteOriginal,
        thumbnailText: clip.thumbnailText,
        filterStack: clip.filterStack,
      })),
      activeClipId,
      mergeClips,
      caption,
      musicName,
      musicStart,
      musicEnabled,
      musicVolume,
      musicFile,
      collaborators,
      taggedPeople,
      location,
      audience,
      commentsEnabled,
      scheduledAt,
      crossPostStory,
      crossPostReel,
      crossPostProfile,
      contentWarning,
      visibility,
    };

    await putDraft(record);
    const allDrafts = await readDrafts();
    setDrafts(allDrafts);
    setCurrentDraftId(draftId);

    if (!silent) {
      toast.success("Draft saved");
    }
  };

  const loadDraft = async (draft: DraftRecord) => {
    clips.forEach((clip) => URL.revokeObjectURL(clip.url));

    const hydratedClips: ClipItem[] = draft.clips.map((clipRecord) => {
      const id = clipRecord.id || asId();
      const duration = clipRecord.duration || 1;
      return {
        id,
        file: clipRecord.file,
        url: URL.createObjectURL(clipRecord.file),
        duration,
        trimStart: Math.max(0, Math.min(clipRecord.trimStart ?? 0, duration - 0.1)),
        trimEnd: Math.max(0.1, Math.min(clipRecord.trimEnd ?? duration, duration)),
        coverTime: Math.max(0, Math.min(clipRecord.coverTime ?? Math.min(1, duration), duration)),
        brightness: clipRecord.brightness ?? 100,
        contrast: clipRecord.contrast ?? 100,
        saturation: clipRecord.saturation ?? 100,
        muteOriginal: clipRecord.muteOriginal ?? false,
        thumbnailText: clipRecord.thumbnailText ?? "",
        filterStack: clipRecord.filterStack ?? [],
      };
    });

    setClips(hydratedClips);
    setActiveClipId(
      hydratedClips.find((clip) => clip.id === draft.activeClipId)?.id ?? hydratedClips[0]?.id ?? null,
    );
    setMergeClips(draft.mergeClips);
    setCaption(draft.caption);
    setMusicName(draft.musicName);
    setMusicStart(draft.musicStart);
    setMusicEnabled(draft.musicEnabled ?? false);
    setMusicVolume(draft.musicVolume ?? 0.8);
    if (musicFileUrl) URL.revokeObjectURL(musicFileUrl);
    setMusicFile(draft.musicFile ?? null);
    setMusicFileUrl(draft.musicFile ? URL.createObjectURL(draft.musicFile) : null);
    setCollaborators(draft.collaborators);
    setTaggedPeople(draft.taggedPeople);
    setLocation(draft.location);
    setAudience(draft.audience);
    setCommentsEnabled(draft.commentsEnabled);
    setScheduledAt(draft.scheduledAt);
    setCrossPostStory(draft.crossPostStory);
    setCrossPostReel(draft.crossPostReel);
    setCrossPostProfile(draft.crossPostProfile);
    setContentWarning(draft.contentWarning);
    setVisibility(draft.visibility);
    setCurrentDraftId(draft.id);
    setStep(hydratedClips.length > 0 ? "edit" : "select");
  };

  const deleteDraft = async (id: string) => {
    await removeDraftById(id);
    const allDrafts = await readDrafts();
    setDrafts(allDrafts);
    if (currentDraftId === id) {
      setCurrentDraftId(null);
    }
    toast.success("Draft deleted");
  };

  const removeClip = (id: string) => {
    setClips((current) => {
      const target = current.find((clip) => clip.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = current.filter((clip) => clip.id !== id);
      if (!next.length) {
        setActiveClipId(null);
        setStep("select");
      } else if (activeClipId === id) {
        setActiveClipId(next[0].id);
      }
      return next;
    });
  };

  const moveClip = (id: string, direction: "up" | "down") => {
    setClips((current) => {
      const index = current.findIndex((clip) => clip.id === id);
      if (index === -1) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const generateThumbnailBlob = async (clip: ClipItem) => {
    const isImage = clip.file.type.startsWith("image/");

    if (isImage) {
      const img = document.createElement("img");
      img.src = clip.url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Could not load image"));
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 720;
      canvas.height = img.naturalHeight || 1280;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not render thumbnail");

      context.filter = getClipFilterCss(clip);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (clip.thumbnailText.trim()) {
        context.filter = "none";
        context.fillStyle = "rgba(0,0,0,0.45)";
        context.fillRect(0, canvas.height - 120, canvas.width, 120);
        context.fillStyle = "#fff";
        context.font = `bold ${Math.round(canvas.width * 0.06)}px Inter, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(clip.thumbnailText.trim(), canvas.width / 2, canvas.height - 60);
      }

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error("Could not export thumbnail"));
          else resolve(blob);
        }, "image/jpeg", 0.9);
      });
    }

    const video = document.createElement("video");
    video.preload = "auto";
    video.src = clip.url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read video metadata"));
    });

    const seekTime = Math.min(Math.max(clip.coverTime, 0), Math.max(video.duration - 0.1, 0));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Could not seek video for thumbnail"));
      video.currentTime = seekTime;
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render thumbnail");

    context.filter = getClipFilterCss(clip);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (clip.thumbnailText.trim()) {
      context.filter = "none";
      context.fillStyle = "rgba(0,0,0,0.45)";
      context.fillRect(0, canvas.height - 120, canvas.width, 120);
      context.fillStyle = "#fff";
      context.font = `bold ${Math.round(canvas.width * 0.06)}px Inter, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(clip.thumbnailText.trim(), canvas.width / 2, canvas.height - 60);
    }

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("Could not export thumbnail"));
        else resolve(blob);
      }, "image/jpeg", 0.9);
    });
  };

  const buildDescription = (clip: ClipItem, clipIndex: number, totalClips: number) => {
    const lines = [caption.trim()].filter(Boolean);

    const collabValue = collaborators
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .join(", ");

    const taggedValue = taggedPeople
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .join(", ");

    lines.push(`\n—— Upload Settings ——`);
    lines.push(`Audience: ${audience}`);
    lines.push(`Comments: ${commentsEnabled ? "On" : "Off"}`);
    lines.push(`Visibility: ${visibility}`);
    lines.push(`Content warning: ${contentWarning ? "Yes" : "No"}`);
    lines.push(`Cross-post: story=${crossPostStory}, clippy=${crossPostReel}, profile=${crossPostProfile}`);
    lines.push(`Clip trim: ${clip.trimStart.toFixed(1)}s - ${clip.trimEnd.toFixed(1)}s`);
    lines.push(`Filters: b${clip.brightness} c${clip.contrast} s${clip.saturation}`);

    if (location.trim()) lines.push(`Location: ${location.trim()}`);
    if (collabValue) lines.push(`Collaborators: ${collabValue}`);
    if (taggedValue) lines.push(`Tagged: ${taggedValue}`);

    if (totalClips > 1) {
      lines.push(`Clip ${clipIndex + 1} of ${totalClips}`);
      lines.push(`Merge mode: ${mergeClips ? "On" : "Off"}`);
    }

    return lines.filter(Boolean).join("\n");
  };

  const handleUpload = async () => {
    if (!user || !clips.length) {
      toast.error("Select at least one video clip");
      return;
    }

    if (scheduledAt) {
      const scheduleDate = new Date(scheduledAt);
      if (!Number.isNaN(scheduleDate.getTime()) && scheduleDate.getTime() > Date.now()) {
        await saveDraft();
        toast.success("Scheduled post saved to drafts");
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStage("Processing clips…");
    setUploadError(null);
    cancelRequestedRef.current = false;

    const uploadGroupId = crypto.randomUUID();
    const hashtagValues = Array.from(new Set((caption.match(/#[\w]+/g) ?? []).map((value) => value.toLowerCase())));
    const mentionValues = Array.from(new Set((caption.match(/@[\w.]+/g) ?? []).map((value) => value.toLowerCase())));
    const collaboratorValues = collaborators
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const taggedValues = taggedPeople
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const musicOverlay: MusicOverlaySettings = {
      enabled: musicEnabled && !!musicFileUrl,
      file: musicFile,
      fileUrl: musicFileUrl,
      trackName: musicName,
      start: musicStart,
      volume: musicVolume,
    };

    try {
      await ensureMentionTargetsAllowMentions(mentionValues);

      const encodeProfile = getUploadEncodeProfile();

      const targets = mergeClips && clips.length > 1
        ? [{ clip: clips[0], file: await mergeClipsToSingleFile(clips, musicOverlay, encodeProfile), index: 0, total: 1 }]
        : await Promise.all(
            clips.map(async (clip, index) => {
              const isImage = clip.file.type.startsWith("image/");
              if (isImage) {
                return { clip, file: clip.file, index, total: clips.length };
              }
              try {
                const processedFile = await processClipToFile(
                  clip,
                  `${clip.id}-${index}`,
                  musicOverlay,
                  encodeProfile,
                  clip.file.size > MAX_DIRECT_UPLOAD_SIZE,
                );
                return {
                  clip,
                  file: processedFile,
                  index,
                  total: clips.length,
                };
              } catch (processingError) {
                console.warn("Clip processing failed, falling back to original file", processingError);
                return {
                  clip,
                  file: clip.file,
                  index,
                  total: clips.length,
                };
              }
            }),
          );

      let createdCount = 0;
      let latestId: string | null = null;

      for (let index = 0; index < targets.length; index += 1) {
        if (cancelRequestedRef.current) throw new Error("Upload canceled");

        const target = targets[index];
        const { clip, file } = target;
        const ext = file.name.split(".").pop() || "webm";
        const filePath = `${user.id}/${Date.now()}-${index}.${ext}`;
        const thumbnailPath = `${user.id}/thumb-${Date.now()}-${index}.jpg`;

        setUploadStage(`Generating thumbnail ${index + 1}/${targets.length}…`);
        setUploadProgress(Math.round((index / targets.length) * 40));

        let thumbnailUrl = "";
        try {
          const thumbnailBlob = await generateThumbnailBlob(clip);
          const { error: thumbError } = await runWithRetry({
            attempts: 2,
            task: () =>
              supabase.storage
                .from("videos")
                .upload(thumbnailPath, thumbnailBlob, { contentType: "image/jpeg", upsert: true }),
          });

          if (!thumbError) {
            const { data: thumbUrlData } = supabase.storage.from("videos").getPublicUrl(thumbnailPath);
            thumbnailUrl = thumbUrlData.publicUrl;
          } else {
            console.warn("Thumbnail upload failed, continuing without thumbnail", thumbError);
          }
        } catch (thumbnailError) {
          console.warn("Thumbnail generation failed, continuing without thumbnail", thumbnailError);
        }

        const musicLabel = musicName.trim()
          ? `${musicName.trim()}${musicStart > 0 ? ` @ ${musicStart.toFixed(1)}s` : ""}`
          : null;

        const advancedPayload = {
          user_id: user.id,
          video_url: "",
          thumbnail_url: thumbnailUrl,
          description: buildDescription(clip, index, targets.length),
          music: musicLabel,
          audience,
          comments_enabled: commentsEnabled,
          visibility,
          content_warning: contentWarning,
          scheduled_for: scheduledAt || null,
          cross_post_story: crossPostStory,
          cross_post_reel: crossPostReel,
          cross_post_profile: crossPostProfile,
          location: location.trim() || null,
          hashtags: hashtagValues,
          mentions: mentionValues,
          collaborators: collaboratorValues,
          tagged_people: taggedValues,
          upload_group_id: uploadGroupId,
          upload_group_index: index,
          merge_mode: mergeClips,
          clip_settings: {
            trim_start: clip.trimStart,
            trim_end: clip.trimEnd,
            cover_time: clip.coverTime,
            brightness: clip.brightness,
            contrast: clip.contrast,
            saturation: clip.saturation,
            mute_original: clip.muteOriginal,
            filter_stack: clip.filterStack,
          },
          thumbnail_text: clip.thumbnailText || null,
          music_start_seconds: musicStart,
          music_volume: musicVolume,
          music_enabled: musicEnabled,
          filter_stack: clip.filterStack,
        };

        if (ENABLE_MUX_STREAMING) {
          const muxPayload = {
            ...advancedPayload,
            stream_provider: "mux",
            stream_status: "uploading",
          };

          let { data: createdVideo, error: dbError } = await supabase
            .from("videos")
            .insert(muxPayload as never)
            .select("id")
            .single();

          if (dbError && isMissingColumnError(dbError)) {
            dbError = null;
            createdVideo = null;
          }

          if (dbError) throw dbError;

          if (createdVideo?.id) {
            const invokeResult = await runWithRetry({
              attempts: 3,
              onRetry: (attempt) => {
                setUploadStage(`Retrying upload setup ${index + 1}/${targets.length} (${attempt}/3)…`);
              },
              task: () =>
                supabase.functions.invoke("create-mux-direct-upload", {
                  body: { videoId: createdVideo.id },
                }),
            });

            if (invokeResult.error) {
              await supabase
                .from("videos")
                .update({ stream_status: "failed", stream_error: String(invokeResult.error.message || "Mux upload failed") } as never)
                .eq("id", createdVideo.id);
              throw invokeResult.error;
            }

            const uploadUrl = String((invokeResult.data as { uploadUrl?: string } | null)?.uploadUrl || "");
            if (!uploadUrl) {
              await supabase
                .from("videos")
                .update({ stream_status: "failed", stream_error: "Mux upload URL missing" } as never)
                .eq("id", createdVideo.id);
              throw new Error("Mux upload URL missing");
            }

            const uploadResponse = await runWithRetry({
              attempts: 3,
              onRetry: (attempt) => {
                setUploadStage(`Retrying video upload ${index + 1}/${targets.length} (${attempt}/3)…`);
              },
              task: async () => {
                if (cancelRequestedRef.current) throw new Error("Upload canceled");
                const controller = new AbortController();
                activeMuxUploadAbortRef.current = controller;
                try {
                  return await fetch(uploadUrl, {
                    method: "PUT",
                    headers: {
                      "Content-Type": file.type || "application/octet-stream",
                    },
                    body: file,
                    signal: controller.signal,
                  });
                } finally {
                  activeMuxUploadAbortRef.current = null;
                }
              },
            });

            if (!uploadResponse.ok) {
              await supabase
                .from("videos")
                .update({ stream_status: "failed", stream_error: `Mux upload failed (${uploadResponse.status})` } as never)
                .eq("id", createdVideo.id);
              throw new Error(`Mux upload failed (${uploadResponse.status})`);
            }

            await supabase
              .from("videos")
              .update({ stream_status: "processing", stream_error: null } as never)
              .eq("id", createdVideo.id);

            createdCount += 1;
            latestId = createdVideo.id;
            setUploadStage(`Uploaded ${index + 1}/${targets.length}`);
            setUploadProgress(40 + Math.round(((index + 1) / targets.length) * 55));
            continue;
          }
        }

        const isImageFile = file.type.startsWith("image/");
        setUploadStage(`Uploading ${isImageFile ? "photo" : "video"} ${index + 1}/${targets.length}…`);
        const { error: videoError } = await runWithRetry({
          attempts: 3,
          onRetry: (attempt) => {
            setUploadStage(`Retrying upload ${index + 1}/${targets.length} (${attempt}/3)…`);
          },
          task: () =>
            supabase.storage
              .from("videos")
              .upload(filePath, file, { contentType: file.type || "video/webm" }),
        });
        if (videoError) throw videoError;

        if (cancelRequestedRef.current) throw new Error("Upload canceled");

        const { data: videoUrlData } = supabase.storage.from("videos").getPublicUrl(filePath);

        const payload = {
          ...advancedPayload,
          video_url: videoUrlData.publicUrl,
        };

        let { data: createdVideo, error: dbError } = await runWithRetry({
          attempts: 2,
          onRetry: (attempt) => {
            setUploadStage(`Retrying save ${index + 1}/${targets.length} (${attempt}/2)…`);
          },
          task: () =>
            supabase
              .from("videos")
              .insert(payload as never)
              .select("id")
              .single(),
        });

        if (dbError) {
          const fallbackPayload = {
            user_id: user.id,
            video_url: videoUrlData.publicUrl,
            thumbnail_url: thumbnailUrl,
            description: buildDescription(clip, index, targets.length),
            music: musicLabel,
          };

          const fallback = await runWithRetry({
            attempts: 2,
            task: () =>
              supabase
                .from("videos")
                .insert(fallbackPayload as never)
                .select("id")
                .single(),
          });

          createdVideo = fallback.data;
          dbError = fallback.error;
        }

        if (dbError) throw dbError;

        createdCount += 1;
        latestId = createdVideo?.id ?? null;

        // If this is a multi-image post (carousel), insert additional media items
        if (createdVideo?.id && targets.length > 1 && index === 0) {
          const carouselMediaRows = targets.map((t, sortIdx) => ({
            video_id: createdVideo.id,
            media_url: t.file.type.startsWith("image/") ? "" : "", // placeholder, will update below
            media_type: t.file.type.startsWith("image/") ? "image" : "video",
            sort_order: sortIdx,
          }));

          // Upload all remaining files and insert post_media
          for (let mi = 0; mi < targets.length; mi++) {
            const mediaFile = targets[mi].file;
            const mediaExt = mediaFile.name.split(".").pop() || "jpg";
            const mediaPath = `${user.id}/carousel-${Date.now()}-${mi}.${mediaExt}`;

            if (mi === 0) {
              // First item already uploaded as video_url
              carouselMediaRows[mi].media_url = (payload as any).video_url || videoUrlData.publicUrl;
            } else {
              const { error: mediaUpError } = await supabase.storage
                .from("videos")
                .upload(mediaPath, mediaFile, { contentType: mediaFile.type });
              if (mediaUpError) {
                console.warn("Carousel media upload failed", mediaUpError);
                continue;
              }
              const { data: mediaUrlData } = supabase.storage.from("videos").getPublicUrl(mediaPath);
              carouselMediaRows[mi].media_url = mediaUrlData.publicUrl;
            }
          }

          const validRows = carouselMediaRows.filter((r) => r.media_url);
          if (validRows.length > 1) {
            await supabase.from("post_media").insert(validRows as never[]);
          }

          // Skip remaining targets since they're part of the carousel
          setUploadStage(`Saved carousel with ${validRows.length} items`);
          setUploadProgress(95);
          break;
        }

        setUploadStage(`Saved ${index + 1}/${targets.length}`);
        setUploadProgress(40 + Math.round(((index + 1) / targets.length) * 55));
      }

      setUploadStage("Finishing up…");
      setUploadProgress(100);
      setSuccessCount(createdCount);
      setLastCreatedVideoId(latestId);
      setStep("success");
      toast.success(createdCount > 1 ? `${createdCount} videos posted` : "Video posted");

      if (currentDraftId) {
        await removeDraftById(currentDraftId);
        setCurrentDraftId(null);
        setDrafts(await readDrafts());
      }
    } catch (error) {
      const message = getErrorMessage(error, "Upload failed");
      setUploadError(message);
      if (message.toLowerCase().includes("upload canceled")) {
        setUploadStage("Upload canceled");
        toast("Upload canceled");
      } else {
        toast.error(message);
      }
    } finally {
      activeMuxUploadAbortRef.current = null;
      setUploading(false);
    }
  };

  const requestCancelUpload = () => {
    cancelRequestedRef.current = true;
    activeMuxUploadAbortRef.current?.abort();
    toast("Cancel requested. Finishing current transfer...");
  };

  const toggleFilterPreset = (presetId: string) => {
    if (!activeClip) return;
    const exists = activeClip.filterStack.includes(presetId);
    if (exists) {
      updateActiveClip({ filterStack: activeClip.filterStack.filter((item) => item !== presetId) });
      return;
    }
    if (activeClip.filterStack.length >= 3) {
      toast.error("You can stack up to 3 filters");
      return;
    }
    updateActiveClip({ filterStack: [...activeClip.filterStack, presetId] });
  };

  const onMusicFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith("audio/")) {
      toast.error("Please select an audio file");
      return;
    }
    if (musicFileUrl) URL.revokeObjectURL(musicFileUrl);
    const url = URL.createObjectURL(selected);
    setMusicFile(selected);
    setMusicFileUrl(url);
    if (!musicName.trim()) {
      setMusicName(selected.name.replace(/\.[^/.]+$/, ""));
    }
    setMusicEnabled(true);
    event.target.value = "";
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-8 pb-20">
        <p className="mb-4 text-muted-foreground">Sign in to create videos</p>
        <Button onClick={() => navigate("/auth")}>Sign In</Button>
      </div>
    );
  }

  if (isStoryCreateMode) {
    return (
      <div className="ig-screen ig-modern-page min-h-screen bg-background pb-24">
        <div className="ig-header ig-modern-header sticky top-0 z-20">
          <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
            <button
              onClick={() => navigate(-1)}
              className="ig-tap ig-modern-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="ig-type-h2">Create Story</h1>
            <div className="w-14" />
          </div>
        </div>

        <div className="mx-auto max-w-md space-y-4 px-4 py-4">
          <div className="ig-modern-card p-4">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(event) => handleStoryFileSelect(event.target.files?.[0] || null)}
              className="mb-3 w-full text-sm"
            />

            {storyPreviewUrl ? (
              storyFile?.type.startsWith("video/") ? (
                <video src={storyPreviewUrl} className="max-h-[420px] w-full rounded-xl object-cover" controls playsInline />
              ) : (
                <img src={storyPreviewUrl} alt="Story preview" className="max-h-[420px] w-full rounded-xl object-cover" />
              )
            ) : (
              <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Select media to preview story
              </div>
            )}
          </div>

          <div className="ig-modern-card p-4">
            <label className="mb-1 block text-sm font-medium">Caption</label>
            <Textarea
              value={storyCaption}
              onChange={(event) => setStoryCaption(event.target.value)}
              rows={3}
              placeholder="Add a caption"
              className="resize-none"
              maxLength={160}
            />
          </div>

          <div className="ig-modern-card p-4">
            <p className="mb-2 text-sm font-medium">Audience</p>
            <RadioGroup value={storyAudience} onValueChange={(value) => setStoryAudience(value as "followers" | "close_friends") }>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="followers" id="story-aud-followers" />
                <label htmlFor="story-aud-followers" className="text-sm">Everyone who follows you</label>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <RadioGroupItem value="close_friends" id="story-aud-close" />
                <label htmlFor="story-aud-close" className="text-sm">Close friends only</label>
              </div>
            </RadioGroup>
          </div>

          <Button
            className="w-full"
            onClick={() => void handleStoryUpload()}
            disabled={!storyFile || createStory.isPending || storyUploading}
          >
            {createStory.isPending || storyUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share story"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ig-screen min-h-screen bg-background pb-24 ${isSelectStep ? "px-0 pt-0" : "px-4 pt-4"}`}>
      <div className={`${isSelectStep ? "w-full" : "mx-auto w-full max-w-4xl"}`}>
        <div className={`ig-header mb-4 flex items-center justify-between border-b border-border/60 ${isSelectStep ? "px-4 pt-3" : "px-2 py-2"}`}>
          {isSelectStep ? (
            <>
              <div className="w-10" />
              <h1 className="text-sm font-semibold tracking-wide text-foreground">New</h1>
              <div ref={createOverflowRef} className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="ig-tap ig-icon-btn border border-border bg-background text-foreground hover:bg-secondary/70"
                  onClick={() => setShowCreateOverflow((prev) => !prev)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {showCreateOverflow && (
                  <div className="ig-panel-enter absolute right-0 z-30 mt-2 w-36 overflow-hidden rounded-xl border border-border bg-background/95 p-1 backdrop-blur">
                    <button
                      onClick={() => {
                        clearAll();
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-secondary"
                    >
                      Reset draft
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateOverflow(false);
                        navigate("/create", { state: { createType: "story" } });
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-secondary"
                    >
                      Story mode
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {(step as string) !== "select" && step !== "success" && (
                    <Button variant="ghost" size="icon" className="ig-tap ig-icon-btn" onClick={() => setStep("select")}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <h1 className="text-xl font-bold">
                  {step === "edit" ? "Edit" : step === "share" ? "Share" : "Done"}
                </h1>
              </div>
              <Button variant="outline" className="ig-tap ig-icon-btn" onClick={clearAll}>
                Reset
              </Button>
            </>
          )}
        </div>

        {!isSelectStep && step !== "success" && (
          <div className="mb-4 flex items-center justify-center gap-6 border-b border-border/70 pb-2 text-sm font-semibold">
            <button
              onClick={() => setStep("select")}
              data-active={step === ("select" as string)}
              className={`relative ig-tap px-1 py-1 transition-colors ${
                step === ("select" as string) ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Select
              {step === ("select" as string) && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
            </button>
            <button
              onClick={() => clips.length && setStep("edit")}
              disabled={!clips.length}
              data-active={step === "edit"}
              className={`relative ig-tap px-1 py-1 transition-colors disabled:opacity-40 ${
                step === "edit" ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Edit
              {step === "edit" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
            </button>
            <button
              onClick={() => clips.length && setStep("share")}
              disabled={!clips.length}
              data-active={step === "share"}
              className={`relative ig-tap px-1 py-1 transition-colors disabled:opacity-40 ${
                step === "share" ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Share
              {step === "share" && <span className="ig-tab-indicator absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-foreground" />}
            </button>
          </div>
        )}

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <input
          ref={cameraInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <input
          ref={musicInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={onMusicFileSelect}
        />

        {step === "select" && (
          <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 60px)" }}>
            {/* Gallery preview area */}
            <div className="relative aspect-square w-full bg-black md:mx-auto md:max-w-md">
              {selectedGalleryIndex !== null && galleryThumbnails[selectedGalleryIndex] ? (
                galleryThumbnails[selectedGalleryIndex].file.type.startsWith("video/") ? (
                  <video
                    src={galleryThumbnails[selectedGalleryIndex].url}
                    muted
                    playsInline
                    loop
                    autoPlay
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={galleryThumbnails[selectedGalleryIndex].url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )
              ) : clips[0] ? (
                <video
                  src={clips[0].url}
                  muted
                  playsInline
                  loop
                  autoPlay
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70">
                  <ImageIcon className="h-12 w-12 opacity-40" />
                  <p className="text-sm font-medium">No media selected</p>
                </div>
              )}
            </div>

            {/* Gallery header row */}
            <div className="flex items-center justify-between border-b border-border/40 bg-background px-4 py-2.5 md:mx-auto md:w-full md:max-w-md">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">Recents</span>
                <ChevronDown className="h-4 w-4 text-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => galleryGridInputRef.current?.click()}
                  className="rounded-full bg-secondary/80 p-2 text-foreground"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void startCamera("environment")}
                  className="rounded-full bg-secondary/80 p-2 text-foreground"
                >
                  <Camera className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Gallery grid */}
            <div className="flex-1 overflow-y-auto bg-background md:mx-auto md:w-full md:max-w-md">
              <input
                ref={galleryGridInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files) return;
                  const newThumbs = Array.from(files).map((file) => ({
                    file,
                    url: URL.createObjectURL(file),
                  }));
                  setGalleryThumbnails((prev) => {
                    const updated = [...prev, ...newThumbs];
                    setSelectedGalleryIndex(prev.length);
                    return updated;
                  });
                  e.target.value = "";
                }}
              />

              <div className="flex items-center gap-2 px-4 py-2">
                <button
                  onClick={() => {
                    setMultiSelectMode(!multiSelectMode);
                    if (multiSelectMode) {
                      setSelectedGalleryIndices([]);
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    multiSelectMode
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                  {multiSelectMode ? `${selectedGalleryIndices.length} selected` : "Select multiple"}
                </button>
              </div>
              {galleryThumbnails.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Tap the grid icon to add photos & videos</p>
                  <button
                    onClick={() => galleryGridInputRef.current?.click()}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Select from Gallery
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-0.5">
                  {galleryThumbnails.map((item, idx) => {
                    const multiIdx = selectedGalleryIndices.indexOf(idx);
                    const isMultiSelected = multiSelectMode && multiIdx !== -1;
                    const isSingleSelected = !multiSelectMode && selectedGalleryIndex === idx;
                    return (
                      <button
                        key={idx}
                        className={`relative aspect-square overflow-hidden ${
                          isSingleSelected
                            ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                            : isMultiSelected
                            ? "opacity-80"
                            : ""
                        }`}
                        onClick={() => toggleGallerySelection(idx)}
                      >
                        {item.file.type.startsWith("video/") ? (
                          <>
                            <video src={item.url} muted playsInline className="h-full w-full object-cover" />
                            <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5">
                              <Clapperboard className="h-3 w-3 text-white" />
                            </div>
                          </>
                        ) : (
                          <img src={item.url} alt="" className="h-full w-full object-cover" />
                        )}
                        {/* Multi-select badge */}
                        {multiSelectMode && (
                          <div
                            className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                              isMultiSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-white/70 bg-black/30"
                            }`}
                          >
                            {isMultiSelected ? multiIdx + 1 : ""}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div className="border-t border-border/40 bg-background md:mx-auto md:w-full md:max-w-md">
              {/* Create type tabs */}
              <div className="flex items-center justify-center gap-8 py-3">
                {(["post", "story", "reel"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setSelectBottomTab(tab);
                      if (tab === "story") {
                        navigate("/create", { state: { createType: "story" } });
                      } else if (tab === "reel") {
                        applyCreateIntentPreset("reel");
                      } else {
                        applyCreateIntentPreset("post");
                      }
                    }}
                    className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                      selectBottomTab === tab
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Next button */}
              <div className="flex items-center gap-3 px-4 pb-4">
                <button
                  onClick={async () => {
                    if (multiSelectMode && selectedGalleryIndices.length > 0) {
                      const mediaFiles = selectedGalleryIndices
                        .map((i) => galleryThumbnails[i])
                        .filter((item) => item.file.type.startsWith("video/") || item.file.type.startsWith("image/"));
                      if (mediaFiles.length === 0) {
                        toast("Select at least one photo or video");
                        return;
                      }
                      for (const item of mediaFiles) {
                        await addDirectFile(item.file);
                      }
                      setMultiSelectMode(false);
                      setSelectedGalleryIndices([]);
                    } else if (selectedGalleryIndex !== null && galleryThumbnails[selectedGalleryIndex]) {
                      const selected = galleryThumbnails[selectedGalleryIndex];
                      if (selectBottomTab === "story" && selected.file.type.startsWith("image/")) {
                        handleStoryFileSelect(selected.file);
                        navigate("/create", { state: { createType: "story" } });
                      } else {
                        await addDirectFile(selected.file);
                      }
                    } else if (clips.length > 0) {
                      setStep("edit");
                    } else {
                      toast("Select media first");
                    }
                  }}
                  className="flex-1 rounded-lg bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
                >
                  {multiSelectMode && selectedGalleryIndices.length > 0
                    ? `Next (${selectedGalleryIndices.length})`
                    : "Next"}
                </button>
              </div>
            </div>

            {/* Drafts row */}
            {drafts.length > 0 && (
              <div className="border-t border-border/40 bg-background px-4 py-3 md:mx-auto md:w-full md:max-w-md">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drafts ({drafts.length})</h2>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {drafts.slice(0, 6).map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => void loadDraft(draft)}
                      className="flex-shrink-0 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                    >
                      <p className="line-clamp-1 text-xs font-medium text-foreground">{draft.title}</p>
                      <p className="text-[10px] text-muted-foreground">{draft.clips.length} clips</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}



        {step === "edit" && activeClip && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-border p-3">
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
                {activeClip.file.type.startsWith("image/") ? (
                  <img
                    key={activeClip.id}
                    src={activeClip.url}
                    alt=""
                    className="h-full w-full object-contain"
                    style={{ filter: getClipFilterCss(activeClip) }}
                  />
                ) : (
                  <video
                    key={activeClip.id}
                    src={activeClip.url}
                    controls
                    playsInline
                    muted={activeClip.muteOriginal}
                    className="h-full w-full object-contain"
                    style={{ filter: getClipFilterCss(activeClip) }}
                  />
                )}
                {!activeClip.file.type.startsWith("image/") && (
                  <>
                    <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                      {Math.max(0, activeClip.trimEnd - activeClip.trimStart).toFixed(1)}s
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2"
                      onClick={() => updateActiveClip({ muteOriginal: !activeClip.muteOriginal })}
                    >
                      {activeClip.muteOriginal ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </>
                )}
              </div>

              {!activeClip.file.type.startsWith("image/") && (
                <>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Trim start/end</span>
                      <span className="text-xs text-muted-foreground">
                        {activeClip.trimStart.toFixed(1)}s - {activeClip.trimEnd.toFixed(1)}s
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={Math.max(activeClip.duration, 1)}
                      step={0.1}
                      value={[activeClip.trimStart, activeClip.trimEnd]}
                      onValueChange={(value) => {
                        const [start, end] = value;
                        updateActiveClip({
                          trimStart: Math.max(0, Math.min(start, end - 0.1)),
                          trimEnd: Math.max(start + 0.1, end),
                          coverTime: Math.min(Math.max(activeClip.coverTime, start), end),
                        });
                      }}
                    />
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Cover frame</span>
                      <span className="text-xs text-muted-foreground">{activeClip.coverTime.toFixed(1)}s</span>
                    </div>
                    <Slider
                      min={activeClip.trimStart}
                      max={activeClip.trimEnd}
                      step={0.1}
                      value={[activeClip.coverTime]}
                      onValueChange={(value) => updateActiveClip({ coverTime: value[0] })}
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-20 w-[45px] flex-shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                        {thumbnailPreviewUrl ? (
                          <img src={thumbnailPreviewUrl} alt="Cover preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Image className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Cover preview updates as you adjust the frame.
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="mt-4 grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Filter stack (up to 3)</label>
                  <div className="flex flex-wrap gap-2">
                    {FILTER_PRESETS.map((preset) => {
                      const enabled = activeClip.filterStack.includes(preset.id);
                      return (
                        <Button
                          key={preset.id}
                          type="button"
                          size="sm"
                          variant={enabled ? "default" : "outline"}
                          onClick={() => toggleFilterPreset(preset.id)}
                        >
                          {preset.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Brightness</label>
                  <Slider
                    min={50}
                    max={150}
                    step={1}
                    value={[activeClip.brightness]}
                    onValueChange={(value) => updateActiveClip({ brightness: value[0] })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Contrast</label>
                  <Slider
                    min={50}
                    max={150}
                    step={1}
                    value={[activeClip.contrast]}
                    onValueChange={(value) => updateActiveClip({ contrast: value[0] })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Saturation</label>
                  <Slider
                    min={0}
                    max={200}
                    step={1}
                    value={[activeClip.saturation]}
                    onValueChange={(value) => updateActiveClip({ saturation: value[0] })}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium">Thumbnail text overlay</label>
                <Input
                  value={activeClip.thumbnailText}
                  onChange={(e) => updateActiveClip({ thumbnailText: e.target.value })}
                  maxLength={60}
                  placeholder="Add cover text"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground">Clip stack</h2>
                <Button variant="outline" size="sm" onClick={() => galleryInputRef.current?.click()}>
                  <Plus className="mr-1 h-4 w-4" /> Add clip
                </Button>
              </div>

              <div className="mb-3 flex items-center justify-between rounded-lg border border-border p-2">
                <div>
                  <p className="text-sm font-medium">Multi-clip merge</p>
                  <p className="text-xs text-muted-foreground">Toggle merge mode for a combined upload flow</p>
                </div>
                <Switch checked={mergeClips} onCheckedChange={setMergeClips} />
              </div>

              <div className="space-y-2">
                {clips.map((clip, index) => (
                  <div
                    key={clip.id}
                    className={`flex items-center gap-2 rounded-lg border p-2 ${
                      activeClip?.id === clip.id ? "border-primary" : "border-border"
                    }`}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setActiveClipId(clip.id)}
                    >
                      {clip.file.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <Film className="h-4 w-4 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{clip.file.name}</p>
                        <p className="text-xs text-muted-foreground">{clip.file.type.startsWith("image/") ? "Photo" : `${clip.duration.toFixed(1)}s`}</p>
                      </div>
                    </button>
                    <Button size="icon" variant="ghost" onClick={() => moveClip(clip.id, "up")} disabled={index === 0}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => moveClip(clip.id, "down")}
                      disabled={index === clips.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeClip(clip.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                Total edited duration: {totalDuration.toFixed(1)}s
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={() => void saveDraft(false)}>
                  <Save className="mr-2 h-4 w-4" /> Save draft
                </Button>
                <Button onClick={() => setStep("share")}>Continue to Share</Button>
              </div>
            </div>
          </div>
        )}

        {step === "share" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-border p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Caption composer</h2>
              <Textarea
                placeholder="Write a caption with #hashtags and @mentions"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                rows={8}
                className="resize-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{caption.length}/2200</span>
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" /> {hashtagCount} hashtags
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {mentionCount} mentions
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Music picker</label>
                  <div className="relative">
                    <Music className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={musicName}
                      onChange={(e) => setMusicName(e.target.value)}
                      placeholder="Track name"
                      className="pl-9"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => musicInputRef.current?.click()}>
                      Add music file
                    </Button>
                    {!!musicFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (musicFileUrl) URL.revokeObjectURL(musicFileUrl);
                          setMusicFile(null);
                          setMusicFileUrl(null);
                          setMusicEnabled(false);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{musicFile ? musicFile.name : "No music file selected"}</p>
                      <p className="text-[11px] text-muted-foreground">Music is mixed into exported video</p>
                    </div>
                    <Switch checked={musicEnabled} onCheckedChange={setMusicEnabled} disabled={!musicFile} />
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Clip start time</span>
                      <span>{musicStart.toFixed(1)}s</span>
                    </div>
                    <Slider min={0} max={30} step={0.1} value={[musicStart]} onValueChange={(v) => setMusicStart(v[0])} />
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Music volume</span>
                      <span>{Math.round(musicVolume * 100)}%</span>
                    </div>
                    <Slider min={0} max={1} step={0.05} value={[musicVolume]} onValueChange={(v) => setMusicVolume(v[0])} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Collaborators</label>
                  <Input
                    value={collaborators}
                    onChange={(e) => setCollaborators(e.target.value)}
                    placeholder="@user1, @user2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Tag people</label>
                  <Input
                    value={taggedPeople}
                    onChange={(e) => setTaggedPeople(e.target.value)}
                    placeholder="@tag1, @tag2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Add location"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Share settings</h2>

              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Audience</p>
                  <RadioGroup value={audience} onValueChange={(value) => setAudience(value as Audience)}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="public" id="aud-public" />
                      <label htmlFor="aud-public" className="text-sm">Public</label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <RadioGroupItem value="followers" id="aud-followers" />
                      <label htmlFor="aud-followers" className="text-sm">Followers</label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Comments</span>
                    <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <label className="mb-1 block text-sm font-medium">Scheduled posting</label>
                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Future schedules are saved as drafts.</p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Cross-post</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Story</span>
                      <Switch checked={crossPostStory} onCheckedChange={setCrossPostStory} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Clippy</span>
                      <Switch checked={crossPostReel} onCheckedChange={setCrossPostReel} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Profile</span>
                      <Switch checked={crossPostProfile} onCheckedChange={setCrossPostProfile} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <label className="mb-1 block text-sm font-medium">Visibility controls</label>
                  <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="close_friends">Close Friends</SelectItem>
                      <SelectItem value="age_18_plus">18+ audience</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Content warning</span>
                    </div>
                    <Switch checked={contentWarning} onCheckedChange={setContentWarning} />
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {uploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {uploadStage}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="transition-all duration-300" />
                  </div>
                )}

                {uploadError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
                    {uploadError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void saveDraft(false)} disabled={uploading}>
                    <Save className="mr-2 h-4 w-4" /> Save draft
                  </Button>
                  <Button variant="outline" onClick={() => setStep("edit")} disabled={uploading}>
                    Back to edit
                  </Button>
                  <Button onClick={() => void handleUpload()} disabled={uploading || !clips.length}>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing...
                      </>
                    ) : (
                      "Share"
                    )}
                  </Button>
                  {uploading && (
                    <Button variant="destructive" onClick={requestCancelUpload}>
                      Cancel
                    </Button>
                  )}
                  {!!uploadError && !uploading && (
                    <Button onClick={() => void handleUpload()}>
                      Retry
                    </Button>
                  )}
                </div>

                <div className="rounded-lg bg-secondary/40 p-2 text-xs text-muted-foreground">
                  <p className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Multi-clip upload is enabled.</p>
                  <p className="mt-1">Merge mode is {mergeClips ? "ON" : "OFF"}. {mergeClips ? "Clips upload as a combined workflow." : "Each selected clip is posted."}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="mx-auto max-w-lg rounded-2xl border border-border p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Check className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold">Upload complete</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {successCount} post{successCount !== 1 ? "s" : ""} published successfully.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  if (lastCreatedVideoId) {
                    navigate("/");
                  } else {
                    navigate("/");
                  }
                }}
              >
                View post
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearAll();
                  setStep("select");
                }}
              >
                Create another
              </Button>
            </div>
          </div>
        )}

        {cameraOpen && (
          <div className="fixed inset-0 z-[70] bg-black">
            <div className="relative flex h-full w-full flex-col">
              {/* Camera top bar */}
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-safe py-3">
                <button onClick={closeCamera} className="rounded-full bg-black/40 p-2 text-white backdrop-blur">
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCameraFlash(!cameraFlash)}
                    className="rounded-full bg-black/40 p-2 text-white backdrop-blur"
                  >
                    {cameraFlash ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Camera viewfinder with filter */}
              <div className="flex-1 overflow-hidden">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className={`h-full w-full object-cover ${cameraFacingMode === "user" ? "scale-x-[-1]" : ""}`}
                  style={{
                    filter: CAMERA_FILTERS[cameraFilterIndex]?.css || "none",
                  }}
                />
              </div>

              {/* Filter carousel */}
              <div className="absolute inset-x-0 bottom-36 z-10 px-2">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {CAMERA_FILTERS.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => setCameraFilterIndex(i)}
                      className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
                        cameraFilterIndex === i
                          ? "bg-white text-black shadow-lg"
                          : "bg-white/15 text-white/80 backdrop-blur"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera bottom controls */}
              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-6 bg-gradient-to-t from-black/80 to-transparent px-6 pb-safe py-8">
                <div className="flex w-full items-center justify-around">
                  {/* Gallery shortcut */}
                  <button
                    onClick={() => {
                      closeCamera();
                      galleryGridInputRef.current?.click();
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 bg-white/10"
                  >
                    <ImageIcon className="h-5 w-5 text-white" />
                  </button>

                  {/* Capture button */}
                  {!cameraRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[4px] border-white"
                    >
                      <div className="h-[60px] w-[60px] rounded-full bg-white" />
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[4px] border-destructive"
                    >
                      <div className="h-8 w-8 rounded-md bg-destructive" />
                    </button>
                  )}

                  {/* Flip camera */}
                  <button
                    onClick={() => void toggleCameraFacing()}
                    disabled={cameraRecording}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-40"
                  >
                    <SwitchCamera className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Create;
