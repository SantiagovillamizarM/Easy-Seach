package com.easysearch.gateway.asistente;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.easysearch.gateway.asistente.AsistenteDtos.CalificacionDto;
import com.easysearch.gateway.asistente.AsistenteDtos.ConsultaDto;
import com.easysearch.gateway.asistente.AsistenteDtos.FuenteDto;
import com.easysearch.gateway.asistente.AsistenteDtos.PaginaDto;
import com.easysearch.gateway.asistente.AsistenteDtos.RespuestaDto;
import com.easysearch.gateway.asistente.N8nCliente.FuenteRag;
import com.easysearch.gateway.asistente.N8nCliente.N8nNoDisponible;
import com.easysearch.gateway.asistente.N8nCliente.PeticionRag;
import com.easysearch.gateway.asistente.N8nCliente.ResultadoRag;
import com.easysearch.gateway.seguridad.UsuarioAutenticado;
import com.easysearch.gateway.usuario.UsuarioRepository;

/**
 * Reglas del asistente con IA.
 *
 * <ol>
 * <li>Una pregunta vacía no llega a n8n (422).</li>
 * <li>La consulta se guarda como PENDIENTE <b>antes</b> de llamar a n8n: si algo falla, queda registro.</li>
 * <li>n8n busca en pgvector y responde con Gemini usando solo las fuentes recuperadas.</li>
 * <li>Spring vuelve a comprobar cada fuente: debe existir en la base y estar activa. Si ninguna sirve, la
 * consulta queda SIN_RESULTADOS (nunca se guarda una respuesta sin respaldo).</li>
 * <li>Si n8n, los embeddings o Gemini fallan, la consulta queda en ERROR con un mensaje claro.</li>
 * </ol>
 */
@Service
public class AsistenteService {

	private static final Logger log = LoggerFactory.getLogger(AsistenteService.class);

	static final String MENSAJE_SIN_RESULTADOS = "No encontré información suficiente en Easy Search para responder "
			+ "tu pregunta. Intenta con otras palabras o usa el buscador.";
	static final String MENSAJE_ERROR = "El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.";
	private static final int MAX_TAMANO_PAGINA = 50;

	private final ConsultaIARepository consultas;
	private final EstablecimientoRepository establecimientos;
	private final UsuarioRepository usuarios;
	private final N8nCliente n8n;
	private final AsistenteProperties properties;
	private final TransactionTemplate transaccion;

	public AsistenteService(ConsultaIARepository consultas, EstablecimientoRepository establecimientos,
			UsuarioRepository usuarios, N8nCliente n8n, AsistenteProperties properties,
			TransactionTemplate transaccion) {
		this.consultas = consultas;
		this.establecimientos = establecimientos;
		this.usuarios = usuarios;
		this.n8n = n8n;
		this.properties = properties;
		this.transaccion = transaccion;
	}

	// ------------------------------------------------------------------------------------------ preguntar

