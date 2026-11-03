import { Track } from '../types';

export type PlayerListener = {
  onPlayStateChange: (isPlaying: boolean) => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onTrackEnded: () => void;
  onError: (msg: string) => void;
  onNextRequested?: () => void;
  onPrevRequested?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: Record<string, unknown>
      ) => YoutubePlayerHandle;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    /** Injected by the Open Grace Music Android WebView shell. */
    OgmAndroid?: {
      onPlaybackState: (playing: boolean, title: string, artist: string) => void;
    };
    __ogmPlayerEngine?: {
      togglePlayPause: () => void;
      pause: () => void;
      requestNext: () => void;
      requestPrev: () => void;
    };
    __ogmNativeCommand?: (cmd: string) => void;
  }
}

function isApkWebViewShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /OpenGraceMusicAPK\//i.test(navigator.userAgent);
}

type YoutubePlayerHandle = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
  loadVideoById: (id: string) => void;
  setVolume: (v: number) => void;
};

function isYoutubeStreamTrack(track: Track): boolean {
  return Boolean(track.ytVideoId) && !track.blob && !track.audioUrl?.startsWith('blob:');
}

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    window.onYouTubeIframeAPIReady = () => resolve();
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    if (window.YT?.Player) resolve();
  });
}

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
  private ytPlayer: YoutubePlayerHandle | null = null;
  private ytHost: HTMLDivElement | null = null;
  private usingYoutube = false;
  /** Music-first default: keep YouTube audio, hide the video surface. */
  private showVideo = false;

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
        if (this.usingYoutube) this.ytPlayer?.playVideo();
        else this.htmlAudio.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (this.usingYoutube) this.ytPlayer?.pauseVideo();
        else this.htmlAudio.pause();
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
    this.notifyAndroidBridge(isPlaying);
  }

  /** Keep the APK foreground MediaSessionService in sync with HTML5 / YouTube playback. */
  private notifyAndroidBridge(isPlaying: boolean) {
    if (typeof window === 'undefined') return;
    if (!isApkWebViewShell() && !window.OgmAndroid) return;
    try {
      const track = this.currentTrack;
      window.OgmAndroid?.onPlaybackState?.(
        isPlaying,
        track?.title || 'Open Grace Music',
        track?.artist || 'Open Grace Music'
      );
    } catch {
      // Native bridge unavailable (browser / PWA)
    }
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
      if (this.usingYoutube && this.ytPlayer) {
        try {
          this.notifyTime(this.ytPlayer.getCurrentTime() || 0, this.ytPlayer.getDuration() || 0);
          return;
        } catch {
          // ignore
        }
      }
      this.notifyTime(this.htmlAudio.currentTime, this.htmlAudio.duration || 0);
    }, 200);
  }

  private stopTimePoll() {
    if (this.timePollInterval) {
      clearInterval(this.timePollInterval);
      this.timePollInterval = null;
    }
  }

  /** Dock = page nav (~3.65rem) + Now Playing bar (~5.25rem) + gap. */
  private static readonly YT_DOCK_CLEARANCE =
    'calc(3.65rem + 5.25rem + env(safe-area-inset-bottom, 0px) + 10px)';

  private applyYtHostLayout() {
    const host = this.ytHost;
    if (!host) return;
    if (!this.usingYoutube) {
      host.style.display = 'none';
      return;
    }
    host.style.display = 'block';
    if (this.showVideo) {
      // Reserved pocket above NowPlayingBar + AppPageNav — never under the transport.
      host.style.cssText = [
        'position:fixed',
        'left:12px',
        `bottom:${AudioPlayerEngine.YT_DOCK_CLEARANCE}`,
        'width:min(220px,calc(100vw - 24px))',
        'height:auto',
        'aspect-ratio:16/9',
        'z-index:30',
        'border-radius:12px',
        'overflow:hidden',
        'opacity:1',
        'pointer-events:none',
        'box-shadow:0 8px 24px rgba(0,0,0,.45)',
        'border:1px solid rgba(184,217,158,.25)',
      ].join(';');
      const iframe = host.querySelector('iframe');
      if (iframe) {
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      }
      const mount = host.querySelector('#ogm-yt-player') as HTMLElement | null;
      if (mount) {
        mount.style.width = '100%';
        mount.style.height = '100%';
      }
    } else {
      // Audio-only: keep the IFrame API alive off-viewport (do not pause).
      host.style.cssText =
        'position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;overflow:hidden;pointer-events:none;z-index:0;border:0';
    }
  }

  private ensureYtHost(): HTMLDivElement {
    if (this.ytHost && document.body.contains(this.ytHost)) {
      this.applyYtHostLayout();
      return this.ytHost;
    }
    const host = document.createElement('div');
    host.id = 'ogm-yt-host';
    host.setAttribute('aria-hidden', 'true');
    const mount = document.createElement('div');
    mount.id = 'ogm-yt-player';
    mount.style.cssText = 'width:100%;height:100%';
    host.appendChild(mount);
    document.body.appendChild(host);
    this.ytHost = host;
    this.applyYtHostLayout();
    return host;
  }

  /** Toggle visible YouTube surface without stopping audio. Default off (music-first). */
  public setShowVideo(show: boolean): void {
    this.showVideo = Boolean(show);
    this.applyYtHostLayout();
  }

  public getShowVideo(): boolean {
    return this.showVideo;
  }

  private destroyYtPlayer() {
    try {
      this.ytPlayer?.destroy();
    } catch {
      // ignore
    }
    this.ytPlayer = null;
    this.usingYoutube = false;
    if (this.ytHost) {
      this.ytHost.style.display = 'none';
    }
  }

  public async playTrack(track: Track): Promise<void> {
    this.currentTrack = track;
    this.updateMediaSessionMetadata(track);

    if (isYoutubeStreamTrack(track) && track.ytVideoId) {
      this.htmlAudio.pause();
      this.htmlAudio.removeAttribute('src');
      this.usingYoutube = true;
      this.ensureYtHost();
      await loadYoutubeIframeApi();
      const videoId = track.ytVideoId;
      const volume = Math.round(this.volume * 100);

      if (this.ytPlayer) {
        this.ytPlayer.loadVideoById(videoId);
        this.ytPlayer.setVolume(volume);
        this.ytPlayer.playVideo();
        this.applyYtHostLayout();
        this.notifyPlayState(true);
        this.startTimePoll();
        return;
      }

      this.ytPlayer = new window.YT!.Player('ogm-yt-player', {
        width: '220',
        height: '124',
        videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: { target: YoutubePlayerHandle }) => {
            event.target.setVolume(volume);
            event.target.playVideo();
            this.applyYtHostLayout();
            this.notifyPlayState(true);
            this.startTimePoll();
          },
          onStateChange: (event: { data: number }) => {
            const state = window.YT?.PlayerState;
            if (!state) return;
            if (event.data === state.PLAYING) {
              this.notifyPlayState(true);
              this.startTimePoll();
              this.updateMediaSessionState('playing');
            } else if (event.data === state.PAUSED) {
              this.notifyPlayState(false);
              this.updateMediaSessionState('paused');
            } else if (event.data === state.ENDED) {
              this.notifyPlayState(false);
              this.notifyEnded();
            }
          },
        },
      });
      return;
    }

    this.destroyYtPlayer();
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
    } else if (!streamSource && track.originalUrl && !track.ytVideoId) {
      streamSource = track.originalUrl;
    }

    if (!streamSource) {
      this.notifyError('Offline audio file not found for this track.');
      return;
    }

    this.htmlAudio.src = streamSource;
    this.htmlAudio.volume = this.volume;
    this.htmlAudio.playbackRate = this.playbackRate;

    try {
      await this.htmlAudio.play();
    } catch {
      this.notifyError('Audio loaded. Tap Play to start listening.');
    }
  }

  public togglePlayPause(): void {
    if (this.usingYoutube && this.ytPlayer) {
      const state = this.ytPlayer.getPlayerState();
      const playing = window.YT?.PlayerState?.PLAYING;
      if (playing !== undefined && state === playing) this.ytPlayer.pauseVideo();
      else this.ytPlayer.playVideo();
      return;
    }
    this.ensureAnalyserConnected();
    if (this.htmlAudio.paused) {
      this.htmlAudio.play().catch(() => {});
    } else {
      this.htmlAudio.pause();
    }
  }

  public pause(): void {
    if (this.usingYoutube && this.ytPlayer) {
      this.ytPlayer.pauseVideo();
      return;
    }
    this.htmlAudio.pause();
  }

  public isPlaying(): boolean {
    if (this.usingYoutube && this.ytPlayer) {
      const playing = window.YT?.PlayerState?.PLAYING;
      try {
        return playing !== undefined && this.ytPlayer.getPlayerState() === playing;
      } catch {
        return false;
      }
    }
    return !this.htmlAudio.paused && !this.htmlAudio.ended;
  }

  public requestNext(): void {
    this.listeners.forEach((l) => l.onNextRequested?.());
  }

  public requestPrev(): void {
    this.listeners.forEach((l) => l.onPrevRequested?.());
  }

  public seekTo(seconds: number): void {
    if (this.usingYoutube && this.ytPlayer) {
      this.ytPlayer.seekTo(seconds, true);
      this.notifyTime(seconds, this.ytPlayer.getDuration() || 0);
      return;
    }
    this.htmlAudio.currentTime = seconds;
    this.notifyTime(seconds, this.htmlAudio.duration || 0);
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.htmlAudio.volume = this.volume;
    try {
      this.ytPlayer?.setVolume(Math.round(this.volume * 100));
    } catch {
      // ignore
    }
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

if (typeof window !== 'undefined') {
  window.__ogmPlayerEngine = playerEngine;
  window.__ogmNativeCommand = (cmd: string) => {
    try {
      if (cmd === 'toggle') playerEngine.togglePlayPause();
      else if (cmd === 'pause') playerEngine.pause();
      else if (cmd === 'next') playerEngine.requestNext();
      else if (cmd === 'prev') playerEngine.requestPrev();
    } catch {
      // ignore
    }
  };
}
