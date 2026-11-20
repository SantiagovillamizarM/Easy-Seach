package com.easysearch.gateway.asistente;

import org.hibernate.annotations.Immutable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Negocio de Easy Search (tabla {@code establishments} que administra FastAPI). Solo lectura.
 * El asistente lo usa para comprobar que cada fuente existe y está activa antes de guardarla.
 */
@Entity
@Immutable
@Table(name = "establishments")
public class Establecimiento {

	@Id
	private Integer id;

	@Column(name = "name", nullable = false, length = 200)
	private String nombre;

	@Column(nullable = false, length = 220)
	private String slug;

	/** active, hidden o duplicate. Solo los activos pueden ser fuente. */
	@Column(name = "status", nullable = false, length = 20)
	private String estado;

	protected Establecimiento() {
	}

	public Integer getId() {
		return id;
	}

	public String getNombre() {
		return nombre;
	}

	public String getSlug() {
		return slug;
	}

	public boolean isActivo() {
		return "active".equals(estado);
	}
}