	public ConsultaDto preguntar(UsuarioAutenticado usuario, String preguntaRecibida) {
		String pregunta = preguntaRecibida == null ? "" : preguntaRecibida.strip().replaceAll("\\s+", " ");
		if (pregunta.length() < 3) {
			throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT,
					"Escribe tu pregunta (mínimo 3 caracteres).");
		}
		long recientes = consultas.countByUsuarioIdAndCreadaEnAfter(usuario.id(), Instant.now().minus(Duration.ofHours(1)));
		if (recientes >= properties.consultasPorHora()) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Llegaste al límite de "
					+ properties.consultasPorHora() + " preguntas por hora. Intenta de nuevo más tarde.");
		}

		// 1) Se guarda PENDIENTE en su propia transacción (queda registro aunque n8n falle o tarde)
		Integer consultaId = transaccion.execute(tx -> consultas.save(
				new ConsultaIA(usuarios.getReferenceById(usuario.id()), pregunta, properties.umbral())).getId());

		// 2) n8n (fuera de transacción: no se mantiene una conexión a la base abierta mientras responde la IA)
		long inicio = System.nanoTime();
		ResultadoRag resultado;
		try {
			resultado = n8n.consultar(new PeticionRag(consultaId, pregunta, properties.umbral(), properties.maxFuentes()));
		}
		catch (N8nNoDisponible ex) {
			log.error("Consulta {}: {}", consultaId, ex.getMessage());
			resultado = new ResultadoRag("ERROR", null, null, null, null, null, null, MENSAJE_ERROR);
		}
		int duracionMs = (int) ((System.nanoTime() - inicio) / 1_000_000);

		// 3) Se guarda el resultado
		ResultadoRag finalResultado = resultado;
		return transaccion.execute(tx -> aDto(guardarResultado(consultaId, finalResultado, duracionMs)));
	}

	private ConsultaIA guardarResultado(Integer consultaId, ResultadoRag r, int duracionMs) {
		ConsultaIA consulta = consultas.findById(consultaId).orElseThrow();
		switch (r.estado()) {
			case "RESPONDIDA" -> guardarRespondida(consulta, r, duracionMs);
			case "SIN_RESULTADOS" -> guardarSinResultados(consulta, r.mejorSimilitud(), duracionMs);
			default -> {
				String detalle = r.detalle() != null ? recortar(r.detalle(), 300) : MENSAJE_ERROR;
				consulta.finalizar(EstadoConsulta.ERROR, r.mejorSimilitud(), duracionMs, detalle);
			}
		}
		return consulta;
	}

	private void guardarRespondida(ConsultaIA consulta, ResultadoRag r, int duracionMs) {
		List<FuenteRag> recibidas = r.fuentes() == null ? List.of() : r.fuentes();
		// Regla de negocio: cada fuente debe existir en la base relacional y estar ACTIVA en este momento
		Map<Integer, Establecimiento> validos = establecimientos
				.findAllById(recibidas.stream().map(FuenteRag::establecimientoId).filter(id -> id != null).toList())
				.stream().filter(Establecimiento::isActivo)
				.collect(Collectors.toMap(Establecimiento::getId, Function.identity()));

		List<FuenteRag> fuentes = new ArrayList<>();
		for (FuenteRag f : recibidas) {
			boolean repetida = fuentes.stream().anyMatch(x -> x.establecimientoId().equals(f.establecimientoId()));
			if (validos.containsKey(f.establecimientoId()) && f.similitud() != null && !repetida) {
				fuentes.add(f);
			}
		}
		if (fuentes.isEmpty() || r.respuesta() == null || r.respuesta().isBlank()) {
			log.warn("Consulta {}: n8n respondió sin fuentes válidas; se guarda como SIN_RESULTADOS", consulta.getId());
			guardarSinResultados(consulta, r.mejorSimilitud(), duracionMs);
			return;
		}

		List<String> pasos = r.pasos() == null ? List.of()
				: r.pasos().stream().filter(p -> p != null && !p.isBlank()).map(p -> recortar(p.strip(), 500)).limit(6).toList();
		var respuesta = new RespuestaIA(consulta, r.respuesta().strip(), pasos, recortar(r.modelo(), 60));
		// Posición 1 = la más parecida a la pregunta (n8n las devuelve en el orden en que Gemini las citó)
		fuentes.sort(java.util.Comparator.comparing(FuenteRag::similitud).reversed());
		for (FuenteRag f : fuentes.stream().limit(properties.maxFuentes()).toList()) {
			respuesta.agregarFuente(validos.get(f.establecimientoId()), f.similitud());
		}
		consulta.asignarRespuesta(respuesta);
		consulta.finalizar(EstadoConsulta.RESPONDIDA, r.mejorSimilitud(), duracionMs, null);
	}

	/** Sin fuentes relevantes: se guarda un mensaje fijo (no generado por la IA), que también se puede calificar. */
	private void guardarSinResultados(ConsultaIA consulta, BigDecimal mejorSimilitud, int duracionMs) {
		consulta.asignarRespuesta(new RespuestaIA(consulta, MENSAJE_SIN_RESULTADOS, List.of(), null));
		consulta.finalizar(EstadoConsulta.SIN_RESULTADOS, mejorSimilitud, duracionMs, null);
	}

	// ------------------------------------------------------------------------------------------ historial

	@Transactional(readOnly = true)
	public PaginaDto<ConsultaDto> historial(UsuarioAutenticado usuario, int pagina, int tamano) {
		int p = Math.max(pagina, 1);
		int t = Math.min(Math.max(tamano, 1), MAX_TAMANO_PAGINA);
		Page<ConsultaIA> page = consultas.findByUsuarioIdOrderByCreadaEnDescIdDesc(usuario.id(), PageRequest.of(p - 1, t));
		return new PaginaDto<>(page.getTotalElements(), p, t, page.getContent().stream().map(this::aDto).toList());
	}

	@Transactional(readOnly = true)
	public ConsultaDto detalle(UsuarioAutenticado usuario, Integer id) {
		return aDto(propia(usuario, id));
	}

	// ------------------------------------------------------------------------------------------ calificar

	@Transactional
	public ConsultaDto calificar(UsuarioAutenticado usuario, Integer id, int puntuacion, String comentario) {
		ConsultaIA consulta = propia(usuario, id);
		if (consulta.getRespuesta() == null) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"Esta consulta no tiene respuesta para calificar (estado " + consulta.getEstado() + ").");
		}
		String limpio = comentario == null || comentario.isBlank() ? null : comentario.strip();
		consulta.getRespuesta().calificar(puntuacion, limpio);
		consultas.flush();
		return aDto(consulta);
	}

	// ------------------------------------------------------------------------------------------ utilidades

	private ConsultaIA propia(UsuarioAutenticado usuario, Integer id) {
		return consultas.findByIdAndUsuarioId(id, usuario.id())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Consulta no encontrada"));
	}

	private ConsultaDto aDto(ConsultaIA c) {
		RespuestaIA r = c.getRespuesta();
		RespuestaDto respuesta = null;
		if (r != null) {
			List<FuenteDto> fuentes = r.getFuentes().stream().map(f -> new FuenteDto(
					f.getEstablecimiento() != null ? f.getEstablecimiento().getId() : null,
					f.getNombreEstablecimiento(),
					f.getEstablecimiento() != null ? f.getEstablecimiento().getSlug() : null,
					f.getSimilitud(), f.getPosicion())).toList();
			Calificacion cal = r.getCalificacion();
			respuesta = new RespuestaDto(r.getRespuesta(), List.copyOf(r.getPasos()), r.getModelo(), fuentes,
					cal == null ? null : new CalificacionDto(cal.getPuntuacion(), cal.getComentario(), cal.getActualizadaEn()));
		}
		return new ConsultaDto(c.getId(), c.getPregunta(), c.getEstado(), c.getCreadaEn(), c.getRespondidaEn(),
				c.getDuracionMs(), c.getUmbral(), c.getMejorSimilitud(), c.getDetalleError(), respuesta);
	}

	private static String recortar(String texto, int max) {
		return texto == null || texto.length() <= max ? texto : texto.substring(0, max);
	}
}
