using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Activate the registered WeChat client only. Do not load UI Automation or
// join input queues: Qt accessibility providers can freeze the entire client.
public class OpenWechat {
    public class Target { public string sessionId; }
    [MTAThread] public static int Main() {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        var json = new JavaScriptSerializer();
        using (var single = new Mutex(false, "Local\\WeNotice.OpenWechat")) {
            bool acquired = false;
            try { acquired = single.WaitOne(0); } catch (AbandonedMutexException) { acquired = true; }
            if (!acquired) { Console.WriteLine(json.Serialize(new { status = "busy" })); return 2; }
            // Also bounds a stalled protocol handler or incomplete stdin.
            using (var deadline = new Timer(delegate {
                Console.WriteLine(new JavaScriptSerializer().Serialize(new { status = "error", error = "唤起微信超时，已停止跳转组件，请手动打开微信。" }));
                Environment.Exit(1);
            }, null, 6000, Timeout.Infinite)) {
                try {
                    var target = json.Deserialize<Target>(Console.In.ReadToEnd());
                    if (target == null || String.IsNullOrWhiteSpace(target.sessionId)) throw new Exception("无效目标");
                    Process.Start(new ProcessStartInfo("weixin://") { UseShellExecute = true });
                    // Keep status compatible with existing packaged callers;
                    // scope explicitly distinguishes activation from chat navigation.
                    Console.WriteLine(json.Serialize(new { status = "opened", scope = "window" }));
                    return 0;
                } catch (Exception error) {
                    Console.WriteLine(json.Serialize(new { status = "error", error = error.Message }));
                    return 1;
                } finally { single.ReleaseMutex(); }
            }
        }
    }
}
