# Audit notes (1.3.4)

Findings from the Kotlin + TS/React + server pass. Fixed in this ship unless marked remaining.

| Sev | File | Issue | Fixed? |
| --- | --- | --- | --- |
| High | `MainActivity.kt`, `PlaybackCaptureService.kt`, `PlaybackAudioRecorder.kt` | MediaProjection / `createScreenCaptureIntent()` showed **Share your screen with Open Grace Music?** during RECORD FLAC | Yes — capture stack deleted. AudioPlaybackCapture needs MediaProjection, so it was omitted entirely. Path is googlevideo intercept + cookies + server convert. |
| High | `MainActivity.kt` `OgmJsBridge.getYouTubeCookieHeader` | JS bridge is injected into **all frames**; a YouTube iframe could read Google cookies | Yes — method removed. Cookies injected into the main frame only via `evaluateJavascript` (`window.__ogmYtCookieHeader`). |
| High | `server/aiStudio.ts` `applyRequestAiKeys` | POST `/api/ai/config` wrote client keys onto `process.env` (shared host, all users) | Yes — request-scoped `AsyncLocalStorage`; config no longer mutates env. |
| High | `RangedDownloader.kt`, `InnerTubeResolver.kt`, `youtubeYtdlpAuth.ts`, `youtubeCookies.ts` | Cookie / header CR-LF injection | Yes — values with `\r` `\n` `\0` dropped; Netscape names restricted. |
| Med | `MainActivity.kt`, `YouTubeLoginActivity.kt` | `setAllowFileAccess` default true on API 24–29; file:// XSS | Yes — file access / universal file URLs / content access off. |
| Med | `MainActivity.kt` `isAppHostedUrl` | Any `*.onrender.com` / `*.appdeploy.ai` stayed in the WebView | Yes — only this app’s public host + localhost. |
| Med | `MainActivity.kt` `shouldOverrideUrlLoading` | `intent:` / non-http URLs could leave the shell | Yes — http(s) only; `ogm.local` is not opened externally. |
| Med | `server.ts` convert cookies | Cookies accepted on **query string** (access logs) | Yes — body only. |
| Med | `youtubeSession.ts` `openYouTubeActivateTab` | TV verification URL not host-checked | Yes — Google/YouTube https only. |
| Med | `YouTubeConnectPanel.tsx`, `App.tsx`, `MorePage.tsx` | Instruction-manual copy; duplicate Connect blocks / error essays | Yes — ~2 short lines + Connect/Sign out; ToS on More + README. |
| Low | `OnDeviceDownloadManager.kt` | Unused InnerTube production path (clients 403 without PO token) | Remaining — parser kept for unit tests only; download path does not call it. |
| Low | `app/.../ui/` Compose | Second YouTube WebView / JS bridge in unused Compose screens | Remaining — not the shipped launcher. |
| Low | `src/services/youtubeCookies.ts` / oauth localStorage | XSS on the PWA origin can still read pasted cookies / TV tokens | Remaining — expected for a same-origin PWA; native cookies are no longer written to localStorage. |
| Low | `src/components/StorageBanner.tsx` | Unused React banner | Yes — deleted. |

**Keep:** Listen / Library / Tuner / Schedule / More, real offline blobs, honest FLAC/MP3 labels, Show video default off, LOAD DEVICE FILES, short Connect YouTube, Activity log.
