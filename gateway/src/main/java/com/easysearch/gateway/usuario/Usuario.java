package com.easysearch.gateway.usuario;

import java.time.Instant;

import org.hibernate.annotations.Immutable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Usuario de Easy Search, mapeado sobre la tabla {@code users} que administra FastAPI.
 *
 * <p>Es de <b>solo lectura</b> ({@link Immutable}): las cuentas se crean, editan y borran en FastAPI (registro,
 * confirmación de correo, cambio de contraseña). Spring solo las consulta para validar la sesión y para relacionar
 * con ellas las consultas al asistente. Solo se mapean las columnas que Spring necesita; la contraseña nunca.
 */
@Entity
@Immutable
@Table(name = "users")
public class Usuario {

	@Id
	private Integer id;

	@Column(nullable = false, length = 255)
	private String email;

	@Column(name = "full_name", nullable = false, length = 120)
	private String nombre;

	/** user, owner o admin (restricción ck_users_role_valid en la base). */
	@Column(name = "role", nullable = false, length = 10)
	private String rol;

	@Column(name = "is_active", nullable = false)
	private boolean activo;

	/** Los tokens emitidos antes de esta fecha ya no son válidos (la sesión se cerró al cambiar la contraseña). */
	@Column(name = "password_changed_at")
	private Instant contrasenaCambiadaEn;

	/** null = todavía no confirma su correo. */
	@Column(name = "email_verified_at")
	private Instant correoConfirmadoEn;

	protected Usuario() {
		// Constructor vacío que exige JPA
	}

	public Usuario(Integer id, String email, String nombre, String rol, boolean activo, Instant contrasenaCambiadaEn,
			Instant correoConfirmadoEn) {
		this.id = id;
		this.email = email;
		this.nombre = nombre;
		this.rol = rol;
		this.activo = activo;
		this.contrasenaCambiadaEn = contrasenaCambiadaEn;
		this.correoConfirmadoEn = correoConfirmadoEn;
	}

	public Integer getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getNombre() {
		return nombre;
	}

	public String getRol() {
		return rol;
	}

	public boolean isActivo() {
		return activo;
	}

	public Instant getContrasenaCambiadaEn() {
		return contrasenaCambiadaEn;
	}

	public boolean isCorreoConfirmado() {
		return correoConfirmadoEn != null;
	}
}
