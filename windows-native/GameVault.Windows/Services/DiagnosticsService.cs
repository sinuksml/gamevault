using System.Text;
using System.IO;
using System.Text.RegularExpressions;

namespace SinuGameVault.Services;

internal static class DiagnosticsService
{
    private static readonly object Gate = new();
    private static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SinuGameVault", "Diagnostics");
    private static readonly string LogPath = Path.Combine(Folder, "gamevault.log");

    public static string CurrentLogPath => LogPath;

    public static void Log(string area, string message, Exception? exception = null)
    {
        try
        {
            Directory.CreateDirectory(Folder);
            var line = $"{DateTimeOffset.Now:O}\t{area}\t{Redact(message)}";
            if (exception is not null) line += $"\t{Describe(exception)}";
            lock (Gate)
            {
                File.AppendAllText(LogPath, line + Environment.NewLine, Encoding.UTF8);
                TrimIfNeeded();
            }
        }
        catch { /* Diagnostics must never crash the app. */ }
    }

    private static string Describe(Exception exception)
    {
        var parts = new List<string>();
        for (Exception? current = exception; current is not null; current = current.InnerException)
            parts.Add($"{current.GetType().Name}: {Redact(current.Message)}");
        return string.Join(" -> ", parts);
    }

    private static string Redact(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;
        value = Regex.Replace(value, @"(?i)(token|secret|password|authorization|x-plex-token)\s*[:=]\s*[^\s,;]+", "$1=[REDACTED]");
        return Regex.Replace(value, @"https?://[^\s]+", "[URL REDACTED]");
    }

    public static async Task ExportAsync(string destination, VaultRepository vault)
    {
        var summary = new StringBuilder()
            .AppendLine("Sinu Game Vault diagnostics")
            .AppendLine($"Generated: {DateTimeOffset.Now:O}")
            .AppendLine($"Windows: {Environment.OSVersion}")
            .AppendLine($".NET: {Environment.Version}")
            .AppendLine($"Schema: {VaultRepository.CurrentSchema}")
            .AppendLine($"Revision: {vault.Root["revision"]}")
            .AppendLine($"Items: {vault.UserItemCount()}")
            .AppendLine($"Drive connected: {CredentialStore.Read("SinuGameVault/GoogleDriveRefresh").Length > 0}")
            .AppendLine()
            .AppendLine("Recent redacted log (credentials and URLs removed; exception messages may contain title names):");
        if (File.Exists(LogPath)) summary.AppendLine(await File.ReadAllTextAsync(LogPath));
        await File.WriteAllTextAsync(destination, summary.ToString(), Encoding.UTF8);
    }

    private static void TrimIfNeeded()
    {
        var info = new FileInfo(LogPath);
        if (!info.Exists || info.Length < 2_000_000) return;
        var lines = File.ReadLines(LogPath).TakeLast(3000);
        File.WriteAllLines(LogPath, lines, Encoding.UTF8);
    }
}
