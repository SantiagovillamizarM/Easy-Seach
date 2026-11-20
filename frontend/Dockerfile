# Frontend React de Easy Search
# Etapa 1: compilar la aplicación (Vite genera archivos estáticos en dist/)
FROM node:22-alpine AS compilacion
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Etapa 2: Nginx sirve los archivos y reenvía /api y /uploads a la puerta de entrada Spring Boot
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /build/dist /usr/share/nginx/html
EXPOSE 80
