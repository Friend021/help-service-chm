# ---- build ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
RUN npx ng build --configuration production

# ---- run ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/kompas/browser /usr/share/nginx/html
EXPOSE 80
