package com.easysearch.gateway.seguridad;

/**
 * Quién hace la petición, ya validado (token correcto, cuenta activa y vigente).
 *
 * <p>Los controladores lo reciben con {@code @AuthenticationPrincipal UsuarioAutenticado usuario}.
 */
public record UsuarioAutenticado(Integer id, String email, String nombre, String rol, boolean correoConfirmado) {

	public boolean esAdmin() {
		return "admin".equals(rol);
	}
}
