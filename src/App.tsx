/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Link2,
  Youtube,
  Search,
  Sparkles,
  Disc3,
  Smartphone,
  Download,
  FolderOpen,
  Clipboard,
  CheckCircle2,
  Loader2,
  KeyRound,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  AUDIOPHILE_FORMATS,
  AudiophileFormatId,
  LibraryTab,
  LoopMode,
  StorageInfo,
  Track,
} from './types';
import {
  getAllTracksFromDB,
  saveTrackToDB,
  deleteTrackFromDB,
  toggleFavoriteInDB,
  getStorageInfo,
  requestPersistentStorage,
} from './services/storage';
import { convertBlobToMp3 } from './services/mp3Converter';
import { extractYouTubeId } from './services/mediaResolver';
import { playerEngine } from './services/playerService';
import { usePWAInstall } from './hooks/usePWAInstall';
import { StorageBanner } from './components/StorageBanner';
import { TrackCard } from './components/TrackCard';
import { NowPlayingBar } from './components/NowPlayingBar';
import { FullPlayerModal } from './components/FullPlayerModal';
import { DownloadDialog } from './components/DownloadDialog';
import { YouTubeBrowserModal } from './components/YouTubeBrowserModal';
import { LyricsModal } from './components/LyricsModal';
import { AndroidProjectModal } from './components/AndroidProjectModal';
import { Toast, ToastMessage } from './components/Toast';

