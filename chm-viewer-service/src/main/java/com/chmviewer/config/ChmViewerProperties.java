package com.chmviewer.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "chm")
public class ChmViewerProperties {

    /** Directory to scan for .chm files */
    private String filesDir = "./chm-files";

    /** Directory where converted HTML will be cached */
    private String convertedDir = "./converted";

    /**
     * Path to 7-zip executable.
     * Windows: C:/Program Files/7-Zip/7z.exe
     * Linux/Docker: 7z  (p7zip-full package)
     */
    private String sevenZipPath = "7z";

    /** Allowed CORS origins for the help API */
    private String corsOrigins = "*";
}
