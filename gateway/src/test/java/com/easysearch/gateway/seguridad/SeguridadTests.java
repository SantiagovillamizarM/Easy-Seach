package com.easysearch.gateway.seguridad;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.easysearch.gateway.usuario.Usuario;
import com.easysearch.gateway.usuario.UsuarioRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Spring debe aceptar exactamente los mismos tokens que FastAPI (HS256 con SECRET_KEY, claims sub/role/iat/exp)
 * y aplicar las mismas reglas: cuenta activa y token posterior al último cambio de contraseña.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SeguridadTests {

	static final String CLAVE = "clave-solo-para-pruebas-automaticas-0123456789";
	static final Instant AHORA = Instant.now();

	@Autowired
	MockMvc mvc;

	@MockitoBean
	UsuarioRepository usuarios;

	// ---------------------------------------------------------------- 401: sin sesión válida

	@Test
	void sinTokenResponde401ConElFormatoDeFastApi() throws Exception {
		mvc.perform(get("/api/sistema/sesion"))
				.andExpect(status().isUnauthorized())
				.andExpect(header().string("WWW-Authenticate", "Bearer"))
				.andExpect(jsonPath("$.detail").value("No autenticado o sesión expirada"));
	}

	@Test
	void tokenValidoDevuelveElUsuario() throws Exception {
		usuario(7, "user", true, null, true);

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(token("7", AHORA, CLAVE))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(7))
				.andExpect(jsonPath("$.email").value("ana@correo.com"))
				.andExpect(jsonPath("$.rol").value("user"))
				.andExpect(jsonPath("$.correoConfirmado").value(true));
	}

	@Test
	void tokenVencidoResponde401() throws Exception {
		usuario(7, "user", true, null, true);
		String vencido = token("7", AHORA.minusSeconds(7200), AHORA.minusSeconds(600), CLAVE);

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(vencido)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void tokenFirmadoConOtraClaveResponde401() throws Exception {
		usuario(7, "user", true, null, true);
		String falso = token("7", AHORA, "otra-clave-que-no-es-la-del-servidor-1234567");

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(falso)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void tokenSinFirmaResponde401() throws Exception {
		usuario(7, "user", true, null, true);
		var b64 = Base64.getUrlEncoder().withoutPadding();
		String sinFirma = b64.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
				+ b64.encodeToString(("{\"sub\":\"7\",\"iat\":" + AHORA.getEpochSecond() + ",\"exp\":"
						+ AHORA.plusSeconds(600).getEpochSecond() + "}").getBytes(StandardCharsets.UTF_8)) + ".";

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(sinFirma)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void usuarioInexistenteOInactivoResponde401() throws Exception {
		given(usuarios.findById(8)).willReturn(Optional.empty());
		usuario(9, "user", false, null, true);

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(token("8", AHORA, CLAVE))))
				.andExpect(status().isUnauthorized());
		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(token("9", AHORA, CLAVE))))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void tokenAnteriorAlCambioDeContrasenaResponde401() throws Exception {
		Instant cambio = AHORA.minusSeconds(60);
		usuario(7, "user", true, cambio, true);

		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(token("7", cambio.minusSeconds(1), CLAVE))))
				.andExpect(status().isUnauthorized());
		// El token nuevo que FastAPI entrega al cambiar la contraseña (mismo segundo) sí sirve
		mvc.perform(get("/api/sistema/sesion").header("Authorization", bearer(token("7", cambio, CLAVE))))
				.andExpect(status().isOk());
	}

	// ---------------------------------------------------------------- 403: permisos

	@Test
	void analiticaSoloParaAdministradores() throws Exception {
		usuario(7, "user", true, null, true);
		usuario(1, "admin", true, null, true);

		mvc.perform(get("/api/analitica/resumen").header("Authorization", bearer(token("7", AHORA, CLAVE))))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.detail").value("No tienes permiso para esta acción"));
		// El admin pasa la seguridad; la ruta aún no existe (fase 11) y NO se reenvía a FastAPI
		mvc.perform(get("/api/analitica/resumen").header("Authorization", bearer(token("1", AHORA, CLAVE))))
				.andExpect(status().isNotFound());
	}

	@Test
	void asistenteExigeCorreoConfirmado() throws Exception {
		usuario(7, "user", true, null, false);
		usuario(8, "user", true, null, true);

		mvc.perform(get("/api/asistente/consultas").header("Authorization", bearer(token("7", AHORA, CLAVE))))
				.andExpect(status().isForbidden())
				.andExpect(header().string("X-Error-Code", "email_not_verified"))
				.andExpect(jsonPath("$.detail").value("Confirma tu correo para continuar. Revisa tu bandeja de entrada."));
		mvc.perform(get("/api/asistente/consultas").header("Authorization", bearer(token("8", AHORA, CLAVE))))
				.andExpect(status().isNotFound());
	}

	@Test
	void estadoDelSistemaEsPublico() throws Exception {
		// En las pruebas no hay base de datos ni FastAPI: responde 503, pero sin pedir sesión
		mvc.perform(get("/api/sistema/estado"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.gateway").value("ok"))
				.andExpect(jsonPath("$.baseDeDatos").value("error"))
				.andExpect(jsonPath("$.fastapi").value("error"));
	}

	@Test
	void respuestasDeSpringLlevanCabecerasDeSeguridad() throws Exception {
		mvc.perform(get("/api/sistema/sesion"))
				.andExpect(header().string("X-Content-Type-Options", "nosniff"))
				.andExpect(header().string("X-Frame-Options", "DENY"))
				.andExpect(header().string("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"));
	}

	// ---------------------------------------------------------------- utilidades

	private void usuario(int id, String rol, boolean activo, Instant contrasenaCambiada, boolean correoConfirmado) {
		given(usuarios.findById(id)).willReturn(Optional.of(new Usuario(id, "ana@correo.com", "Ana", rol, activo,
				contrasenaCambiada, correoConfirmado ? AHORA.minusSeconds(86400) : null)));
	}

	/** Token igual al de FastAPI (create_access_token): sub, role, iat y exp a 120 minutos. */
	static String token(String sub, Instant emitido, String clave) throws Exception {
		return token(sub, emitido, emitido.plusSeconds(7200), clave);
	}

	static String token(String sub, Instant emitido, Instant vence, String clave) throws Exception {
		var claims = new JWTClaimsSet.Builder()
				.subject(sub)
				.claim("role", "user")
				.issueTime(Date.from(emitido))
				.expirationTime(Date.from(vence))
				.build();
		var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
		jwt.sign(new MACSigner(clave.getBytes(StandardCharsets.UTF_8)));
		return jwt.serialize();
	}

	private static String bearer(String token) {
		return "Bearer " + token;
	}
}
