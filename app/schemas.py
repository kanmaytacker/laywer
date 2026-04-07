from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "Viewer"
    tenant: str = "default"


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    tenant: str

    class Config:
        from_attributes = True


class MatterCreate(BaseModel):
    title: str
    forum: str
    parties: str
    ay_fy_period: str | None = None
    sections: str | None = None
    counsel: str | None = None
    stage: str | None = None
    next_date: date | None = None
    internal_owner: str | None = None


class MatterOut(BaseModel):
    id: int
    tenant: str
    title: str
    forum: str
    parties: str
    ay_fy_period: str | None
    sections: str | None
    counsel: str | None
    stage: str | None
    next_date: date | None
    internal_owner: str | None
    status: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentOut(BaseModel):
    id: int
    matter_id: int
    title: str
    tag: str
    doc_type: str

    class Config:
        from_attributes = True


class DocumentVersionOut(BaseModel):
    id: int
    document_id: int
    version_number: int
    file_path: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ArtifactOut(BaseModel):
    id: int
    matter_id: int
    artifact_type: str
    version_number: int
    title: str
    content: str
    sources_json: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    due_date: date
    assignee: str | None = None


class TaskOut(BaseModel):
    id: int
    matter_id: int
    title: str
    due_date: date
    assignee: str | None
    status: str

    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    target_type: str
    target_id: int
    body: str


class CommentOut(BaseModel):
    id: int
    matter_id: int
    target_type: str
    target_id: int
    body: str
    author_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Editor"
    tenant: str = "default"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatProxyRequest(BaseModel):
    model: str = "gpt-4.1-mini"
    messages: list[ChatMessage]
    use_web_search: bool = False
    use_vector_search: bool = False
    case_id: str | None = None
    citations_required: bool = True
