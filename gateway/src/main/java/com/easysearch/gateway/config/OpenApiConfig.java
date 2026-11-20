package com.easysearch.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** Datos generales de la documentación Swagger de Spring Boot (http://127.0.0.1:8020/swagger-ui.html). */
@Configuration
public class OpenApiConfig {

	/** Nombre del esquema de seguridad; los controladores lo citan con {@code @SecurityRequirement(name = "bearer")}. */
	public static final String BEARER = "bearer";

	@Bean
	OpenAPI easySearchOpenApi() {
		return new OpenAPI()
				.info(new Info()
						.title("Easy Search — Spring Boot")
						.version("0.1.0")
						.description("""
								Módulos atendidos por Spring Boot: asistente con IA, análisis de datos y estado del \
								sistema. Las demás rutas de /api se reenvían a FastAPI (elige su especificación \
								arriba a la derecha).

								Para probar las rutas protegidas: inicia sesión en la app, copia el token y pégalo \
								en **Authorize**."""))
				.components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
						.type(SecurityScheme.Type.HTTP)
						.scheme("bearer")
						.bearerFormat("JWT")
						.description("El mismo token que devuelve POST /api/auth/login")));
	}
}
