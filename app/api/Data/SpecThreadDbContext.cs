using Microsoft.EntityFrameworkCore;

namespace SpecThread.Api.Data;

public sealed class SpecThreadDbContext(DbContextOptions<SpecThreadDbContext> options)
    : DbContext(options);
