package com.easysearch.gateway.asistente;

import java.math.BigDecimal;
import java.time.Instant;

import com.easysearch.gateway.usuario.Usuario;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** Una pregunta que un usuario le hizo al asistente, con su estado (tabla consultas_ia). */
@Entity
@Table(name = "consultas_ia")
public class ConsultaIA {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Integer id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "usuario_id", nullable = false)
	private Usuario usuario;

	@Column(nullable = false, length = 500)
	private String pregunta;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 20)
	private EstadoConsulta estado = EstadoConsulta.PENDIENTE;

	@Column(nullable = false, precision = 4, scale = 3)
	private BigDecimal umbral;

	@Column(name = "mejor_similitud", precision = 5, scale = 4)
	private BigDecimal mejorSimilitud;

	@Column(name = "detalle_error", length = 300)
	private String detalleError;

	@Column(name = "duracion_ms")
	private Integer duracionMs;

	@Column(name = "creada_en", nullable = false, updatable = false)
	private Instant creadaEn = Instant.now();

	@Column(name = "respondida_en")
	private Instant respondidaEn;

	@OneToOne(mappedBy = "consulta", cascade = CascadeType.ALL, orphanRemoval = true)
	private RespuestaIA respuesta;

	protected ConsultaIA() {
	}

	public ConsultaIA(Usuario usuario, String pregunta, BigDecimal umbral) {
		this.usuario = usuario;
		this.pregunta = pregunta;
		this.umbral = umbral;
	}

	/** Cierra la consulta con su estado final. */
	public void finalizar(EstadoConsulta estado, BigDecimal mejorSimilitud, int duracionMs, String detalleError) {
		this.estado = estado;
		this.mejorSimilitud = mejorSimilitud;
		this.duracionMs = duracionMs;
		this.detalleError = detalleError;
		this.respondidaEn = Instant.now();
	}

	public void asignarRespuesta(RespuestaIA respuesta) {
		this.respuesta = respuesta;
	}

	public Integer getId() {
		return id;
	}

	public Usuario getUsuario() {
		return usuario;
	}

	public String getPregunta() {
		return pregunta;
	}

	public EstadoConsulta getEstado() {
		return estado;
	}

	public BigDecimal getUmbral() {
		return umbral;
	}

	public BigDecimal getMejorSimilitud() {
		return mejorSimilitud;
	}

	public String getDetalleError() {
		return detalleError;
	}

	public Integer getDuracionMs() {
		return duracionMs;
	}

	public Instant getCreadaEn() {
		return creadaEn;
	}

	public Instant getRespondidaEn() {
		return respondidaEn;
	}

	public RespuestaIA getRespuesta() {
		return respuesta;
	}
}
