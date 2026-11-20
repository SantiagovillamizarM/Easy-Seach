package com.easysearch.gateway.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS: lo resuelve la puerta de entrada (no FastAPI), porque es lo único que el navegador ve.
 * Las mismas reglas que tenía FastAPI: sin cookies (la sesión viaja en la cabecera Authorization) y solo
 * los métodos y cabeceras que usa el frontend.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

	private final GatewayProperties properties;

	public WebConfig(GatewayProperties properties) {
		this.properties = properties;
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/**")
				.allowedOrigins(properties.corsOrigins().toArray(String[]::new))
				.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
				.allowedHeaders("Authorization", "Content-Type", "Accept")
				.exposedHeaders("X-Error-Code", "Retry-After")
				.allowCredentials(false);
	}
}
