# PocketBase auto-hébergé (docs/PHASES.md P4/P5/P7). Version pinnée — bascule
# manuelle vers une version plus récente (revalider les migrations, cf. README).
FROM alpine:3.20 AS download
ARG PB_VERSION=0.40.3
RUN apk add --no-cache curl unzip \
  && curl -sL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -o pb.zip \
  && unzip pb.zip pocketbase -d /pb \
  && rm pb.zip

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=download /pb/pocketbase /usr/local/bin/pocketbase
COPY pb_migrations /pb_migrations
COPY pb_hooks /pb_hooks
VOLUME /pb_data
EXPOSE 8090
ENTRYPOINT ["pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--migrationsDir=/pb_migrations", "--hooksDir=/pb_hooks"]
