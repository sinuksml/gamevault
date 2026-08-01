namespace SinuGameVault.Models;

public sealed class TorrentRow
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public string Status { get; init; } = "";
    public double Progress { get; init; }
    public long TotalSize { get; init; }
    public long Downloaded { get; init; }
    public long RateDown { get; init; }
    public long RateUp { get; init; }
    public long Eta { get; init; }
    public int Peers { get; init; }
    public int Priority { get; init; }
    public string Hash { get; init; } = "";
    public string ProgressText => $"{Progress:0.0}%";
    public string AmountText => $"{Bytes(Downloaded)} / {Bytes(TotalSize)}";
    public string SpeedText => $"Down {Bytes(RateDown)}/s  Up {Bytes(RateUp)}/s";
    public string EtaText => Eta < 0 || Eta > 604800 ? "--" : TimeSpan.FromSeconds(Eta).ToString(Eta >= 3600 ? @"h\h\ m\m" : @"m\m\ s\s");

    private static string Bytes(long value)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double size = Math.Max(0, value);
        var unit = 0;
        while (size >= 1024 && unit < units.Length - 1) { size /= 1024; unit++; }
        return $"{size:0.#} {units[unit]}";
    }
}

public sealed class TorrentHistoryRow
{
    public string Name { get; init; } = "";
    public string Outcome { get; init; } = "";
    public string Date { get; init; } = "";
    public string Progress { get; init; } = "";
    public string Downloaded { get; init; } = "";
    public string Files { get; init; } = "";
}
