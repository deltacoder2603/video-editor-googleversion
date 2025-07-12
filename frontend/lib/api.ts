// Enhanced API client for the updated Express.js backend with AssemblyAI
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface VideoInfo {
  duration: number;
  size: number;
  format: string;
  video: {
    codec: string;
    resolution: string;
    fps: string;
    bitrate: number;
  };
  audio: {
    codec: string;
    channels: number;
    sampleRate: number;
  };
}

export interface AudioInfo {
  duration: number;
  size: number;
  format: string;
  audio: {
    codec: string;
    channels: number;
    sampleRate: number;
    bitrate: number;
  };
}

export interface UploadResponse {
  success: boolean;
  file: {
    id: string;
    originalName: string;
    filename: string;
    size: number;
    path: string;
    uploadedAt: string;
    fileType: 'video' | 'audio';
    videoInfo?: VideoInfo;
    audioInfo?: AudioInfo;
  };
  videoInfo?: VideoInfo;
  audioInfo?: AudioInfo;
}

export interface MultiUploadResponse {
  success: boolean;
  files: Array<{
    id: string;
    originalName: string;
    filename: string;
    size: number;
    path: string;
    uploadedAt: string;
    fileType: 'video' | 'audio';
    videoInfo?: VideoInfo;
    audioInfo?: AudioInfo;
  }>;
  sessionId: string;
}

export interface SessionResponse {
  success: boolean;
  sessionId: string;
}

export interface TranscriptionWord {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speaker?: string; // New: speaker information from AssemblyAI
}

export interface TranscriptionSegment {
  index: number;
  text: string;
  confidence: number;
  start?: number;
  end?: number;
  speaker?: string; // New: speaker information from AssemblyAI
}

export interface TranscriptionResponse {
  success: boolean;
  transcription: {
    fullText: string;
    segments: TranscriptionSegment[];
    words: TranscriptionWord[];
    detectedLanguage?: string; // New: detected language from AssemblyAI
    languageConfidence?: number; // New: language detection confidence
  };
  fileId: string;
  fileType: 'video' | 'audio';
  processingInfo: {
    audioSizeMB: number;
    method: 'assemblyai_enhanced'; // Updated method name
  };
}

export interface ProfanitySegment {
  word: string;
  start: number;
  end: number;
  confidence: number;
  source?: 'assemblyai' | 'custom'; // New: source of profanity detection
}

export interface ProfanityDetectionResponse {
  success: boolean;
  profanitySegments: ProfanitySegment[];
  transcription: {
    fullText: string;
    segments: TranscriptionSegment[];
    words: TranscriptionWord[];
    detectedLanguage?: string; // New: detected language
    languageConfidence?: number; // New: language confidence
  };
  fileId: string;
  detectedLanguage?: string; // New: detected language
  languageConfidence?: number; // New: language confidence
  processingInfo: {
    audioSizeMB: number;
    method: 'assemblyai_enhanced'; // Updated method name
    profanitySourcesUsed: string[]; // New: sources used for profanity detection
  };
}

export interface EditHistoryEntry {
  version: number;
  type: 'profanity_filter' | 'audio_removal' | 'trim' | 'multi_trim_join';
  filename: string;
  sourceVersion: string;
  timestamp: string;
  segments?: Array<{ start: number; end: number }>;
  joinSegments?: boolean;
  videoSegments?: Array<{
    videoId: string;
    segments: Array<{ start: number; end: number }>;
  }>;
}

export interface SessionHistoryResponse {
  success: boolean;
  session: {
    id: string;
    videos: Array<{
      id: string;
      originalName: string;
      filename: string;
      size: number;
      path: string;
      uploadedAt: string;
      fileType: 'video' | 'audio';
      videoInfo?: VideoInfo;
      audioInfo?: AudioInfo;
    }>;
    createdAt: string;
    currentVersion: number;
  };
  history: EditHistoryEntry[];
  availableVersions: string[];
}

export interface ProcessResponse {
  success: boolean;
  outputFile: string;
  downloadUrl: string;
  version?: number;
}

export interface ProcessingProgress {
  phase: string;
  progress: number;
  message: string;
}

export interface VideoSegment {
  videoId: string;
  segments: Array<{ start: number; end: number }>;
}

// Create a new session
export const createSession = async (): Promise<SessionResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Session creation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Session creation error:', error);
    throw error;
  }
};

// Upload multiple videos
export const uploadMultipleVideos = async (
  files: File[],
  sessionId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<MultiUploadResponse> => {
  const formData = new FormData();
  files.forEach(file => formData.append('videos', file));
  formData.append('sessionId', sessionId);

  if (onProgress) {
    onProgress({
      phase: 'Uploading',
      progress: 0.1,
      message: `Uploading ${files.length} videos...`
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload-multiple`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Multi-upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: `Successfully uploaded ${files.length} videos!`
      });
    }

    return result;
  } catch (error) {
    console.error('Multi-upload error:', error);
    throw error;
  }
};

// Upload single video
export const uploadVideo = async (
  file: File,
  sessionId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('sessionId', sessionId);

  if (onProgress) {
    onProgress({
      phase: 'Uploading',
      progress: 0.1,
      message: 'Starting file upload...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Upload completed successfully!'
      });
    }

    return result;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

// Upload audio file
export const uploadAudio = async (
  file: File,
  sessionId: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('sessionId', sessionId);

  if (onProgress) {
    onProgress({
      phase: 'Uploading',
      progress: 0.1,
      message: 'Starting audio upload...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload-audio`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Audio upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Audio upload completed successfully!'
      });
    }

    return result;
  } catch (error) {
    console.error('Audio upload error:', error);
    throw error;
  }
};

