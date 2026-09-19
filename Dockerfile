# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy global.json for SDK pinning and project files with lockfile for reproducible restore caching
COPY global.json ./
COPY app/api/SpecThread.Api.csproj app/api/packages.lock.json app/api/
RUN dotnet restore app/api/SpecThread.Api.csproj --locked-mode

# Copy application source and publish Release binaries
COPY app/api/ app/api/
RUN dotnet publish app/api/SpecThread.Api.csproj -c Release -o /app/publish --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Install Supabase Root CA into system trust store for VerifyFull TLS support
COPY app/api/certs/prod-ca-2021.crt /usr/local/share/ca-certificates/supabase-root-2021.crt
RUN update-ca-certificates

COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

USER $APP_UID
ENTRYPOINT ["dotnet", "SpecThread.Api.dll"]
