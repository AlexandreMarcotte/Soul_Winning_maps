import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '@/lib/colorPalette';

interface Props {
  current: string;
  onPick: (color: string) => void;
  onClose: () => void;
}

export function ColorPicker({ current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hex, setHex] = useState(current);

  useEffect(() => { setHex(current); }, [current]);

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  function submitHex(value: string): void {
    const normalized = value.startsWith('#') ? value : `#${value}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onPick(normalized.toUpperCase());
    }
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-8 z-50 w-48 rounded-lg border border-gray-200 bg-white p-2.5 shadow-xl"
    >
      {/* Palette swatches — 6 columns × 4 rows */}
      <div className="grid grid-cols-6 gap-1">
        {PALETTE.map((c) => {
          const active = c.toLowerCase() === current.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              title={c}
              className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 ${
                active
                  ? 'border-gray-800 shadow-md scale-110'
                  : 'border-transparent hover:border-gray-400'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          );
        })}
      </div>

      <div className="my-2 border-t border-gray-100" />

      {/* Custom color row: color wheel + hex input + live preview */}
      <div className="flex items-center gap-1.5">
        {/* Native color-wheel trigger */}
        <label
          className="relative flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border border-gray-300"
          title="Pick custom color"
        >
          <span
            className="h-4 w-4 rounded-sm"
            style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
          />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000'}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setHex(v);
              onPick(v);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        {/* Hex text input */}
        <input
          type="text"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={(e) => submitHex(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitHex(hex); }}
          maxLength={7}
          spellCheck={false}
          className="flex-1 rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="#000000"
        />

        {/* Live preview swatch */}
        <div
          className="h-6 w-6 shrink-0 rounded border border-gray-300"
          style={{ backgroundColor: hex }}
        />
      </div>
    </div>
  );
}