// Get transcript (AssemblyAI auto-detects language)
export const getTranscript = async (
  fileId: string,
  sessionId: string
): Promise<TranscriptionResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        sessionId
      }),
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
};

// Detect profanity (AssemblyAI auto-detects language)
export const detectProfanity = async (
  fileId: string,
  sessionId: string,
  customWords: string[] = [],
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProfanityDetectionResponse> => {
  if (onProgress) {
    onProgress({
      phase: 'Processing',
      progress: 0.1,
      message: 'Starting profanity detection...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/detect-profanity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        sessionId,
        customWords
      }),
    });

    if (!response.ok) {
      throw new Error(`Profanity detection failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Profanity detection completed!'
      });
    }

    return result;
  } catch (error) {
    console.error('Profanity detection error:', error);
    throw error;
  }
};

// Add custom profanity words
export const addCustomProfanityWords = async (words: string[]): Promise<{ success: boolean; customProfanityList: string[] }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profanity/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ words }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add profanity words: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Add profanity words error:', error);
    throw error;
  }
};

// Get custom profanity words
export const getCustomProfanityWords = async (): Promise<{ success: boolean; customProfanityList: string[] }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profanity/list`);

    if (!response.ok) {
      throw new Error(`Failed to get profanity words: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get profanity words error:', error);
    throw error;
  }
};

// Remove custom profanity words
export const removeCustomProfanityWords = async (words: string[]): Promise<{ success: boolean; customProfanityList: string[] }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/profanity/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ words }),
    });

    if (!response.ok) {
      throw new Error(`Failed to remove profanity words: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Remove profanity words error:', error);
    throw error;
  }
};

// Get session history
export const getSessionHistory = async (sessionId: string): Promise<SessionHistoryResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}/history`);

    if (!response.ok) {
      throw new Error(`Failed to get session history: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get session history error:', error);
    throw error;
  }
};

// Remove audio from segments
export const removeAudioFromSegments = async (
  fileId: string,
  segments: Array<{ start: number; end: number }>,
  sessionId: string,
  sourceVersion: string = 'original',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessResponse> => {
  if (onProgress) {
    onProgress({
      phase: 'Processing',
      progress: 0.1,
      message: 'Removing audio from segments...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/process/audio-remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        segments,
        sessionId,
        sourceVersion
      }),
    });

    if (!response.ok) {
      throw new Error(`Audio removal failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Audio removal completed!'
      });
    }

    return result;
  } catch (error) {
    console.error('Audio removal error:', error);
    throw error;
  }
};

// Trim video
export const trimVideo = async (
  fileId: string,
  segments: Array<{ start: number; end: number }>,
  joinSegments: boolean = false,
  sessionId: string,
  sourceVersion: string = 'original',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessResponse> => {
  if (onProgress) {
    onProgress({
      phase: 'Processing',
      progress: 0.1,
      message: 'Trimming video...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/process/trim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        segments,
        joinSegments,
        sessionId,
        sourceVersion
      }),
    });

    if (!response.ok) {
      throw new Error(`Video trimming failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Video trimming completed!'
      });
    }

    return result;
  } catch (error) {
    console.error('Video trimming error:', error);
    throw error;
  }
};

// Mute profanity
export const muteProfanity = async (
  fileId: string,
  segments: Array<{ start: number; end: number }>,
  sessionId: string,
  sourceVersion: string = 'original',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessResponse> => {
  if (onProgress) {
    onProgress({
      phase: 'Processing',
      progress: 0.1,
      message: 'Muting profanity...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/process/profanity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId,
        segments,
        sessionId,
        sourceVersion
      }),
    });

    if (!response.ok) {
      throw new Error(`Profanity muting failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Profanity muting completed!'
      });
    }

    return result;
  } catch (error) {
    console.error('Profanity muting error:', error);
    throw error;
  }
};

// Multi-video trim and join
export const multiVideoTrimJoin = async (
  sessionId: string,
  videoSegments: VideoSegment[],
  outputName?: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessResponse> => {
  if (onProgress) {
    onProgress({
      phase: 'Processing',
      progress: 0.1,
      message: 'Processing multi-video trim and join...'
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/process/multi-trim-join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        videoSegments,
        outputName
      }),
    });

    if (!response.ok) {
      throw new Error(`Multi-video processing failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        phase: 'Complete',
        progress: 1,
        message: 'Multi-video processing completed!'
      });
    }

    return result;
  } catch (error) {
    console.error('Multi-video processing error:', error);
    throw error;
  }
};

// Download video
export const downloadVideo = (filename: string): void => {
  const downloadUrl = `${API_BASE_URL}/api/download/${filename}`;
  window.open(downloadUrl, '_blank');
};

// Cleanup session
export const cleanupSession = async (sessionId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/session/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Cleanup failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
};

// Get video preview URL
export const getVideoPreviewUrl = (filename: string): string => {
  return `${API_BASE_URL}/uploads/${filename}`;
};

// Get processed video URL
export const getProcessedVideoUrl = (filename: string): string => {
  return `${API_BASE_URL}/api/download/${filename}`;
};

// Utility functions
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};