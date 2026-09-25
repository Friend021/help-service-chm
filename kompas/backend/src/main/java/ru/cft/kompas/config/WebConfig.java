package ru.cft.kompas.config;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import ru.cft.kompas.security.AccessTokenFilter;
import ru.cft.kompas.security.AccessTokenService;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Bean
    public FilterRegistrationBean<AccessTokenFilter> accessTokenFilter(AccessTokenService service) {
        FilterRegistrationBean<AccessTokenFilter> registration =
                new FilterRegistrationBean<>(new AccessTokenFilter(service));
        registration.addUrlPatterns("/api/*");
        registration.setOrder(1);
        return registration;
    }

    /** В docker-compose SPA ходит через nginx-прокси, CORS нужен только для локальной разработки. */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*")
                .allowedMethods("GET", "POST", "PUT", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("Content-Disposition");
    }
}
