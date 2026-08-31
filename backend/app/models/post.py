"""
文章，以及掛在文章上的兩樣東西：標籤與讚。

這三張表放同一個檔案，是因為 PostTag 與 PostLike 離開 Post 就沒有意義 ——
它們不是獨立的概念，而是文章的一部分。反過來說，Comment 雖然也掛在文章上，
卻放在 social.py，因為留言本身是一個獨立的社交行為，有自己的作者與生命週期。

檔案怎麼切，切的是「概念的邊界」，不是「程式碼的行數」。
"""

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin, UtcDateTime, utcnow


class Post(Base, UUIDMixin):
    """
    一篇文章。

    注意它繼承 UUIDMixin 但**沒有**繼承 TimestampMixin —— 時間欄位是自己宣告的。
    因為這裡的 created_at 有特殊規則：編輯文章時它不能被更新，
    而 TimestampMixin 給的是通用行為。與其硬套再想辦法繞過，不如自己寫清楚。

    body 存的是**原始碼**，含使用者打的自訂語法（反引號、#標籤），
    不是渲染後的 HTML。存原始碼才改得動、才搜尋得到，
    也才不會把 XSS 的風險醃進資料庫裡。
    """

    __tablename__ = "posts"
    __table_args__ = (
        # 動態牆固定用 created_at 新到舊，這條索引直接對應那個查詢
        Index("ix_posts_created_at", "created_at"),
        Index("ix_posts_author_created", "author_id", "created_at"),
    )

    author_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # 原始碼，含自訂語法
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 首次發布時間，編輯不會改動它 —— 排序才不會因為編輯而跳動，
    # 對讀者也比較誠實（看得出原本是什麼時候寫的）
    created_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UtcDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )
    edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # 讚數與留言數存成欄位。每次查列表都 COUNT 一次在資料量大時會很慢，
    # 這裡用計數欄位，並在按讚／留言的同一個交易裡更新，不會對不上。
    like_count: Mapped[int] = mapped_column(default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(default=0, nullable=False)

    author = relationship("User", back_populates="posts")
    comments = relationship("Comment", back_populates="post", cascade="all, delete-orphan")
    likes = relationship("PostLike", back_populates="post", cascade="all, delete-orphan")
    tags = relationship("PostTag", back_populates="post", cascade="all, delete-orphan")


class PostTag(Base, UUIDMixin):
    """
    文章的標籤。

    從內文的 #標籤 解析出來，存成獨立資料表而不是塞在文章欄位裡，
    這樣「找出所有帶這個標籤的文章」才走得到索引。
    """

    __tablename__ = "post_tags"
    __table_args__ = (
        UniqueConstraint("post_id", "tag", name="uq_post_tag"),
        Index("ix_post_tags_tag", "tag"),
    )

    post_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    # 一律存小寫，搜尋時大小寫不敏感
    tag: Mapped[str] = mapped_column(String(50), nullable=False)

    post = relationship("Post", back_populates="tags")


class PostLike(Base, TimestampMixin):
    """
    誰按了讚。

    複合主鍵天然保證同一個人對同一篇只會有一筆 —— 連按兩次不會重複計數，
    不需要在應用層再檢查一遍。
    """

    __tablename__ = "post_likes"

    post_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    post = relationship("Post", back_populates="likes")
    user = relationship("User")
