FROM nginx:stable-alpine
WORKDIR /srv/disk1/docker/jenkins/workspace/HomePageClient
COPY ./dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 