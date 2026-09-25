package ru.cft.kompas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class KompasApplication {

    public static void main(String[] args) {
        SpringApplication.run(KompasApplication.class, args);
    }
}
