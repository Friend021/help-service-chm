package ru.cft.kompas.security;

/**
 * Проверка токена входа. В макете — HMAC/JWT общим секретом.
 * Реальный SSO подключается отдельной реализацией — [POST-MVP].
 */
public interface EntryTokenVerifier {

    EntryContext verify(String token);
}
