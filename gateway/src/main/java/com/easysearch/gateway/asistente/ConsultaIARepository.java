package com.easysearch.gateway.asistente;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsultaIARepository extends JpaRepository<ConsultaIA, Integer> {

	/** Historial de un usuario, de la más reciente a la más antigua (usa el índice ix_consultas_ia_usuario_creada). */
	Page<ConsultaIA> findByUsuarioIdOrderByCreadaEnDescIdDesc(Integer usuarioId, Pageable pageable);

	/** Una consulta solo si pertenece al usuario (las de otros responden 404, no 403: no se revela que existen). */
	Optional<ConsultaIA> findByIdAndUsuarioId(Integer id, Integer usuarioId);

	long countByUsuarioIdAndCreadaEnAfter(Integer usuarioId, Instant desde);
}
