package com.easysearch.gateway.sistema;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.easysearch.gateway.config.GatewayProperties;
import com.easysearch.gateway.config.OpenApiConfig;
import com.easysearch.gateway.config.RutasSpring;
import com.easysearch.gateway.seguridad.UsuarioAutenticado;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping(RutasSpring.SISTEMA)
@Tag(name = "Sistema", description = "Estado de los servicios y sesión vista por Spring Boot")
public class SistemaController {

	private static final Logger log = LoggerFactory.getLogger(SistemaController.class);

	private final JdbcTemplate jdbc;
	private final GatewayProperties properties;
	private final HttpClient httpClient = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(3))
			.build();

	public SistemaController(JdbcTemplate jdbc, GatewayProperties properties) {
		this.jdbc = jdbc;
		this.properties = properties;
	}

	public record Estado(String gateway, String baseDeDatos, String fastapi) {
	}

	public record Sesion(Integer id, String email, String nombre, String rol, boolean correoConfirmado) {
	}

	@GetMapping("/estado")
	@Operation(summary = "Estado de los servicios",
			description = "Público. Responde 200 si Spring, PostgreSQL y FastAPI funcionan; 503 si alguno falla.")
	public ResponseEntity<Estado> estado() {
		Estado estado = new Estado("ok", baseDeDatos(), fastapi());
		boolean todoBien = "ok".equals(estado.baseDeDatos()) && "ok".equals(estado.fastapi());
		return ResponseEntity.status(todoBien ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(estado);
	}

	@GetMapping("/sesion")
	@SecurityRequirement(name = OpenApiConfig.BEARER)
	@Operation(summary = "Usuario de la sesión actual",
			description = "Comprueba que Spring acepta el token emitido por FastAPI y muestra a quién pertenece.")
	public Sesion sesion(@AuthenticationPrincipal UsuarioAutenticado usuario) {
		return new Sesion(usuario.id(), usuario.email(), usuario.nombre(), usuario.rol(), usuario.correoConfirmado());
	}

	private String baseDeDatos() {
		try {
			jdbc.queryForObject("SELECT 1", Integer.class);
			return "ok";
		}
		catch (RuntimeException ex) {
			log.error("PostgreSQL no responde: {}", ex.getMessage());
			return "error";
		}
	}

	private String fastapi() {
		try {
			HttpRequest request = HttpRequest.newBuilder(properties.fastapiUrl().resolve("/api/health"))
					.timeout(Duration.ofSeconds(5)).GET().build();
			int status = httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
			return status == 200 ? "ok" : "error";
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			return "error";
		}
		catch (Exception ex) {
			log.error("FastAPI no responde: {}", ex.toString());
			return "error";
		}
	}
}
