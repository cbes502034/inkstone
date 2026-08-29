import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Eye, PenLine, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AiPanel } from '../components/AiPanel'
import { PostBody } from '../components/PostBody'
import { Tooltip } from '../components/Tooltip'
import { Button } from '../components/ui'
import { posts } from '../lib/api'
import { extractTags } from '../lib/markup'

type Tab = 'write' | 'preview'

export function Write() {
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tab, setTab] = useState<Tab>('write')
  const [aiOpen, setAiOpen] = useState(false)

  // 編輯模式 —— 載入原文
  const { data: existing } = useQuery({
    queryKey: ['post', editId],
    queryFn: () => posts.get(editId!),
    enabled: Boolean(editId),
  })

  useEffect(() => {
    if (existing) {
      setTitle(existing.title)
      setBody(existing.body)
    }
  }, [existing])

  const save = useMutation({
    mutationFn: () =>
      editId ? posts.update(editId, { title, body }) : posts.create({ title, body }),
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['post', post.id] })
      navigate(`/post/${post.id}`)
    },
  })

  const canSave = title.trim().length > 0 && body.trim().length > 0
  const tags = extractTags(body)

  /** AI 產出被採用 —— 直接灌進編輯區 */
  const acceptDraft = (draft: { title: string; body: string }) => {
    if (!title.trim()) setTitle(draft.title)
    setBody((prev) => (prev.trim() ? `${prev}\n\n${draft.body}` : draft.body))
    setAiOpen(false)
    setTab('write')
  }

  return (
    <div className="scrim flex min-h-dvh flex-col">
      {/* 工具列 */}
      <header className="sticky top-[52px] z-20 flex items-center gap-2 border-b border-rule bg-paper/90 px-3 py-2.5 backdrop-blur-md md:top-0">
        <button
          onClick={() => navigate(-1)}
          aria-label="返回"
          className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <ArrowLeft size={18} />
        </button>

        {/* 窄螢幕放不下就先捨棄標籤，優先保住切換與發布 */}
        <span className="hidden shrink-0 whitespace-nowrap text-sm text-ink-faint sm:inline">
          {editId ? '編輯文章' : '新文章'}
        </span>

        {/* 排版語法不佔版面，移到游標上才出現 */}
        <Tooltip
          side="bottom"
          text="用反引號包住文字會變粗體；井字號開頭會變成可點擊的標籤，讀者點下去會跳到搜尋頁。"
        />

        {/* 編輯／預覽切換 */}
        <div className="ml-auto flex shrink-0 rounded-full bg-paper-sunk p-0.5">
          {(
            [
              ['write', '編輯', PenLine],
              ['preview', '預覽', Eye],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-label={label}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors
                ${tab === key ? 'bg-paper-raised font-medium text-ink shadow-sm' : 'text-ink-soft'}`}
            >
              <Icon size={14} />
              <span className="hidden xs:inline">{label}</span>
            </button>
          ))}
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={!canSave}
          loading={save.isPending}
          className="shrink-0 px-4"
        >
          {editId ? '更新' : '發布'}
        </Button>
      </header>

      {/* 編輯區 */}
      <div className="flex-1 px-5 py-7 sm:px-10">
        {tab === 'write' ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="標題"
              className="w-full border-none bg-transparent p-0 text-[28px] leading-tight tracking-tight
                         outline-none placeholder:text-ink-faint sm:text-[34px]"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
            />

            <div className="my-5 h-px bg-rule" />

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="寫下你想說的話…"
              rows={16}
              className="w-full resize-none border-none bg-transparent p-0 text-[17px] leading-[1.9]
                         outline-none placeholder:text-ink-faint"
            />

            {tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-accent-wash px-2.5 py-1 text-accent"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <h1 className="text-[28px] leading-tight tracking-tight sm:text-[34px]">
              {title || <span className="text-ink-faint">還沒有標題</span>}
            </h1>
            <div className="my-5 h-px bg-rule" />
            {body.trim() ? (
              <PostBody source={body} />
            ) : (
              <p className="text-ink-faint">還沒有內容。</p>
            )}
          </div>
        )}
      </div>

      {/* AI 浮動按鈕 */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          className="press fixed bottom-24 right-5 z-30 flex items-center gap-2 rounded-full
                     border border-rule-strong bg-paper-raised px-4 py-3 text-sm font-medium
                     text-ink shadow-lg transition-colors hover:border-accent hover:text-accent
                     md:bottom-8 md:right-8"
        >
          <Sparkles size={17} />
          幫我起個頭
        </button>
      )}

      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} onAccept={acceptDraft} />
    </div>
  )
}
