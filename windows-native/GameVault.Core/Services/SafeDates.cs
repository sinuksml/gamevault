namespace SinuGameVault.Services;

public static class SafeDates
{
    public static DateTimeOffset? FromUnixMilliseconds(long value) => value > 0 && value <= 253402300799999
        ? DateTimeOffset.FromUnixTimeMilliseconds(value) : null;

    public static bool IsStale(long value, TimeSpan lifetime, DateTimeOffset now)
    {
        var timestamp = FromUnixMilliseconds(value);
        return timestamp is null || timestamp > now || now - timestamp.Value > lifetime;
    }
}
