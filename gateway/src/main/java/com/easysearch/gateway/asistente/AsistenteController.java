package com.easysearch.gateway.asistente;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.easysearch.gateway.asistente.AsistenteDtos.CalificacionRequest;
import com.easysearch.gateway.asistente.AsistenteDtos.ConsultaDto;
import com.easysearch.gateway.asistente.AsistenteDtos.ConsultaRequest;
import com.easysearch.gateway.asistente.AsistenteDtos.PaginaDto;
import com.easysearch.gateway.config.OpenApiConfig;
import com.easysearch.gateway.config.RutasSpring;
import com.easysearch.gateway.seguridad.UsuarioAutenticado;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping(RutasSpring.ASISTENTE + "/consultas")
@Tag(name = "Asistente IA", description = "Preguntas en lenguaje natural respondidas con RAG (pgvector + Gemini vía n8n)")
@SecurityRequirement(name = OpenApiConfig.BEARER)
public class AsistenteController {

	private final AsistenteService servicio;

	public AsistenteController(AsistenteService servicio) {
		this.servicio = servicio;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Hacer una pregunta al asistente", description = """
			Guarda la consulta, busca en pgvector los negocios más parecidos y genera una orientación usando solo esos \
			negocios. Estados posibles: RESPONDIDA (con fuentes y similitudes), SIN_RESULTADOS (ninguna fuente \
			relevante: no se inventa nada) o ERROR (falló un servicio). Exige correo confirmado. \
			Límite: 20 preguntas por hora.""")
	public ConsultaDto preguntar(@AuthenticationPrincipal UsuarioAutenticado usuario,
			@Valid @RequestBody ConsultaRequest datos) {
		return servicio.preguntar(usuario, datos.pregunta());
	}

	@GetMapping
	@Operation(summary = "Historial de mis consultas", description = "De la más reciente a la más antigua.")
	public PaginaDto<ConsultaDto> historial(@AuthenticationPrincipal UsuarioAutenticado usuario,
			@RequestParam(defaultValue = "1") int pagina, @RequestParam(defaultValue = "10") int tamano) {
		return servicio.historial(usuario, pagina, tamano);
	}

	@GetMapping("/{id}")
	@Operation(summary = "Detalle de una consulta", description = "Pregunta, estado, respuesta, fuentes, similitudes y calificación.")
	public ConsultaDto detalle(@AuthenticationPrincipal UsuarioAutenticado usuario, @PathVariable Integer id) {
		return servicio.detalle(usuario, id);
	}

	@PutMapping("/{id}/calificacion")
	@Operation(summary = "Calificar la respuesta de 1 a 5", description = "Si ya estaba calificada, se reemplaza la calificación.")
	public ConsultaDto calificar(@AuthenticationPrincipal UsuarioAutenticado usuario, @PathVariable Integer id,
			@Valid @RequestBody CalificacionRequest datos) {
		return servicio.calificar(usuario, id, datos.puntuacion(), datos.comentario());
	}
}
