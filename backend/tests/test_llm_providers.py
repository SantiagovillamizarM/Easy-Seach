"""Proveedores de IA: OpenAI (salida estricta), cadena OpenAI → Gemini y elección por configuración.

No se llama a ninguna API real: se simula httpx.post.
"""
import json
from types import SimpleNamespace

import httpx
import pytest

from app.services import llm as llm_module
from app.services.llm import LLMError, answered_by
from app.services.llm.chain import FallbackLLM
from app.services.llm.openai_provider import OpenAIProvider, to_strict_schema
from app.services.query_parser import _schema as query_schema
from app.services.query_parser import parse_query


def _response(status=200, content=None, refusal=None, error_code=None, finish_reason="stop"):
    if status != 200:
        return httpx.Response(status, json={"error": {"code": error_code}})
    message = {"role": "assistant", "content": json.dumps(content) if content is not None else None}
    if refusal:
        message["refusal"] = refusal
    return httpx.Response(200, json={"choices": [{"message": message, "finish_reason": finish_reason}]})


@pytest.fixture()
def fake_post(monkeypatch):
    """Reemplaza httpx.post: guarda las peticiones y devuelve las respuestas encoladas."""
    calls, queue = [], []

    def post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "headers": headers, "json": json})
        return queue.pop(0)

    monkeypatch.setattr(httpx, "post", post)
    return SimpleNamespace(calls=calls, queue=queue)


def test_strict_schema_translates_nullable_and_closes_objects():
    strict = to_strict_schema(query_schema())
    assert strict["additionalProperties"] is False
    assert set(strict["required"]) == set(strict["properties"])
    assert strict["properties"]["location_text"]["type"] == ["string", "null"]
    assert strict["properties"]["price_preference"]["enum"][-1] is None
    assert "nullable" not in json.dumps(strict)


def test_openai_sends_strict_schema_and_marks_the_answer(fake_post):
    fake_post.queue.append(_response(content={"decision": "approved"}))
    provider = OpenAIProvider(api_key="clave-de-prueba", model="gpt-4.1-mini")
    schema = {"type": "object", "properties": {"decision": {"type": "string"}}, "required": ["decision"]}
    raw = provider.generate_json("hola", schema, system="Eres un moderador")

    sent = fake_post.calls[0]
    assert sent["headers"]["Authorization"] == "Bearer clave-de-prueba"
    assert sent["json"]["response_format"]["json_schema"]["strict"] is True
    assert sent["json"]["messages"][0] == {"role": "system", "content": "Eres un moderador"}
    assert sent["json"]["temperature"] == 0
    assert answered_by(raw, provider) == "openai"
    assert raw == {"decision": "approved"}


def test_reasoning_models_do_not_get_temperature(fake_post):
    fake_post.queue.append(_response(content={"ok": True}))
    OpenAIProvider(api_key="k", model="gpt-5-mini").generate_json("x", {"type": "object", "properties": {}})
    assert "temperature" not in fake_post.calls[0]["json"]


def test_openai_rate_limit_pauses_the_provider(fake_post):
    fake_post.queue.append(_response(429, error_code="insufficient_quota"))
    provider = OpenAIProvider(api_key="k", model="gpt-4.1-mini")
    with pytest.raises(LLMError, match="429"):
        provider.generate_json("x", {"type": "object", "properties": {}})
    # En pausa: no vuelve a llamar a la API (responde el respaldo sin hacer esperar)
    with pytest.raises(LLMError, match="pausa"):
        provider.generate_json("x", {"type": "object", "properties": {}})
    assert len(fake_post.calls) == 1


def test_openai_refusal_is_an_error(fake_post):
    fake_post.queue.append(_response(content=None, refusal="No puedo ayudar con eso"))
    with pytest.raises(LLMError, match="negó"):
        OpenAIProvider(api_key="k", model="gpt-4.1-mini").generate_json("x", {"type": "object", "properties": {}})


class _Fake:
    def __init__(self, name, answer=None, fail=False):
        self.name, self.answer, self.fail, self.calls = name, answer, fail, 0

    def generate_json(self, prompt, schema, system=None, **kwargs):
        self.calls += 1
        if self.fail:
            raise LLMError(f"{self.name} caído")
        return {**self.answer, "_provider": self.name}


def test_chain_falls_back_to_gemini_when_openai_fails():
    openai_, gemini = _Fake("openai", fail=True), _Fake("gemini", {"x": 1})
    raw = FallbackLLM([openai_, gemini]).generate_json("p", {})
    assert answered_by(raw, None) == "gemini" and raw == {"x": 1}
    assert openai_.calls == gemini.calls == 1


def test_chain_raises_when_every_provider_fails():
    with pytest.raises(LLMError):
        FallbackLLM([_Fake("openai", fail=True), _Fake("gemini", fail=True)]).generate_json("p", {})


def test_query_parser_labels_the_provider_that_answered():
    answer = {"need": "ferretería", "keywords": ["ferreteria"], "category_slugs": ["ferreterias"],
              "location_text": None, "near_me": False, "budget_min": None, "budget_max": None,
              "price_preference": None, "open_now": False, "min_rating": None, "preferences": [], "is_search": True}
    chain = FallbackLLM([_Fake("openai", fail=True), _Fake("gemini", answer)])
    assert parse_query("una ferretería prueba-cadena", chain).parser == "gemini"
    assert parse_query("una ferretería prueba-openai", _Fake("openai", answer)).parser == "openai"


