namespace SpecThread.Api.Data;

// Database compatibility models for Better Auth 1.7.5 (core + JWT plugin).
// Authentication behavior remains owned by Better Auth, not these classes.
public sealed class AuthUser
{
    public required string Id { get; set; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public bool EmailVerified { get; set; }
    public string? Image { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class AuthSession
{
    public required string Id { get; set; }
    public required string UserId { get; set; }
    public required string Token { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class AuthAccount
{
    public required string Id { get; set; }
    public required string AccountId { get; set; }
    public required string ProviderId { get; set; }
    public required string UserId { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public string? IdToken { get; set; }
    public DateTime? AccessTokenExpiresAt { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }
    public string? Scope { get; set; }
    public string? Password { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class AuthVerification
{
    public required string Id { get; set; }
    public required string Identifier { get; set; }
    public required string Value { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class AuthSigningKey
{
    public required string Id { get; set; }
    public required string PublicKey { get; set; }
    public required string PrivateKey { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string? Alg { get; set; }
    public string? Crv { get; set; }
}

public sealed class AuthRateLimit
{
    public required string Id { get; set; }
    public required string Key { get; set; }
    public int Count { get; set; }
    public long LastRequest { get; set; }
}
