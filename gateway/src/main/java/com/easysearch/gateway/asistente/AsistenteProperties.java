package com.easysearch.gateway.asistente;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuración del asistente (prefijo {@code easysearch.asistente.}).
 *
 * @param n8nUrl            dirección de n8n (los webhooks cuelgan de /webhook/...)
 * @param n8nWebhookKey     clave que exige el webhook de n8n (cabecera X-N8N-Key)
 * @param umbral            similitud mínima para que un negocio cuente como fuente (calibrada, ver AVANCE.md)
 * @param maxFuentes        cuántos negocios recupera la búsqueda semántica como máximo
 * @param timeout           tiempo máximo esperando la respuesta de n8n
 * @param consultasPorHora  límite por usuario (protege la cuota de Gemini)
 */
@ConfigurationProperties("easysearch.asistente")
public record AsistenteProperties(URI n8nUrl, String n8nWebhookKey, BigDecimal umbral, int maxFuentes,
		Duration timeout, int consultasPorHora) {

	@Override
	public String toString() {
		return "AsistenteProperties[n8nUrl=" + n8nUrl + ", umbral=" + umbral + ", maxFuentes=" + maxFuentes
				+ ", timeout=" + timeout + ", consultasPorHora=" + consultasPorHora + ", n8nWebhookKey=***]";
	}
}
