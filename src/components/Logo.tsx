/**
 * 印章式標記 —— 方印裡放縮寫。
 *
 * 沿用原本的方印形狀：這個造型在小尺寸下辨識度好，
 * 而且跟整站的夜空調性搭得起來。內容從單一漢字換成兩個字母，
 * 所以字級要跟著縮 —— 同樣的字級放兩個字母會撐滿整個方塊，
 * 失去印章該有的留白。
 */
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
          // 單字用 0.58，兩個字母要縮到 0.42 才留得住四邊的空白
          fontSize: size * 0.42,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.02em',
        }}
      >
        FW
      </span>
    </span>
  )
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      {/*
        只有一行。方印裡已經是 FW，旁邊再寫一次 FW 是同一個資訊講兩遍 ——
        原本「硯 ＋ INKSTONE」是名字加拼音，兩者不重複才成立。
      */}
      <span
        className="font-medium leading-none tracking-tight text-ink"
        style={{ fontFamily: 'var(--font-serif)', fontSize: size * 0.52 }}
      >
        Friends World
      </span>
    </span>
  )
}
