package com.easysearch.gateway.config;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuración propia de la puerta de entrada (prefijo {@code easysearch.} en application.properties).
 *
 * @param fastapiUrl     dirección del backend FastAPI, p. ej. http://127.0.0.1:8010
 * @param fastapiTimeout tiempo máximo de espera por una respuesta de FastAPI
 * @param maxBodyBytes   tamaño máximo del cuerpo de una petición (las fotos llegan hasta 5 MB)
 * @param corsOrigins    orígenes del navegador autorizados a llamar a la API
 * @param jwtSecret      clave con la que FastAPI firma los tokens (SECRET_KEY del .env)
 */
@ConfigurationProperties("easysearch")
public record GatewayProperties(URI fastapiUrl, Duration fastapiTimeout, long maxBodyBytes, List<String> corsOrigins,
		String jwtSecret) {

	/** Sin la clave: un record imprime todos sus campos y esta configuración podría terminar en un log. */
	@Override
	public String toString() {
		return "GatewayProperties[fastapiUrl=" + fastapiUrl + ", fastapiTimeout=" + fastapiTimeout
				+ ", maxBodyBytes=" + maxBodyBytes + ", corsOrigins=" + corsOrigins + ", jwtSecret=***]";
	}
}