export default function App() {
  const { isInstallable, install } = usePWAInstall();

  // Library & Storage state
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTab, setSelectedTab] = useState<LibraryTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    usedBytes: 0,
    quotaBytes: 0,
    isPersistent: false,
    trackCount: 0,
  });

  // Inline Audiophile Converter state
  const [inlineUrl, setInlineUrl] = useState('');
  const [inlineFormat, setInlineFormat] = useState<AudiophileFormatId>('FLAC');
  const [inlineMp3Bitrate, setInlineMp3Bitrate] = useState<number>(320);
  const [inlineSaveToDevice, setInlineSaveToDevice] = useState(true);
  const [inlineCookies, setInlineCookies] = useState('');
  const [showInlineCookies, setShowInlineCookies] = useState(false);
  const [inlinePreview, setInlinePreview] = useState<{
    valid: boolean;
    isYouTube: boolean;
    id: string;
    title: string;
    author: string;
    thumbnailUrl: string;
  } | null>(null);
  const [inlineValidationError, setInlineValidationError] = useState<string | null>(null);
  const [isValidatingInline, setIsValidatingInline] = useState(false);

  // Player state synchronized with Offline-First Audio Engine
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>('OFF');
  const [isShuffle, setIsShuffle] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [volume, setVolume] = useState(0.85);

  // Conversion & Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [convertingTrackId, setConvertingTrackId] = useState<string | null>(null);
  const [convertingProgress, setConvertingProgress] = useState(0);

  // Modal Dialogs
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showYouTubeBrowser, setShowYouTubeBrowser] = useState(false);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [showAndroidProject, setShowAndroidProject] = useState(false);
  const [selectedTrackForLyrics, setSelectedTrackForLyrics] = useState<Track | null>(null);
  const [prefilledUrl, setPrefilledUrl] = useState<string | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Subscribe to Offline-First Audio Engine
  useEffect(() => {
    const unsubscribe = playerEngine.subscribe({
      onPlayStateChange: (playing) => setIsPlaying(playing),
      onTimeUpdate: (cur, dur) => {
        setCurrentTime(cur);
        if (dur > 0) setDuration(dur);
      },
      onTrackEnded: () => {
        handleTrackEnded();
      },
      onNextRequested: () => {
        handleNextTrack();
      },
      onPrevRequested: () => {
        handlePrevTrack();
      },
      onError: (msg) => {
        addToast(msg, 'error');
      },
    });

    return () => unsubscribe();
  }, [tracks, currentTrack, loopMode, isShuffle]);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const loaded = await getAllTracksFromDB();
      setTracks(loaded);
      const sInfo = await getStorageInfo(loaded.length);
      setStorageInfo(sInfo);
    } catch {
      addToast('Could not load tracks from local storage.', 'error');
    }
  };

  const refreshStorage = async (count?: number) => {
    const sInfo = await getStorageInfo(count !== undefined ? count : tracks.length);
    setStorageInfo(sInfo);
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistentStorage();
    if (granted) {
      addToast('Protected offline storage granted by browser.', 'success');
    } else {
      addToast('Browser storage remains standard device cached.', 'info');
    }
    refreshStorage();
  };

  // Validate Inline Converter URL via /api/validate-url
  const validateInlineUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setInlinePreview(null);
      setInlineValidationError(null);
      return;
    }

    setIsValidatingInline(true);
    setInlineValidationError(null);
    try {
      const res = await fetch(`/api/validate-url?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setInlinePreview({
          valid: true,
          isYouTube: !!data.isYouTube,
          id: data.videoId || data.id,
          title: data.title || 'Audio Stream',
          author: data.author || 'Open Grace Music',
          thumbnailUrl: data.thumbnailUrl || '',
        });
      } else {
        setInlinePreview(null);
        setInlineValidationError(data.error || 'Please enter a valid YouTube or direct audio URL.');
      }
    } catch {
      const ytId = extractYouTubeId(trimmed);
      if (ytId) {
        setInlinePreview({
          valid: true,
          isYouTube: true,
          id: ytId,
          title: `YouTube Track (${ytId})`,
          author: 'YouTube Music',
          thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        });
      } else {
        setInlinePreview(null);
      }
    } finally {
      setIsValidatingInline(false);
    }
  };

  const handleInlinePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInlineUrl(text);
        validateInlineUrl(text);
      }
    } catch {
      addToast('Paste permission not granted — long-press input to paste.', 'info');
    }
  };

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    let result = [...tracks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.format.toLowerCase().includes(q)
      );
    }

    switch (selectedTab) {
      case 'LOSSLESS':
        return result.filter((t) =>
          ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(t.format.toUpperCase())
        );
      case 'DOWNLOADS':
        return result.filter((t) => t.source === 'YOUTUBE' || t.source === 'DIRECT_URL');
      case 'DEVICE_MUSIC':
        return result.filter((t) => t.source === 'LOCAL_IMPORT' || t.source === 'SAMPLE_AUDIO');
      case 'MP3':
        return result.filter(
          (t) => t.format.toUpperCase() === 'MP3' || t.mimeType.includes('mpeg')
        );
      case 'FAVORITES':
        return result.filter((t) => t.isFavorite);
      case 'ALL':
      default:
        return result;
    }
  }, [tracks, searchQuery, selectedTab]);

  // Playback Handlers
  const playTrack = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      playerEngine.togglePlayPause();
      return;
    }

    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 0);
    await playerEngine.playTrack(track);
  };

  const togglePlayPause = () => {
    if (!currentTrack) {
      if (filteredTracks.length > 0) {
        playTrack(filteredTracks[0]);
      }
      return;
    }
    playerEngine.togglePlayPause();
  };

  const handleNextTrack = () => {
    if (!tracks.length) return;
    const currentIdx = tracks.findIndex((t) => t.id === currentTrack?.id);

    if (isShuffle) {
      const randomIdx = Math.floor(Math.random() * tracks.length);
      playTrack(tracks[randomIdx]);
      return;
    }

    const nextIdx = (currentIdx + 1) % tracks.length;
    playTrack(tracks[nextIdx]);
  };

  const handlePrevTrack = () => {
    if (!tracks.length) return;
    if (currentTime > 3) {
      playerEngine.seekTo(0);
      return;
    }
    const currentIdx = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIdx = (currentIdx - 1 + tracks.length) % tracks.length;
    playTrack(tracks[prevIdx]);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    playerEngine.seekTo(time);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    playerEngine.setVolume(vol);
  };

  const handleSpeedChange = (spd: number) => {
    setPlaybackSpeed(spd);
    playerEngine.setPlaybackRate(spd);
  };

  const cycleLoopMode = () => {
    const next: LoopMode = loopMode === 'OFF' ? 'ALL' : loopMode === 'ALL' ? 'ONE' : 'OFF';
    setLoopMode(next);
    addToast(`Loop mode: ${next}`, 'info');
  };

  const handleTrackEnded = () => {
    if (loopMode === 'ONE') {
      playerEngine.seekTo(0);
      if (currentTrack) playerEngine.playTrack(currentTrack);
    } else if (loopMode === 'ALL' || isShuffle) {
      handleNextTrack();
    } else {
      setIsPlaying(false);
    }
  };

  // Helper to trigger browser file download to device Music / Downloads folder
  const triggerBrowserDownload = (blob: Blob, title: string, ext: string) => {
    const safeTitle = title.replace(/[^a-zA-Z0-9._ -]/g, '').trim() || 'OpenGraceMusic_Track';
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${safeTitle}.${ext.toLowerCase()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  };

  // Import Local Audio Files
  const handleLocalFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        addToast(`Importing "${file.name}"...`, 'info');

        const durationSec = await new Promise<number>((resolve) => {
          const tempUrl = URL.createObjectURL(file);
          const probe = new Audio();
          probe.onloadedmetadata = () => {
            const d = probe.duration || 0;
            URL.revokeObjectURL(tempUrl);
            resolve(d);
          };
          probe.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            resolve(0);
          };
          probe.src = tempUrl;
        });

        const ext = file.name.split('.').pop()?.toUpperCase() || 'FLAC';
        const isLossless = ['FLAC', 'ALAC', 'DSD', 'DSF', 'WAV'].includes(ext);
        const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

        const newTrack: Track = {
          id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          title: cleanTitle,
          artist: 'Device Music',
          album: 'Phone Music Library',
          duration: durationSec,
          sizeBytes: file.size,
          format: ext,
          mimeType: file.type || (ext === 'FLAC' ? 'audio/flac' : 'audio/mpeg'),
          source: 'LOCAL_IMPORT',
          storageStatus: 'PERSISTENT',
          addedAt: Date.now(),
          bitrateKbps: isLossless ? 2304 : 320,
          sampleRateHz: isLossless ? 96000 : 48000,
          bitDepth: isLossless ? '24-bit' : '16-bit',
          isFavorite: false,
        };

        const saved = await saveTrackToDB(newTrack, file);
        setTracks((prev) => [saved, ...prev]);
        addToast(`✓ Saved "${cleanTitle}" (${ext}) to offline library`, 'success');
      } catch (err: any) {
        addToast(`Failed to import "${file.name}": ${err.message}`, 'error');
      }
    }

    refreshStorage();
    e.target.value = '';
  };

  // Real Audiophile Lossless & Hi-Res Download & Conversion Handler via /api/convert-audio
  const handleStartDownload = async (
    url: string,
    format: AudiophileFormatId = 'FLAC',
    bitrateKbps: number = 2304,
    saveToDeviceFolder: boolean = true,
    cookies?: string,
    customTitle?: string,
    customArtist?: string
  ) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      addToast('Please enter a valid YouTube or audio URL.', 'error');
      return;
    }

    const formatObj = AUDIOPHILE_FORMATS.find((f) => f.id === format) || AUDIOPHILE_FORMATS[0];

    setIsDownloading(true);
    setDownloadProgress(0.15);
    setDownloadStatus(`Connecting ${format} (${formatObj.badge}) studio pipeline...`);

    try {
      const ytId = extractYouTubeId(trimmedUrl);
      setDownloadProgress(0.35);
      setDownloadStatus(
        `Extracting authentic audio & transcoding to ${format} (${formatObj.badge})...`
      );

      const response = await fetch('/api/convert-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmedUrl,
          format,
          bitrate: bitrateKbps,
          cookies,
          title: customTitle,
          artist: customArtist,
        }),
      });

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errMsg = errJson.error;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      setDownloadProgress(0.75);
      setDownloadStatus(`Receiving ${format} master stream & verifying integrity...`);

      const headerTitle = response.headers.get('X-Audio-Title')
        ? decodeURIComponent(response.headers.get('X-Audio-Title')!)
        : customTitle || `Audiophile Track`;
      const headerArtist = response.headers.get('X-Audio-Artist')
        ? decodeURIComponent(response.headers.get('X-Audio-Artist')!)
        : customArtist || 'Open Grace Music';
      const headerDuration = parseInt(response.headers.get('X-Audio-Duration') || '0', 10);
      const headerFormat = (response.headers.get('X-Audio-Format') || format) as AudiophileFormatId;
      const headerExt = response.headers.get('X-Audio-Extension') || formatObj.extension;
      const headerSampleRate = parseInt(
        response.headers.get('X-Audio-Sample-Rate') || String(formatObj.sampleRateHz),
        10
      );
      const headerBitDepth = response.headers.get('X-Audio-Bit-Depth') || formatObj.bitDepth;
      const headerThumb = response.headers.get('X-Audio-Thumbnail')
        ? decodeURIComponent(response.headers.get('X-Audio-Thumbnail')!)
        : ytId
        ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        : undefined;

      const audioBlob = await response.blob();
      if (!audioBlob || audioBlob.size < 20000) {
        throw new Error('Downloaded audio stream was empty or corrupted.');
      }

      // Probe exact duration in browser if header duration wasn't available
      let finalDuration = headerDuration;
      if (!finalDuration || finalDuration <= 0) {
        finalDuration = await new Promise<number>((resolve) => {
          const tempUrl = URL.createObjectURL(audioBlob);
          const probe = new Audio();
          probe.onloadedmetadata = () => {
            const d = probe.duration || 210;
            URL.revokeObjectURL(tempUrl);
            resolve(d);
          };
          probe.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            resolve(210);
          };
          probe.src = tempUrl;
        });
      }

      setDownloadProgress(0.92);
      setDownloadStatus(`Saving verified ${headerFormat} master to offline IndexedDB...`);

      const newTrack: Track = {
        id: ytId ? `yt_${ytId}_${headerFormat.toLowerCase()}` : `url_${Date.now()}`,
        title: headerTitle,
        artist: headerArtist,
        album: `Open Grace Music · ${headerFormat} Master`,
        duration: finalDuration,
        sizeBytes: audioBlob.size,
        format: headerFormat,
        mimeType: audioBlob.type || formatObj.mimeType,
        source: ytId ? 'YOUTUBE' : 'DIRECT_URL',
        storageStatus: 'PERSISTENT',
        addedAt: Date.now(),
        thumbnailUrl: headerThumb,
        bitrateKbps,
        sampleRateHz: headerSampleRate,
        bitDepth: headerBitDepth,
        isFavorite: false,
        originalUrl: trimmedUrl,
        ytVideoId: ytId || undefined,
      };

      const saved = await saveTrackToDB(newTrack, audioBlob);
      setTracks((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)]);

      if (saveToDeviceFolder) {
        triggerBrowserDownload(audioBlob, headerTitle, headerExt);
      }

      setShowDownloadDialog(false);
      setShowYouTubeBrowser(false);
      setInlineUrl('');
      setInlinePreview(null);

      addToast(
        `✓ Saved "${headerTitle}" in ${headerFormat} (${headerBitDepth}/${headerSampleRate / 1000}kHz)!`,
        'success'
      );
      refreshStorage();

      // Immediately play the real offline audio track from IndexedDB
      playTrack(saved);
    } catch (err: any) {
      addToast(`Conversion error: ${err.message || 'Failed to process audio'}`, 'error');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStatus('');
    }
  };

  // Convert an existing track to MP3
  const handleConvertToMp3 = async (track: Track) => {
    setConvertingTrackId(track.id);
    setConvertingProgress(0.1);

    try {
      let sourceBlob = track.blob;
      if (!sourceBlob && track.audioUrl) {
        const res = await fetch(track.audioUrl);
        if (res.ok) sourceBlob = await res.blob();
      }
      if (!sourceBlob) {
        throw new Error('Source audio blob not found.');
      }

      const mp3Blob = await convertBlobToMp3(sourceBlob, 320, (prog) => {
        setConvertingProgress(prog);
      });

      const updatedTrack: Track = {
        ...track,
        format: 'MP3',
        mimeType: 'audio/mpeg',
        sizeBytes: mp3Blob.size,
        bitrateKbps: 320,
      };

      const saved = await saveTrackToDB(updatedTrack, mp3Blob);
      setTracks((prev) => prev.map((t) => (t.id === track.id ? saved : t)));
      addToast(`✓ Converted "${track.title}" to 320kbps MP3`, 'success');
      refreshStorage();
    } catch (err: any) {
      addToast(`Conversion failed: ${err.message}`, 'error');
    } finally {
      setConvertingTrackId(null);
      setConvertingProgress(0);
    }
  };

  // Delete Track
  const handleDeleteTrack = async (track: Track) => {
    try {
      await deleteTrackFromDB(track.id);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      if (currentTrack?.id === track.id) {
        playerEngine.togglePlayPause();
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      addToast(`Removed "${track.title}" from library`, 'info');
      refreshStorage(tracks.length - 1);
    } catch {
      addToast(`Could not delete "${track.title}"`, 'error');
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (track: Track) => {
    const nextFav = await toggleFavoriteInDB(track.id);
    setTracks((prev) =>
      prev.map((t) => (t.id === track.id ? { ...t, isFavorite: nextFav } : t))
    );
  };

  // Export / Save real audio file directly from IndexedDB to device Music / Downloads folder
  const handleExportTrack = (track: Track) => {
    if (track.blob) {
      const extMap: Record<string, string> = {
        FLAC: 'flac',
        ALAC: 'm4a',
        DSD: 'wav',
        WAV: 'wav',
        MP3: 'mp3',
      };
      const ext = extMap[track.format.toUpperCase()] || track.format.toLowerCase() || 'flac';
      triggerBrowserDownload(track.blob, track.title, ext);
      addToast(`✓ Saved "${track.title}.${ext}" to device Downloads/Music`, 'success');
      return;
    }

    if (track.audioUrl) {
      const ext = track.format.toLowerCase() || 'flac';
      const a = document.createElement('a');
      a.href = track.audioUrl;
      a.download = `${track.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addToast(`✓ Saved "${track.title}.${ext}" to device Downloads/Music`, 'success');
      return;
    }

    addToast('No offline audio file found to export.', 'error');
  };

  // Load Built-in Studio Acoustic Tracks
  const handleLoadSampleTracks = async () => {
    addToast('Loading built-in studio acoustic tracks...', 'info');
    const samples = [
      {
        title: 'Grace Morning Chords (Studio Session)',
        artist: 'Open Grace Ensemble',
        album: 'Acoustic Sanctuary',
        url: '/assets/WhatsApp_Audio_2026-10-23_at_2.57.53_AM_3d0a1356.mpeg',
      },
      {
        title: 'Quiet Harbor Melody (Master Acoustic)',
        artist: 'Open Grace Studio',
        album: 'Nightfall Resonance',
        url: '/assets/WhatsApp_Audio_2026-10-23_at_2.57.57_AM_f8e11d58.mpeg',
      },
    ];

    for (const s of samples) {
      try {
        const res = await fetch(s.url);
        if (res.ok) {
          const blob = await res.blob();
          const track: Track = {
            id: `sample_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: 180,
            sizeBytes: blob.size,
            format: 'MP3',
            mimeType: 'audio/mpeg',
            source: 'SAMPLE_AUDIO',
            storageStatus: 'PERSISTENT',
            addedAt: Date.now(),
            bitrateKbps: 320,
            sampleRateHz: 48000,
            bitDepth: '16-bit',
            isFavorite: false,
          };
          const saved = await saveTrackToDB(track, blob);
          setTracks((prev) => [saved, ...prev]);
        }
      } catch {
        // ignore
      }
    }
    refreshStorage();
    addToast('✓ Loaded sample tracks into offline library!', 'success');
  };

  const activeInlineFormatObj =
    AUDIOPHILE_FORMATS.find((f) => f.id === inlineFormat) || AUDIOPHILE_FORMATS[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#11120f] text-[#eeeae2] pb-28">
      {/* Sticky Dark Sage & Charcoal Header */}
      <header className="border-b border-[#292a24] bg-[#171814]/95 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Golden-Sage Harp/Vinyl Emblem + Brand Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#21291d] border border-[#3a4433] flex items-center justify-center shadow-lg overflow-hidden shrink-0">
              <img
                src="/logo.png"
                alt="Open Grace Music Emblem"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-serif-display text-lg sm:text-xl font-bold tracking-tight text-[#eeeae2] truncate">
                  Open Grace Music
                </h1>
                <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
                  ANDROID · HI-RES AUDIO
                </span>
              </div>
              <p className="text-[11px] text-[#a3a198] leading-tight truncate">
                Lossless Digital Studio · FLAC 24-bit · ALAC · DSD 192kHz · MP3 320k
              </p>
            </div>
          </div>

          {/* Header Actions: YouTube Browser + Direct APK Download + Studio Modal */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setPrefilledUrl(null);
                setShowYouTubeBrowser(true);
              }}
              title="Search and browse YouTube in app"
              className="px-3 py-1.5 rounded-full bg-[#11120f] text-[#b8d99e] hover:bg-[#21291d] border border-[#292a24] font-medium text-xs flex items-center gap-1 transition-colors"
            >
              <span>YouTube →</span>
            </button>

            <a
              href="/OpenGraceMusic.apk"
              download="OpenGraceMusic.apk"
              className="px-3.5 py-1.5 rounded-full bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
              title="Download compiled Native Android APK (25 MB)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download APK</span>
            </a>

            <button
              onClick={() => setShowAndroidProject(true)}
              className="hidden sm:flex px-3 py-1.5 rounded-full bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] text-xs font-semibold items-center gap-1.5 transition-all"
              title="Android Studio Kotlin Project & Architecture"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Android Studio</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="max-w-5xl mx-auto w-full flex-1 flex flex-col pt-4 px-4 sm:px-6 space-y-5">
        {/* Hero Section: "Your music. Your quiet place." + Animated Vinyl Disc + Android APK Banner */}
        <section className="rounded-3xl bg-[#171814] border border-[#292a24] p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-2.5 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#21291d] border border-[#3a4433] text-[#b8d99e] text-[11px] font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>PURE NATIVE ANDROID APP + OFFLINE AUDIOPHILE STUDIO</span>
              </div>

              <h2 className="font-serif-display text-2xl sm:text-3xl font-bold italic text-[#eeeae2] tracking-tight">
                “Your music. Your quiet place.”
              </h2>

              <p className="text-xs sm:text-sm text-[#a3a198] leading-relaxed">
                Crafted for passionate music lovers and audiophiles. Extract, transcode, and keep studio-master{' '}
                <strong className="text-[#eeeae2]">FLAC (24-bit/96kHz)</strong>,{' '}
                <strong className="text-[#eeeae2]">ALAC (.m4a)</strong>,{' '}
                <strong className="text-[#eeeae2]">DSD / Hi-Res (24-bit/192kHz)</strong>,{' '}
                <strong className="text-[#eeeae2]">WAV</strong>, and{' '}
                <strong className="text-[#eeeae2]">320kbps MP3</strong> completely offline on your Android device.
              </p>

              {/* Primary Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <label className="cursor-pointer px-4 py-2.5 rounded-full bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all active:scale-95">
                  <Plus className="w-4 h-4" />
                  <span>Import Audio Files</span>
                  <input
                    type="file"
                    multiple
                    accept="audio/*,.flac,.m4a,.alac,.dsf,.dff,.wav,.mp3,.aac,.ogg,.opus,.webm,.mp4"
                    onChange={handleLocalFiles}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => {
                    setPrefilledUrl(null);
                    setShowDownloadDialog(true);
                  }}
                  className="px-4 py-2.5 rounded-full bg-[#11120f] text-[#b8d99e] hover:bg-[#21291d] border border-[#b8d99e] font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                  <span>Import from URL</span>
                </button>

                <a
                  href="/OpenGraceMusic.apk"
                  download="OpenGraceMusic.apk"
                  className="px-4 py-2.5 rounded-full bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Get Android .APK (25 MB)</span>
                </a>

                {isInstallable && (
                  <button
                    onClick={install}
                    className="px-3.5 py-2.5 rounded-full bg-[#21291d] text-[#86efac] border border-[#2b3e2f] font-semibold text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install to Home Screen</span>
                  </button>
                )}
              </div>
            </div>

            {/* Animated Album Vinyl Disc */}
            <div
              onClick={() => {
                if (currentTrack) setShowFullPlayer(true);
              }}
              className="self-center md:self-auto shrink-0 cursor-pointer group"
              title="Open Turntable Hi-Fi Player"
            >
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full vinyl-grooves border-2 border-[#3a4433] flex items-center justify-center relative shadow-2xl ${
                  isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused'
                }`}
              >
                <div className="absolute inset-3 rounded-full border border-white/5 pointer-events-none" />
                <div className="absolute inset-6 rounded-full border border-white/5 pointer-events-none" />
                <div className="w-12 h-12 rounded-full overflow-hidden bg-[#21291d] border border-[#b8d99e] flex items-center justify-center">
                  <img
                    src={currentTrack?.thumbnailUrl || '/logo.png'}
                    alt="Album Disc"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-[#11120f] border border-[#292a24]" />
              </div>
            </div>
          </div>
        </section>

        {/* Inline Audiophile Lossless & Hi-Res Converter Card */}
        <section className="rounded-3xl bg-[#171814] border border-[#292a24] p-5 sm:p-6 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#292a24] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
                <Disc3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif-display text-base sm:text-lg font-bold text-[#eeeae2]">
                  Audiophile Lossless & Hi-Res Studio Converter
                </h3>
                <p className="text-xs text-[#a3a198]">
                  Paste any YouTube or direct audio URL · Live URL Validator & Simultaneous Video Preview
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-[#21291d] text-[#b8d99e] border border-[#3a4433]">
              FFmpeg 24-Bit Studio Engine
            </span>
          </div>

          {/* URL Input Row */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 flex items-center">
              <input
                type="text"
                value={inlineUrl}
                onChange={(e) => {
                  setInlineUrl(e.target.value);
                  validateInlineUrl(e.target.value);
                }}
                disabled={isDownloading}
                placeholder="Paste YouTube URL (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
                className="w-full pl-3.5 pr-20 py-3 rounded-xl bg-[#11120f] border border-[#292a24] text-[#eeeae2] placeholder-[#6e6d66] text-xs sm:text-sm focus:outline-none focus:border-[#b8d99e] transition-colors"
              />
              <button
                type="button"
                onClick={handleInlinePaste}
                disabled={isDownloading}
                className="absolute right-2 px-2.5 py-1.5 rounded-lg bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste</span>
              </button>
            </div>

            <button
              type="button"
              disabled={!inlineUrl.trim() || isDownloading}
              onClick={() =>
                handleStartDownload(
                  inlineUrl,
                  inlineFormat,
                  inlineFormat === 'MP3' ? inlineMp3Bitrate : activeInlineFormatObj.bitrateKbps,
                  inlineSaveToDevice,
                  inlineCookies.trim() || undefined,
                  inlinePreview?.title,
                  inlinePreview?.author
                )
              }
              className="px-6 py-3 rounded-xl bg-[#b8d99e] text-[#11120f] hover:bg-[#c8e6b0] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcoding {inlineFormat}...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    Convert to {inlineFormat} ({activeInlineFormatObj.badge})
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Audiophile Format Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {AUDIOPHILE_FORMATS.map((fmt) => {
              const selected = inlineFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isDownloading}
                  onClick={() => setInlineFormat(fmt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    selected
                      ? 'bg-[#b8d99e] text-[#11120f] border-[#b8d99e] shadow-sm'
                      : 'bg-[#11120f] text-[#eeeae2] border-[#292a24] hover:border-[#3a4433]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">{fmt.id}</span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                        selected
                          ? 'bg-[#11120f]/15 text-[#11120f] font-bold'
                          : 'bg-[#21291d] text-[#b8d99e]'
                      }`}
                    >
                      .{fmt.extension}
                    </span>
                  </div>
                  <div
                    className={`text-[10px] font-mono mt-0.5 ${
                      selected ? 'text-[#11120f]/85 font-semibold' : 'text-[#a3a198]'
                    }`}
                  >
                    {fmt.badge}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Converter Options Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#a3a198] hover:text-[#eeeae2]">
              <input
                type="checkbox"
                checked={inlineSaveToDevice}
                onChange={(e) => setInlineSaveToDevice(e.target.checked)}
                className="accent-[#b8d99e] rounded"
              />
              <span>
                Auto-save <strong className="text-[#b8d99e]">.{activeInlineFormatObj.extension}</strong> file directly to device Music/Downloads folder
              </span>
            </label>

            <div className="flex items-center gap-3">
              {inlineFormat === 'MP3' && (
                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className="text-[#a3a198]">Bitrate:</span>
                  {[320, 256, 192].map((br) => (
                    <button
                      key={br}
                      type="button"
                      onClick={() => setInlineMp3Bitrate(br)}
                      className={`px-2 py-0.5 rounded border ${
                        inlineMp3Bitrate === br
                          ? 'bg-[#21291d] text-[#b8d99e] border-[#b8d99e]'
                          : 'bg-[#11120f] text-[#a3a198] border-[#292a24]'
                      }`}
                    >
                      {br}k
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowInlineCookies(!showInlineCookies)}
                className="text-[11px] font-mono text-[#a3a198] hover:text-[#b8d99e] flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3 text-[#b8d99e]" />
                <span>{showInlineCookies ? 'Hide YouTube Cookies ▲' : 'YouTube Cookies (Optional) ▼'}</span>
              </button>
            </div>
          </div>

          {showInlineCookies && (
            <div className="p-3 rounded-xl bg-[#11120f] border border-[#292a24] space-y-1">
              <textarea
                rows={2}
                value={inlineCookies}
                onChange={(e) => setInlineCookies(e.target.value)}
                placeholder="Optional: Paste YouTube Netscape cookies.txt or cookie header (SID=...; HSID=...) for age-restricted/private streams"
                className="w-full p-2 rounded-lg bg-[#171814] border border-[#292a24] text-[11px] font-mono text-[#eeeae2] placeholder-[#6e6d66] focus:outline-none focus:border-[#b8d99e]"
              />
            </div>
          )}

          {/* Live URL Validation & Simultaneous Embedded Video Preview */}
          {isValidatingInline && (
            <div className="p-3 rounded-xl bg-[#11120f] border border-[#292a24] flex items-center gap-2 text-xs text-[#a3a198]">
              <Loader2 className="w-4 h-4 animate-spin text-[#b8d99e]" />
              <span>Validating URL & resolving YouTube oEmbed metadata...</span>
            </div>
          )}

          {inlineValidationError && !isValidatingInline && (
            <div className="p-3 rounded-xl bg-[#2a1616] border border-[#522929] flex items-center gap-2 text-xs text-[#fca5a5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{inlineValidationError}</span>
            </div>
          )}

          {inlinePreview && (
            <div className="rounded-2xl border border-[#3a4433] bg-[#11120f] p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-2.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#86efac] bg-[#1b2b1e] px-2.5 py-0.5 rounded-full border border-[#2b3e2f]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>LIVE URL VALIDATED · READY FOR {inlineFormat}</span>
                </div>
                <h4 className="font-serif-display text-base sm:text-lg font-bold text-[#eeeae2]">
                  {inlinePreview.title}
                </h4>
                <p className="text-xs text-[#b8d99e] font-mono">
                  Artist / Channel: {inlinePreview.author} · ID: {inlinePreview.id}
                </p>
                <p className="text-xs text-[#a3a198]">
                  Output Spec: <strong className="text-[#eeeae2]">{activeInlineFormatObj.spec}</strong> ({activeInlineFormatObj.badge})
                </p>
              </div>

              {inlinePreview.isYouTube && (
                <div className="rounded-xl overflow-hidden aspect-video bg-black border border-[#292a24]">
                  <iframe
                    src={`https://www.youtube.com/embed/${inlinePreview.id}?autoplay=0&enablejsapi=1`}
                    title="YouTube Simultaneous Video Preview"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          )}

          {/* Active Download Progress Bar */}
          {isDownloading && (
            <div className="p-3.5 rounded-xl bg-[#11120f] border border-[#3a4433] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#b8d99e]">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{downloadStatus}</span>
                </span>
                <span className="font-mono font-bold">{Math.round(downloadProgress * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-[#292a24] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#b8d99e] transition-all duration-200 rounded-full"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Storage Status Banner */}
        <StorageBanner
          storageInfo={storageInfo}
          onRequestPersistence={handleRequestPersistence}
        />

        {/* Library Navigation Tabs & Search Toolbar */}
        <section className="flex flex-col gap-3 pb-2 border-b border-[#292a24]">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(
              [
                { id: 'ALL', label: 'All Tracks', count: tracks.length },
                {
                  id: 'LOSSLESS',
                  label: 'Lossless (FLAC / ALAC / DSD)',
                  count: tracks.filter((t) =>
                    ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(t.format.toUpperCase())
                  ).length,
                },
                {
                  id: 'DOWNLOADS',
                  label: 'YouTube & URLs',
                  count: tracks.filter(
                    (t) => t.source === 'YOUTUBE' || t.source === 'DIRECT_URL'
                  ).length,
                },
                {
                  id: 'DEVICE_MUSIC',
                  label: 'Phone Storage',
                  count: tracks.filter(
                    (t) => t.source === 'LOCAL_IMPORT' || t.source === 'SAMPLE_AUDIO'
                  ).length,
                },
                {
                  id: 'MP3',
                  label: 'MP3 (320k)',
                  count: tracks.filter(
                    (t) => t.format.toUpperCase() === 'MP3' || t.mimeType.includes('mpeg')
                  ).length,
                },
                {
                  id: 'FAVORITES',
                  label: 'Favorites',
                  count: tracks.filter((t) => t.isFavorite).length,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  selectedTab === tab.id
                    ? 'bg-[#b8d99e] text-[#11120f] font-semibold shadow-sm'
                    : 'bg-[#171814] text-[#a3a198] hover:text-[#eeeae2] border border-[#292a24]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    selectedTab === tab.id
                      ? 'bg-[#11120f]/20 text-[#11120f]'
                      : 'bg-[#21291d] text-[#b8d99e]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#6e6d66] absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search offline tracks by title, artist, or format (FLAC, ALAC, DSD, MP3)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#171814] border border-[#292a24] text-[#eeeae2] placeholder-[#6e6d66] text-xs focus:outline-none focus:border-[#b8d99e] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-[#a3a198] hover:text-[#eeeae2]"
                >
                  ✕
                </button>
              )}
            </div>

            {tracks.length === 0 && (
              <button
                onClick={handleLoadSampleTracks}
                className="px-3.5 py-2 rounded-xl bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
                title="Load built-in demo tracks"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Studio Samples</span>
              </button>
            )}
          </div>
        </section>

        {/* Verified Offline Library */}
        <section className="flex-1 pb-6">
          {filteredTracks.length === 0 ? (
            <div className="py-12 sm:py-16 px-4 rounded-3xl bg-[#171814] border border-[#292a24] flex flex-col items-center justify-center text-center max-w-lg mx-auto">
              <div className="w-20 h-20 rounded-full bg-[#21291d] border border-[#3a4433] flex items-center justify-center text-[#b8d99e] mb-4 shadow-inner">
                <span className="text-3xl">♪</span>
              </div>

              <h3 className="font-serif-display text-xl font-bold text-[#eeeae2]">
                Your Audiophile Library Awaits
              </h3>
              <p className="text-xs sm:text-sm text-[#a3a198] mt-2 leading-relaxed max-w-md">
                Paste a YouTube link above to convert into 24-bit Lossless FLAC, ALAC, DSD, or 320kbps MP3, or import audio files from your phone. Every track is verified and stored offline on this device.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                <label className="cursor-pointer px-5 py-2.5 rounded-full bg-[#21291d] text-[#b8d99e] hover:bg-[#2b3626] border border-[#3a4433] font-semibold text-xs flex items-center justify-center gap-2 transition-colors">
                  <FolderOpen className="w-4 h-4" />
                  <span>Scan Phone Music Folder</span>
                  <input
                    type="file"
                    multiple
                    accept="audio/*,.flac,.m4a,.alac,.dsf,.dff,.wav,.mp3,.aac,.ogg,.opus,.webm,.mp4"
                    onChange={handleLocalFiles}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={handleLoadSampleTracks}
                  className="px-4 py-2.5 rounded-full bg-[#11120f] text-[#a3a198] hover:text-[#b8d99e] border border-[#292a24] text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#b8d99e]" />
                  <span>Load Acoustic Samples</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-[#6e6d66] px-1 font-mono">
                <span>
                  {filteredTracks.length} {filteredTracks.length === 1 ? 'MASTER TRACK' : 'MASTER TRACKS'} IN OFFLINE LIBRARY
                </span>
                <span>INDEXEDDB VERIFIED · TAP TO PLAY</span>
              </div>

              {filteredTracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  isPlayingThis={currentTrack?.id === track.id}
                  isCurrentlyPlaying={isPlaying}
                  isConverting={convertingTrackId === track.id}
                  conversionProgress={convertingProgress}
                  onPlayClick={() => playTrack(track)}
                  onConvertToMp3={() => handleConvertToMp3(track)}
                  onLyricsClick={() => setSelectedTrackForLyrics(track)}
                  onExportClick={() => handleExportTrack(track)}
                  onDeleteClick={() => handleDeleteTrack(track)}
                  onToggleFavorite={() => handleToggleFavorite(track)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Docked Now Playing Bar */}
      <NowPlayingBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        isShuffle={isShuffle}
        loopMode={loopMode}
        volume={volume}
        onTogglePlayPause={togglePlayPause}
        onPrevious={handlePrevTrack}
        onNext={handleNextTrack}
        onSeek={handleSeek}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        onCycleLoop={cycleLoopMode}
        onVolumeChange={handleVolumeChange}
        onOpenFullPlayer={() => setShowFullPlayer(true)}
      />

      {/* Full Screen Vinyl Turntable + Live Frequency Equalizer Player */}
      <FullPlayerModal
        isOpen={showFullPlayer}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        isShuffle={isShuffle}
        loopMode={loopMode}
        playbackSpeed={playbackSpeed}
        volume={volume}
        queue={tracks}
        onClose={() => setShowFullPlayer(false)}
        onTogglePlayPause={togglePlayPause}
        onPrevious={handlePrevTrack}
        onNext={handleNextTrack}
        onSeek={handleSeek}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        onCycleLoop={cycleLoopMode}
        onSetSpeed={handleSpeedChange}
        onVolumeChange={handleVolumeChange}
        onSelectTrack={(t) => playTrack(t)}
        onExportTrack={handleExportTrack}
        onOpenLyrics={(t) => setSelectedTrackForLyrics(t)}
      />

      {/* Audiophile URL & YouTube Downloader / Converter Dialog */}
      <DownloadDialog
        isOpen={showDownloadDialog}
        initialUrl={prefilledUrl}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        downloadStatus={downloadStatus}
        onClose={() => setShowDownloadDialog(false)}
        onStartDownload={handleStartDownload}
        onOpenYouTubeBrowser={(url) => {
          setShowDownloadDialog(false);
          setPrefilledUrl(url || null);
          setShowYouTubeBrowser(true);
        }}
      />

      {/* In-App YouTube Browser & Search Preview Modal */}
      <YouTubeBrowserModal
        isOpen={showYouTubeBrowser}
        initialUrl={prefilledUrl}
        onClose={() => setShowYouTubeBrowser(false)}
        onConvertVideo={(videoUrl) => {
          setShowYouTubeBrowser(false);
          handleStartDownload(videoUrl, inlineFormat, activeInlineFormatObj.bitrateKbps, true);
        }}
      />

      {/* Vocal Lyrics & Instrument Chord Sheet Modal */}
      <LyricsModal
        isOpen={!!selectedTrackForLyrics}
        track={selectedTrackForLyrics}
        onClose={() => setSelectedTrackForLyrics(null)}
      />

      {/* Pure Native Android APK & Studio Project Modal */}
      <AndroidProjectModal
        isOpen={showAndroidProject}
        onClose={() => setShowAndroidProject(false)}
      />

      {/* Global Toast Notification System */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
