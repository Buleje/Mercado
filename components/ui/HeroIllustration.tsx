"use client";

/**
 * HeroIllustration — Inline SVG cityscape / delivery illustration.
 * Pure SVG so it loads instantly (no network request) and can be CSS-animated.
 * Represents a Pucallpa city scene with a delivery scooter and palm trees.
 */
export default function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 360"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
        <radialGradient id="moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#c7d2fe" />
        </radialGradient>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="bldg1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4338ca" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
        <linearGradient id="bldg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        <style>{`
          @keyframes scooterRide {
            0%   { transform: translateX(-80px); }
            100% { transform: translateX(560px); }
          }
          @keyframes bobScooter {
            0%,100% { transform: translateY(0); }
            50%     { transform: translateY(-3px); }
          }
          @keyframes blinkWindow {
            0%,90%,100% { opacity: 0.7; }
            45%          { opacity: 0.15; }
          }
          @keyframes starTwinkle {
            0%,100% { opacity: 0.8; r: 1.5px; }
            50%     { opacity: 0.2; r: 0.8px; }
          }
          @keyframes signalLight {
            0%,33%  { fill: #ef4444; }
            34%,66% { fill: #f59e0b; }
            67%,100%{ fill: #22c55e; }
          }
          @keyframes moonGlow {
            0%,100% { filter: url(#softGlow); opacity: 1; }
            50%     { opacity: 0.85; }
          }
          @keyframes palmSway {
            0%,100% { transform-origin: bottom center; transform: rotate(0deg); }
            50%     { transform-origin: bottom center; transform: rotate(3deg); }
          }
          @keyframes cloudDrift {
            from { transform: translateX(0); }
            to   { transform: translateX(-40px); }
          }
          .scooter-group {
            animation: scooterRide 6s linear infinite;
          }
          .scooter-bob {
            animation: bobScooter 0.4s ease-in-out infinite;
          }
          .win-blink { animation: blinkWindow 4s ease-in-out infinite; }
          .win-blink2 { animation: blinkWindow 4s ease-in-out 1.5s infinite; }
          .win-blink3 { animation: blinkWindow 4s ease-in-out 2.8s infinite; }
          .star { animation: starTwinkle 3s ease-in-out infinite; }
          .signal { animation: signalLight 3s step-end infinite; }
          .palm { animation: palmSway 5s ease-in-out infinite; }
          .cloud { animation: cloudDrift 18s linear infinite alternate; }
        `}</style>
      </defs>

      {/* Sky background */}
      <rect width="520" height="360" fill="url(#sky)" rx="16" />

      {/* Stars */}
      {[
        [42,28,1.5,0],[90,18,1,0.8],[155,35,1.5,1.6],[220,15,1,0.3],[310,42,1.5,2.1],
        [390,20,1,1],[450,38,1.5,0.5],[480,18,1,1.8],[30,55,1,2.4],[130,12,1.5,0.9],
        [260,28,1,1.3],[340,12,1.5,0.6],[420,52,1,2.9],[500,35,1.5,1.4],
      ].map(([cx, cy, r, delay], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="white"
          className="star"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      {/* Moon */}
      <g style={{ animation: "moonGlow 6s ease-in-out infinite" }}>
        <circle cx="430" cy="55" r="26" fill="url(#moon)" opacity="0.9" />
        <circle cx="442" cy="48" r="18" fill="#1e1b4b" opacity="0.4" />
      </g>

      {/* Cloud */}
      <g className="cloud" opacity="0.12">
        <ellipse cx="100" cy="65" rx="35" ry="12" fill="white" />
        <ellipse cx="118" cy="58" rx="22" ry="14" fill="white" />
        <ellipse cx="82" cy="62" rx="18" ry="10" fill="white" />
      </g>

      {/* Background buildings (far) */}
      <rect x="30" y="160" width="45" height="140" fill="#1e1b4b" />
      <rect x="38" y="170" width="8" height="10" fill="#fbbf24" className="win-blink3" opacity="0.5" rx="1" />
      <rect x="52" y="170" width="8" height="10" fill="#93c5fd" opacity="0.3" rx="1" />
      <rect x="38" y="188" width="8" height="10" fill="#93c5fd" opacity="0.4" rx="1" />
      <rect x="52" y="188" width="8" height="10" fill="#fbbf24" className="win-blink" opacity="0.5" rx="1" />

      <rect x="445" y="150" width="55" height="150" fill="#1e1b4b" />
      <rect x="453" y="162" width="9" height="11" fill="#fbbf24" className="win-blink2" opacity="0.5" rx="1" />
      <rect x="468" y="162" width="9" height="11" fill="#93c5fd" opacity="0.3" rx="1" />
      <rect x="480" y="162" width="9" height="11" fill="#93c5fd" opacity="0.35" rx="1" />

      {/* Main building — left */}
      <rect x="55" y="120" width="90" height="180" fill="url(#bldg1)" rx="2" />
      <rect x="64" y="130" width="14" height="16" fill="#c7d2fe" className="win-blink" opacity="0.6" rx="1" />
      <rect x="84" y="130" width="14" height="16" fill="#fbbf24" className="win-blink2" opacity="0.5" rx="1" />
      <rect x="104" y="130" width="14" height="16" fill="#c7d2fe" opacity="0.35" rx="1" />
      <rect x="64" y="154" width="14" height="16" fill="#fbbf24" opacity="0.4" rx="1" />
      <rect x="84" y="154" width="14" height="16" fill="#c7d2fe" className="win-blink3" opacity="0.55" rx="1" />
      <rect x="104" y="154" width="14" height="16" fill="#fbbf24" className="win-blink" opacity="0.45" rx="1" />
      {/* Rooftop antenna */}
      <rect x="96" y="108" width="2" height="14" fill="#818cf8" />
      <circle cx="97" cy="107" r="3" fill="#f59e0b" filter="url(#glow)" />
      {/* Sign Bodega */}
      <rect x="64" y="200" width="62" height="20" fill="#6366f1" rx="4" />
      <text x="95" y="213" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">BODEGA</text>

      {/* Main building — center-right */}
      <rect x="300" y="100" width="110" height="200" fill="url(#bldg2)" rx="2" />
      <rect x="310" y="115" width="16" height="18" fill="#c7d2fe" className="win-blink2" opacity="0.6" rx="1" />
      <rect x="332" y="115" width="16" height="18" fill="#fbbf24" opacity="0.45" rx="1" />
      <rect x="354" y="115" width="16" height="18" fill="#c7d2fe" className="win-blink3" opacity="0.5" rx="1" />
      <rect x="376" y="115" width="16" height="18" fill="#fbbf24" className="win-blink" opacity="0.55" rx="1" />
      <rect x="310" y="142" width="16" height="18" fill="#fbbf24" className="win-blink3" opacity="0.4" rx="1" />
      <rect x="332" y="142" width="16" height="18" fill="#c7d2fe" opacity="0.5" rx="1" />
      <rect x="354" y="142" width="16" height="18" fill="#fbbf24" className="win-blink2" opacity="0.45" rx="1" />
      <rect x="376" y="142" width="16" height="18" fill="#c7d2fe" opacity="0.55" rx="1" />
      <rect x="310" y="168" width="16" height="18" fill="#c7d2fe" className="win-blink" opacity="0.45" rx="1" />
      <rect x="332" y="168" width="16" height="18" fill="#fbbf24" opacity="0.4" rx="1" />
      {/* Sign San Martin */}
      <rect x="308" y="220" width="94" height="22" fill="#f59e0b" rx="4" />
      <text x="355" y="234" textAnchor="middle" fill="#1e1b4b" fontSize="7" fontWeight="bold" fontFamily="sans-serif">SAN MARTÍN</text>

      {/* Smaller building — right */}
      <rect x="420" y="175" width="70" height="125" fill="#312e81" rx="2" />
      <rect x="430" y="186" width="12" height="14" fill="#fbbf24" className="win-blink2" opacity="0.5" rx="1" />
      <rect x="448" y="186" width="12" height="14" fill="#c7d2fe" opacity="0.4" rx="1" />
      <rect x="466" y="186" width="12" height="14" fill="#fbbf24" className="win-blink3" opacity="0.45" rx="1" />

      {/* Palm trees */}
      <g className="palm" style={{ transformOrigin: "170px 300px" }}>
        <rect x="168" y="230" width="4" height="70" fill="#854d0e" />
        <ellipse cx="155" cy="222" rx="20" ry="10" fill="#166534" transform="rotate(-30 155 222)" />
        <ellipse cx="175" cy="215" rx="22" ry="10" fill="#15803d" transform="rotate(5 175 215)" />
        <ellipse cx="188" cy="225" rx="18" ry="9" fill="#166534" transform="rotate(35 188 225)" />
      </g>
      <g className="palm" style={{ transformOrigin: "280px 310px", animationDelay: "1.5s" }}>
        <rect x="278" y="238" width="4" height="72" fill="#92400e" />
        <ellipse cx="265" cy="230" rx="18" ry="9" fill="#15803d" transform="rotate(-25 265 230)" />
        <ellipse cx="282" cy="224" rx="20" ry="9" fill="#166534" transform="rotate(8 282 224)" />
        <ellipse cx="295" cy="232" rx="16" ry="8" fill="#15803d" transform="rotate(38 295 232)" />
      </g>

      {/* Road */}
      <rect x="0" y="300" width="520" height="60" fill="url(#road)" />
      {/* Road markings */}
      <rect x="0" y="328" width="520" height="2" fill="rgba(255,255,255,0.06)" />
      {[0,80,160,240,320,400,480].map((x, i) => (
        <rect key={i} x={x} y="326" width="45" height="4" fill="rgba(255,255,255,0.15)" rx="1" />
      ))}

      {/* Traffic light */}
      <rect x="240" y="240" width="8" height="60" fill="#374151" />
      <rect x="234" y="240" width="20" height="38" fill="#1f2937" rx="3" />
      <circle cx="244" cy="250" r="5" className="signal" filter="url(#glow)" />
      <circle cx="244" cy="263" r="5" fill="#f59e0b" opacity="0.3" />
      <circle cx="244" cy="276" r="5" fill="#22c55e" opacity="0.3" />

      {/* Delivery scooter */}
      <g className="scooter-group">
        <g className="scooter-bob">
          {/* Box / package */}
          <rect x="14" y="287" width="18" height="14" fill="#6366f1" rx="2" />
          <rect x="15" y="288" width="16" height="12" fill="none" stroke="#818cf8" strokeWidth="0.8" rx="1.5" />
          <text x="23" y="297" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="sans-serif">📦</text>

          {/* Body */}
          <ellipse cx="20" cy="308" rx="18" ry="7" fill="#4f46e5" />
          <rect x="8" y="302" width="24" height="10" fill="#6366f1" rx="4" />

          {/* Seat + rider */}
          <rect x="18" y="298" width="12" height="5" fill="#818cf8" rx="2" />
          {/* Helmet */}
          <circle cx="26" cy="295" r="6" fill="#f59e0b" />
          <rect x="21" y="297" width="10" height="3" fill="#fbbf24" rx="1" />
          {/* Body */}
          <rect x="22" y="300" width="8" height="6" fill="#e0e7ff" rx="1" />

          {/* Wheels */}
          <circle cx="10" cy="313" r="7" fill="#1f2937" />
          <circle cx="10" cy="313" r="5" fill="#374151" />
          <circle cx="10" cy="313" r="2" fill="#6366f1" />
          <circle cx="34" cy="313" r="7" fill="#1f2937" />
          <circle cx="34" cy="313" r="5" fill="#374151" />
          <circle cx="34" cy="313" r="2" fill="#6366f1" />

          {/* Exhaust particles */}
          <circle cx="-2" cy="309" r="1.5" fill="rgba(255,255,255,0.3)" />
          <circle cx="-7" cy="311" r="1" fill="rgba(255,255,255,0.15)" />
        </g>
      </g>

      {/* Foreground buildings silhouette overlay */}
      <rect x="0" y="270" width="50" height="90" fill="#0f172a" opacity="0.7" />
      <rect x="470" y="280" width="50" height="80" fill="#0f172a" opacity="0.7" />

      {/* Ambient glow on road */}
      <ellipse cx="260" cy="310" rx="180" ry="15" fill="rgba(99,102,241,0.08)" />
    </svg>
  );
}
