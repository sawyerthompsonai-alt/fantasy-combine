export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Avatar({ name, color, size = 48 }: { name: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={name}>
      {/* jersey */}
      <path d="M14 8 L20 4 H28 L34 8 L42 14 L37 21 L34 18 V44 H14 V18 L11 21 L6 14 Z"
        fill={color} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <text x="24" y="32" textAnchor="middle" fontSize="13" fontWeight="800"
        fill="#0a0c10" fontFamily="inherit">{initials(name)}</text>
    </svg>
  );
}
