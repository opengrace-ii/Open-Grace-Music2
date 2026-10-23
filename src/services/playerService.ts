import { Track } from '../types';

export type PlayerListener = {
  onPlayStateChange: (isPlaying: boolean) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onTrackEnded: () => void;
  onError: (msg: string) => void;
  onNextRequested?: () => void;
  onPrevRequested?: () => void;
};

class AudioPlayerEngine {
  private htmlAudio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private currentTrack: Track | null = null;
  private currentObjectUrl: string | null = null;
  private listeners: PlayerListener[] = [];
  private timePollInterval: any = null;
  private volume = 0.85;
  private playbackRate = 1.0;

  constructor() {
    this.htmlAudio = new Audio();
    this.htmlAudio.preload = 'auto';
    this.htmlAudio.crossOrigin = 'anonymous';

    this.htmlAudio.onplay = () => {
      this.resumeAudioContext();
      this.notifyPlayState(true);
      this.startTimePoll();
      this.updateMediaSessionState('playing');
    };

    this.htmlAudio.onpause = () => {
      this.notifyPlayState(false);
      this.stopTimePoll();
      this.updateMediaSessionState('paused');
    };

    this.htmlAudio.ontimeupdate = () => {
      this.notifyTime(this.htmlAudio.currentTime, this.htmlAudio.duration || 0);
    };

    this.htmlAudio.onended = () => {
      this.notifyEnded();
    };

    this.htmlAudio.onerror = () => {
      this.notifyError('Failed to decode or play audio track.');
    };

    this.setupMediaSessionHandlers();
  }

  private ensureAnalyserConnected() {
    if (typeof window === 'undefined') return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        this.audioCtx = new AudioContextClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.78;
        this.sourceNode = this.audioCtx.createMediaElementSource(this.htmlAudio);
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch {
      // Fallback if Web Audio API cannot attach
    }
  }

  private resumeAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (this.analyser && !this.htmlAudio.paused) {
      try {
        this.analyser.getByteFrequencyData(target);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private setupMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.htmlAudio.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.htmlAudio.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.listeners.forEach((l) => l.onPrevRequested?.());
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.listeners.forEach((l) => l.onNextRequested?.());
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          this.seekTo(details.seekTime);
        }
      });
    } catch {
      // ignore unsupported mediaSession actions
    }
  }

  private updateMediaSessionMetadata(track: Track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: `${track.artist || 'Open Grace Music'} · ${track.format}`,
        album: track.album || 'Open Grace Music · Audiophile Library',
        artwork: track.thumbnailUrl
          ? [{ src: track.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' }]
          : [{ src: '/logo.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch {
      // ignore
    }
  }

  private updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // ignore
    }
  }

  public subscribe(listener: PlayerListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyPlayState(isPlaying: boolean) {
    this.listeners.forEach((l) => l.onPlayStateChange(isPlaying));
  }

  private notifyTime(current: number, duration: number) {
    this.listeners.forEach((l) => l.onTimeUpdate(current, duration));
  }

  private notifyEnded() {
    this.listeners.forEach((l) => l.onTrackEnded());
  }

  private notifyError(msg: string) {
    this.listeners.forEach((l) => l.onError(msg));
  }

  private startTimePoll() {
    this.stopTimePoll();
    this.timePollInterval = setInterval(() => {
      this.notifyTime(this.htmlAudio.currentTime, this.htmlAudio.duration || 0);
    }, 200);
  }

  private stopTimePoll() {
    if (this.timePollInterval) {
      clearInterval(this.timePollInterval);
      this.timePollInterval = null;
    }
  }

  public async playTrack(track: Track): Promise<void> {
    this.currentTrack = track;
    this.ensureAnalyserConnected();

    let streamSource = track.audioUrl;
    if (track.blob) {
      if (this.currentObjectUrl) {
        try {
          URL.revokeObjectURL(this.currentObjectUrl);
        } catch {
          // ignore
        }
      }
      this.currentObjectUrl = URL.createObjectURL(track.blob);
      streamSource = this.currentObjectUrl;
    } else if (!streamSource && track.originalUrl) {
      streamSource = track.originalUrl;
    }

    if (!streamSource) {
      this.notifyError('Offline audio file not found for this track.');
      return;
    }

    this.htmlAudio.src = streamSource;
    this.htmlAudio.volume = this.volume;
    this.htmlAudio.playbackRate = this.playbackRate;
    this.updateMediaSessionMetadata(track);

    try {
      await this.htmlAudio.play();
    } catch {
      this.notifyError('Audio loaded. Tap Play to start listening.');
    }
  }

  public togglePlayPause(): void {
    this.ensureAnalyserConnected();
    if (this.htmlAudio.paused) {
      this.htmlAudio.play().catch(() => {});
    } else {
      this.htmlAudio.pause();
    }
  }

  public seekTo(seconds: number): void {
    this.htmlAudio.currentTime = seconds;
    this.notifyTime(seconds, this.htmlAudio.duration || 0);
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.htmlAudio.volume = this.volume;
  }

  public setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    this.htmlAudio.playbackRate = rate;
  }

  public getCurrentTrack(): Track | null {
    return this.currentTrack;
  }
}

export const playerEngine = new AudioPlayerEngine();
