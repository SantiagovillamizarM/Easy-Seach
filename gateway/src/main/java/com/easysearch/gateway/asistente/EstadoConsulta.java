package com.easysearch.gateway.asistente;

/** Estados de una consulta al asistente (restricción ck_consultas_ia_estado_valido en la base). */
public enum EstadoConsulta {
	/** Guardada; esperando la respuesta de n8n. */
	PENDIENTE,
	/** Respondida con fuentes reales y sus similitudes. */
	RESPONDIDA,
	/** Ningún negocio superó el umbral, o las fuentes no respondían la pregunta: no se inventa nada. */
	SIN_RESULTADOS,
	/** Falló un servicio (embeddings, pgvector, Gemini o n8n). */
	ERROR
}
