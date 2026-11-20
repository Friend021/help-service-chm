# ---- build (Angular 22) ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
COPY public ./public
# dev-конфигурация использует environment.ts (localhost-URL), а не environment.prod.ts
# (там keycloak.internal / относительный /api/v1 — для боевого контура, не для docker-демо)
RUN npx ng build --configuration development

# ---- run ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
