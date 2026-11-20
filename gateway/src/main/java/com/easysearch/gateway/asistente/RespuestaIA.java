package com.easysearch.gateway.asistente;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

/** Respuesta generada para una consulta (tabla respuestas_ia). */
@Entity
@Table(name = "respuestas_ia")
public class RespuestaIA {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Integer id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "consulta_id", nullable = false, unique = true)
	private ConsultaIA consulta;

	@Column(nullable = false, columnDefinition = "text")
	private String respuesta;

	/** Pasos recomendados (columna text[] de PostgreSQL). */
	@JdbcTypeCode(SqlTypes.ARRAY)
	@Column(nullable = false, columnDefinition = "text[]")
	private List<String> pasos = new ArrayList<>();

	@Column(length = 60)
	private String modelo;

	@Column(name = "creada_en", nullable = false, updatable = false)
	private Instant creadaEn = Instant.now();

	@OneToMany(mappedBy = "respuesta", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("posicion ASC")
	private List<FuenteRespuesta> fuentes = new ArrayList<>();

	@OneToOne(mappedBy = "respuesta", cascade = CascadeType.ALL, orphanRemoval = true)
	private Calificacion calificacion;

	protected RespuestaIA() {
	}

	public RespuestaIA(ConsultaIA consulta, String respuesta, List<String> pasos, String modelo) {
		this.consulta = consulta;
		this.respuesta = respuesta;
		this.pasos = new ArrayList<>(pasos);
		this.modelo = modelo;
	}

	public void agregarFuente(Establecimiento establecimiento, java.math.BigDecimal similitud) {
		fuentes.add(new FuenteRespuesta(this, establecimiento, similitud, fuentes.size() + 1));
	}

	public void calificar(int puntuacion, String comentario) {
		if (calificacion == null) {
			calificacion = new Calificacion(this, puntuacion, comentario);
		}
		else {
			calificacion.actualizar(puntuacion, comentario);
		}
	}

	public Integer getId() {
		return id;
	}

	public String getRespuesta() {
		return respuesta;
	}

	public List<String> getPasos() {
		return pasos;
	}

	public String getModelo() {
		return modelo;
	}

	public Instant getCreadaEn() {
		return creadaEn;
	}

	public List<FuenteRespuesta> getFuentes() {
		return fuentes;
	}

	public Calificacion getCalificacion() {
		return calificacion;
	}
}
