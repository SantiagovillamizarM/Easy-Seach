package com.easysearch.gateway.asistente;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Llama al flujo 2 de n8n (asistente RAG). Solo Spring Boot habla con n8n: el navegador nunca lo ve.
 */
@Component
public class N8nCliente {

	static final String WEBHOOK = "/webhook/easysearch/asistente";

	/** Lo que se envía al flujo. */
	public record PeticionRag(@JsonProperty("consulta_id") Integer consultaId, String pregunta, BigDecimal umbral,
			@JsonProperty("max_fuentes") int maxFuentes) {
	}

	/** Lo que responde el flujo (los campos que no apliquen al estado llegan en null). */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record ResultadoRag(String estado, String respuesta, List<String> pasos, List<FuenteRag> fuentes,
			@JsonProperty("mejor_similitud") BigDecimal mejorSimilitud, String modelo, String motivo,
			String detalle) {
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record FuenteRag(@JsonProperty("establecimiento_id") Integer establecimientoId, String nombre,
			BigDecimal similitud) {
	}

	/** n8n no respondió, tardó demasiado o devolvió algo que no se entiende. */
	public static class N8nNoDisponible extends RuntimeException {
		public N8nNoDisponible(String mensaje, Throwable causa) {
			super(mensaje, causa);
		}
	}

	private final RestClient restClient;
	private final AsistenteProperties properties;

	public N8nCliente(AsistenteProperties properties) {
		this.properties = properties;
		HttpClient httpClient = HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)
				.connectTimeout(Duration.ofSeconds(5))
				.build();
		var factory = new JdkClientHttpRequestFactory(httpClient);
		factory.setReadTimeout(properties.timeout());
		this.restClient = RestClient.builder().baseUrl(properties.n8nUrl().toString()).requestFactory(factory).build();
	}

	public ResultadoRag consultar(PeticionRag peticion) {
		try {
			ResultadoRag resultado = restClient.post()
					.uri(WEBHOOK)
					.header("X-N8N-Key", properties.n8nWebhookKey())
					.contentType(MediaType.APPLICATION_JSON)
					.body(peticion)
					.retrieve()
					.body(ResultadoRag.class);
			if (resultado == null || resultado.estado() == null) {
				throw new N8nNoDisponible("n8n respondió sin estado", null);
			}
			return resultado;
		}
		catch (RestClientException ex) {
			throw new N8nNoDisponible("n8n no respondió correctamente: " + ex.getClass().getSimpleName(), ex);
		}
	}
}
