package com.example.stomptodo.ws;

import java.time.Instant;
import java.util.Map;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.CredentialsExpiredException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.stereotype.Component;

/**
 * Authenticates the STOMP CONNECT frame using "Authorization: Bearer &lt;jwt&gt;" and rejects any later
 * inbound frame once the token has expired (the socket may live much longer than the token).
 */
@Component
public class JwtConnectInterceptor implements ChannelInterceptor {

    static final String TOKEN_EXP = "tokenExp";

    private final JwtDecoder jwtDecoder;
    private final JwtAuthenticationConverter converter;

    public JwtConnectInterceptor(JwtDecoder jwtDecoder, JwtAuthenticationConverter converter) {
        this.jwtDecoder = jwtDecoder;
        this.converter = converter;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        // getAccessor returns the message's own mutable accessor; StompHeaderAccessor.wrap() would be a copy
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand()) || StompCommand.STOMP.equals(accessor.getCommand())) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                throw new BadCredentialsException("Missing bearer token");
            }
            Jwt jwt;
            try {
                jwt = jwtDecoder.decode(header.substring("Bearer ".length()));
            }
            catch (JwtException ex) {
                throw new BadCredentialsException("Invalid token", ex);
            }
            AbstractAuthenticationToken authentication = converter.convert(jwt);
            accessor.setUser(authentication);                          // remembered for the whole session
            Map<String, Object> attrs = accessor.getSessionAttributes();
            if (attrs != null && jwt.getExpiresAt() != null) {
                attrs.put(TOKEN_EXP, jwt.getExpiresAt());
            }
            return message;
        }
        // Every other inbound frame: refuse once the CONNECT token has expired.
        Map<String, Object> attrs = accessor.getSessionAttributes();
        if (attrs != null && attrs.get(TOKEN_EXP) instanceof Instant exp && Instant.now().isAfter(exp)
                && !StompCommand.DISCONNECT.equals(accessor.getCommand())) {
            throw new CredentialsExpiredException("Token expired, reconnect with a fresh token");
        }
        return message;
    }
}
