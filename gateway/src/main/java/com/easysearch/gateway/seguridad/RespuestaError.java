package com.easysearch.gateway.seguridad;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Escribe errores con el mismo formato que FastAPI ({@code {"detail": "..."}}), que es el que el frontend ya
 * sabe mostrar. Así al usuario le da igual qué backend respondió.
 */
public final class RespuestaError {

	private RespuestaError() {
	}

	public static String json(String mensaje) {
		return "{\"detail\":\"" + mensaje.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
	}

	public static void escribir(HttpServletResponse response, int status, String mensaje) throws IOException {
		response.setStatus(status);
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.getWriter().write(json(mensaje));
	}
}
