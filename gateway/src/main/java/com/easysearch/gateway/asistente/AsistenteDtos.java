package com.easysearch.gateway.asistente;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Datos que entran y salen de la API del asistente. */
public final class AsistenteDtos {

	private AsistenteDtos() {
	}

	@Schema(description = "Pregunta en lenguaje natural")
	public record ConsultaRequest(
			@Schema(example = "¿Dónde puedo almorzar barato en Cabecera?") @NotNull @Size(max = 500) String pregunta) {
	}

	public record CalificacionRequest(
			@Schema(example = "5") @NotNull @Min(1) @Max(5) Integer puntuacion,
			@Schema(example = "Me sirvió, fui al primer lugar") @Size(max = 500) String comentario) {
	}

	public record FuenteDto(Integer establecimientoId, String nombre, String slug, BigDecimal similitud, int posicion) {
	}

	public record CalificacionDto(int puntuacion, String comentario, Instant actualizadaEn) {
	}

	public record RespuestaDto(String texto, List<String> pasos, String modelo, List<FuenteDto> fuentes,
			CalificacionDto calificacion) {
	}

	public record ConsultaDto(Integer id, String pregunta, EstadoConsulta estado, Instant creadaEn,
			Instant respondidaEn, Integer duracionMs, BigDecimal umbral, BigDecimal mejorSimilitud,
			String detalleError, RespuestaDto respuesta) {
	}

	public record PaginaDto<T>(long total, int pagina, int tamano, List<T> items) {
	}
}
