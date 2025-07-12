const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const { AssemblyAI } = require('assemblyai');

const assemblyClient = new AssemblyAI({
  apiKey: "102bbf7aedf94943b60951a88c9fb20f" // Replace with your actual API key
});

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


let videoSessions = new Map();
let editHistory = new Map();
let customProfanityList = new Set();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    fs.mkdir(uploadDir, { recursive: true }).then(() => cb(null, uploadDir));
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Accept both video and audio files
    const allowedExtensions = /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|mp3|wav|flac|aac|ogg|m4a|wma)$/i;
    const extname = allowedExtensions.test(file.originalname);
    const allowedMimeTypes = /^(video|audio)\/(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|x-msvideo|quicktime|mpeg|wav|flac|aac|ogg|m4a|wma)$/i;
    const mimetype = allowedMimeTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only video and audio files are allowed'));
  }
});

async function splitAudioIntoChunks(audioPath, outputDir, chunkDurationSeconds = 300) {
  // AssemblyAI handles large files automatically, so we can simplify this
  // But keep the function for backward compatibility
  const audioInfo = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });

  const totalDuration = audioInfo.format.duration;
  
  // For AssemblyAI, we don't need to chunk files as it handles large files
  // Return the original file as a single "chunk"
  return [{
    path: audioPath,
    startTime: 0,
    endTime: totalDuration,
    sizeMB: (await fs.stat(audioPath)).size / (1024 * 1024)
  }];
}

async function transcribeAudioWithChunking(audioPath) {
  console.log('Using AssemblyAI for transcription...');
  
  try {
    // Upload the file first
    const uploadUrl = await assemblyClient.files.upload(audioPath);
    
    const transcript = await assemblyClient.transcripts.transcribe({
      audio: uploadUrl,
      speech_model: "slam-1",
      speaker_labels: true,
      filter_profanity: true,
      format_text: true,
      punctuate: true,
      language_detection: true,
      word_boost: [],
      auto_highlights: false
    });

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    console.log(`Transcription completed. Detected language: ${transcript.language_code || 'auto-detected'}`);
    return processAssemblyAIResponse(transcript);
  } catch (error) {
    console.error('AssemblyAI transcription error:', error);
    throw error;
  }
}

async function convertToMp4(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const outputPath = ext === '.mp4' ? inputPath : inputPath.replace(ext, '.mp4');
  if (ext !== '.mp4') {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-strict', 'experimental',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    await fs.unlink(inputPath).catch(() => {});
  }
  return outputPath;
}

async function convertToMp3(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const outputPath = ext === '.mp3' ? inputPath : inputPath.replace(ext, '.mp3');
  
  if (ext !== '.mp3') {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:a', 'libmp3lame',
          '-b:a', '192k',
          '-ar', '44100',
          '-ac', '2'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    await fs.unlink(inputPath).catch(() => {});
  }
  return outputPath;
}

async function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration,
        size: metadata.format.size,
        format: metadata.format.format_name,
        video: {
          codec: videoStream?.codec_name,
          resolution: `${videoStream?.width}x${videoStream?.height}`,
          fps: videoStream?.r_frame_rate,
          bitrate: videoStream?.bit_rate
        },
        audio: {
          codec: audioStream?.codec_name,
          channels: audioStream?.channels,
          sampleRate: audioStream?.sample_rate
        }
      });
    });
  });
}

async function getAudioInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      resolve({
        duration: metadata.format.duration,
        size: metadata.format.size,
        format: metadata.format.format_name,
        audio: {
          codec: audioStream?.codec_name,
          channels: audioStream?.channels,
          sampleRate: audioStream?.sample_rate,
          bitrate: audioStream?.bit_rate
        }
      });
    });
  });
}

