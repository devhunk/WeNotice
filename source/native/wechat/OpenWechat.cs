using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

// One-shot UI Automation helper. Input is JSON on stdin; no message is typed or sent.
public class OpenWechat {
    public class Target { public string sessionId; public string[] names; public string[] queries; }
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    delegate bool EnumWindowProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowProc callback, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int length);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr extra);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static AutomationElement Find(AutomationElement root, AutomationProperty property, object value) {
        return root.FindFirst(TreeScope.Descendants, new PropertyCondition(property, value));
    }
    static string Id(AutomationElement e) { return e.Current.AutomationId ?? ""; }
    static string Name(AutomationElement e) { return e.Current.Name ?? ""; }
    static bool FocusWindow(IntPtr hwnd) {
        ShowWindowAsync(hwnd, IsIconic(hwnd) ? 9 : 5);
        uint ignored, current = GetCurrentThreadId();
        uint foreground = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
        bool attached = foreground != 0 && foreground != current && AttachThreadInput(current, foreground, true);
        try { SetForegroundWindow(hwnd); } finally { if (attached) AttachThreadInput(current, foreground, false); }
        Thread.Sleep(100);
        if (GetForegroundWindow() == hwnd) return true;
        // Let the registered WeChat launcher activate its existing instance.
        try { Process.Start(new ProcessStartInfo("weixin://") { UseShellExecute = true }); } catch { }
        for (int i = 0; i < 15; i++) { Thread.Sleep(100); if (GetForegroundWindow() == hwnd) return true; }
        return false;
    }
    static bool OpenItem(AutomationElement item, IntPtr main, int pid) {
        if (!FocusWindow(main)) return false;
        var rect = item.Current.BoundingRectangle;
        if (rect.IsEmpty || rect.Width < 1 || rect.Height < 1) return false;
        POINT p = new POINT { x = (int)(rect.Left + rect.Width / 2), y = (int)(rect.Top + rect.Height / 2) };
        uint atPid; GetWindowThreadProcessId(WindowFromPoint(p), out atPid);
        if (atPid != pid) return false;
        SetCursorPos(p.x, p.y);
        mouse_event(2, 0, 0, 0, UIntPtr.Zero); mouse_event(4, 0, 0, 0, UIntPtr.Zero);
        return true;
    }
    static bool VerifyChat(AutomationElement root, string expected) {
        for (int attempt = 0; attempt < 15; attempt++) {
            if (Find(root, AutomationElement.AutomationIdProperty, "search_list") == null) {
                var labels = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
                foreach (AutomationElement label in labels) {
                    if (Id(label).EndsWith(".current_chat_name_label") && Name(label) == expected) return true;
                }
            }
            Thread.Sleep(100);
        }
        return false;
    }
    [STAThread] public static int Main() {
        Console.InputEncoding = Encoding.UTF8; Console.OutputEncoding = new UTF8Encoding(false);
        try {
            var target = Json.Deserialize<Target>(Console.In.ReadToEnd());
            if (target == null || target.names == null || target.queries == null || target.queries.Length == 0) throw new Exception("无效目标");
            AutomationElement root = null, search = null; IntPtr hwnd = IntPtr.Zero; int pid = 0;
            var processes = Process.GetProcessesByName("Weixin").Concat(Process.GetProcessesByName("WeChat")).Select(p => p.Id).ToArray();
            var handles = new List<IntPtr>();
            EnumWindows(delegate(IntPtr h, IntPtr l) {
                uint p; GetWindowThreadProcessId(h, out p);
                var text = new StringBuilder(256); GetWindowText(h, text, text.Capacity);
                if (processes.Contains((int)p) && (text.ToString() == "微信" || text.ToString() == "Weixin" || text.ToString() == "WeChat")) handles.Add(h);
                return true;
            }, IntPtr.Zero);
            foreach (var handle in handles) {
                try {
                    // A tray-hidden/minimized Qt window may not expose its
                    // search edit until it has been restored and activated.
                    if (!FocusWindow(handle)) continue;
                    var candidate = AutomationElement.FromHandle(handle);
                    var edit = candidate.FindFirst(TreeScope.Descendants, new AndCondition(
                        new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                        new PropertyCondition(AutomationElement.NameProperty, "搜索")));
                    if (edit == null) continue;
                    if (root != null) throw new Exception("存在多个微信主窗口，无法确定目标账号");
                    uint owner; GetWindowThreadProcessId(handle, out owner);
                    root = candidate; search = edit; hwnd = handle; pid = (int)owner;
                } catch (ElementNotAvailableException) { }
            }
            if (root == null) throw new Exception("请先打开并登录微信主窗口");
            if (!FocusWindow(hwnd)) throw new Exception("微信未能取得焦点");
            object valueObject;
            if (!search.TryGetCurrentPattern(ValuePattern.Pattern, out valueObject)) throw new Exception("微信搜索框不支持辅助功能输入");
            var value = (ValuePattern)valueObject;
            foreach (var query in target.queries.Distinct()) {
                if (String.IsNullOrWhiteSpace(query) || query.Length > 256 || query.Any(Char.IsControl)) continue;
                value.SetValue(query);
                Thread.Sleep(450);
                List<AutomationElement> matches = new List<AutomationElement>();
                var watch = Stopwatch.StartNew();
                do {
                    matches.Clear();
                    var list = Find(root, AutomationElement.AutomationIdProperty, "search_list");
                    if (list != null) {
                        var items = list.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
                        foreach (AutomationElement item in items) {
                            var id = Id(item); var name = Name(item);
                            // Record/web suggestions have no search_item_ ID. Match complete names only.
                            if (id.StartsWith("search_item_") && target.names.Contains(name)) matches.Add(item);
                        }
                    }
                    if (matches.Count != 0) break;
                    Thread.Sleep(100);
                } while (watch.ElapsedMilliseconds < 1000);
                if (matches.Count > 1) { Console.WriteLine(Json.Serialize(new { status = "ambiguous", error = "有多个同名联系人，请在微信搜索结果中选择" })); return 2; }
                if (matches.Count == 0) continue;
                string expected = Name(matches[0]);
                if (!OpenItem(matches[0], hwnd, pid)) throw new Exception("微信未能取得焦点，请在搜索结果中选择联系人");
                if (VerifyChat(root, expected)) {
                    Console.WriteLine(Json.Serialize(new { status = "opened" })); return 0;
                }
                throw new Exception("未能确认已进入目标会话，请在微信中检查搜索结果");
            }
            Console.WriteLine(Json.Serialize(new { status = "not-found", error = "未找到唯一匹配的微信联系人，已保留搜索结果" })); return 2;
        } catch (Exception error) { Console.WriteLine(Json.Serialize(new { status = "error", error = error.Message })); return 1; }
    }
}
