import { LyricOrChord } from '../types';

export function generateLocalLyricsOrChord(title: string, artist: string): LyricOrChord {
  const lower = title.toLowerCase();
  const isInstrumental =
    lower.includes('instrumental') ||
    lower.includes('ambient') ||
    lower.includes('lofi') ||
    lower.includes('beats') ||
    lower.includes('guitar') ||
    lower.includes('piano') ||
    lower.includes('orchestral') ||
    lower.includes('soundtrack');

  if (isInstrumental) {
    return {
      title,
      artist: artist || 'Open Grace Music',
      isInstrumental: true,
      key: 'C Major',
      bpm: 118,
      timeSignature: '4/4',
      content: `========================================
INSTRUMENT CHORD SHEET & HARMONIC MAP
========================================
Piece:   ${title}
Artist:  ${artist || 'Open Grace Music'}
Key:     C Major  |  Tempo: 118 BPM  |  Time: 4/4
Style:   Acoustic / Harmonious Resonance

[Intro - Soft Acoustic Build]
| C      - G/B    - Am     - F      |
| C      - G      - C      - C      |

[Section A - Main Theme Progression]
| C  . . . | G  . . . | Am . . . | F  . . . |
| C  . . . | G  . . . | C   . . . | C  . . . |

[Section B - Dynamic Lift & Groove]
| F  . . . | C  . . . | G   . . . | Am . . . |
| F  . . . | C  . . . | G7  . . . | C  . . . |

[Bridge - Solo / Improvisation Cadence]
| Am . . . | F  . . . | C   . . . | G   . . . |
| Am . . . | Dm . . . | G   . . . | G7  . . . |

[Outro - Resolving Peacefully]
| C      - G/B    - Am     - F      |
| C      - G      - C (Hold & Ring) |
========================================
Open Grace Music · Offline Personal Audio Architecture`,
    };
  }

  return {
    title,
    artist: artist || 'Open Grace Music',
    isInstrumental: false,
    key: 'G Major',
    bpm: 96,
    timeSignature: '4/4',
    content: `========================================
VOCAL LYRICS & STRUCTURE
========================================
Track:   ${title}
Artist:  ${artist || 'Open Grace Music'}
Key:     G Major  |  Tempo: 96 BPM

[Verse 1]
Walking through the quiet morning light,
Every shadow softly fades into the night.
Gentle melodies across the open breeze,
Carried timelessly beyond the quiet seas.

[Chorus]
And the music plays on through the grace of sound,
In this peaceful harbor where we are found.
Keep the rhythm close, let the spirit rise,
Underneath the calm and golden skies.

[Verse 2]
Memories of yesterday begin to speak,
Answers to the questions that we used to seek.
No connection needed when the song is near,
Every single tone and word is crystal clear.

[Chorus]
And the music plays on through the grace of sound,
In this peaceful harbor where we are found.
Keep the rhythm close, let the spirit rise,
Underneath the calm and golden skies.

[Bridge]
When the world around is turning fast and loud,
We find sanctuary high above the crowd.
Just a heartbeat and the resonance within,
Here is where the purest harmonies begin.

[Outro]
Let it fade... let it ring...
Hear the grace of music sing.
(Fade out softly)
========================================
Open Grace Music · Saved On This Device`,
  };
}

export async function fetchAiLyricsOrChord(title: string, artist: string): Promise<LyricOrChord> {
  try {
    const res = await fetch('/api/generate-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        return data;
      }
    }
  } catch {
    // fallback to local generator
  }
  return generateLocalLyricsOrChord(title, artist);
}
