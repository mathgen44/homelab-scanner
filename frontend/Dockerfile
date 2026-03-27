# Build stage — Vite (no ajv/webpack issues)
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/

ARG REACT_APP_API_URL=""
ARG REACT_APP_WS_URL=""
ENV VITE_API_URL=$REACT_APP_API_URL
ENV VITE_WS_URL=$REACT_APP_WS_URL

RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
