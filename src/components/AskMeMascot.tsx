/**
 * AskMeMascot — น้องสน (Sno), the Ask Me chat mascot.
 * A friendly penguin themed for NSL Food Service (cold storage / frozen).
 * Pure SVG + CSS keyframes; no external dependencies.
 *
 * States:
 *   idle     — gentle breathing bob + occasional blink
 *   thinking — faster bob, eyes look up, brain "..." bubble
 *   talking  — beak opens/closes, wings wiggle, excited bob
 */
import { memo } from 'react';

export type MascotState = 'idle' | 'thinking' | 'talking';

interface Props {
  state?: MascotState;
  size?: number;
  /** Show the speech bubble with "..." when thinking. */
  showThinkBubble?: boolean;
}

export const AskMeMascot = memo(function AskMeMascot({
  state = 'idle',
  size = 80,
  showThinkBubble = false,
}: Props) {
  return (
    <div className={`mascot mascot--${state}`} style={{ width: size, height: size, position: 'relative', display: 'inline-block' }}>
      <svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        {/* Feet (orange) */}
        <ellipse cx="38" cy="102" rx="9" ry="4" fill="#ff9933" stroke="#c97216" strokeWidth="1.5" />
        <ellipse cx="62" cy="102" rx="9" ry="4" fill="#ff9933" stroke="#c97216" strokeWidth="1.5" />

        {/* Body shadow */}
        <ellipse cx="50" cy="100" rx="32" ry="3" fill="#000" opacity="0.08" />

        {/* Wings (back layer) */}
        <g className="mascot-wing-group">
          <ellipse className="wing wing--left"  cx="17" cy="60" rx="8" ry="16" fill="#1a3a5c" stroke="#0f2540" strokeWidth="1.5" />
          <ellipse className="wing wing--right" cx="83" cy="60" rx="8" ry="16" fill="#1a3a5c" stroke="#0f2540" strokeWidth="1.5" />
        </g>

        {/* Body (white belly with dark head/back) */}
        <ellipse cx="50" cy="65" rx="30" ry="35" fill="#1a3a5c" stroke="#0f2540" strokeWidth="2" />
        {/* White belly area */}
        <ellipse cx="50" cy="68" rx="22" ry="28" fill="#fff" />

        {/* Snowflake accent on belly (NSL cold-storage theme) */}
        <g opacity="0.18" stroke="#4285F4" strokeWidth="1.2" fill="none" strokeLinecap="round">
          <line x1="50" y1="74" x2="50" y2="82" />
          <line x1="46" y1="78" x2="54" y2="78" />
          <line x1="47" y1="75" x2="53" y2="81" />
          <line x1="53" y1="75" x2="47" y2="81" />
        </g>

        {/* Head (slightly oval) */}
        <ellipse cx="50" cy="42" rx="26" ry="24" fill="#1a3a5c" stroke="#0f2540" strokeWidth="2" />
        {/* Face (white) */}
        <ellipse cx="50" cy="46" rx="17" ry="18" fill="#fff" />

        {/* Cheeks */}
        <circle cx="36" cy="50" r="3.5" fill="#ffb3c1" opacity="0.6" />
        <circle cx="64" cy="50" r="3.5" fill="#ffb3c1" opacity="0.6" />

        {/* Eyes */}
        <g className="mascot-eyes">
          <g className="eye eye--left">
            <ellipse cx="42" cy="42" rx="3.5" ry="4.5" fill="#1a1a2e" />
            <circle cx="43.5" cy="40.5" r="1.2" fill="#fff" />
          </g>
          <g className="eye eye--right">
            <ellipse cx="58" cy="42" rx="3.5" ry="4.5" fill="#1a1a2e" />
            <circle cx="59.5" cy="40.5" r="1.2" fill="#fff" />
          </g>
        </g>

        {/* Beak (orange) */}
        <g className="mascot-beak-group">
          <path
            className="mascot-beak"
            d="M 46 52 Q 50 58 54 52 Q 50 54 46 52 Z"
            fill="#ff9933"
            stroke="#c97216"
            strokeWidth="1.2"
          />
        </g>

        {/* Tiny sparkle on top of head when idle (idle-only via CSS) */}
        <g className="mascot-sparkle" opacity="0">
          <path d="M 50 18 L 51 22 L 55 23 L 51 24 L 50 28 L 49 24 L 45 23 L 49 22 Z" fill="#fbbf24" />
        </g>
      </svg>

      {/* Thinking bubble */}
      {state === 'thinking' && showThinkBubble && (
        <div className="think-bubble">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}

      <style>{`
        /* ── Body bob ── */
        .mascot {
          transform-origin: 50% 90%;
        }
        .mascot--idle     { animation: bob 3.5s ease-in-out infinite; }
        .mascot--thinking { animation: bob 1.4s ease-in-out infinite, tilt 2.8s ease-in-out infinite; }
        .mascot--talking  { animation: bob 0.7s ease-in-out infinite; }
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes tilt {
          0%, 100% { transform: translateY(0) rotate(-3deg); }
          50%      { transform: translateY(-5px) rotate(3deg); }
        }

        /* ── Eyes ── */
        .mascot .eye {
          transform-origin: center;
          animation: blink 5s infinite;
        }
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          93%, 95%      { transform: scaleY(0.1); }
        }
        .mascot--thinking .eye {
          animation: lookUp 2.4s ease-in-out infinite;
        }
        @keyframes lookUp {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2.5px); }
        }
        .mascot--talking .eye {
          animation: blinkFast 2s infinite;
        }
        @keyframes blinkFast {
          0%, 80%, 100% { transform: scaleY(1); }
          85%, 90%      { transform: scaleY(0.2); }
        }

        /* ── Beak ── */
        .mascot--talking .mascot-beak {
          transform-origin: 50px 53px;
          animation: beakOpen 0.35s ease-in-out infinite;
        }
        @keyframes beakOpen {
          0%, 100% { transform: scaleY(1)   translateY(0); }
          50%      { transform: scaleY(1.6) translateY(1px); }
        }

        /* ── Wings ── */
        .wing { transform-origin: 50% 35%; transition: transform 0.2s; }
        .mascot--talking .wing--left  { animation: wingL 0.45s ease-in-out infinite; }
        .mascot--talking .wing--right { animation: wingR 0.45s ease-in-out infinite; }
        .mascot--thinking .wing--right {
          animation: rubChin 2s ease-in-out infinite;
        }
        @keyframes wingL { 0%,100%{transform:rotate(0deg);} 50%{transform:rotate(-12deg);} }
        @keyframes wingR { 0%,100%{transform:rotate(0deg);} 50%{transform:rotate( 12deg);} }
        @keyframes rubChin {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50%      { transform: translate(-8px, -22px) rotate(-22deg); }
        }

        /* ── Sparkle (idle subtle) ── */
        .mascot--idle .mascot-sparkle { animation: sparkle 4s ease-in-out infinite; }
        @keyframes sparkle {
          0%, 80%, 100% { opacity: 0; transform: translateY(0) scale(0.8); }
          85%, 92%      { opacity: 1; transform: translateY(-3px) scale(1.1); }
        }

        /* ── Thinking dot bubble ── */
        .think-bubble {
          position: absolute;
          top: -8px; right: -12px;
          padding: 4px 8px;
          background: #fff;
          border: 1.5px solid #4285F4;
          border-radius: 12px;
          display: flex; align-items: center; gap: 3px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.10);
        }
        .think-bubble::after {
          content: '';
          position: absolute;
          bottom: -5px; left: 8px;
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #4285F4;
        }
        .think-bubble .dot {
          width: 4px; height: 4px; border-radius: 50%;
          background: #4285F4;
          animation: dotBlink 1.2s infinite;
        }
        .think-bubble .dot:nth-child(2) { animation-delay: 0.2s; }
        .think-bubble .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes dotBlink {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30%           { opacity: 1;   transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
});
