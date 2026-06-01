package com.chmviewer;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties
public class ChmViewerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ChmViewerApplication.class, args);
    }
}
