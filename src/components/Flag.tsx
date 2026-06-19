import {
  UA,
  GB,
  CN,
  ES,
  DE,
  FR,
  PL,
  PT,
  JP,
  IT,
  KR,
  TR,
} from "country-flag-icons/react/3x2";

// SVG flags render identically on every OS (unlike emoji flags, which Windows
// shows as bare letter codes). Keyed by ISO 3166-1 alpha-2 country code.
const FLAGS: Record<string, typeof UA> = {
  UA,
  GB,
  CN,
  ES,
  DE,
  FR,
  PL,
  PT,
  JP,
  IT,
  KR,
  TR,
};

interface FlagProps {
  countryCode: string;
  // Rendered width in px; height follows the 3:2 aspect ratio.
  width?: number;
  title?: string;
}

export function Flag({ countryCode, width = 22, title }: FlagProps) {
  const Svg = FLAGS[countryCode];
  if (!Svg) return null;
  return (
    <Svg
      title={title}
      style={{
        width,
        height: (width * 2) / 3,
        borderRadius: 2,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
        verticalAlign: "middle",
        display: "inline-block",
      }}
    />
  );
}
