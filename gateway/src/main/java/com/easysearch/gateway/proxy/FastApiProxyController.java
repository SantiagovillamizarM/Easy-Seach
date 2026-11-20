package com.easysearch.gateway.proxy;

import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.easysearch.gateway.config.GatewayProperties;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Reenvía al backend FastAPI toda petición de {@code /api/**} y {@code /uploads/**} que no atienda
 * otro controlador de Spring.
 *
 * <p>Spring elige siempre la ruta más específica: cuando se agregue, por ejemplo,
 * {@code @GetMapping("/api/asistente/consultas")}, esa ruta la responde Spring y todo lo demás sigue
 * llegando aquí. Por eso el frontend no tiene que saber qué backend atiende cada cosa.
 */
@RestController
public class FastApiProxyController {

	private static final Logger log = LoggerFactory.getLogger(FastApiProxyController.class);

	/**
	 * Cabeceras que no se copian de la petición del navegador hacia FastAPI.
	 * Las "hop-by-hop" solo valen para una conexión; Host y Content-Length los calcula el cliente HTTP;
	 * y las de reenvío (X-Forwarded-*) las pone esta clase, para que nadie pueda falsificar su IP.
	 */
	private static final Set<String> REQUEST_HEADERS_TO_SKIP = Set.of(
			"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer",
			"transfer-encoding", "upgrade", "host", "content-length", "expect",
			"forwarded", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port",
			"x-real-ip");

	/** Cabeceras de FastAPI que no se devuelven al navegador (CORS lo resuelve Spring). */
	private static final Set<String> RESPONSE_HEADERS_TO_SKIP = Set.of(
			"connection", "keep-alive", "proxy-authenticate", "te", "trailer", "transfer-encoding", "upgrade",
			"content-length", "date", "server");

	private final GatewayProperties properties;
	private final HttpClient httpClient;

	public FastApiProxyController(GatewayProperties properties) {
		this.properties = properties;
		this.httpClient = HttpClient.newBuilder()
				.version(HttpClient.Version.HTTP_1_1)          // uvicorn habla HTTP/1.1
				.connectTimeout(java.time.Duration.ofSeconds(5))
				.followRedirects(HttpClient.Redirect.NEVER)    // las redirecciones las sigue el navegador
				.build();
	}

	@RequestMapping({ "/api/**", "/uploads/**" })
	public ResponseEntity<byte[]> forward(HttpServletRequest request) throws IOException {
		long declaredLength = request.getContentLengthLong();
		if (declaredLength > properties.maxBodyBytes()) {
			return error(HttpStatus.CONTENT_TOO_LARGE, "La solicitud es demasiado grande.");
		}
		byte[] body = readBody(request.getInputStream());
		if (body.length > properties.maxBodyBytes()) {
			return error(HttpStatus.CONTENT_TOO_LARGE, "La solicitud es demasiado grande.");
		}

		HttpRequest upstreamRequest = buildUpstreamRequest(request, body);
		try {
			HttpResponse<byte[]> upstream = httpClient.send(upstreamRequest, HttpResponse.BodyHandlers.ofByteArray());
			return toResponse(upstream);
		}
		catch (HttpConnectTimeoutException | ConnectException ex) {
			log.error("FastAPI no responde en {}: {}", properties.fastapiUrl(), ex.toString());
			return error(HttpStatus.BAD_GATEWAY, "El servicio no está disponible en este momento. Intenta de nuevo.");
		}
		catch (HttpTimeoutException ex) {
			log.error("FastAPI tardó demasiado en {} {}", request.getMethod(), request.getRequestURI());
			return error(HttpStatus.GATEWAY_TIMEOUT, "El servicio tardó demasiado en responder. Intenta de nuevo.");
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			return error(HttpStatus.SERVICE_UNAVAILABLE, "El servidor se está reiniciando. Intenta de nuevo.");
		}
	}

	/** Lee el cuerpo sin pasar del límite: un cliente que miente en Content-Length no puede llenar la memoria. */
	private byte[] readBody(InputStream in) throws IOException {
		return in.readNBytes((int) Math.min(Integer.MAX_VALUE - 8, properties.maxBodyBytes() + 1));
	}

	private HttpRequest buildUpstreamRequest(HttpServletRequest request, byte[] body) {
		// getRequestURI() y getQueryString() vienen sin decodificar: se reenvían exactamente como llegaron
		String target = request.getRequestURI() + (request.getQueryString() != null ? "?" + request.getQueryString() : "");
		HttpRequest.Builder builder = HttpRequest.newBuilder(properties.fastapiUrl().resolve(target))
				.timeout(properties.fastapiTimeout())
				.method(request.getMethod(), body.length == 0
						? HttpRequest.BodyPublishers.noBody()
						: HttpRequest.BodyPublishers.ofByteArray(body));

		for (String name : Collections.list(request.getHeaderNames())) {
			if (REQUEST_HEADERS_TO_SKIP.contains(name.toLowerCase(Locale.ROOT))) {
				continue;
			}
			for (String value : Collections.list(request.getHeaders(name))) {
				builder.header(name, value);
			}
		}
		// IP real del cliente: FastAPI la usa para los límites de intentos. Uvicorn confía en esta cabecera
		// solo si la conexión viene de 127.0.0.1 (esta aplicación), así que un navegador no puede falsificarla.
		builder.header("X-Forwarded-For", request.getRemoteAddr());
		builder.header("X-Forwarded-Proto", request.getScheme());
		return builder.build();
	}

	private ResponseEntity<byte[]> toResponse(HttpResponse<byte[]> upstream) {
		HttpHeaders headers = new HttpHeaders();
		for (Map.Entry<String, List<String>> entry : upstream.headers().map().entrySet()) {
			String name = entry.getKey().toLowerCase(Locale.ROOT);
			if (name.startsWith(":") || RESPONSE_HEADERS_TO_SKIP.contains(name) || name.startsWith("access-control-")) {
				continue;
			}
			if (name.equals("location")) {
				headers.add(HttpHeaders.LOCATION, relativeLocation(entry.getValue().getFirst()));
				continue;
			}
			headers.addAll(entry.getKey(), entry.getValue());
		}
		return ResponseEntity.status(upstream.statusCode()).headers(headers).body(upstream.body());
	}

	/** Si FastAPI redirige a su propia dirección interna (http://127.0.0.1:8010/...), se deja solo la ruta. */
	private String relativeLocation(String location) {
		URI base = properties.fastapiUrl();
		URI uri = URI.create(location);
		if (uri.isAbsolute() && base.getHost().equalsIgnoreCase(uri.getHost()) && base.getPort() == uri.getPort()) {
			return uri.getRawPath() + (uri.getRawQuery() != null ? "?" + uri.getRawQuery() : "");
		}
		return location;
	}

	/** Mismo formato de error que FastAPI ({"detail": "..."}) para que el frontend lo muestre igual. */
	private static ResponseEntity<byte[]> error(HttpStatus status, String message) {
		String json = "{\"detail\":\"" + message.replace("\"", "\\\"") + "\"}";
		return ResponseEntity.status(status)
				.contentType(MediaType.APPLICATION_JSON)
				.body(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	}
}