// Extract audio from video for transcription
async function extractAudioForTranscription(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .noVideo()
      .audioCodec('libmp3lame') // Changed from 'flac' to 'libmp3lame'
      .audioChannels(1) // Mono channel
      .audioFrequency(16000) // 16kHz sample rate
      .outputOptions([
        '-b:a', '128k', // Set bitrate to 128kbps (good quality for speech)
        '-sample_fmt', 's16'
      ])
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// Transcribe audio using AssemblyAI with slam-1 model and automatic language detection
async function transcribeAudio(audioPath) {
  try {
    const audioStats = await fs.stat(audioPath);
    const audioSizeInMB = audioStats.size / (1024 * 1024);
    
    console.log(`Audio file size: ${audioSizeInMB.toFixed(2)}MB`);
    
    // Upload the file first, then transcribe
    const uploadUrl = await assemblyClient.files.upload(audioPath);
    
    const transcript = await assemblyClient.transcripts.transcribe({
      audio: uploadUrl,
      speech_model: "universal",
      speaker_labels: true,           // ✅ Already applied
      filter_profanity: true,         // ✅ Already applied
      format_text: true,
      punctuate: true,
      language_detection: true,       // ✅ Already applied
      redact_pii: false,              // Optional: redact personal info
      redact_pii_policies: [],
      word_boost: [],
      auto_highlights: false
    });

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    console.log(`Transcription completed. Detected language: ${transcript.language_code || 'auto-detected'}`);
    return processAssemblyAIResponse(transcript);
  } catch (error) {
    console.error('AssemblyAI transcription error:', error);
    throw error;
  }
}

// Process the transcription response into a more usable format
function processAssemblyAIResponse(transcript) {
  const transcription = {
    fullText: transcript.text || '',
    segments: [],
    words: [],
    detectedLanguage: transcript.language_code || 'unknown',
    languageConfidence: transcript.language_confidence || 0,
    filtered_words: transcript.filtered_words || [] // Add profanity data
  };

  // Process words with timestamps
  if (transcript.words) {
    transcript.words.forEach((word, index) => {
      transcription.words.push({
        word: word.text,
        startTime: word.start / 1000,
        endTime: word.end / 1000,
        confidence: word.confidence || 0,
        speaker: word.speaker || null // Add speaker info if available
      });
    });
  }

  // Create segments from utterances with speaker information
  if (transcript.utterances && transcript.utterances.length > 0) {
    transcript.utterances.forEach((utterance, index) => {
      transcription.segments.push({
        index: index,
        text: utterance.text,
        confidence: utterance.confidence || 0,
        start: utterance.start / 1000,
        end: utterance.end / 1000,
        speaker: utterance.speaker || `Speaker_${utterance.speaker || 'Unknown'}`
      });
    });
  } else {
    // Fallback: create a single segment
    transcription.segments.push({
      index: 0,
      text: transcript.text || '',
      confidence: transcript.confidence || 0,
      speaker: 'Unknown'
    });
  }

  return transcription;
}

// Find profanity in transcription
function findProfanityInTranscription(transcription, customProfanityWords = new Set()) {
  const profanitySegments = [];
  
  // Use AssemblyAI's filtered words if available
  if (transcription.filtered_words && transcription.filtered_words.length > 0) {
    transcription.filtered_words.forEach(filteredWord => {
      profanitySegments.push({
        word: filteredWord.text,
        start: filteredWord.start / 1000,
        end: filteredWord.end / 1000,
        confidence: filteredWord.confidence || 1.0,
        source: 'assemblyai'
      });
    });
  }
  
  // Also check for custom profanity words in the transcription
  if (transcription.words) {
    transcription.words.forEach(word => {
      if (customProfanityWords.has(word.word.toLowerCase())) {
        // Check if this word is not already detected by AssemblyAI
        const alreadyDetected = profanitySegments.some(seg => 
          Math.abs(seg.start - word.startTime) < 0.1 && 
          Math.abs(seg.end - word.endTime) < 0.1
        );
        
        if (!alreadyDetected) {
          profanitySegments.push({
            word: word.word,
            start: word.startTime,
            end: word.endTime,
            confidence: word.confidence,
            source: 'custom'
          });
        }
      }
    });
  }
  
  return profanitySegments;
}

async function handleSingleUpload(file) {
  const fileType = file.mimetype.startsWith('video/') ? 'video' : 'audio';
  let convertedPath, fileInfo;
  
  if (fileType === 'video') {
    convertedPath = await convertToMp4(file.path);
    fileInfo = await getVideoInfo(convertedPath);
  } else {
    convertedPath = await convertToMp3(file.path);
    fileInfo = await getAudioInfo(convertedPath);
  }
  
  return {
    id: path.parse(convertedPath).name,
    originalName: file.originalname,
    filename: path.basename(convertedPath),
    size: file.size,
    path: convertedPath,
    uploadedAt: new Date(),
    fileType: fileType,
    [fileType === 'video' ? 'videoInfo' : 'audioInfo']: fileInfo
  };
}

app.post('/api/session/create', async (req, res) => {
  console.log('Session creation requested');
  try {
    const sessionId = uuidv4();
    videoSessions.set(sessionId, { id: sessionId, videos: [], createdAt: new Date(), currentVersion: 0 });
    editHistory.set(sessionId, []);
    res.json({ success: true, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
  console.log('Upload req.body:', req.body);
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileData = await handleSingleUpload(req.file);

    // Associate with session
    if (req.body.sessionId) {
      const session = videoSessions.get(req.body.sessionId);
      if (session) {
        session.videos.push(fileData);
        console.log('Video added to session:', req.body.sessionId, fileData.id);
      } else {
        console.log('Session not found during upload:', req.body.sessionId);
      }
    }

    res.json({ success: true, file: fileData, videoInfo: fileData.videoInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-multiple', upload.array('videos', 10), async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const session = videoSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const uploadedFiles = [];
    for (const file of req.files) {
      const fileData = await handleSingleUpload(file);
      uploadedFiles.push(fileData);
      session.videos.push(fileData);
    }
    res.json({ success: true, files: uploadedFiles, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  console.log('Audio upload req.body:', req.body);
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
    
    // Check if it's an audio file
    if (!req.file.mimetype.startsWith('audio/')) {
      return res.status(400).json({ error: 'Only audio files are allowed for this endpoint' });
    }
    
    const fileData = await handleSingleUpload(req.file);

    // Associate with session
    if (req.body.sessionId) {
      const session = videoSessions.get(req.body.sessionId);
      if (session) {
        session.videos.push(fileData); // Note: still using 'videos' array for consistency
        console.log('Audio file added to session:', req.body.sessionId, fileData.id);
      } else {
        console.log('Session not found during audio upload:', req.body.sessionId);
      }
    }

    res.json({ 
      success: true, 
      file: fileData, 
      audioInfo: fileData.audioInfo 
    });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for transcription
app.post('/api/transcribe', async (req, res) => {
  const { fileId, sessionId } = req.body;
  
  try {
    const session = videoSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const file = session.videos.find(v => v.id === fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    let audioPath;
    
    if (file.fileType === 'audio') {
      // If it's already an audio file, use it directly
      audioPath = file.path;
    } else {
      // If it's a video file, extract audio as MP3
      const tempDir = path.join(__dirname, 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      audioPath = path.join(tempDir, `${fileId}_audio.mp3`); // Changed from .flac to .mp3
      await extractAudioForTranscription(file.path, audioPath);
    }

    // Check audio file size
    const audioStats = await fs.stat(audioPath);
    const audioSizeInMB = audioStats.size / (1024 * 1024);
    
    console.log(`Audio file size: ${audioSizeInMB.toFixed(2)}MB`);
    
    if (audioSizeInMB > 200) {
      if (file.fileType === 'video') {
        await fs.unlink(audioPath).catch(() => {});
      }
      return res.status(400).json({ 
        error: `Audio file too large (${audioSizeInMB.toFixed(2)}MB). Please use a shorter file.` 
      });
    }

    // Transcribe the audio (language auto-detected)
    const transcription = await transcribeAudio(audioPath);
    
    // Clean up temp audio file if it was extracted from video
    if (file.fileType === 'video') {
      await fs.unlink(audioPath).catch(() => {});
    }
    
    res.json({ 
      success: true, 
      transcription: transcription,
      fileId: fileId,
      fileType: file.fileType,
      processingInfo: {
        audioSizeMB: audioSizeInMB,
        method: 'direct'
      }
    });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced profanity detection endpoint
app.post('/api/detect-profanity', async (req, res) => {
  const { fileId, sessionId, customWords = [] } = req.body;
  console.log('Detect Profanity called with:', { sessionId, fileId, customWords });
  
  try {
    const session = videoSessions.get(sessionId);
    if (!session) {
      console.log('Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const video = session.videos.find(v => v.id === fileId);
    if (!video) {
      console.log('Video not found in session:', fileId);
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const audioPath = path.join(tempDir, `${fileId}_audio.mp3`);
    await extractAudioForTranscription(video.path, audioPath);
    
    const audioStats = await fs.stat(audioPath);
    const audioSizeInMB = audioStats.size / (1024 * 1024);
    
    if (audioSizeInMB > 200) {
      await fs.unlink(audioPath).catch(() => {});
      return res.status(400).json({ 
        error: `Audio file too large (${audioSizeInMB.toFixed(2)}MB). Please use a shorter video for profanity detection.` 
      });
    }
    
    const transcription = await transcribeAudio(audioPath);
    
    const customProfanityWords = new Set([...customProfanityList, ...customWords.map(w => w.toLowerCase())]);
    const profanitySegments = findProfanityInTranscription(transcription, customProfanityWords);
    
    await fs.unlink(audioPath).catch(() => {});

    res.json({
      success: true,
      profanitySegments: profanitySegments,
      transcription: transcription,
      detectedLanguage: transcription.detectedLanguage,
      languageConfidence: transcription.languageConfidence,
      fileId: fileId,
      processingInfo: {
        audioSizeMB: audioSizeInMB,
        method: 'assemblyai_enhanced',
        profanitySourcesUsed: ['assemblyai', 'custom']
      }
    });
  } catch (error) {
    console.error('Profanity detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add custom profanity words
app.post('/api/profanity/add', async (req, res) => {
  const { words } = req.body;
  try {
    if (Array.isArray(words)) {
    words.forEach(word => customProfanityList.add(word.toLowerCase()));
    }
    res.json({ success: true, customProfanityList: Array.from(customProfanityList) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get custom profanity words
app.get('/api/profanity/list', async (req, res) => {
  try {
    res.json({ success: true, customProfanityList: Array.from(customProfanityList) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove custom profanity words
app.post('/api/profanity/remove', async (req, res) => {
  const { words } = req.body;
  try {
    if (Array.isArray(words)) {
      words.forEach(word => customProfanityList.delete(word.toLowerCase()));
    }
    res.json({ success: true, customProfanityList: Array.from(customProfanityList) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cleanup', async (req, res) => {
  const dirs = [
    path.join(__dirname, 'processed'),
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'temp'),
  ];
  try {
    for (const dir of dirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(dir, { recursive: true });
    }
    res.json({ success: true, message: 'Cleanup complete.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- RESTORE ALL ADVANCED ENDPOINTS BELOW THIS LINE ---

app.get('/api/session/:sessionId/history', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = videoSessions.get(sessionId);
    const history = editHistory.get(sessionId) || [];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session, history, availableVersions: ['original', ...history.map(h => h.version.toString())] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:filename', async (req, res) => {
  const filename = req.params.filename;
  try {
    const filePath = path.join(__dirname, 'processed', filename);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = videoSessions.get(sessionId);
    const history = editHistory.get(sessionId) || [];
    if (session) {
      for (const video of session.videos) {
        await fs.unlink(video.path).catch(() => {});
      }
    }
    for (const edit of history) {
      const filePath = path.join(__dirname, 'processed', edit.filename);
      await fs.unlink(filePath).catch(() => {});
    }
    videoSessions.delete(sessionId);
    editHistory.delete(sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Profanity, audio, trim, merge, and related helpers
function srtTimeToSeconds(srtTime) {
  const [h, m, rest] = srtTime.split(':');
  const [s, ms] = rest.split(',');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

async function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .noVideo()
      .audioCodec('pcm_s16le')
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function removeAudioFromSegments(inputPath, outputPath, segments) {
  return new Promise((resolve, reject) => {
    let filter = '[0:a]';
    if (segments && segments.length > 0) {
      const volumeConditions = segments.map(({ start, end }) => `between(t,${start},${end})`).join('+');
      filter += `volume=enable='${volumeConditions}':volume=0[outa]`;
    } else {
      filter += 'copy[outa]';
    }
    ffmpeg(inputPath)
      .outputOptions([
        '-filter_complex', filter,
        '-map', '0:v',
        '-map', '[outa]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-movflags', '+faststart'
      ])
      .output(outputPath)
      .on('end', () => resolve({ filename: path.basename(outputPath) }))
      .on('error', reject)
      .run();
  });
}

async function trimVideo(inputPath, outputPath, segments, joinSegments) {
  return new Promise((resolve, reject) => {
    if (segments.length === 1 && !joinSegments) {
      const { start, end } = segments[0];
      ffmpeg(inputPath)
        .outputOptions([
          '-ss', start.toString(),
          '-t', (end - start).toString(),
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve({ filename: path.basename(outputPath) }))
        .on('error', reject)
        .run();
    } else if (joinSegments && segments.length > 1) {
    let filterComplex = '';
    let concatInputs = '';
      segments.forEach((segment, i) => {
        const { start, end } = segment;
        filterComplex += `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}];`;
        filterComplex += `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}];`;
        concatInputs += `[v${i}][a${i}]`;
      });
      filterComplex += `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;
      ffmpeg(inputPath)
        .outputOptions([
          '-filter_complex', filterComplex,
          '-map', '[outv]',
          '-map', '[outa]',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve({ filename: path.basename(outputPath) }))
        .on('error', reject)
        .run();
    } else {
      reject(new Error('Invalid trim configuration'));
    }
  });
}

app.post('/api/process/audio-remove', async (req, res) => {
  const { fileId, segments, sessionId, sourceVersion = 'original' } = req.body;
  console.log('Audio remove called with:', { fileId, segments, sessionId, sourceVersion });
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    console.log('No segments provided for audio removal');
    return res.status(400).json({ error: 'No segments provided for audio removal' });
  }
  try {
    const session = videoSessions.get(sessionId);
    if (!session) {
      console.log('Session not found for audio remove:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    let inputPath;
    if (sourceVersion === 'original') {
      inputPath = path.join(__dirname, 'uploads', `${fileId}.mp4`);
    } else {
      const history = editHistory.get(sessionId) || [];
      const versionEntry = history.find(h => h.version === parseInt(sourceVersion));
      if (!versionEntry) {
        console.log('Version not found for audio remove:', sourceVersion);
        return res.status(404).json({ error: 'Version not found' });
      }
      inputPath = path.join(__dirname, 'processed', versionEntry.filename);
    }
    const outputPath = path.join(__dirname, 'processed', `${fileId}_v${session.currentVersion + 1}_audio_removed.mp4`);
    console.log('Audio remove inputPath:', inputPath);
    console.log('Audio remove outputPath:', outputPath);
    console.log('Audio remove segments:', segments);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await removeAudioFromSegments(inputPath, outputPath, segments);
    session.currentVersion++;
    const editEntry = { version: session.currentVersion, type: 'audio_removal', filename: result.filename, sourceVersion, timestamp: new Date(), segments };
    const history = editHistory.get(sessionId) || [];
    history.push(editEntry);
    editHistory.set(sessionId, history);
    console.log('Audio removal successful:', { outputFile: result.filename, version: session.currentVersion });
    res.json({ success: true, outputFile: result.filename, downloadUrl: `/api/download/${result.filename}`, version: session.currentVersion });
  } catch (error) {
    console.error('Audio removal error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/process/trim', async (req, res) => {
  const { fileId, segments, joinSegments, sessionId, sourceVersion = 'original' } = req.body;
  console.log('Trim called with:', { fileId, segments, joinSegments, sessionId, sourceVersion });
  try {
    const session = videoSessions.get(sessionId);
    let inputPath;
    if (sourceVersion === 'original') {
      inputPath = path.join(__dirname, 'uploads', `${fileId}.mp4`);
    } else {
      const history = editHistory.get(sessionId) || [];
      const versionEntry = history.find(h => h.version === parseInt(sourceVersion));
      if (!versionEntry) return res.status(404).json({ error: 'Version not found' });
      inputPath = path.join(__dirname, 'processed', versionEntry.filename);
    }
    const outputPath = path.join(__dirname, 'processed', `${fileId}_v${session.currentVersion + 1}_trimmed.mp4`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await trimVideo(inputPath, outputPath, segments, joinSegments);
    session.currentVersion++;
    const editEntry = { version: session.currentVersion, type: 'trim', filename: result.filename, sourceVersion, timestamp: new Date(), segments, joinSegments };
    const history = editHistory.get(sessionId) || [];
    history.push(editEntry);
    editHistory.set(sessionId, history);
    res.json({ success: true, outputFile: result.filename, downloadUrl: `/api/download/${result.filename}`, version: session.currentVersion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/process/profanity', async (req, res) => {
  const { fileId, segments, sessionId, sourceVersion = 'original' } = req.body;
  console.log('Profanity mute called with:', { fileId, segments, sessionId, sourceVersion });
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    console.log('No segments provided for profanity mute');
    return res.status(400).json({ error: 'No segments provided for profanity mute' });
  }
  try {
    const session = videoSessions.get(sessionId);
    if (!session) {
      console.log('Session not found for profanity mute:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }
    let inputPath;
    if (sourceVersion === 'original') {
      inputPath = path.join(__dirname, 'uploads', `${fileId}.mp4`);
    } else {
      const history = editHistory.get(sessionId) || [];
      const versionEntry = history.find(h => h.version === parseInt(sourceVersion));
      if (!versionEntry) {
        console.log('Version not found for profanity mute:', sourceVersion);
        return res.status(404).json({ error: 'Version not found' });
      }
      inputPath = path.join(__dirname, 'processed', versionEntry.filename);
    }
    const outputPath = path.join(__dirname, 'processed', `${fileId}_v${session.currentVersion + 1}_profanity_muted.mp4`);
    console.log('Profanity mute inputPath:', inputPath);
    console.log('Profanity mute outputPath:', outputPath);
    console.log('Profanity mute segments:', segments);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await removeAudioFromSegments(inputPath, outputPath, segments);
    session.currentVersion++;
    const editEntry = { version: session.currentVersion, type: 'profanity_filter', filename: result.filename, sourceVersion, timestamp: new Date(), segments };
    const history = editHistory.get(sessionId) || [];
    history.push(editEntry);
    editHistory.set(sessionId, history);
    console.log('Profanity muting successful:', { outputFile: result.filename, version: session.currentVersion });
    res.json({ success: true, outputFile: result.filename, downloadUrl: `/api/download/${result.filename}`, version: session.currentVersion });
  } catch (error) {
    console.error('Profanity muting error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function ensureMp4H264Aac(inputPath, tempDir, index) {
  // Simplified version - just ensure consistent encoding without pre-conversion
  try {
    const probe = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const videoStream = probe.streams.find(s => s.codec_type === 'video');
    const audioStream = probe.streams.find(s => s.codec_type === 'audio');
    
    console.log(`File ${inputPath} - Video: ${videoStream?.codec_name}, Audio: ${audioStream?.codec_name}`);
    
    // Return original path - we'll handle encoding during trimming
    return inputPath;
  } catch (error) {
    console.error(`Error probing ${inputPath}:`, error);
    throw error;
  }
}

app.post('/api/process/multi-trim-join', async (req, res) => {
  const { sessionId, videoSegments, outputName } = req.body;
  console.log('Multi-trim-join called with:', { sessionId, videoSegments, outputName });
  
  try {
    const session = videoSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    if (!Array.isArray(videoSegments) || videoSegments.length === 0) {
      return res.status(400).json({ error: 'No video segments provided' });
    }
    
    // Validate input
    for (const videoSeg of videoSegments) {
      if (!videoSeg.videoId || !Array.isArray(videoSeg.segments) || videoSeg.segments.length === 0) {
        return res.status(400).json({ error: 'Malformed videoSegments: each entry must have videoId and non-empty segments array' });
      }
      for (const segment of videoSeg.segments) {
        if (typeof segment.start !== 'number' || typeof segment.end !== 'number' || segment.start >= segment.end) {
          return res.status(400).json({ error: 'Malformed segment: start and end must be numbers and start < end' });
        }
      }
    }
    
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Step 1: Trim all segments with proper re-encoding for consistency
    console.log('Step 1: Trimming segments with consistent encoding...');
    const trimPromises = [];
    const trimmedPaths = [];
    
    videoSegments.forEach((videoSeg, videoIndex) => {
      const video = session.videos.find(v => v.id === videoSeg.videoId);
      if (!video) throw new Error(`Video ${videoSeg.videoId} not found in session`);
      
      videoSeg.segments.forEach((segment, segIndex) => {
        const trimmedPath = path.join(tempDir, `trimmed_${videoIndex}_${segIndex}_${Date.now()}.mp4`);
        trimmedPaths.push(trimmedPath);
        
        const trimPromise = new Promise((resolve, reject) => {
          ffmpeg(video.path)
            .outputOptions([
              '-ss', segment.start.toString(),
              '-t', (segment.end - segment.start).toString(),
              '-c:v', 'libx264',
              '-c:a', 'aac',
              '-preset', 'medium',
              '-crf', '23',
              '-ar', '48000', // Consistent audio sample rate
              '-ac', '2', // Stereo audio
              '-r', '30', // Consistent frame rate
              '-movflags', '+faststart',
              '-async', '1', // Audio sync
              '-vsync', 'cfr' // Constant frame rate
            ])
            .output(trimmedPath)
            .on('end', () => {
              console.log(`Trimmed segment: ${trimmedPath}`);
              resolve(trimmedPath);
            })
            .on('error', (error) => {
              console.error(`Error trimming segment ${trimmedPath}:`, error);
              reject(error);
            })
            .run();
        });
        
        trimPromises.push(trimPromise);
    });
  });
    
    await Promise.all(trimPromises);
    console.log('All segments trimmed successfully');
    
    // Step 2: Create concat file for demuxer
    console.log('Step 2: Creating concat file...');
    const concatListPath = path.join(tempDir, `concat_list_${Date.now()}.txt`);
    let concatContent = '';
    
    trimmedPaths.forEach(trimmedPath => {
      const absolutePath = path.resolve(trimmedPath);
      concatContent += `file '${absolutePath}'\n`;
    });
    
    await fs.writeFile(concatListPath, concatContent);
    console.log('Concat file created:', concatListPath);
    
    // Step 3: Concatenate with proper stream handling
    console.log('Step 3: Concatenating videos with stream sync...');
    const outputPath = path.join(__dirname, 'processed', `${outputName || 'multi_video_joined'}_v${session.currentVersion + 1}.mp4`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'medium',
          '-crf', '23',
          '-ar', '48000',
          '-ac', '2',
          '-r', '30',
          '-movflags', '+faststart',
          '-async', '1',
          '-vsync', 'cfr',
          '-af', 'aresample=async=1' // Audio resampling for sync
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Concatenation completed:', outputPath);
          resolve();
        })
        .on('error', (error) => {
          console.error('Concatenation error:', error);
          reject(error);
        })
        .run();
    });
    
    // Step 4: Clean up temp files
    console.log('Step 4: Cleaning up temp files...');
    const cleanupPromises = [];
    
    // Clean up trimmed files
    trimmedPaths.forEach(file => {
      cleanupPromises.push(fs.unlink(file).catch(() => {}));
    });
    
    // Clean up concat file
    cleanupPromises.push(fs.unlink(concatListPath).catch(() => {}));
    
    await Promise.all(cleanupPromises);
    console.log('Cleanup completed');
    
    // Update session and history
    session.currentVersion++;
    const editEntry = {
      version: session.currentVersion,
      type: 'multi_trim_join',
      filename: path.basename(outputPath),
      sourceVersion: 'multiple',
      timestamp: new Date(),
      videoSegments
    };
    
    const history = editHistory.get(sessionId) || [];
    history.push(editEntry);
    editHistory.set(sessionId, history);
    
    console.log('Multi-trim-join completed successfully');
    res.json({
      success: true,
      outputFile: path.basename(outputPath),
      downloadUrl: `/api/download/${path.basename(outputPath)}`,
      version: session.currentVersion
    });
    
  } catch (error) {
    console.error('Multi-trim-join error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/merge-multiple', async (req, res) => {
  const { videoPaths, outputName = 'merged_video.mp4' } = req.body;
  
  if (!Array.isArray(videoPaths) || videoPaths.length < 2) {
    return res.status(400).json({ error: 'Provide at least two video paths.' });
  }
  
  try {
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    console.log('Starting merge process for', videoPaths.length, 'videos');
    
    // Step 1: Convert all videos in parallel (only if needed)
    console.log('Step 1: Converting videos if needed...');
    const conversionPromises = videoPaths.map(async (videoPath, index) => {
      return await ensureMp4H264Aac(videoPath, tempDir, index);
    });
    
    const convertedPaths = await Promise.all(conversionPromises);
    console.log('All videos converted/validated');
    
    // Step 2: Create concat file for demuxer
    console.log('Step 2: Creating concat file...');
    const concatListPath = path.join(tempDir, `merge_concat_${Date.now()}.txt`);
    let concatContent = '';
    
    convertedPaths.forEach(videoPath => {
      const absolutePath = path.resolve(videoPath);
      concatContent += `file '${absolutePath}'\n`;
    });
    
    await fs.writeFile(concatListPath, concatContent);
    
    // Step 3: Merge using concat demuxer
    console.log('Step 3: Merging videos...');
    const finalOutput = path.join(__dirname, 'processed', outputName);
    await fs.mkdir(path.dirname(finalOutput), { recursive: true });
    
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c', 'copy', // Copy without re-encoding
          '-movflags', '+faststart',
          '-fflags', '+genpts'
        ])
        .output(finalOutput)
        .on('end', () => {
          console.log('Merge completed:', finalOutput);
          resolve();
        })
        .on('error', (error) => {
          console.error('Merge error:', error);
          reject(error);
        })
        .run();
    });
    
    // Step 4: Clean up temp files
    console.log('Step 4: Cleaning up...');
    const cleanupPromises = [];
    
    // Only delete converted files, not original input files
    convertedPaths.forEach((convertedPath, index) => {
      if (convertedPath !== videoPaths[index]) {
        cleanupPromises.push(fs.unlink(convertedPath).catch(() => {}));
      }
    });
    
    cleanupPromises.push(fs.unlink(concatListPath).catch(() => {}));
    await Promise.all(cleanupPromises);
    
    console.log('Merge process completed successfully');
    res.json({ 
      success: true, 
      outputFile: path.basename(finalOutput),
      downloadUrl: `/api/download/${path.basename(finalOutput)}`
    });
    
  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Backend is running', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});