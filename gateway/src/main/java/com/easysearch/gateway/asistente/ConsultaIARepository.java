package com.easysearch.gateway.asistente;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsultaIARepository extends JpaRepository<ConsultaIA, Integer> {

	/** Historial de un usuario, de la más reciente a la más antigua (usa el índice ix_consultas_ia_usuario_creada). */
	Page<ConsultaIA> findByUsuarioIdOrderByCreadaEnDescIdDesc(Integer usuarioId, Pageable pageable);

	/** Una consulta solo si pertenece al usuario (las de otros responden 404, no 403: no se revela que existen). */
	Optional<ConsultaIA> findByIdAndUsuarioId(Integer id, Integer usuarioId);

	long countByUsuarioIdAndCreadaEnAfter(Integer usuarioId, Instant desde);

	/**
	 * Preguntas de un usuario desde cierto momento que respondió OpenAI (de pago): todo modelo que no es
	 * Gemini. Las SIN_RESULTADOS y los errores no tienen modelo, así que no gastan cupo.
	 */
	@Query("select count(c) from ConsultaIA c join c.respuesta r where c.usuario.id = :usuarioId "
			+ "and c.creadaEn >= :desde and r.modelo is not null and lower(r.modelo) not like 'gemini%'")
	long contarRespondidasConOpenAI(@Param("usuarioId") Integer usuarioId, @Param("desde") Instant desde);
}
