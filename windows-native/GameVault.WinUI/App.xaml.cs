using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using SinuGameVault.Services;

namespace SinuGameVault;

public static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr owner, string text, string caption, uint type);

    [STAThread]
    private static void Main()
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        /* Two copies of the app would each own vault.json and each run Drive sync,
           so whichever saved last quietly overwrote the other. Held for the
           lifetime of the process. */
        using var singleInstance = new Mutex(initiallyOwned: true, @"Local\SinuGameVault.SingleInstance", out var isOnlyInstance);
        if (!isOnlyInstance)
        {
            MessageBoxW(IntPtr.Zero, "Sinu Game Vault is already running. Use the window that is already open.", "Sinu Game Vault", 0x40);
            return;
        }
        Application.Start(callbackParams =>
        {
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            _ = new App();
        });
    }
}

public partial class App : Application
{
    public static MainWindow? Window { get; private set; }

    public App()
    {
        InitializeComponent();
        UnhandledException += (_, args) =>
        {
            DiagnosticsService.Log("Unhandled", "Unhandled UI exception", args.Exception);
            /* Saves are validated before they replace the vault file, so a failed
               handler cannot corrupt the library. Staying open and saying so is
               kinder than losing the window. */
            args.Handled = true;
            AppState.Current.Notify("Something went wrong. A private diagnostic entry was saved.", Microsoft.UI.Xaml.Controls.InfoBarSeverity.Error);
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            DiagnosticsService.Log("Fatal", "Unhandled process exception", args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            DiagnosticsService.Log("Background", "Unobserved background exception", args.Exception);
            args.SetObserved();
        };
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        DiagnosticsService.Log("Startup", "Application started");
        Window = new MainWindow();
        Window.Activate();
    }
}
