# Puerta de entrada Spring Boot de Easy Search
# Etapa 1: compilar con Maven (el resultado es un solo .jar)
FROM eclipse-temurin:21-jdk AS compilacion
WORKDIR /build
# Primero el pom y el wrapper: las dependencias se descargan en una capa que se reutiliza si solo cambia el código
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src src
# Las pruebas se corren aparte (necesitan la base de pruebas); aquí solo se empaqueta
RUN ./mvnw -q -B package -DskipTests

# Etapa 2: solo el entorno de ejecución de Java (sin Maven ni el código fuente)
FROM eclipse-temurin:21-jre
RUN useradd --create-home --uid 10001 easysearch
WORKDIR /app
COPY --from=compilacion /build/target/gateway-*.jar app.jar
USER easysearch
EXPOSE 8020
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
