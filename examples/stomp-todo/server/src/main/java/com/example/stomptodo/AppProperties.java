package com.example.stomptodo;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(Jwt jwt, boolean devTokens, List<String> allowedOriginPatterns, Broker broker, Limits limits) {

    public record Jwt(String secret, Duration ttl) {}

    public record Broker(String mode, Relay relay) {
        public boolean isRelay() { return "relay".equalsIgnoreCase(mode); }
    }

    public record Relay(String host, int port, String virtualHost, String clientLogin, String clientPasscode,
                        String systemLogin, String systemPasscode) {}

    public record Limits(int messagesPerSecond) {}
}
