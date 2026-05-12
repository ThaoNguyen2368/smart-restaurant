FROM node:24-alpine AS build

ARG APP_NAME
ARG VITE_API_URL=http://localhost:8000/api

WORKDIR /app
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
COPY packages ./packages

RUN npm ci
RUN npm run build --workspace ${APP_NAME}

FROM nginx:1.27-alpine

ARG APP_NAME

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/${APP_NAME}/dist /usr/share/nginx/html

EXPOSE 80
