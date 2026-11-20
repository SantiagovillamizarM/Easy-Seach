package com.easysearch.gateway.proxy;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertySource;

import com.sun.net.httpserver.HttpServer;

/**
 * Pruebas del reenvío a FastAPI con un servidor HTTP real (Tomcat) y un "FastAPI falso" que registra lo que
 * recibe. Así se prueba el comportamiento real: cuerpos de formulario, cabeceras y errores de conexión.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class FastApiProxyControllerTests {

	/** Última petición que recibió el FastAPI falso. */
	static final Map<String, String> received = new ConcurrentHashMap<>();
	static final HttpServer fakeFastApi = startFakeFastApi();

	@Value("${local.server.port}")
	int port;

	final HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("easysearch.fastapi-url", () -> "http://127.0.0.1:" + fakeFastApi.getAddress().getPort());
		registry.add("easysearch.max-body-bytes", () -> "1000");
		registry.add("easysearch.cors-origins", () -> "http://127.0.0.1:5173");
	}

	@AfterAll
	static void stop() {
		fakeFastApi.stop(0);
	}

	@BeforeEach
	void clear() {
		received.clear();
	}

	@Test
	void reenviaMetodoRutaConsultaCuerpoYCabeceras() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/api/search?q=pizza%20barata&page=2"))
				.header("Authorization", "Bearer abc")
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString("{\"texto\":\"pizza\"}")));

		assertThat(received).containsEntry("method", "POST")
				.containsEntry("path", "/api/search")
				.containsEntry("query", "q=pizza%20barata&page=2")
				.containsEntry("body", "{\"texto\":\"pizza\"}")
				.containsEntry("authorization", "Bearer abc");
		assertThat(response.statusCode()).isEqualTo(429);
		assertThat(response.body()).isEqualTo("{\"detail\":\"lento\"}");
		// Cabeceras que el frontend necesita leer
		assertThat(response.headers().firstValue("Retry-After")).hasValue("30");
		assertThat(response.headers().firstValue("X-Error-Code")).hasValue("guest_limit");
		// El "Access-Control-Allow-Origin: *" de FastAPI no debe llegar al navegador
		assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
	}

	@Test
	void reenviaFormularioDeLoginSinAlterarlo() throws Exception {
		send(HttpRequest.newBuilder(url("/api/auth/login"))
				.header("Content-Type", "application/x-www-form-urlencoded")
				.POST(HttpRequest.BodyPublishers.ofString("username=ana%40correo.com&password=clave+123")));

		assertThat(received).containsEntry("body", "username=ana%40correo.com&password=clave+123")
				.containsEntry("content-type", "application/x-www-form-urlencoded");
	}

	@Test
	void reemplazaLaIpFalsificadaPorLaIpReal() throws Exception {
		send(HttpRequest.newBuilder(url("/api/health")).header("X-Forwarded-For", "1.2.3.4").GET());

		assertThat(received).containsEntry("x-forwarded-for", "127.0.0.1");
	}

	@Test
	void rechazaCuerposDemasiadoGrandesSinLlamarAFastApi() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/api/owner/photos"))
				.POST(HttpRequest.BodyPublishers.ofString("x".repeat(1001))));

		assertThat(response.statusCode()).isEqualTo(413);
		assertThat(response.body()).contains("demasiado grande");
		assertThat(received).isEmpty();
	}

	@Test
	void convierteRedireccionesInternasEnRutasRelativas() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/api/redirige")).GET());

		assertThat(response.statusCode()).isEqualTo(307);
		assertThat(response.headers().firstValue("Location")).hasValue("/api/destino/?a=1");
	}

	@Test
	void unTokenInvalidoEnRutasDeFastApiLoDecideFastApi() throws Exception {
		// Spring no valida tokens en lo que reenvía: FastAPI aplica sus propias reglas (rutas públicas incluidas)
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/api/search"))
				.header("Authorization", "Bearer token-vencido-o-falso").GET());

		assertThat(received).containsEntry("authorization", "Bearer token-vencido-o-falso");
		assertThat(response.statusCode()).isEqualTo(429); // la respuesta del FastAPI falso, no un 401 de Spring
	}

	@Test
	void lasRutasDeSpringNuncaSeReenvian() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/api/sistema/no-existe"))
				.header("Authorization", "Bearer x").GET());

		assertThat(response.statusCode()).isEqualTo(401); // la seguridad de Spring responde primero
		assertThat(received).isEmpty();
	}

	@Test
	void reenviaLaEspecificacionOpenApiDeFastApi() throws Exception {
		send(HttpRequest.newBuilder(url("/openapi.json")).GET());

		assertThat(received).containsEntry("path", "/openapi.json");
	}

	@Test
	void reenviaFotosSubidas() throws Exception {
		HttpResponse<String> response = send(HttpRequest.newBuilder(url("/uploads/1/foto.webp")).GET());

		assertThat(received).containsEntry("path", "/uploads/1/foto.webp");
		assertThat(response.statusCode()).isEqualTo(429); // el FastAPI falso responde igual a todo
	}

	@Test
	void respondeCorsSoloAlFrontendAutorizado() throws Exception {
		HttpResponse<String> allowed = send(HttpRequest.newBuilder(url("/api/search"))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
				.header("Origin", "http://127.0.0.1:5173")
				.header("Access-Control-Request-Method", "POST"));
		HttpResponse<String> denied = send(HttpRequest.newBuilder(url("/api/search"))
				.method("OPTIONS", HttpRequest.BodyPublishers.noBody())
				.header("Origin", "https://sitio-malicioso.com")
				.header("Access-Control-Request-Method", "POST"));

		assertThat(allowed.statusCode()).isEqualTo(200);
		assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).hasValue("http://127.0.0.1:5173");
		assertThat(denied.statusCode()).isEqualTo(403);
		assertThat(received).isEmpty(); // las verificaciones CORS no llegan a FastAPI
	}

	@Test
	void respondeErrorClaroSiFastApiEstaApagado() throws Exception {
		int closedPort;
		try (ServerSocket socket = new ServerSocket(0)) {
			closedPort = socket.getLocalPort();
		}
		var controller = new FastApiProxyController(new com.easysearch.gateway.config.GatewayProperties(
				URI.create("http://127.0.0.1:" + closedPort), java.time.Duration.ofSeconds(2), 1000,
				java.util.List.of(), "no-se-usa"));
		var request = new org.springframework.mock.web.MockHttpServletRequest("GET", "/api/health");

		var response = controller.forward(request);

		assertThat(response.getStatusCode().value()).isEqualTo(502);
		assertThat(new String(response.getBody(), StandardCharsets.UTF_8)).contains("no está disponible");
	}

	private URI url(String path) {
		return URI.create("http://127.0.0.1:" + port + path);
	}

	private HttpResponse<String> send(HttpRequest.Builder builder) throws IOException, InterruptedException {
		return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
	}

	private static HttpServer startFakeFastApi() {
		try {
			HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			server.createContext("/", exchange -> {
				var uri = exchange.getRequestURI();
				received.put("method", exchange.getRequestMethod());
				received.put("path", uri.getRawPath());
				if (uri.getRawQuery() != null) {
					received.put("query", uri.getRawQuery());
				}
				received.put("body", new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
				exchange.getRequestHeaders().forEach((name, values) ->
						received.put(name.toLowerCase(), String.join(",", values)));

				if (uri.getPath().equals("/api/redirige")) {
					exchange.getResponseHeaders().add("Location",
							"http://127.0.0.1:" + exchange.getLocalAddress().getPort() + "/api/destino/?a=1");
					exchange.sendResponseHeaders(307, -1);
				}
				else {
					byte[] body = "{\"detail\":\"lento\"}".getBytes(StandardCharsets.UTF_8);
					exchange.getResponseHeaders().add("Content-Type", "application/json");
					exchange.getResponseHeaders().add("Retry-After", "30");
					exchange.getResponseHeaders().add("X-Error-Code", "guest_limit");
					exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*"); // debe descartarse
					exchange.sendResponseHeaders(429, body.length);
					exchange.getResponseBody().write(body);
				}
				exchange.close();
			});
			server.start();
			return server;
		}
		catch (IOException ex) {
			throw new IllegalStateException(ex);
		}
	}
}
