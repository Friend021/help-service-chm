package ru.cft.legacy;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * Заглушка внутреннего сервиса «ПЛАН РАЗВИТИЯ».
 * Воспроизводит экран «Создать план развития» и служит точкой входа в «Компас».
 */
@SpringBootApplication
@EnableConfigurationProperties(LegacyProperties.class)
public class LegacyStubApplication {

    public static void main(String[] args) {
        SpringApplication.run(LegacyStubApplication.class, args);
    }
}
