package ru.cft.kompas.v1.security;

/** Токен Keycloak недействителен: подпись, issuer, audience, срок или состав claim'ов. */
public class KeycloakAuthException extends RuntimeException {

    public KeycloakAuthException(String message) {
        super(message);
    }

    public KeycloakAuthException(String message, Throwable cause) {
        super(message, cause);
    }
}
