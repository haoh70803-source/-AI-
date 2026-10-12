FROM golang:1.25-bookworm@sha256:c268a04d59aea0b180ed9946a658cfab9e7b3391dc90eed6e4969ccff98c851f AS builder
WORKDIR /src
RUN git init . && git remote add origin https://github.com/minio/minio.git && git fetch --depth=1 origin 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a && git checkout --detach FETCH_HEAD && test "$(git rev-parse HEAD)" = "9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a"
RUN go mod download && go mod verify && CGO_ENABLED=0 go build -trimpath -o /out/minio .
FROM scratch
COPY --from=builder /out/minio /minio
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /src /usr/share/minio-source
LABEL org.opencontainers.image.source="https://github.com/minio/minio" org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" org.opencontainers.image.licenses="AGPL-3.0" xsj.scope="isolated-local-test-only"
USER 10001:10001
ENTRYPOINT ["/minio"]
CMD ["server", "/data", "--address", ":9000"]
