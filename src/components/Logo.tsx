/** 印章式標記 —— 硃砂方印，取「硯」字 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] bg-accent text-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: size * 0.58,
          fontWeight: 500,
          lineHeight: 1,
          paddingTop: size * 0.02,
        }}
      >
        硯
      </span>
    </span>
  )
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="font-medium tracking-tight text-ink"
          style={{ fontFamily: 'var(--font-serif)', fontSize: size * 0.56 }}
        >
          硯
        </span>
        <span
          className="mt-0.5 tracking-[0.18em] text-ink-faint uppercase"
          style={{ fontSize: size * 0.28 }}
        >
          Inkstone
        </span>
      </span>
    </span>
  )
}
