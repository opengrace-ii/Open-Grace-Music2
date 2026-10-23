import React, { useId } from 'react';

export interface GramophoneDiscLogoProps {
  isPlaying?: boolean;
  size?: number | string;
  className?: string;
  showHornOverlay?: boolean;
  badgeFrame?: boolean;
  thumbnailUrl?: string;
  title?: string;
  onClick?: () => void;
}

/**
 * Reusable Audiophile Gramophone & Vinyl Disc Logo Component.
 * - The Obsidian & Golden-Sage Vinyl Disc rotates smoothly (`animate-spin-slow`)
 *   whenever `isPlaying` is `true` and pauses in-place (`animate-spin-slow-paused`)
 *   when `isPlaying` is `false`.
 * - The Vintage Brass & Golden-Sage Gramophone Horn & Tonearm Stylus sits over the
 *   spinning vinyl grooves and pivots subtly onto the record during playback.
 */
export const GramophoneDiscLogo: React.FC<GramophoneDiscLogoProps> = ({
  isPlaying = false,
  size = 44,
  className = '',
  showHornOverlay = true,
  badgeFrame = true,
  thumbnailUrl,
  title = 'Open Grace Music — Gramophone Disc Emblem',
  onClick,
}) => {
  const uid = useId().replace(/:/g, '');
  const spinClass = isPlaying ? 'animate-spin-slow' : 'animate-spin-slow-paused';

  return (
    <div
      onClick={onClick}
      title={title}
      style={typeof size === 'number' ? { width: size, height: size } : undefined}
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${
        badgeFrame
          ? 'rounded-2xl bg-[#151913] border border-[#3a4433] shadow-lg overflow-hidden'
          : 'rounded-full'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Spinning Gramophone Vinyl Record Layer */}
      <div
        data-testid="gramophone-disc-rotor"
        className={`w-full h-full flex items-center justify-center ${spinClass}`}
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full block overflow-visible"
          aria-label="Gramophone Vinyl Disc"
        >
          <defs>
            <radialGradient id={`vinylGrad-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#262C22" />
              <stop offset="38%" stopColor="#141712" />
              <stop offset="72%" stopColor="#1C2119" />
              <stop offset="94%" stopColor="#10120E" />
              <stop offset="100%" stopColor="#090B08" />
            </radialGradient>

            <linearGradient id={`vinylSheen-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#B8D99E" stopOpacity="0" />
              <stop offset="42%" stopColor="#B8D99E" stopOpacity="0.04" />
              <stop offset="50%" stopColor="#F6E7B2" stopOpacity="0.22" />
              <stop offset="58%" stopColor="#B8D99E" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#B8D99E" stopOpacity="0" />
            </linearGradient>

            <radialGradient id={`labelGrad-${uid}`} cx="45%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#F3E3AD" />
              <stop offset="48%" stopColor="#B8D99E" />
              <stop offset="82%" stopColor="#6D9157" />
              <stop offset="100%" stopColor="#2B3824" />
            </radialGradient>

            <clipPath id={`labelClip-${uid}`}>
              <circle cx="100" cy="100" r="31" />
            </clipPath>
          </defs>

          {/* Outer Obsidian Vinyl Disc */}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill={`url(#vinylGrad-${uid})`}
            stroke="#B8D99E"
            strokeOpacity="0.55"
            strokeWidth="2.2"
          />
          <circle cx="100" cy="100" r="87" fill={`url(#vinylSheen-${uid})`} />

          {/* Concentric Golden-Sage Micro-Grooves */}
          <circle cx="100" cy="100" r="80" fill="none" stroke="#B8D99E" strokeOpacity="0.22" strokeWidth="0.9" />
          <circle
            cx="100"
            cy="100"
            r="73"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.2"
            strokeWidth="0.8"
            strokeDasharray="65 10 42 10"
          />
          <circle cx="100" cy="100" r="66" fill="none" stroke="#B8D99E" strokeOpacity="0.26" strokeWidth="1" />
          <circle cx="100" cy="100" r="59" fill="none" stroke="#B8D99E" strokeOpacity="0.16" strokeWidth="0.8" />
          <circle
            cx="100"
            cy="100"
            r="52"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.24"
            strokeWidth="0.9"
            strokeDasharray="48 12 36 12"
          />
          <circle cx="100" cy="100" r="45" fill="none" stroke="#B8D99E" strokeOpacity="0.28" strokeWidth="1" />
          <circle cx="100" cy="100" r="39" fill="none" stroke="#E8D8A0" strokeOpacity="0.22" strokeWidth="0.8" />

          {/* Asymmetric Specular Light Arcs on Vinyl (Make rotation clearly visible) */}
          <path
            d="M 38 56 A 76 76 0 0 1 73 29"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.4"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M 50 65 A 60 60 0 0 1 78 44"
            fill="none"
            stroke="#B8D99E"
            strokeOpacity="0.34"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 162 144 A 76 76 0 0 1 127 171"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.36"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M 150 135 A 60 60 0 0 1 122 156"
            fill="none"
            stroke="#B8D99E"
            strokeOpacity="0.3"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Warm Sage-and-Gold Center Record Label */}
          <circle
            cx="100"
            cy="100"
            r="32"
            fill={`url(#labelGrad-${uid})`}
            stroke="#F6E7B2"
            strokeWidth="1.8"
          />

          {thumbnailUrl ? (
            <image
              href={thumbnailUrl}
              x="69"
              y="69"
              width="62"
              height="62"
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#labelClip-${uid})`}
            />
          ) : (
            <>
              <circle
                cx="100"
                cy="100"
                r="26"
                fill="none"
                stroke="#141812"
                strokeOpacity="0.5"
                strokeWidth="1"
                strokeDasharray="5 3"
              />
              <circle
                cx="100"
                cy="100"
                r="20"
                fill="#171D15"
                fillOpacity="0.28"
                stroke="#F6E7B2"
                strokeOpacity="0.55"
                strokeWidth="0.8"
              />
              {/* 4 Cardinal Rotation Dots & Filigree on Center Label */}
              <circle cx="100" cy="76" r="2.2" fill="#141812" />
              <circle cx="124" cy="100" r="2.2" fill="#141812" />
              <circle cx="100" cy="124" r="2.2" fill="#141812" />
              <circle cx="76" cy="100" r="2.2" fill="#141812" />
              <path
                d="M 88 86 Q 100 79 112 86"
                fill="none"
                stroke="#141812"
                strokeOpacity="0.75"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M 88 114 Q 100 121 112 114"
                fill="none"
                stroke="#141812"
                strokeOpacity="0.75"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Center Spindle Hole */}
          <circle cx="100" cy="100" r="7.5" fill="#11120F" stroke="#F6E7B2" strokeWidth="1.8" />
          <circle cx="100" cy="100" r="2.8" fill="#B8D99E" fillOpacity="0.8" />
        </svg>
      </div>

      {/* Fixed / Pivoting Vintage Brass & Golden-Sage Gramophone Horn & Tonearm Overlay */}
      {showHornOverlay && (
        <svg
          viewBox="0 0 200 200"
          className={`absolute inset-0 w-full h-full pointer-events-none transition-transform duration-500 ${
            isPlaying ? 'rotate-0' : 'rotate-[-5deg]'
          }`}
          style={{ transformOrigin: '84% 42%' }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`hornBell-${uid}`} x1="10%" y1="10%" x2="90%" y2="90%">
              <stop offset="0%" stopColor="#F8EBC2" />
              <stop offset="38%" stopColor="#D7BC70" />
              <stop offset="72%" stopColor="#B8D99E" />
              <stop offset="100%" stopColor="#5D754A" />
            </linearGradient>
            <radialGradient id={`hornMouth-${uid}`} cx="42%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#11140F" />
              <stop offset="52%" stopColor="#2A3321" />
              <stop offset="85%" stopColor="#8F7A40" />
              <stop offset="100%" stopColor="#E6D18A" />
            </radialGradient>
            <linearGradient id={`brassArm-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F6E7B2" />
              <stop offset="55%" stopColor="#C9AF63" />
              <stop offset="100%" stopColor="#6D845A" />
            </linearGradient>
          </defs>

          {/* Turntable Pivot Mount */}
          <circle
            cx="168"
            cy="82"
            r="11"
            fill="#191F16"
            stroke={`url(#brassArm-${uid})`}
            strokeWidth="2.2"
          />
          <circle cx="168" cy="82" r="5.5" fill={`url(#brassArm-${uid})`} />
          <circle cx="168" cy="82" r="2.2" fill="#11140F" />

          {/* Curved Brass Gramophone Acoustic Neck */}
          <path
            d="M 168 82 C 178 70, 177 48, 160 38 C 149 32, 136 33, 125 40"
            fill="none"
            stroke={`url(#brassArm-${uid})`}
            strokeWidth="6.5"
            strokeLinecap="round"
          />

          {/* Flared Gramophone Horn Bell */}
          <path
            d="M 130 37 C 116 23, 97 12, 75 11 C 60 26, 62 56, 80 72 C 100 68, 120 53, 130 37 Z"
            fill={`url(#hornBell-${uid})`}
            stroke="#F6E7B2"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Gramophone Horn Mouth Opening */}
          <ellipse
            cx="76"
            cy="42"
            rx="19"
            ry="30"
            transform="rotate(-14 76 42)"
            fill={`url(#hornMouth-${uid})`}
            stroke="#F6E7B2"
            strokeWidth="2"
          />

          {/* Horn Ribs */}
          <path
            d="M 126 37 C 110 28, 94 22, 74 20"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <path
            d="M 125 41 C 108 50, 94 58, 78 63"
            fill="none"
            stroke="#F6E7B2"
            strokeOpacity="0.55"
            strokeWidth="1"
          />

          {/* Tonearm & Stylus Riding on Vinyl Grooves */}
          <path
            d="M 168 82 L 152 125 L 128 139"
            fill="none"
            stroke={`url(#brassArm-${uid})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g transform="translate(126, 140) rotate(-28)">
            <rect
              x="-8"
              y="-4"
              width="12"
              height="8"
              rx="2.5"
              fill="#1E251B"
              stroke="#F6E7B2"
              strokeWidth="1.3"
            />
            <circle cx="-9.5" cy="0.5" r="2.2" fill={isPlaying ? '#B8D99E' : '#E8D8A0'} />
          </g>
        </svg>
      )}
    </div>
  );
};
