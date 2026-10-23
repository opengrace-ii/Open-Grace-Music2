/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Sparkles,
  Smartphone,
  Download,
  FolderOpen,
  Clipboard,
  Loader2,
  KeyRound,
  AlertCircle,
  Play,
  Pause,
  Radio,
  Youtube,
  Disc3,
} from 'lucide-react';
import {
  AUDIOPHILE_FORMATS,
  AudiophileFormatId,
  LibraryTab,
  LoopMode,
  Track,
} from './types';
import {
  getAllTracksFromDB,
  saveTrackToDB,
  deleteTrackFromDB,
  toggleFavoriteInDB,
} from './services/storage';
import { convertBlobToMp3 } from './services/mp3Converter';
import { extractYouTubeId } from './services/mediaResolver';
import { playerEngine } from './services/playerService';
import { usePWAInstall } from './hooks/usePWAInstall';
import { TrackCard } from './components/TrackCard';
import { NowPlayingBar } from './components/NowPlayingBar';
import { FullPlayerModal } from './components/FullPlayerModal';
import { DownloadDialog } from './components/DownloadDialog';
import { YouTubeBrowserModal } from './components/YouTubeBrowserModal';
import { LyricsModal } from './components/LyricsModal';
import { AndroidProjectModal } from './components/AndroidProjectModal';
import { Toast, ToastMessage } from './components/Toast';
import { GramophoneDiscLogo } from './components/GramophoneDiscLogo';