@pytest.mark.parametrize("choice,openai_key,gemini_key,expected", [
    ("auto", "k", "g", ["openai", "gemini"]),   # los dos: OpenAI primero, Gemini de respaldo
    ("auto", None, "g", ["gemini"]),
    ("auto", "k", None, ["openai"]),
    ("gemini", "k", "g", ["gemini"]),           # forzado
    ("openai", "k", "g", ["openai"]),
    ("auto", None, None, None),                 # sin claves: solo reglas
])
def test_get_llm_follows_the_configuration(monkeypatch, choice, openai_key, gemini_key, expected):
    settings = SimpleNamespace(llm_provider=choice, openai_api_key=openai_key, openai_model="gpt-4.1-mini",
                               gemini_api_key=gemini_key, gemini_model="m", gemini_fallback_model=None,
                               llm_timeout_seconds=5)
    monkeypatch.setattr(llm_module, "get_settings", lambda: settings)
    llm_module.get_llm.cache_clear()
    try:
        result = llm_module.get_llm()
    finally:
        llm_module.get_llm.cache_clear()
    if expected is None:
        assert result is None
    else:
        providers = result.providers if isinstance(result, FallbackLLM) else [result]
        assert [p.name for p in providers] == expected



# ------------------------------- Control de costos ----------------------------------------------------

def test_openai_caps_the_answer_tokens(fake_post):
    fake_post.queue.append(_response(content={"ok": True}))
    OpenAIProvider(api_key="k", model="gpt-4.1-mini").generate_json("x", {"type": "object", "properties": {}}, max_tokens=300)
    assert fake_post.calls[0]["json"]["max_completion_tokens"] == 300


def test_reasoning_models_get_room_to_think_and_minimal_effort(fake_post):
    fake_post.queue.append(_response(content={"ok": True}))
    OpenAIProvider(api_key="k", model="gpt-5-mini").generate_json("x", {"type": "object", "properties": {}}, max_tokens=300)
    body = fake_post.calls[0]["json"]
    assert body["max_completion_tokens"] == 1200 and body["reasoning_effort"] == "minimal"


def test_answer_cut_by_the_token_cap_is_an_error(fake_post):
    fake_post.queue.append(_response(content={"ok": True}, finish_reason="length"))
    with pytest.raises(LLMError, match="tope de tokens"):
        OpenAIProvider(api_key="k", model="gpt-4.1-mini").generate_json("x", {"type": "object", "properties": {}}, max_tokens=10)


def test_without_openai_keeps_only_the_free_providers():
    from app.services.llm import without_openai
    openai_, gemini = _Fake("openai"), _Fake("gemini")
    assert without_openai(FallbackLLM([openai_, gemini])) is gemini
    assert without_openai(openai_) is None
    assert without_openai(gemini) is gemini
    assert without_openai(None) is None


def _history(db, user_id, parser, days_ago=0, n=1):
    from datetime import timedelta

    from app.models import SearchHistory
    from app.services.ai_quota import start_of_today
    when = start_of_today() + timedelta(hours=1) - timedelta(days=days_ago)
    for _ in range(n):
        db.add(SearchHistory(user_id=user_id, query_text="x", parsed_query={"parser": parser}, created_at=when))
    db.flush()


def test_daily_openai_quota_switches_to_gemini(db, monkeypatch):
    from app.services import ai_quota
    from tests.conftest import _make_user
    monkeypatch.setattr(ai_quota, "get_settings", lambda: SimpleNamespace(openai_searches_per_day=3))
    user = _make_user(db, "cupo@test.com", "user")
    chain = FallbackLLM([_Fake("openai"), _Fake("gemini")])

    _history(db, user.id, "openai", n=2)
    _history(db, user.id, "gemini", n=5)             # las de Gemini no gastan cupo
    _history(db, user.id, "openai", days_ago=1, n=9)  # las de ayer tampoco
    assert ai_quota.llm_for_user(db, user, chain) is chain        # 2 de 3: todavía con OpenAI

    _history(db, user.id, "openai")
    assert ai_quota.llm_for_user(db, user, chain).name == "gemini"  # 3 de 3: cupo agotado
    # Las recomendaciones de la búsqueda que agotó el cupo todavía van con OpenAI
    assert ai_quota.llm_for_user(db, user, chain, already_recorded=True) is chain
    # Los invitados tienen su propio límite de búsquedas de prueba: no se les cambia la IA
    assert ai_quota.llm_for_user(db, None, chain) is chain


def test_search_uses_gemini_after_the_daily_openai_quota(client, db, monkeypatch):
    from sqlalchemy import select

    from app.main import app
    from app.models import User
    from app.services import ai_quota
    from app.services.llm import get_llm
    from tests.conftest import _make_user, _token
    monkeypatch.setattr(ai_quota, "get_settings", lambda: SimpleNamespace(openai_searches_per_day=1))
    _make_user(db, "cupo-api@test.com", "user")
    client.headers["Authorization"] = f"Bearer {_token(client, 'cupo-api@test.com')}"
    answer = {"need": "pizza", "keywords": ["pizza"], "category_slugs": [], "location_text": None, "near_me": False,
              "budget_min": None, "budget_max": None, "price_preference": None, "open_now": False, "min_rating": None,
              "preferences": [], "is_search": True}
    openai_, gemini = _Fake("openai", answer), _Fake("gemini", answer)
    app.dependency_overrides[get_llm] = lambda: FallbackLLM([openai_, gemini])

    assert client.post("/api/search", json={"q": "pizza cupo uno"}).json()["interpretation"]["parser"] == "openai"
    body = client.post("/api/search", json={"q": "pizza cupo dos"}).json()
    assert body["interpretation"]["parser"] == "gemini"      # cupo de 1 agotado: responde Gemini
    assert openai_.calls == 1 and gemini.calls == 1
    user = db.scalar(select(User).where(User.email == "cupo-api@test.com"))
    assert ai_quota.openai_searches_today(db, user.id) == 1
