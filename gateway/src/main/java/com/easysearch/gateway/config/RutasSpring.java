package com.easysearch.gateway.config;

import java.util.List;

/**
 * Rutas que atiende Spring Boot. Todo lo demás bajo /api se reenvía a FastAPI.
 *
 * <p>Están en un solo lugar porque las usan la seguridad (exigir sesión) y el proxy (no reenviarlas a FastAPI:
 * si alguien pide una ruta de Spring que no existe, debe recibir 404 y no llegar a otro backend).
 */
public final class RutasSpring {

	/** Asistente con IA: consultas, historial y calificaciones (fase 10). Exige correo confirmado. */
	public static final String ASISTENTE = "/api/asistente";
	/** Análisis de datos y dashboard (fase 11). Solo administradores. */
	public static final String ANALITICA = "/api/analitica";
	/** Estado del sistema y sesión vista por Spring. */
	public static final String SISTEMA = "/api/sistema";

	public static final List<String> TODAS = List.of(ASISTENTE, ANALITICA, SISTEMA);

	private RutasSpring() {
	}

	/** true si la ruta pertenece a Spring (el prefijo exacto o algo debajo de él). */
	public static boolean esDeSpring(String path) {
		return TODAS.stream().anyMatch(prefijo -> path.equals(prefijo) || path.startsWith(prefijo + "/"));
	}
}
