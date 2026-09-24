using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace SpecThread.Api.Auth;

// Better Auth publishes a bare JWKS without an OpenID discovery document.
// Loading it through ConfigurationManager keeps IdentityModel's caching and
// its refresh when a token names an unknown key id.
internal sealed class JwksRetriever : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var document = await retriever.GetDocumentAsync(address, cancel);
        var keySet = new JsonWebKeySet(document);
        var configuration = new OpenIdConnectConfiguration { JsonWebKeySet = keySet };
        foreach (var key in keySet.GetSigningKeys())
        {
            configuration.SigningKeys.Add(key);
        }
        return configuration;
    }
}
