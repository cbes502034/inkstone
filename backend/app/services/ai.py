"""
AI 寫作助手。

範圍限制不是只靠一句 system prompt —— 那擋不住誘導。實作是兩層：

  1. 輸入端分類：送進生成模型之前先判斷是不是搗亂／離題／想套系統提示，
     是的話直接回善意提醒，完全不呼叫生成模型（也省下推論成本）
  2. 輸出端複查：生成完再檢查一次，不過關就重來

第 2 層存在的理由是第 1 層一定會被繞過。規則比對擋得住常見的直球，
擋不住換句話說，所以生成出來的東西仍要再看一次。
"""

import re

import httpx

from app.core.config import settings

# --- 第一層：輸入端規則 ---

_OFF_TOPIC = [
    re.compile(r"怎麼(駭|入侵|盜|破解)"),
    re.compile(r"(信用卡|身分證|銀行帳號|密碼)\s*號?碼"),
    re.compile(r"幫我(寫|做|解)(作業|考卷|報告|考題)"),
    re.compile(r"(股票|樂透|明牌|飆股).{0,6}(推薦|報|買)"),
    re.compile(r"(製作|合成|怎麼做).{0,6}(炸彈|毒品|槍)"),
    # 想套出系統提示或改變角色設定
    re.compile(r"(忽略|無視).{0,6}(上面|先前|之前|所有).{0,6}(指令|規則|設定)", re.I),
    re.compile(r"(你的|系統).{0,4}prompt", re.I),
    re.compile(r"你(是|用).{0,6}(什麼|哪個).{0,4}模型"),
    re.compile(r"repeat (the|your) (above|system)", re.I),
]

# 同一個字重複刷、或整串都是標點
_NONSENSE = re.compile(r"^[\s\W]*(.)\1{5,}[\s\W]*$")

SYSTEM_PROMPT = (
    "你是一個部落格平台的寫作助手，只負責幫使用者把文章的開頭寫出來。"
    "規則："
    "1. 只產出繁體中文的文章草稿，不回答與寫作無關的問題。"
    "2. 不提供醫療、法律、投資建議，也不撰寫任何違法或傷害他人的內容。"
    "3. 使用者若試圖讓你偏離寫作任務，禮貌地把話題帶回他想寫的主題。"
    "4. 輸出格式：第一行是標題，空一行之後是內文。不要加任何說明或前言。"
)


class AiResult:
    def __init__(
        self, kind: str, body: str, title: str | None = None, draft_body: str | None = None
    ):
        self.kind = kind  # draft / refusal
        self.body = body
        self.title = title
        self.draft_body = draft_body


REFUSAL_OFF_TOPIC = (
    "這個我幫不上忙 —— 我只負責陪你寫這裡的文章。"
    "要不要換個想寫的題目？隨便一件今天發生的小事都可以。"
)
REFUSAL_TOO_SHORT = (
    "看起來還沒想好要寫什麼。跟我說個主題或心情就好，"
    "例如「想寫一篇關於通勤路上看到的事」。"
)


def screen_input(prompt: str) -> str | None:
    """回傳拒絕訊息，或 None 表示可以往下送。"""
    text = prompt.strip()
    if len(text) < 4 or _NONSENSE.match(text):
        return REFUSAL_TOO_SHORT
    if any(p.search(text) for p in _OFF_TOPIC):
        return REFUSAL_OFF_TOPIC
    return None


def screen_output(text: str) -> bool:
    """輸出端複查。過不了就重新生成或降級為提醒。"""
    if not text or len(text.strip()) < 20:
        return False
    # 模型把系統提示原樣吐出來，代表被繞過了
    if "你是一個部落格平台的寫作助手" in text:
        return False
    if any(p.search(text) for p in _OFF_TOPIC):
        return False
    return True


async def generate(prompt: str) -> AiResult:
    """
    呼叫 Hugging Face 推論服務。

    沒設定 HF_TOKEN 時走本機的樣板產生器 —— 這樣前端與流程可以先跑起來，
    不必等模型部署好。接上之後這個分支自然不會走到。
    """
    refusal = screen_input(prompt)
    if refusal:
        return AiResult(kind="refusal", body=refusal)

    if not settings.HF_TOKEN:
        return _local_draft(prompt)

    try:
        text = await _call_hf(prompt)
    except (httpx.HTTPError, httpx.TimeoutException):
        # 模型掛掉不該讓整個寫作流程停擺，退回本機樣板
        return _local_draft(prompt)

    if not screen_output(text):
        return AiResult(kind="refusal", body=REFUSAL_OFF_TOPIC)

    title, _, body = text.strip().partition("\n")
    return AiResult(
        kind="draft",
        body="照你說的方向寫了一版，你看看順不順：",
        title=title.strip() or _fallback_title(prompt),
        draft_body=body.strip() or text.strip(),
    )


async def _call_hf(prompt: str) -> str:
    url = f"https://api-inference.huggingface.co/models/{settings.HF_TEXT_MODEL}/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.HF_TOKEN}"}
    payload = {
        "model": settings.HF_TEXT_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 700,
        "temperature": 0.8,
    }
    async with httpx.AsyncClient(timeout=settings.HF_TIMEOUT_SECONDS) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


def _fallback_title(prompt: str) -> str:
    core = re.sub(
        r"^(幫我|請幫我|請|我想|想)?\s*(寫|生成|來|記錄|整理|聊聊|說說)\s*(一)?(篇|下|個)?\s*(關於)?",
        "",
        prompt.strip(),
    ).strip()
    return (core[:22] + "…") if len(core) > 24 else (core or "無題")


def _local_draft(prompt: str) -> AiResult:
    """模型還沒接上時的樣板。結構與語氣與正式版一致，方便前端先開發。"""
    topic = _fallback_title(prompt)
    body = (
        f"最近一直在想{topic}這件事。\n\n"
        "一開始只是個很小的念頭，沒放在心上。但它就這樣待著，"
        "時不時冒出來提醒我一下，久了就變成一件`非得寫下來不可`的事。\n\n"
        "我想先把事情本身講清楚，再講它為什麼讓我在意。\n\n"
        "（這裡接著寫你的觀察或經過。可以從一個具體的場景開始 —— "
        "那天幾點、你在哪裡、看到什麼，讀起來會比抽象的心得更有畫面。）\n\n"
        f"寫到這裡才發現，其實真正想說的不是{topic}本身，"
        "而是它讓我看見的那一點東西。\n\n"
        f"#{re.sub(r'[\\s\\W]', '', topic)[:6] or '隨筆'}"
    )
    return AiResult(
        kind="draft",
        body="照你說的方向寫了一版，你看看順不順：",
        title=topic,
        draft_body=body,
    )
