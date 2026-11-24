package com.easysearch.gateway.asistente;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

import jakarta.persistence.EntityManager;

/**
 * Pruebas funcionales del asistente contra la base de pruebas real (JPA, restricciones e índices de verdad) y un
 * n8n falso al que cada prueba le dice qué responder. Cubre las pruebas obligatorias del enunciado: pregunta
 * vacía, fuentes desactivadas, sin información suficiente, fallo de servicios, historial y calificación.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("it")
@Transactional
class AsistenteIntegracionTests {

	/** Lo que responderá el n8n falso: código HTTP y cuerpo. */
	static final AtomicReference<String> respuestaN8n = new AtomicReference<>();
	static final AtomicInteger codigoN8n = new AtomicInteger(200);
	static final AtomicInteger llamadasN8n = new AtomicInteger();
	static final Map<String, String> recibido = new ConcurrentHashMap<>();
	static final HttpServer n8nFalso = iniciarN8nFalso();

	@DynamicPropertySource
	static void propiedades(DynamicPropertyRegistry registry) {
		registry.add("easysearch.asistente.n8n-url", () -> "http://127.0.0.1:" + n8nFalso.getAddress().getPort());
	}

	@AfterAll
	static void detener() {
		n8nFalso.stop(0);
	}

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;
	@Autowired
	EntityManager em;
	@Value("${easysearch.jwt-secret}")
	String claveJwt;

	int ana;
	int beto;
	int activo1;
	int activo2;
	int oculto;

	@BeforeEach
	void datos() {
		Integer tablas = jdbc.queryForObject(
				"SELECT count(*) FROM information_schema.tables WHERE table_name = 'consultas_ia'", Integer.class);
		assertThat(tablas).as("La base de pruebas no tiene las tablas del asistente. Ejecuta las pruebas de FastAPI "
				+ "(cd backend; .\\.venv\\Scripts\\python -m pytest), que la migran.").isEqualTo(1);

		ana = usuario("ana.asistente@test.com");
		beto = usuario("beto.asistente@test.com");
		activo1 = negocio("Arepas La Esquina", "active");
		activo2 = negocio("Corrientazo Don Pepe", "active");
		oculto = negocio("Negocio Desactivado", "hidden");
		respuestaN8n.set(null);
		codigoN8n.set(200);
		llamadasN8n.set(0);
		recibido.clear();
	}

	// ============================================================== 1. Pregunta vacía: no se ejecuta el flujo

	@Test
	void preguntaVaciaNoLlegaAN8nNiSeGuarda() throws Exception {
		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"   \"}"))
				.andExpect(status().isUnprocessableContent())
				.andExpect(jsonPath("$.detail").value("Escribe tu pregunta (mínimo 3 caracteres)."));
		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{}"))
				.andExpect(status().isUnprocessableContent());

		assertThat(llamadasN8n.get()).isZero();
		assertThat(contar("consultas_ia")).isZero();
	}

	// ============================================================== 2. Respuesta con fuentes y similitudes

	@Test
	void respuestaConFuentesSeGuardaCompletaYEnviaLoCorrectoAN8n() throws Exception {
		respuestaN8n.set("""
				{"estado":"RESPONDIDA","respuesta":"Puedes almorzar en Corrientazo Don Pepe o en Arepas La Esquina.",
				 "pasos":["Revisa primero Corrientazo Don Pepe.","Confirma el precio del día."],
				 "fuentes":[{"establecimiento_id":%d,"nombre":"Arepas La Esquina","similitud":0.8412},
				            {"establecimiento_id":%d,"nombre":"Corrientazo Don Pepe","similitud":0.8601}],
				 "mejor_similitud":0.8601,"modelo":"gemini-2.5-flash-lite"}""".formatted(activo1, activo2));

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"  ¿Dónde almuerzo   barato? \"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.estado").value("RESPONDIDA"))
				.andExpect(jsonPath("$.pregunta").value("¿Dónde almuerzo barato?"))
				.andExpect(jsonPath("$.umbral").value(0.82))
				.andExpect(jsonPath("$.mejorSimilitud").value(0.8601))
				.andExpect(jsonPath("$.respuesta.pasos.length()").value(2))
				.andExpect(jsonPath("$.respuesta.fuentes[0].nombre").value("Corrientazo Don Pepe"))
				.andExpect(jsonPath("$.respuesta.fuentes[0].similitud").value(0.8601))
				.andExpect(jsonPath("$.respuesta.fuentes[0].posicion").value(1))
				.andExpect(jsonPath("$.respuesta.fuentes[1].establecimientoId").value(activo1));

		// (n8n las mandó en otro orden: se guardan de mayor a menor similitud)
		// Lo que recibió n8n: pregunta limpia, umbral configurado y la clave del webhook
		assertThat(recibido.get("x-n8n-key")).isEqualTo("clave-webhook-de-pruebas");
		assertThat(recibido.get("body")).contains("\"pregunta\":\"¿Dónde almuerzo barato?\"")
				.contains("\"umbral\":0.82").contains("\"max_fuentes\":5");

		em.flush();
		assertThat(jdbc.queryForList("SELECT similitud, posicion FROM fuentes_respuesta ORDER BY posicion"))
				.extracting(f -> f.get("similitud").toString()).containsExactly("0.8601", "0.8412");
		assertThat(jdbc.queryForObject("SELECT array_length(pasos, 1) FROM respuestas_ia", Integer.class)).isEqualTo(2);
	}

	// ============================================================== 3. Artículo desactivado: nunca es fuente

	@Test
	void unNegocioDesactivadoNoSeGuardaComoFuente() throws Exception {
		respuestaN8n.set(respuestaCon(oculto, activo1));

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"arepas\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.estado").value("RESPONDIDA"))
				.andExpect(jsonPath("$.respuesta.fuentes.length()").value(1))
				.andExpect(jsonPath("$.respuesta.fuentes[0].establecimientoId").value(activo1));
	}

	@Test
	void siTodasLasFuentesEstanDesactivadasOnoExistenQuedaSinResultados() throws Exception {
		respuestaN8n.set(respuestaCon(oculto, 999_999));

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"arepas\"}"))
				.andExpect(jsonPath("$.estado").value("SIN_RESULTADOS"))
				.andExpect(jsonPath("$.respuesta.texto").value(AsistenteService.MENSAJE_SIN_RESULTADOS))
				.andExpect(jsonPath("$.respuesta.fuentes.length()").value(0));
	}

	// ============================================================== 4. Sin información suficiente: no inventa

	@Test
	void sinFuentesRelevantesNoSeInventaUnaRespuesta() throws Exception {
		respuestaN8n.set("{\"estado\":\"SIN_RESULTADOS\",\"motivo\":\"Ningún negocio supera el umbral\",\"mejor_similitud\":0.8129}");

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"¿Cómo configuro mi router?\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.estado").value("SIN_RESULTADOS"))
				.andExpect(jsonPath("$.mejorSimilitud").value(0.8129))
				.andExpect(jsonPath("$.respuesta.texto").value(AsistenteService.MENSAJE_SIN_RESULTADOS))
				.andExpect(jsonPath("$.respuesta.pasos.length()").value(0));
	}

	// ============================================================== 5. Fallo en servicios: estado ERROR

	@Test
	void fallaDeEmbeddingsInformadaPorN8nQuedaEnError() throws Exception {
		respuestaN8n.set("{\"estado\":\"ERROR\",\"detalle\":\"El servicio de embeddings no respondió\"}");

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"pizza\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.estado").value("ERROR"))
				.andExpect(jsonPath("$.detalleError").value("El servicio de embeddings no respondió"))
				.andExpect(jsonPath("$.respuesta").doesNotExist());
	}

	@Test
	void n8nCaidoOConErrorInternoQuedaEnErrorYSeConservaLaConsulta() throws Exception {
		codigoN8n.set(500);
		respuestaN8n.set("{\"message\":\"Error in workflow\"}");

		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"pizza\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.estado").value("ERROR"))
				.andExpect(jsonPath("$.detalleError").value(AsistenteService.MENSAJE_ERROR));
		em.flush();
		assertThat(jdbc.queryForObject("SELECT estado FROM consultas_ia", String.class)).isEqualTo("ERROR");
	}

	// ============================================================== 6. Historial

	@Test
	void historialSoloMuestraMisConsultasDeLaMasRecienteALaMasAntigua() throws Exception {
		respuestaN8n.set(respuestaCon(activo1));
		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"primera pregunta\"}"));
		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"segunda pregunta\"}"));
		mvc.perform(como(beto, post("/api/asistente/consultas")).content("{\"pregunta\":\"pregunta de beto\"}"));

		mvc.perform(como(ana, get("/api/asistente/consultas")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(2))
				.andExpect(jsonPath("$.items[0].pregunta").value("segunda pregunta"))
				.andExpect(jsonPath("$.items[1].pregunta").value("primera pregunta"))
				.andExpect(jsonPath("$.items[0].respuesta.fuentes[0].similitud").exists());
	}

	@Test
	void nadiePuedeVerLaConsultaDeOtro() throws Exception {
		respuestaN8n.set(respuestaCon(activo1));
		int id = crearConsulta(ana, "pregunta privada");

		mvc.perform(como(beto, get("/api/asistente/consultas/" + id))).andExpect(status().isNotFound());
		mvc.perform(como(ana, get("/api/asistente/consultas/" + id))).andExpect(status().isOk());
	}

	// ============================================================== 7. Calificación

	@Test
	void calificarGuardaLaPuntuacionYSePuedeCambiar() throws Exception {
		respuestaN8n.set(respuestaCon(activo1));
		int id = crearConsulta(ana, "arepas");

		mvc.perform(como(ana, put("/api/asistente/consultas/" + id + "/calificacion"))
				.content("{\"puntuacion\":4,\"comentario\":\"Útil\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.respuesta.calificacion.puntuacion").value(4));
		mvc.perform(como(ana, put("/api/asistente/consultas/" + id + "/calificacion")).content("{\"puntuacion\":5}"))
				.andExpect(jsonPath("$.respuesta.calificacion.puntuacion").value(5))
				.andExpect(jsonPath("$.respuesta.calificacion.comentario").doesNotExist());

		em.flush();
		assertThat(jdbc.queryForObject("SELECT puntuacion FROM calificaciones", Integer.class)).isEqualTo(5);
		assertThat(contar("calificaciones")).isEqualTo(1);   // se actualiza, no se duplica
	}

	@Test
	void calificacionFueraDeRangoOAjenaOSinRespuestaSeRechaza() throws Exception {
		respuestaN8n.set(respuestaCon(activo1));
		int id = crearConsulta(ana, "arepas");
		mvc.perform(como(ana, put("/api/asistente/consultas/" + id + "/calificacion")).content("{\"puntuacion\":6}"))
				.andExpect(status().isUnprocessableContent());
		mvc.perform(como(ana, put("/api/asistente/consultas/" + id + "/calificacion")).content("{\"puntuacion\":0}"))
				.andExpect(status().isUnprocessableContent());
		mvc.perform(como(beto, put("/api/asistente/consultas/" + id + "/calificacion")).content("{\"puntuacion\":3}"))
				.andExpect(status().isNotFound());

		respuestaN8n.set("{\"estado\":\"ERROR\",\"detalle\":\"Gemini no respondió\"}");
		int conError = crearConsulta(ana, "pizza");
		mvc.perform(como(ana, put("/api/asistente/consultas/" + conError + "/calificacion")).content("{\"puntuacion\":3}"))
				.andExpect(status().isConflict());
	}

	// ============================================================== 8. Límite de uso

	@Test
	void limiteDePreguntasPorHora() throws Exception {
		for (int i = 0; i < 3; i++) {
			jdbc.update("INSERT INTO consultas_ia (usuario_id, pregunta, estado, umbral) VALUES (?, 'anterior', 'RESPONDIDA', 0.82)", ana);
		}
		mvc.perform(como(ana, post("/api/asistente/consultas")).content("{\"pregunta\":\"una más\"}"))
				.andExpect(status().isTooManyRequests());
		assertThat(llamadasN8n.get()).isZero();
	}

	// ============================================================== 9. Cupo diario de OpenAI (de pago)

	@Test
	void cupoDiarioDeOpenAIPasaAGeminiAlAgotarse() throws Exception {
		respuestaN8n.set(respuestaCon(activo1));
		// Sin consultas hoy: n8n puede usar OpenAI
		crearConsulta(ana, "primera");
		assertThat(recibido.get("body")).contains("\"permitir_openai\":true");

		// Dos respuestas de hoy hechas con OpenAI (el cupo de pruebas es 2) y una de Gemini, que no cuenta
		respuestaHoy(ana, "gpt-4.1-mini-2025-04-14");
		respuestaHoy(ana, "gpt-4.1-mini-2025-04-14");
		respuestaHoy(beto, "gpt-4.1-mini-2025-04-14");   // las de otro usuario no cuentan
		crearConsulta(beto, "de beto");
		assertThat(recibido.get("body")).contains("\"permitir_openai\":true");
		crearConsulta(ana, "segunda");
		assertThat(recibido.get("body")).contains("\"permitir_openai\":false");
	}

	/** Una consulta de hoy ya respondida por el modelo dado (fuera de la última hora: no afecta el límite por hora). */
	private void respuestaHoy(int usuario, String modelo) {
		Integer consulta = jdbc.queryForObject("""
				INSERT INTO consultas_ia (usuario_id, pregunta, estado, umbral, creada_en)
				VALUES (?, 'anterior', 'RESPONDIDA', 0.82, greatest(now() - interval '61 minutes',
				        date_trunc('day', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'))
				RETURNING id""", Integer.class, usuario);
		jdbc.update("INSERT INTO respuestas_ia (consulta_id, respuesta, modelo) VALUES (?, 'texto', ?)", consulta, modelo);
	}

	// ============================================================== utilidades

	private int crearConsulta(int usuario, String pregunta) throws Exception {
		String json = mvc.perform(como(usuario, post("/api/asistente/consultas"))
				.content("{\"pregunta\":\"" + pregunta + "\"}"))
				.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		return Integer.parseInt(json.replaceAll("^\\{\"id\":(\\d+).*", "$1").trim());
	}

	private static String respuestaCon(int... ids) {
		StringBuilder fuentes = new StringBuilder();
		for (int i = 0; i < ids.length; i++) {
			fuentes.append(i == 0 ? "" : ",")
					.append("{\"establecimiento_id\":").append(ids[i]).append(",\"nombre\":\"x\",\"similitud\":0.85}");
		}
		return "{\"estado\":\"RESPONDIDA\",\"respuesta\":\"Te recomiendo estos lugares según tus datos.\","
				+ "\"pasos\":[\"Revisa la ficha.\"],\"fuentes\":[" + fuentes + "],\"mejor_similitud\":0.85}";
	}

	private MockHttpServletRequestBuilder como(int usuarioId, MockHttpServletRequestBuilder peticion) throws Exception {
		var claims = new JWTClaimsSet.Builder().subject(String.valueOf(usuarioId)).claim("role", "user")
				.issueTime(Date.from(Instant.now())).expirationTime(Date.from(Instant.now().plusSeconds(600))).build();
		var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
		jwt.sign(new MACSigner(claveJwt.getBytes(StandardCharsets.UTF_8)));
		return peticion.header("Authorization", "Bearer " + jwt.serialize()).contentType(MediaType.APPLICATION_JSON);
	}

	private int usuario(String email) {
		return jdbc.queryForObject("""
				INSERT INTO users (email, password_hash, full_name, role, email_verified_at)
				VALUES (?, 'no-se-usa', 'Prueba', 'user', now()) RETURNING id""", Integer.class, email);
	}

	private int negocio(String nombre, String estado) {
		return jdbc.queryForObject("""
				INSERT INTO establishments (name, slug, latitude, longitude, status)
				VALUES (?, ?, 7.1, -73.1, ?) RETURNING id""", Integer.class, nombre,
				nombre.toLowerCase().replace(' ', '-') + "-" + System.nanoTime(), estado);
	}

	private int contar(String tabla) {
		em.flush();
		return jdbc.queryForObject("SELECT count(*) FROM " + tabla, Integer.class);
	}

	private static HttpServer iniciarN8nFalso() {
		try {
			HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			server.createContext(N8nCliente.WEBHOOK, exchange -> {
				llamadasN8n.incrementAndGet();
				recibido.put("x-n8n-key", String.valueOf(exchange.getRequestHeaders().getFirst("X-N8N-Key")));
				recibido.put("body", new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
				byte[] cuerpo = String.valueOf(respuestaN8n.get()).getBytes(StandardCharsets.UTF_8);
				exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
				exchange.sendResponseHeaders(codigoN8n.get(), cuerpo.length);
				exchange.getResponseBody().write(cuerpo);
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
