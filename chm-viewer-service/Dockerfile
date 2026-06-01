FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN apk add --no-cache 7zip

COPY --from=build /build/target/chm-viewer-service-*.jar app.jar

RUN mkdir -p /app/chm-files /app/converted

EXPOSE 8085

ENTRYPOINT ["java", "-jar", "app.jar", \
  "--chm.files-dir=/app/chm-files", \
  "--chm.converted-dir=/app/converted", \
  "--chm.seven-zip-path=7z"]
