package com.easysearch.gateway.asistente;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** Calificación de 1 a 5 de una respuesta (tabla calificaciones). Una por respuesta; se puede cambiar. */
@Entity
@Table(name = "calificaciones")
public class Calificacion {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Integer id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "respuesta_id", nullable = false, unique = true)
	private RespuestaIA respuesta;

	@Column(nullable = false)
	private short puntuacion;

	@Column(length = 500)
	private String comentario;

	@Column(name = "creada_en", nullable = false, updatable = false)
	private Instant creadaEn = Instant.now();

	@Column(name = "actualizada_en", nullable = false)
	private Instant actualizadaEn = Instant.now();

	protected Calificacion() {
	}

	Calificacion(RespuestaIA respuesta, int puntuacion, String comentario) {
		this.respuesta = respuesta;
		this.puntuacion = (short) puntuacion;
		this.comentario = comentario;
	}

	void actualizar(int puntuacion, String comentario) {
		this.puntuacion = (short) puntuacion;
		this.comentario = comentario;
		this.actualizadaEn = Instant.now();
	}

	public short getPuntuacion() {
		return puntuacion;
	}

	public String getComentario() {
		return comentario;
	}

	public Instant getActualizadaEn() {
		return actualizadaEn;
	}
}
