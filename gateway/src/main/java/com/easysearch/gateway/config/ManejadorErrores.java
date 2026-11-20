package com.easysearch.gateway.config;

import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import com.easysearch.gateway.seguridad.RespuestaError;

/**
 * Todos los errores de los controladores de Spring salen con el formato de FastAPI ({@code {"detail": "..."}}),
 * que es el que el frontend sabe mostrar. Los errores inesperados no revelan detalles internos.
 */
@RestControllerAdvice
public class ManejadorErrores {

	private static final Logger log = LoggerFactory.getLogger(ManejadorErrores.class);

	@ExceptionHandler(ResponseStatusException.class)
	ResponseEntity<String> estado(ResponseStatusException ex) {
		return json(ex.getStatusCode(), ex.getReason() != null ? ex.getReason() : "Error");
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<String> validacion(MethodArgumentNotValidException ex) {
		var error = ex.getBindingResult().getFieldErrors().stream().findFirst();
		String mensaje = error.map(e -> "Dato inválido en '" + e.getField() + "': " + e.getDefaultMessage())
				.orElse("Datos inválidos");
		return json(HttpStatus.UNPROCESSABLE_CONTENT, mensaje);
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class })
	ResponseEntity<String> formato(Exception ex) {
		return json(HttpStatus.UNPROCESSABLE_CONTENT, "El formato de la solicitud no es válido");
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<String> inesperado(Exception ex) {
		// Errores propios de Spring MVC con su código (405 método no permitido, 415 tipo no soportado...)
		if (ex instanceof org.springframework.web.ErrorResponse respuesta && respuesta.getStatusCode().is4xxClientError()) {
			return json(respuesta.getStatusCode(), "Solicitud no válida");
		}
		log.error("Error no controlado", ex);
		return json(HttpStatus.INTERNAL_SERVER_ERROR, "Tuvimos un problema en el servidor. Intenta de nuevo en un momento.");
	}

	private static ResponseEntity<String> json(HttpStatusCode status, String mensaje) {
		return ResponseEntity.status(status)
				.contentType(new MediaType(MediaType.APPLICATION_JSON, StandardCharsets.UTF_8))
				.body(RespuestaError.json(mensaje));
	}
}
