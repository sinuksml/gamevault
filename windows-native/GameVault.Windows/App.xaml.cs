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
            MessageBox.Show("GameVault encountered an unexpected problem. A private local diagnostic entry was created.", "Sinu Game Vault", MessageBoxButton.OK, MessageBoxImage.Error);
            args.Handled = true;
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) => DiagnosticsService.Log("Fatal", "Unhandled process exception", args.ExceptionObject as Exception);
        DiagnosticsService.Log("Startup", "Application started");
        base.OnStartup(e);
    }
}
