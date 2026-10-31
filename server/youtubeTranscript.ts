function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function captionsXmlToPlainText(xml: string): string {
  const texts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)].map((m) =>
    decodeXmlEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  );
  return texts.filter(Boolean).join('\n');
}

async function fetchCaptionList(videoId: string): Promise<{ lang: string; name: string }[]> {
  const url = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const tracks: { lang: string; name: string }[] = [];
  for (const m of xml.matchAll(/<track\b([^>]*)\/?>/gi)) {
    const attrs = m[1] || '';
    const lang = /lang_code="([^"]+)"/i.exec(attrs)?.[1];
    const name = /name="([^"]*)"/i.exec(attrs)?.[1] || '';
    if (lang) tracks.push({ lang, name });
  }
  return tracks;
}

async function fetchCaptionTrack(videoId: string, lang: string): Promise<string> {
  const url = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    },
  });
  if (!res.ok) return '';
  return captionsXmlToPlainText(await res.text());
}

export async function fetchYoutubeTranscript(videoId: string): Promise<{
  found: boolean;
  videoId: string;
  language?: string;
  content?: string;
}> {
  const id = videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return { found: false, videoId: id };
  }

  const tracks = await fetchCaptionList(id);
  const preferred =
    tracks.find((t) => t.lang === 'en') ||
    tracks.find((t) => t.lang.startsWith('en')) ||
    tracks[0];

  if (!preferred) {
    return { found: false, videoId: id };
  }

  const content = await fetchCaptionTrack(id, preferred.lang);
  if (!content.trim()) {
    return { found: false, videoId: id };
  }

  return {
    found: true,
    videoId: id,
    language: preferred.lang,
    content: `${content.trim()}\n\n— Source: YouTube captions (${preferred.lang})`,
  };
}