export default function App() {
  const { isInstallable, install } = usePWAInstall();

  // Library state
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTab, setSelectedTab] = useState<LibraryTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Inline Tape Deck Recorder state
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

  // Player state
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

  // Hero VU Spectrum Canvas
  const heroVuCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const addToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
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

  // Animate Hero Analog VU Spectrum Ribbon
  useEffect(() => {
    let animId: number;
    const freqBuffer = new Uint8Array(24);

    const drawHeroVu = () => {
      const canvas = heroVuCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const hasLive = isPlaying && playerEngine.getFrequencyData(freqBuffer);
          const barCount = 24;
          const gap = 3;
          const barWidth = (width - gap * (barCount - 1)) / barCount;
          const now = performance.now() / 240;

          for (let i = 0; i < barCount; i++) {
            let ratio = 0.16;
            if (hasLive) {
              const val = freqBuffer[i % freqBuffer.length] || 0;
              ratio = val > 0 ? Math.max(0.16, Math.min(1.0, val / 240)) : 0.22 + 0.55 * Math.abs(Math.sin(now + i * 0.45));
            } else if (isPlaying) {
              ratio = 0.22 + 0.62 * Math.abs(Math.sin(now + i * 0.42) * Math.cos(now * 0.65 - i * 0.28));
            } else {
              ratio = 0.14 + 0.08 * Math.sin(now * 0.35 + i * 0.5);
            }

            const barH = Math.max(3, ratio * height);
            const x = i * (barWidth + gap);
            const y = height - barH;

            ctx.fillStyle =
              ratio > 0.76
                ? '#e2c986'
                : isPlaying
                ? '#b8d99e'
                : 'rgba(184, 217, 158, 0.35)';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barH, 2);
            ctx.fill();
          }
        }
      }
      animId = requestAnimationFrame(drawHeroVu);
    };

    animId = requestAnimationFrame(drawHeroVu);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  const loadLibrary = async () => {
    try {
      const loaded = await getAllTracksFromDB();
      setTracks(loaded);
    } catch {
      addToast('Could not load tracks.', 'error');
    }
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
        setInlineValidationError(data.error || 'Enter a valid YouTube or audio URL.');
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
      addToast('Long-press input to paste URL.', 'info');
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
      } else {
        handleLoadSampleTracks();
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
    addToast(`Repeat: ${next}`, 'info');
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
          artist: 'Device Master',
          album: 'Cassette Archive',
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
        addToast(`♪ Loaded "${cleanTitle}" (${ext})`, 'success');
      } catch (err: any) {
        addToast(`Failed to import "${file.name}": ${err.message}`, 'error');
      }
    }

    e.target.value = '';
  };

  // Real Audiophile Lossless & Hi-Res Download & Conversion Handler
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
      addToast('Enter a YouTube or audio URL.', 'error');
      return;
    }

    const formatObj = AUDIOPHILE_FORMATS.find((f) => f.id === format) || AUDIOPHILE_FORMATS[0];

    setIsDownloading(true);
    setDownloadProgress(0.2);
    setDownloadStatus(`RECORDING ${format} (${formatObj.badge})...`);

    try {
      const ytId = extractYouTubeId(trimmedUrl);
      setDownloadProgress(0.45);

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

      setDownloadProgress(0.8);
      setDownloadStatus(`MASTERING ${format} REEL...`);

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
        throw new Error('Audio stream was empty.');
      }

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

      setDownloadProgress(0.95);

      const newTrack: Track = {
        id: ytId ? `yt_${ytId}_${headerFormat.toLowerCase()}` : `url_${Date.now()}`,
        title: headerTitle,
        artist: headerArtist,
        album: `Open Grace · ${headerFormat}`,
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

      addToast(`♪ Recorded "${headerTitle}" (${headerFormat})`, 'success');
      playTrack(saved);
    } catch (err: any) {
      addToast(`Recorder error: ${err.message || 'Failed to process audio'}`, 'error');
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
        throw new Error('Source audio not found.');
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
      addToast(`♪ Dubbed "${track.title}" to MP3 320K`, 'success');
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
      addToast(`Ejected "${track.title}"`, 'info');
    } catch {
      addToast(`Could not remove "${track.title}"`, 'error');
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (track: Track) => {
    const nextFav = await toggleFavoriteInDB(track.id);
    setTracks((prev) =>
      prev.map((t) => (t.id === track.id ? { ...t, isFavorite: nextFav } : t))
    );
  };

  // Export Track
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
      addToast(`♪ Saved "${track.title}.${ext}"`, 'success');
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
      addToast(`♪ Saved "${track.title}.${ext}"`, 'success');
      return;
    }

    addToast('No offline audio file found.', 'error');
  };

  // Load Built-in Studio Acoustic Tracks
  const handleLoadSampleTracks = async () => {
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

    let firstLoaded: Track | null = null;
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
            format: 'FLAC',
            mimeType: 'audio/mpeg',
            source: 'SAMPLE_AUDIO',
            storageStatus: 'PERSISTENT',
            addedAt: Date.now(),
            bitrateKbps: 1411,
            sampleRateHz: 96000,
            bitDepth: '24-bit',
            isFavorite: false,
          };
          const saved = await saveTrackToDB(track, blob);
          if (!firstLoaded) firstLoaded = saved;
          setTracks((prev) => [saved, ...prev]);
        }
      } catch {
        // ignore
      }
    }
    if (firstLoaded) {
      addToast('♪ Loaded Studio Acoustic Reels', 'success');
      playTrack(firstLoaded);
    }
  };

  const activeInlineFormatObj =
    AUDIOPHILE_FORMATS.find((f) => f.id === inlineFormat) || AUDIOPHILE_FORMATS[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#0e100d] text-[#f0ece1] pb-28 relative overflow-hidden">
      {/* Subtle Ambient Musical Glow when Music Plays */}
      <div
        className={`pointer-events-none fixed inset-0 transition-opacity duration-1000 ${
          isPlaying ? 'opacity-100' : 'opacity-30'
        }`}
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(184, 217, 158, 0.11) 0%, rgba(226, 201, 134, 0.05) 35%, transparent 70%)',
        }}
      />

      {/* Sticky Gramophone & Cassette Deck Header */}
      <header className="border-b border-[#262c22] bg-[#121510]/95 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Gramophone Disc Emblem + Brand Title */}
          <div
            onClick={togglePlayPause}
            className="flex items-center gap-3 min-w-0 cursor-pointer group"
            title={isPlaying ? 'Pause Gramophone' : 'Play Gramophone'}
          >
            <GramophoneDiscLogo
              isPlaying={isPlaying}
              size={48}
              showHornOverlay={true}
              badgeFrame={true}
              title={isPlaying ? 'Gramophone Disc Spinning' : 'Open Grace Music Gramophone'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`cassette-led ${isPlaying ? 'cassette-led-on' : ''}`} />
                <h1 className="font-serif-display text-lg sm:text-xl font-bold tracking-tight text-[#f0ece1] truncate">
                  Open Grace Music
                </h1>
              </div>
              <p className="text-[11px] font-mono text-[#e2c986] tracking-wider uppercase truncate">
                Gramophone & Master Cassette Deck
              </p>
            </div>
          </div>

          {/* Cassette Transport Bank in Header */}
          <div className="cassette-bank flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setPrefilledUrl(null);
                setShowYouTubeBrowser(true);
              }}
              title="YouTube Studio Tuner"
              className="cassette-btn px-3 py-1.5 text-xs font-mono text-[#b8d99e]"
            >
              <Youtube className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TUNER</span>
            </button>

            <a
              href="/OpenGraceMusic.apk"
              download="OpenGraceMusic.apk"
              className="cassette-btn cassette-btn-primary px-3.5 py-1.5 text-xs font-mono"
              title="Download Android APK"
            >
              <Download className="w-3.5 h-3.5" />
              <span>APK</span>
            </a>

            <button
              onClick={() => setShowAndroidProject(true)}
              className="cassette-btn hidden sm:inline-flex px-3 py-1.5 text-xs font-mono text-[#e2c986]"
              title="Android Studio Project"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Musical Sanctuary Stage */}
      <main className="max-w-5xl mx-auto w-full flex-1 flex flex-col pt-5 px-4 sm:px-6 space-y-6 relative z-10">
        {/* Gramophone Turntable Sanctuary Hero */}
        <section className="cassette-card rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          {/* Floating Ambient Musical Notes */}
          <span className="music-note-float-1 pointer-events-none select-none absolute top-5 right-64 text-2xl text-[#b8d99e]/30 font-serif">
            ♪
          </span>
          <span className="music-note-float-2 pointer-events-none select-none absolute bottom-6 right-72 text-xl text-[#e2c986]/25 font-serif">
            ♫
          </span>
          <span className="music-note-float-3 pointer-events-none select-none absolute top-12 right-10 text-xl text-[#b8d99e]/25 font-serif">
            ♬
          </span>

          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Left: Poetic Sanctuary Title + Live Analog VU Spectrum + Cassette Transport Keys */}
            <div className="space-y-5 flex-1 w-full text-center md:text-left">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a2116] border border-[#34402d] text-[#e2c986] text-[11px] font-mono tracking-widest uppercase mb-3">
                  <span className={`cassette-led ${isPlaying ? 'cassette-led-on' : 'cassette-led-rec'}`} />
                  <span>{isPlaying && currentTrack ? `NOW SPINNING · ${currentTrack.format}` : 'HI-FI GRAMOPHONE SANCTUARY'}</span>
                </div>

                <h2 className="font-serif-display text-3xl sm:text-4xl font-bold italic text-[#f0ece1] tracking-tight">
                  “Your music. Your quiet place.”
                </h2>
              </div>

              {/* Integrated Live Analog VU Spectrum Ribbon */}
              <div className="cassette-window rounded-2xl px-4 py-3 max-w-md mx-auto md:mx-0">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#9fa396] mb-1.5">
                  <span className="text-[#b8d99e] flex items-center gap-1.5">
                    <span>♪ ANALOG VU SPECTRUM</span>
                  </span>
                  <span className="text-[#e2c986]">
                    {currentTrack ? `${currentTrack.title.slice(0, 24)}` : 'FLAC · ALAC · DSD · MP3'}
                  </span>
                </div>
                <canvas
                  ref={heroVuCanvasRef}
                  width={340}
                  height={32}
                  className="w-full h-8 block"
                />
              </div>

              {/* Main Cassette Deck Piano-Key Transport Bank */}
              <div className="cassette-bank inline-flex flex-wrap items-center justify-center md:justify-start gap-2">
                <button
                  onClick={togglePlayPause}
                  className="cassette-btn cassette-btn-primary px-4 py-2.5 text-xs font-mono uppercase tracking-wider"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span>⏸ PAUSE DECK</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>▶ PLAY DECK</span>
                    </>
                  )}
                </button>

                <label className="cassette-btn px-4 py-2.5 text-xs font-mono text-[#f0ece1] cursor-pointer">
                  <span className="cassette-led cassette-led-on" />
                  <FolderOpen className="w-3.5 h-3.5 text-[#b8d99e]" />
                  <span>⏏ IMPORT AUDIO</span>
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
                  className="cassette-btn px-4 py-2.5 text-xs font-mono text-[#e2c986]"
                >
                  <span className="cassette-led cassette-led-rec" />
                  <span>⏺ RECORD URL</span>
                </button>

                {isInstallable && (
                  <button
                    onClick={install}
                    className="cassette-btn px-3.5 py-2.5 text-xs font-mono text-[#b8d99e]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>INSTALL</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: Interactive Rotating Gramophone Disc & Ornate Brass Horn Centerpiece */}
            <div
              onClick={() => {
                if (currentTrack) {
                  setShowFullPlayer(true);
                } else {
                  togglePlayPause();
                }
              }}
              className="relative w-48 h-48 sm:w-56 sm:h-56 shrink-0 cursor-pointer group flex items-center justify-center"
              title="Tap Gramophone Turntable"
            >
              {/* Warm Halo Behind Gramophone */}
              <div
                className={`absolute inset-2 rounded-full transition-all duration-700 ${
                  isPlaying
                    ? 'bg-[#b8d99e]/20 blur-2xl scale-105'
                    : 'bg-[#e2c986]/5 blur-xl scale-95'
                }`}
              />

              {/* Turntable Plinth Base */}
              <div className="relative w-full h-full rounded-[38px] bg-gradient-to-br from-[#1e251b] via-[#141812] to-[#0c0e0b] border-2 border-[#394532] shadow-2xl flex items-center justify-center p-3">
                {/* Rotating Gramophone Vinyl Disc */}
                <div
                  className={`w-36 h-36 sm:w-42 sm:h-42 rounded-full vinyl-grooves border-2 border-[#b8d99e]/50 flex items-center justify-center relative shadow-2xl ${
                    isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused'
                  }`}
                >
                  <div className="absolute inset-2.5 rounded-full border border-[#e2c986]/20 pointer-events-none" />
                  <div className="absolute inset-6 rounded-full border border-[#b8d99e]/20 pointer-events-none" />
                  <div className="absolute inset-9 rounded-full border border-[#e2c986]/15 pointer-events-none" />

                  {/* Golden-Sage Center Label */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-gradient-to-br from-[#e8d8a0] via-[#b8d99e] to-[#2d3b26] border-2 border-[#f6e7b2] flex items-center justify-center relative">
                    {currentTrack?.thumbnailUrl ? (
                      <img
                        src={currentTrack.thumbnailUrl}
                        alt="Gramophone Disc"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Disc3 className="w-6 h-6 text-[#141812]" />
                    )}
                    {/* Cardinal Rotation Markers */}
                    <span className="absolute top-1 w-1.5 h-1.5 rounded-full bg-[#141812]" />
                    <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#141812]" />
                    <span className="absolute left-1 w-1.5 h-1.5 rounded-full bg-[#141812]" />
                    <span className="absolute right-1 w-1.5 h-1.5 rounded-full bg-[#141812]" />
                    <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-[#0e100d] border border-[#f6e7b2]" />
                  </div>
                </div>

                {/* Ornate Brass Gramophone Horn & Stylus Overlay (poised above the spinning record) */}
                <svg
                  viewBox="0 0 512 512"
                  className={`absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_8px_12px_rgba(0,0,0,0.75)] transition-transform duration-700 ${
                    isPlaying ? 'rotate-0 scale-100' : 'rotate-[-3deg] scale-[0.99]'
                  }`}
                >
                  <defs>
                    <linearGradient id="heroHornBell" x1="15%" y1="10%" x2="85%" y2="90%">
                      <stop offset="0%" stopColor="#F6E7B2" />
                      <stop offset="32%" stopColor="#D4B86A" />
                      <stop offset="68%" stopColor="#B8D99E" />
                      <stop offset="100%" stopColor="#5B7349" />
                    </linearGradient>
                    <radialGradient id="heroHornInside" cx="40%" cy="45%" r="55%">
                      <stop offset="0%" stopColor="#11140F" />
                      <stop offset="48%" stopColor="#2A3321" />
                      <stop offset="82%" stopColor="#8A763E" />
                      <stop offset="100%" stopColor="#DEC67E" />
                    </radialGradient>
                    <linearGradient id="heroBrassArm" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#F3E3AD" />
                      <stop offset="50%" stopColor="#C8AF62" />
                      <stop offset="100%" stopColor="#687D56" />
                    </linearGradient>
                  </defs>
                  <circle cx="430" cy="212" r="22" fill="#1A2017" stroke="url(#heroBrassArm)" strokeWidth="4" />
                  <circle cx="430" cy="212" r="11" fill="url(#heroBrassArm)" />
                  <path
                    d="M 430 212 C 454 185, 452 132, 412 108 C 388 94, 355 96, 330 112"
                    fill="none"
                    stroke="url(#heroBrassArm)"
                    strokeWidth="15"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 340 105 C 310 72, 265 44, 212 40 C 175 78, 178 148, 224 188 C 272 178, 318 144, 340 105 Z"
                    fill="url(#heroHornBell)"
                    stroke="#F6E7B2"
                    strokeWidth="3"
                    strokeLinejoin="round"
                  />
                  <ellipse
                    cx="212"
                    cy="115"
                    rx="42"
                    ry="68"
                    transform="rotate(-14 212 115)"
                    fill="url(#heroHornInside)"
                    stroke="#F6E7B2"
                    strokeWidth="4"
                  />
                  {isPlaying && (
                    <>
                      <path d="M 148 86 A 58 58 0 0 0 142 146" fill="none" stroke="#B8D99E" strokeOpacity="0.85" strokeWidth="4" strokeLinecap="round" />
                      <path d="M 124 70 A 86 86 0 0 0 116 160" fill="none" stroke="#E8D8A0" strokeOpacity="0.65" strokeWidth="3.5" strokeLinecap="round" />
                    </>
                  )}
                  <path
                    d="M 430 212 L 392 316 L 336 346"
                    fill="none"
                    stroke="url(#heroBrassArm)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Studio Master Tape Deck (Streamlined URL / YouTube Recorder) */}
        <section className="cassette-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="cassette-led cassette-led-rec" />
              <h3 className="font-serif-display text-base sm:text-lg font-bold text-[#f0ece1]">
                Studio Master Tape Recorder
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInlineSaveToDevice(!inlineSaveToDevice)}
                className={`cassette-btn px-2.5 py-1 text-[11px] font-mono ${
                  inlineSaveToDevice ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                }`}
              >
                <span className={`cassette-led ${inlineSaveToDevice ? 'cassette-led-on' : ''}`} />
                <span>AUTO-SAVE .{activeInlineFormatObj.extension.toUpperCase()}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInlineCookies(!showInlineCookies)}
                className={`cassette-btn px-2.5 py-1 text-[11px] font-mono ${
                  showInlineCookies ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                }`}
                title="Optional Studio Cookie Key"
              >
                <KeyRound className="w-3 h-3 text-[#e2c986]" />
              </button>
            </div>
          </div>

          {/* Tape Bias / Format Selector Keys */}
          <div className="cassette-bank grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {AUDIOPHILE_FORMATS.map((fmt) => {
              const selected = inlineFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={isDownloading}
                  onClick={() => setInlineFormat(fmt.id)}
                  className={`cassette-btn flex-col items-start px-3 py-2 text-left ${
                    selected ? 'cassette-btn-engaged' : ''
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="font-mono text-xs font-bold">{fmt.id}</span>
                    <span className={`cassette-led ${selected ? 'cassette-led-on' : ''}`} />
                  </div>
                  <div className="text-[10px] font-mono text-[#9fa396] mt-0.5 truncate w-full">
                    {fmt.badge}
                  </div>
                </button>
              );
            })}
          </div>

          {/* URL Slot + Record Cassette Key */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="cassette-window flex-1 flex items-center rounded-2xl p-1.5">
              <input
                type="text"
                value={inlineUrl}
                onChange={(e) => {
                  setInlineUrl(e.target.value);
                  validateInlineUrl(e.target.value);
                }}
                disabled={isDownloading}
                placeholder="Paste YouTube or Audio URL to record onto master tape..."
                className="flex-1 bg-transparent px-3 py-2 text-[#f0ece1] placeholder-[#686b60] text-xs sm:text-sm focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleInlinePaste}
                disabled={isDownloading}
                className="cassette-btn px-3 py-2 text-xs font-mono text-[#b8d99e] shrink-0"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>PASTE</span>
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
              className="cassette-btn cassette-btn-primary px-6 py-3 text-xs sm:text-sm font-mono uppercase tracking-wider disabled:opacity-40 shrink-0"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>RECORDING {inlineFormat}...</span>
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4" />
                  <span>⏺ RECORD {inlineFormat}</span>
                </>
              )}
            </button>
          </div>

          {inlineFormat === 'MP3' && (
            <div className="cassette-bank inline-flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-[#9fa396] px-2">MP3 BIAS:</span>
              {[320, 256, 192].map((br) => (
                <button
                  key={br}
                  type="button"
                  onClick={() => setInlineMp3Bitrate(br)}
                  className={`cassette-btn px-2.5 py-1 text-[11px] font-mono ${
                    inlineMp3Bitrate === br ? 'cassette-btn-engaged' : ''
                  }`}
                >
                  {br}K
                </button>
              ))}
            </div>
          )}

          {showInlineCookies && (
            <div className="cassette-window p-3 rounded-xl">
              <textarea
                rows={2}
                value={inlineCookies}
                onChange={(e) => setInlineCookies(e.target.value)}
                placeholder="Optional: Paste YouTube cookies for private streams..."
                className="w-full bg-transparent text-[11px] font-mono text-[#f0ece1] placeholder-[#686b60] focus:outline-none"
              />
            </div>
          )}

          {/* Live URL Validation & Monitor */}
          {isValidatingInline && (
            <div className="cassette-window p-3 rounded-xl flex items-center gap-2 text-xs font-mono text-[#b8d99e]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>TUNING STREAM SIGNAL...</span>
            </div>
          )}

          {inlineValidationError && !isValidatingInline && (
            <div className="p-3 rounded-xl bg-[#2a1616] border border-[#522929] flex items-center gap-2 text-xs text-[#fca5a5]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{inlineValidationError}</span>
            </div>
          )}

          {inlinePreview && (
            <div className="cassette-window rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono text-[#b8d99e]">
                  <span className="cassette-led cassette-led-on" />
                  <span>SIGNAL LOCKED · {inlineFormat} ({activeInlineFormatObj.badge})</span>
                </div>
                <h4 className="font-serif-display text-base sm:text-lg font-bold text-[#f0ece1]">
                  {inlinePreview.title}
                </h4>
                <p className="text-xs font-mono text-[#e2c986]">
                  {inlinePreview.author}
                </p>
              </div>

              {inlinePreview.isYouTube && (
                <div className="rounded-xl overflow-hidden aspect-video bg-black border border-[#272c23]">
                  <iframe
                    src={`https://www.youtube.com/embed/${inlinePreview.id}?autoplay=0&enablejsapi=1`}
                    title="YouTube Monitor"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          )}

          {isDownloading && (
            <div className="cassette-window p-3.5 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-[#b8d99e]">
                <span className="flex items-center gap-2">
                  <span className="cassette-led cassette-led-rec animate-ping" />
                  <span>{downloadStatus}</span>
                </span>
                <span>{Math.round(downloadProgress * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-[#161a13] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#b8d99e] to-[#e2c986] transition-all duration-200 rounded-full"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Cassette Rack Selector Bank & Search */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="cassette-bank flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {(
              [
                { id: 'ALL', label: 'ALL TAPES', count: tracks.length },
                {
                  id: 'LOSSLESS',
                  label: 'LOSSLESS',
                  count: tracks.filter((t) =>
                    ['FLAC', 'ALAC', 'DSD', 'WAV'].includes(t.format.toUpperCase())
                  ).length,
                },
                {
                  id: 'DOWNLOADS',
                  label: 'YOUTUBE',
                  count: tracks.filter(
                    (t) => t.source === 'YOUTUBE' || t.source === 'DIRECT_URL'
                  ).length,
                },
                {
                  id: 'DEVICE_MUSIC',
                  label: 'DEVICE',
                  count: tracks.filter(
                    (t) => t.source === 'LOCAL_IMPORT' || t.source === 'SAMPLE_AUDIO'
                  ).length,
                },
                {
                  id: 'MP3',
                  label: 'MP3 320K',
                  count: tracks.filter(
                    (t) => t.format.toUpperCase() === 'MP3' || t.mimeType.includes('mpeg')
                  ).length,
                },
                {
                  id: 'FAVORITES',
                  label: '♥ FAVORITES',
                  count: tracks.filter((t) => t.isFavorite).length,
                },
              ] as const
            ).map((tab) => {
              const active = selectedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`cassette-btn px-3 py-1.5 text-xs font-mono whitespace-nowrap ${
                    active ? 'cassette-btn-engaged' : 'text-[#9fa396]'
                  }`}
                >
                  <span className={`cassette-led ${active ? 'cassette-led-on' : ''}`} />
                  <span>{tab.label}</span>
                  <span className="text-[10px] text-[#e2c986]">({tab.count})</span>
                </button>
              );
            })}
          </div>

          <div className="cassette-window flex items-center px-3 py-1.5 rounded-xl min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#686b60] shrink-0" />
            <input
              type="text"
              placeholder="Find tape..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-2 pr-2 py-1 bg-transparent text-[#f0ece1] placeholder-[#686b60] text-xs font-mono focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#9fa396] hover:text-[#f0ece1]"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* Cassette Tape Library */}
        <section className="flex-1 pb-6">
          {filteredTracks.length === 0 ? (
            <div className="py-12 px-6 rounded-3xl cassette-card flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-5">
              {/* Mini Cassette Reel Graphic */}
              <div className="cassette-window px-6 py-4 rounded-2xl flex items-center gap-5">
                <svg viewBox="0 0 40 40" className="w-9 h-9 text-[#b8d99e] animate-spin-reel">
                  <circle cx="20" cy="20" r="16" fill="#10130e" stroke="currentColor" strokeWidth="2.2" />
                  <circle cx="20" cy="20" r="6" fill="none" stroke="#e2c986" strokeWidth="1.8" strokeDasharray="3 3" />
                  <line x1="20" y1="4" x2="20" y2="12" stroke="currentColor" strokeWidth="2" />
                  <line x1="20" y1="28" x2="20" y2="36" stroke="currentColor" strokeWidth="2" />
                  <line x1="4" y1="20" x2="12" y2="20" stroke="currentColor" strokeWidth="2" />
                  <line x1="28" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="font-serif-display text-2xl text-[#e2c986]">♪</span>
                <svg viewBox="0 0 40 40" className="w-9 h-9 text-[#e2c986] animate-spin-reel">
                  <circle cx="20" cy="20" r="16" fill="#10130e" stroke="currentColor" strokeWidth="2.2" />
                  <circle cx="20" cy="20" r="6" fill="none" stroke="#b8d99e" strokeWidth="1.8" strokeDasharray="3 3" />
                  <line x1="20" y1="4" x2="20" y2="12" stroke="currentColor" strokeWidth="2" />
                  <line x1="20" y1="28" x2="20" y2="36" stroke="currentColor" strokeWidth="2" />
                  <line x1="4" y1="20" x2="12" y2="20" stroke="currentColor" strokeWidth="2" />
                  <line x1="28" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              <h3 className="font-serif-display text-xl font-bold text-[#f0ece1]">
                Insert Your First Master Tape
              </h3>

              <div className="cassette-bank flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleLoadSampleTracks}
                  className="cassette-btn cassette-btn-primary px-4 py-2.5 text-xs font-mono"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>▶ PLAY STUDIO SAMPLES</span>
                </button>

                <label className="cassette-btn px-4 py-2.5 text-xs font-mono text-[#f0ece1] cursor-pointer">
                  <FolderOpen className="w-3.5 h-3.5 text-[#b8d99e]" />
                  <span>⏏ LOAD DEVICE FILES</span>
                  <input
                    type="file"
                    multiple
                    accept="audio/*,.flac,.m4a,.alac,.dsf,.dff,.wav,.mp3,.aac,.ogg,.opus,.webm,.mp4"
                    onChange={handleLocalFiles}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
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

      {/* Docked Cassette Transport Bar */}
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

      {/* Full Screen Gramophone Turntable + Live Frequency Equalizer */}
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

      {/* Master Tape Deck Recorder Dialog */}
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

      {/* In-App YouTube Studio Tuner Modal */}
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
