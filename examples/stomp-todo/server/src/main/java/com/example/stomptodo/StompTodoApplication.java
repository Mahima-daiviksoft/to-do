package com.example.stomptodo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class StompTodoApplication {

    public static void main(String[] args) {
        SpringApplication.run(StompTodoApplication.class, args);
    }
}
