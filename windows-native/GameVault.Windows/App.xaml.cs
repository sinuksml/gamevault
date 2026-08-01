using System.Windows;
using SinuGameVault.Services;

namespace SinuGameVault;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += (_, args) =>
        {
            DiagnosticsService.Log("Unhandled", "Unhandled UI exception", args.Exception);
            if (args.Exception is InvalidOperationException &&
                (args.Exception.Message.Contains("while a Window is closing", StringComparison.OrdinalIgnoreCase)
                 || args.Exception.Message.Contains("node already has a parent", StringComparison.OrdinalIgnoreCase)))
            {
                // These are recoverable late-callback/data ownership failures. Their
                // source paths are guarded, but older queued callbacks may still fire.
                args.Handled = true;
                return;
            }
            MessageBox.Show("GameVault encountered an unexpected problem. A private local diagnostic entry was created.", "Sinu Game Vault", MessageBoxButton.OK, MessageBoxImage.Error);
            // Unknown UI exceptions may leave the vault in an unsafe state. Let WPF
            // terminate after recording the diagnostic instead of continuing silently.
            args.Handled = false;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) => DiagnosticsService.Log("Fatal", "Unhandled process exception", args.ExceptionObject as Exception);
        DiagnosticsService.Log("Startup", "Application started");
        base.OnStartup(e);
    }
}
