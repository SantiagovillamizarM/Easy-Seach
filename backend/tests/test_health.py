"""Fase 0: la API responde y la base de datos tiene pgvector."""


def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["api"] == "ok"
    assert data["database"] == "ok"
    assert data["pgvector"] is not None, "La extensión pgvector no está instalada"
    # Distancia coseno entre [1,0,0] y [0.7,0.7,0] ≈ 0.2929
    assert abs(data["vector_test_cosine_distance"] - 0.2929) < 0.001
