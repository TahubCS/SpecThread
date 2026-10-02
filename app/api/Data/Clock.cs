namespace SpecThread.Api.Data;

internal static class Clock
{
    // PostgreSQL keeps microseconds; .NET ticks are 100 ns. Dropping the extra digit here
    // makes a write response carry the same timestamp a later read returns.
    public static DateTime UtcNow()
    {
        var now = DateTime.UtcNow;
        return new DateTime(now.Ticks - now.Ticks % TimeSpan.TicksPerMicrosecond, DateTimeKind.Utc);
    }
}
