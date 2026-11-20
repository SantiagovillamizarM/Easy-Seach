package com.easysearch.gateway.usuario;

import org.springframework.data.jpa.repository.JpaRepository;

/** Acceso a la tabla de usuarios. Spring Data genera la implementación (findById, count...). */
public interface UsuarioRepository extends JpaRepository<Usuario, Integer> {
}
