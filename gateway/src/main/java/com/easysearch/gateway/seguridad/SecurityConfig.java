package com.easysearch.gateway.seguridad;

import java.nio.charset.StandardCharsets;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

import com.easysearch.gateway.config.GatewayProperties;
import com.easysearch.gateway.config.RutasSpring;

/**
 * Seguridad de la puerta de entrada. Hay dos cadenas de filtros:
 *
 * <ol>
 * <li><b>Rutas de Spring</b> ({@link RutasSpring}): Spring valida el token JWT y aplica los permisos.</li>
 * <li><b>Todo lo demás</b> (lo que se reenvía a FastAPI): Spring no revisa nada, porque FastAPI ya aplica sus
 * propias reglas por ruta (unas públicas, otras con sesión, otras solo admin). Si Spring también validara aquí,
 * una búsqueda pública con un token vencido fallaría distinto que antes.</li>
 * </ol>
 */
@Configuration
public class SecurityConfig {

	/** Ninguna respuesta de la API ejecuta código ni se muestra dentro de otra página. */
	private static final String CSP = "default-src 'none'; frame-ancestors 'none'";

	@Bean
	@Order(1)
	SecurityFilterChain rutasDeSpring(HttpSecurity http, UsuarioJwtConverter converter) throws Exception {
		String[] rutas = RutasSpring.TODAS.stream().flatMap(r -> java.util.stream.Stream.of(r, r + "/**"))
				.toArray(String[]::new);
		http.securityMatcher(rutas)
				.csrf(csrf -> csrf.disable())    // sin cookies de sesión no hay CSRF posible: el token va en una cabecera
				.cors(Customizer.withDefaults()) // mismas reglas CORS de WebConfig
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.headers(h -> h
						.contentSecurityPolicy(csp -> csp.policyDirectives(CSP))
						.referrerPolicy(r -> r.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(RutasSpring.SISTEMA + "/estado").permitAll()
						.requestMatchers(RutasSpring.ANALITICA, RutasSpring.ANALITICA + "/**").hasRole("admin")
						.requestMatchers(RutasSpring.ASISTENTE, RutasSpring.ASISTENTE + "/**")
						.hasAuthority(UsuarioJwtConverter.CORREO_CONFIRMADO)
						.anyRequest().authenticated())
				.oauth2ResourceServer(oauth -> oauth
						.jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
						.authenticationEntryPoint(noAutenticado()))
				.exceptionHandling(e -> e
						.authenticationEntryPoint(noAutenticado())
						.accessDeniedHandler(sinPermiso()));
		return http.build();
	}

	@Bean
	@Order(2)
	SecurityFilterChain reenvioAFastApi(HttpSecurity http) throws Exception {
		http.csrf(csrf -> csrf.disable())
				.cors(Customizer.withDefaults())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				// FastAPI ya envía sus cabeceras de seguridad; Spring no debe duplicarlas ni cambiarlas
				.headers(h -> h.disable())
				.requestCache(c -> c.disable())
				.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
		return http.build();
	}

	/**
	 * Verifica la firma HS256 con la misma SECRET_KEY de FastAPI, y el vencimiento (exp) del token.
	 * HS256 exige una clave de al menos 32 bytes: con una más corta la app no arranca y lo explica.
	 */
	@Bean
	JwtDecoder jwtDecoder(GatewayProperties properties) {
		String secreto = properties.jwtSecret();
		if (secreto == null || secreto.getBytes(StandardCharsets.UTF_8).length < 32) {
			throw new IllegalStateException("SECRET_KEY debe tener al menos 32 caracteres. Genera una con: "
					+ "python -c \"import secrets; print(secrets.token_urlsafe(48))\"");
		}
		var clave = new SecretKeySpec(secreto.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		return NimbusJwtDecoder.withSecretKey(clave).macAlgorithm(MacAlgorithm.HS256).build();
	}

	/** 401: falta el token, es falso, venció, o la cuenta ya no es válida. Mismo mensaje que FastAPI. */
	private static AuthenticationEntryPoint noAutenticado() {
		return (request, response, ex) -> {
			response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
			RespuestaError.escribir(response, HttpStatus.UNAUTHORIZED.value(), "No autenticado o sesión expirada");
		};
	}

	/** 403: sesión válida pero sin permiso. Si lo que falta es confirmar el correo, se dice (como FastAPI). */
	private static AccessDeniedHandler sinPermiso() {
		return (request, response, ex) -> {
			Authentication auth = SecurityContextHolder.getContext().getAuthentication();
			boolean faltaConfirmarCorreo = auth != null
					&& auth.getPrincipal() instanceof UsuarioAutenticado usuario
					&& !usuario.correoConfirmado()
					&& request.getRequestURI().startsWith(RutasSpring.ASISTENTE);
			if (faltaConfirmarCorreo) {
				response.setHeader("X-Error-Code", "email_not_verified");
				RespuestaError.escribir(response, HttpStatus.FORBIDDEN.value(),
						"Confirma tu correo para continuar. Revisa tu bandeja de entrada.");
				return;
			}
			RespuestaError.escribir(response, HttpStatus.FORBIDDEN.value(), "No tienes permiso para esta acción");
		};
	}
}
