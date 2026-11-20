package com.easysearch.gateway.seguridad;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.stereotype.Component;

import com.easysearch.gateway.usuario.Usuario;
import com.easysearch.gateway.usuario.UsuarioRepository;

/**
 * Convierte un token ya verificado (firma y vencimiento) en el usuario autenticado.
 *
 * <p>Aplica las mismas reglas que FastAPI ({@code _user_from_token} en {@code app/api/deps.py}):
 * el usuario debe existir y estar activo, y el token no puede ser anterior al último cambio de contraseña.
 * Cualquier fallo responde 401, igual que si el token fuera falso, para no dar pistas.
 */
@Component
public class UsuarioJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

	/** Permiso extra de quien ya confirmó su correo (lo exige el asistente con IA). */
	public static final String CORREO_CONFIRMADO = "CORREO_CONFIRMADO";

	private final UsuarioRepository usuarios;

	public UsuarioJwtConverter(UsuarioRepository usuarios) {
		this.usuarios = usuarios;
	}

	@Override
	public AbstractAuthenticationToken convert(Jwt jwt) {
		Integer id = idDelToken(jwt);
		Instant emitidoEn = jwt.getIssuedAt();
		if (emitidoEn == null) {
			throw sesionInvalida();
		}

		Usuario usuario = usuarios.findById(id).filter(Usuario::isActivo).orElseThrow(UsuarioJwtConverter::sesionInvalida);

		// Token anterior al último cambio de contraseña: esa sesión quedó cerrada.
		// (iat viene en segundos enteros, por eso se compara contra el segundo truncado, igual que FastAPI)
		Instant cambio = usuario.getContrasenaCambiadaEn();
		if (cambio != null && emitidoEn.getEpochSecond() < cambio.getEpochSecond()) {
			throw sesionInvalida();
		}

		List<GrantedAuthority> permisos = new ArrayList<>();
		permisos.add(new SimpleGrantedAuthority("ROLE_" + usuario.getRol()));   // ROLE_user, ROLE_owner, ROLE_admin
		if (usuario.isCorreoConfirmado()) {
			permisos.add(new SimpleGrantedAuthority(CORREO_CONFIRMADO));
		}
		var principal = new UsuarioAutenticado(usuario.getId(), usuario.getEmail(), usuario.getNombre(),
				usuario.getRol(), usuario.isCorreoConfirmado());
		return new UsernamePasswordAuthenticationToken(principal, jwt, permisos);
	}

	private static Integer idDelToken(Jwt jwt) {
		try {
			return Integer.valueOf(jwt.getSubject());
		}
		catch (NumberFormatException | NullPointerException ex) {
			throw sesionInvalida();
		}
	}

	private static InvalidBearerTokenException sesionInvalida() {
		return new InvalidBearerTokenException("No autenticado o sesión expirada");
	}
}
