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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
const DB_NAME = "opium-create-drafts";
const DB_STORE = "drafts";

type Step = "select" | "edit" | "share" | "success";
type Audience = "public" | "followers";
type Visibility = "everyone" | "close_friends" | "age_18_plus";

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
) => {
  if (!isClipProcessingNeeded(clip)) return clip.file;

  if (typeof MediaRecorder === "undefined") return clip.file;

  const video = document.createElement("video");
  video.src = clip.url;
  video.preload = "auto";
  video.playsInline = true;
  video.muted = clip.muteOriginal;

  await waitForMetadata(video);

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  const context = canvas.getContext("2d");
  if (!context) return clip.file;

  const stream = canvas.captureStream(30);
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
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

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

const mergeClipsToSingleFile = async (clips: ClipItem[], music: MusicOverlaySettings) => {
  if (clips.length === 1) {
    return processClipToFile(clips[0], clips[0].id, music);
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Merge is not supported in this browser");
  }

  const firstVideo = document.createElement("video");
  firstVideo.src = clips[0].url;
  firstVideo.preload = "metadata";
  await waitForMetadata(firstVideo);

  const canvas = document.createElement("canvas");
  canvas.width = firstVideo.videoWidth || 720;
  canvas.height = firstVideo.videoHeight || 1280;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not initialize merge renderer");

  const stream = canvas.captureStream(30);
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
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

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

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);

  const [step, setStep] = useState<Step>("select");
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [lastCreatedVideoId, setLastCreatedVideoId] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("environment");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraRecording, setCameraRecording] = useState(false);

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
    },
    [cameraStream, musicFileUrl],
  );

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
      if (!file.type.startsWith("video/")) {
        toast.error(`${file.name}: only video files are supported`);
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
        const duration = await getDuration(file);
        const id = asId();
        return {
          id,
          file,
          url: URL.createObjectURL(file),
          duration,
          trimStart: 0,
          trimEnd: duration,
          coverTime: Math.min(1, duration),
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

    const recorder = new MediaRecorder(cameraStream, { mimeType });
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
    setSuccessCount(0);
    setLastCreatedVideoId(null);
    setStep("select");
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
    lines.push(`Cross-post: story=${crossPostStory}, reel=${crossPostReel}, profile=${crossPostProfile}`);
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

    const targets = mergeClips && clips.length > 1
      ? [{ clip: clips[0], file: await mergeClipsToSingleFile(clips, musicOverlay), index: 0, total: 1 }]
      : await Promise.all(
          clips.map(async (clip, index) => ({
            clip,
            file: await processClipToFile(clip, `${clip.id}-${index}`, musicOverlay),
            index,
            total: clips.length,
          })),
        );
    let createdCount = 0;
    let latestId: string | null = null;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (cancelRequestedRef.current) throw new Error("Upload canceled");

        const target = targets[index];
        const { clip, file } = target;
        const ext = file.name.split(".").pop() || "webm";
        const filePath = `${user.id}/${Date.now()}-${index}.${ext}`;
        const thumbnailPath = `${user.id}/thumb-${Date.now()}-${index}.jpg`;

        setUploadProgress(Math.round((index / targets.length) * 100));

        const { error: videoError } = await supabase.storage
          .from("videos")
          .upload(filePath, file, { contentType: file.type || "video/webm" });
        if (videoError) throw videoError;

        if (cancelRequestedRef.current) throw new Error("Upload canceled");

        const thumbnailBlob = await generateThumbnailBlob(clip);
        const { error: thumbError } = await supabase.storage
          .from("videos")
          .upload(thumbnailPath, thumbnailBlob, { contentType: "image/jpeg", upsert: true });
        if (thumbError) throw thumbError;

        const { data: videoUrlData } = supabase.storage.from("videos").getPublicUrl(filePath);
        const { data: thumbUrlData } = supabase.storage.from("videos").getPublicUrl(thumbnailPath);

        const musicLabel = musicName.trim()
          ? `${musicName.trim()}${musicStart > 0 ? ` @ ${musicStart.toFixed(1)}s` : ""}`
          : null;

        const payload = {
          user_id: user.id,
          video_url: videoUrlData.publicUrl,
          thumbnail_url: thumbUrlData.publicUrl,
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

        let { data: createdVideo, error: dbError } = await supabase
          .from("videos")
          .insert(payload as never)
          .select("id")
          .single();

        if (dbError) {
          const fallbackPayload = {
            user_id: user.id,
            video_url: videoUrlData.publicUrl,
            thumbnail_url: thumbUrlData.publicUrl,
            description: buildDescription(clip, index, targets.length),
            music: musicLabel,
          };

          const fallback = await supabase
            .from("videos")
            .insert(fallbackPayload as never)
            .select("id")
            .single();

          createdVideo = fallback.data;
          dbError = fallback.error;
        }

        if (dbError) throw dbError;

        createdCount += 1;
        latestId = createdVideo?.id ?? null;
        setUploadProgress(Math.round(((index + 1) / targets.length) * 100));
      }

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
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const requestCancelUpload = () => {
    cancelRequestedRef.current = true;
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

  return (
    <div className="fade-in min-h-screen bg-background px-4 pb-24 pt-4">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== "select" && step !== "success" && (
              <Button variant="ghost" size="icon" onClick={() => setStep("select")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-xl font-bold">Create</h1>
          </div>
          <Button variant="outline" onClick={clearAll}>
            Reset
          </Button>
        </div>

        {step !== "success" && (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-border p-2">
            <Button
              variant={step === "select" ? "default" : "ghost"}
              onClick={() => setStep("select")}
              className="w-full"
            >
              Select
            </Button>
            <Button
              variant={step === "edit" ? "default" : "ghost"}
              onClick={() => clips.length && setStep("edit")}
              className="w-full"
              disabled={!clips.length}
            >
              Edit
            </Button>
            <Button
              variant={step === "share" ? "default" : "ghost"}
              onClick={() => clips.length && setStep("share")}
              className="w-full"
              disabled={!clips.length}
            >
              Share
            </Button>
          </div>
        )}

        <input
          ref={galleryInputRef}
          type="file"
          accept="video/*"
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
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-border p-4">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Source picker</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => void startCamera("environment")}
                >
                  <Camera className="h-5 w-5" />
                  Camera
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <Image className="h-5 w-5" />
                  Gallery
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => setStep("share")}
                  disabled={!drafts.length}
                >
                  <Save className="h-5 w-5" />
                  Drafts
                </Button>
              </div>

              <div className="mt-4 rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                <p>Supports multi-clip upload/merge, draft restore, schedule setup, and full share controls.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground">Drafts</h2>
                <span className="text-xs text-muted-foreground">{drafts.length}</span>
              </div>
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drafts yet.</p>
              ) : (
                <div className="space-y-2">
                  {drafts.slice(0, 6).map((draft) => (
                    <div key={draft.id} className="rounded-lg border border-border p-2">
                      <p className="line-clamp-1 text-sm font-medium">{draft.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.clips.length} clip{draft.clips.length !== 1 ? "s" : ""} · {new Date(draft.updatedAt).toLocaleString()}
                      </p>
                      {!!draft.scheduledAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Scheduled: {new Date(draft.scheduledAt).toLocaleString()}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void loadDraft(draft)}>
                          Load
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void deleteDraft(draft.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "edit" && activeClip && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-border p-3">
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
                <video
                  key={activeClip.id}
                  src={activeClip.url}
                  controls
                  playsInline
                  muted={activeClip.muteOriginal}
                  className="h-full w-full object-contain"
                  style={{
                    filter: getClipFilterCss(activeClip),
                  }}
                />
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
              </div>

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
              </div>

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
                      <Film className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{clip.file.name}</p>
                        <p className="text-xs text-muted-foreground">{clip.duration.toFixed(1)}s</p>
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
                      <span className="text-sm">Reel</span>
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
                      <span>Uploading</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
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
          <div className="fixed inset-0 z-[70] bg-black/95">
            <div className="mx-auto flex h-full w-full max-w-md flex-col px-4 pb-8 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Camera</p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void toggleCameraFacing()} disabled={cameraRecording}>
                    Flip
                  </Button>
                  <Button variant="destructive" size="sm" onClick={closeCamera}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="relative flex-1 overflow-hidden rounded-xl border border-white/20 bg-black">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className={`h-full w-full object-cover ${cameraFacingMode === "user" ? "scale-x-[-1]" : ""}`}
                />
              </div>

              <div className="mt-4 flex items-center justify-center gap-2">
                {!cameraRecording ? (
                  <Button className="w-full" onClick={startRecording}>
                    <Camera className="mr-2 h-4 w-4" /> Start recording
                  </Button>
                ) : (
                  <Button variant="destructive" className="w-full" onClick={stopRecording}>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stop & use clip
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Create;
