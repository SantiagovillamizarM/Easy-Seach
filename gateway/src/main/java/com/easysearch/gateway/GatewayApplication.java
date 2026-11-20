package com.easysearch.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Puerta de entrada de Easy Search.
 *
 * <p>El frontend solo habla con esta aplicación. Lo que ya existía (búsqueda, cuentas, reseñas, paneles)
 * se reenvía al backend FastAPI; los módulos nuevos (asistente con IA y analítica) viven aquí.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class GatewayApplication {

	public static void main(String[] args) {
		SpringApplication.run(GatewayApplication.class, args);
	}

}
