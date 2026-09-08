using System.Globalization;
using System.Windows.Data;

namespace SinuGameVault.Services;

public sealed class ArtworkHeightConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        var width = values[0] is double value && value > 0 ? value : 248;
        return Math.Round(width * (values[1] is true ? 1.5 : 9d / 16));
    }
    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture) => throw new NotSupportedException();
}
