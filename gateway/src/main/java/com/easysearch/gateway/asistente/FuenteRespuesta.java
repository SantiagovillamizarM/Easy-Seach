package com.easysearch.gateway.asistente;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Negocio usado como fuente de una respuesta, con su similitud (tabla fuentes_respuesta). */
@Entity
@Table(name = "fuentes_respuesta")
public class FuenteRespuesta {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Integer id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "respuesta_id", nullable = false)
	private RespuestaIA respuesta;

	/** Puede quedar en null si más adelante se borra el negocio; el nombre se conserva para el historial. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "establecimiento_id")
	private Establecimiento establecimiento;

	@Column(name = "nombre_establecimiento", nullable = false, length = 200)
	private String nombreEstablecimiento;

	@Column(nullable = false, precision = 5, scale = 4)
	private BigDecimal similitud;

	@Column(nullable = false)
	private short posicion;

	protected FuenteRespuesta() {
	}

	FuenteRespuesta(RespuestaIA respuesta, Establecimiento establecimiento, BigDecimal similitud, int posicion) {
		this.respuesta = respuesta;
		this.establecimiento = establecimiento;
		this.nombreEstablecimiento = establecimiento.getNombre();
		this.similitud = similitud;
		this.posicion = (short) posicion;
	}

	public Establecimiento getEstablecimiento() {
		return establecimiento;
	}

	public String getNombreEstablecimiento() {
		return nombreEstablecimiento;
	}

	public BigDecimal getSimilitud() {
		return similitud;
	}

	public short getPosicion() {
		return posicion;
	}
}
