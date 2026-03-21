interface LogoProps {
  size?: number;
  className?: string;
}

export function VulcanLogo({ size = 28, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vulcan AI logo"
      className={className}
    >
      {/* Anvil / forge shape — V formed by hammer and sparks */}
      <path
        d="M6 8l10 18L26 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Spark dots */}
      <circle cx="10" cy="6" r="1.2" fill="currentColor" />
      <circle cx="22" cy="6" r="1.2" fill="currentColor" />
      <circle cx="16" cy="4" r="1.2" fill="currentColor" />
    </svg>
  );
}
