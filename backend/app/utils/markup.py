"""
自訂文章語法的解析。

    `文字`   → 粗體
    #標籤    → 可點擊的搜尋標籤

這份規則必須與前端的 src/lib/markup.ts 完全一致 ——
前端負責渲染，後端負責存檔時抽出標籤入庫，兩邊對不上就會出現
「文章裡看得到的標籤，搜尋卻找不到」這種問題。

刻意不沿用 Markdown：在 Markdown 裡反引號是行內程式碼、井字號是標題，
語意與這裡相反，套現成 parser 會出錯。
"""

import re

# 標籤允許的字元：各國文字、數字、底線（中日英皆可）
_TAG_CHARS = re.compile(r"[^\W]", re.UNICODE)


def _is_tag_char(ch: str) -> bool:
    return ch == "_" or ch.isalnum()


def tokenize_line(line: str) -> list[tuple[str, str]]:
    """
    把一行切成 (型別, 內容)。型別是 text / bold / tag。

    未配對的反引號、單獨的 # 都原樣輸出，不會吃掉使用者的字。
    """
    tokens: list[tuple[str, str]] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            tokens.append(("text", "".join(buf)))
            buf.clear()

    i = 0
    n = len(line)
    while i < n:
        ch = line[i]

        if ch == "`":
            close = line.find("`", i + 1)
            if close > i + 1:
                flush()
                tokens.append(("bold", line[i + 1 : close]))
                i = close + 1
                continue
            buf.append(ch)
            i += 1
            continue

        if ch == "#":
            j = i + 1
            while j < n and _is_tag_char(line[j]):
                j += 1
            if j > i + 1:
                flush()
                tokens.append(("tag", line[i + 1 : j]))
                i = j
                continue
            buf.append(ch)
            i += 1
            continue

        buf.append(ch)
        i += 1

    flush()
    return tokens


def extract_tags(source: str) -> list[str]:
    """取出文章中所有標籤，去重且保留出現順序。一律轉小寫以便比對。"""
    seen: set[str] = set()
    out: list[str] = []
    for line in source.split("\n"):
        for kind, value in tokenize_line(line):
            if kind != "tag":
                continue
            tag = value.lower()
            if tag and tag not in seen:
                seen.add(tag)
                out.append(tag)
    return out


def to_plain_text(source: str) -> str:
    """去除語法符號取純文字 —— 用於摘要、搜尋索引與 SEO description。"""
    lines = []
    for line in source.split("\n"):
        lines.append("".join(v for _, v in tokenize_line(line)))
    return "\n".join(lines).strip()


def excerpt(source: str, max_len: int = 120) -> str:
    plain = re.sub(r"\s+", " ", to_plain_text(source))
    return plain[:max_len].rstrip() + "…" if len(plain) > max_len else plain
