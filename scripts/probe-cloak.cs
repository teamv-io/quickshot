// Win32 truth probe: top-level windows with visibility + DWM cloak state.
// Cloaked windows (tray-hidden apps, other virtual desktops, suspended UWP)
// enumerate with bounds but are invisible — node-screenshots can't see that.
// Build: csc /nologo /out:probe-cloak.exe probe-cloak.cs   Run: probe-cloak.exe
using System;
using System.Text;
using System.Runtime.InteropServices;

static class Probe
{
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int L, T, R, B; }

    static string J(string s)
    {
        var b = new StringBuilder();
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') { b.Append('\\').Append(c); }
            else if (c < ' ') { b.Append(' '); }
            else b.Append(c);
        }
        return b.ToString();
    }

    static void Main()
    {
        var outSb = new StringBuilder("[\n");
        bool first = true;
        EnumWindows(delegate(IntPtr h, IntPtr lp)
        {
            if (!IsWindowVisible(h)) return true;
            var t = new StringBuilder(256); GetWindowText(h, t, 256);
            if (t.Length == 0) return true;
            var c = new StringBuilder(256); GetClassName(h, c, 256);
            RECT r; GetWindowRect(h, out r);
            if (r.R - r.L <= 0 || r.B - r.T <= 0) return true;
            int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);
            int ex = GetWindowLong(h, -20);
            if (!first) outSb.Append(",\n");
            first = false;
            outSb.AppendFormat(
                "{{\"hwnd\":{0},\"title\":\"{1}\",\"class\":\"{2}\",\"cloaked\":{3},\"toolWindow\":{4},\"x\":{5},\"y\":{6},\"w\":{7},\"h\":{8}}}",
                h.ToInt64(), J(t.ToString()), J(c.ToString()), cloaked,
                ((ex & 0x80) != 0) ? "true" : "false",
                r.L, r.T, r.R - r.L, r.B - r.T);
            return true;
        }, IntPtr.Zero);
        outSb.Append("\n]");
        System.IO.File.WriteAllText(
            System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "probe-out", "cloak.json"),
            outSb.ToString(), new UTF8Encoding(false));
        Console.WriteLine("ok");
    }
}
