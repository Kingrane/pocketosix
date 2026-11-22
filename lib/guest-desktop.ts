import type { Linux } from "@leaningtech/cheerpx";

// Values must come from a read-only probe of THIS live guest, not image defaults.
export type GuestDesktopSession = { uid: number; gid: number; socketPath: string };
export type GuestWindowTarget = { containerId: number; windowId: number };
export type GuestRunResult = Awaited<ReturnType<Linux["run"]>>;
export type GuestCommand = {
  fileName: string;
  args: string[];
  options: NonNullable<Parameters<Linux["run"]>[2]>;
  completion: "ipc-ack" | "probe-exit" | "subscriber-exit";
};
export type GuestApp = "launcher" | "terminal" | "files" | "lightweight-files" | "windows";
export type GuestWindowAction = "close" | "hide" | "restore" | "floating" | "tiling";
export type GuestDesktopAction =
  | { type: "launcher" | "terminal" | "files" }
  | { type: "floating-on" | "floating-off"; token: string }
  | { type: "close" | "minimize" | "restore"; target: GuestWindowTarget };

function options(session: GuestDesktopSession): GuestCommand["options"] {
  if (!Number.isSafeInteger(session.uid) || session.uid <= 0 ||
      !Number.isSafeInteger(session.gid) || session.gid < 0 ||
      !session.socketPath.startsWith("/") || /[\x00\r\n]/.test(session.socketPath)) {
    throw new Error("Нужны проверенные UID/GID пользователя и socket текущей i3-сессии.");
  }
  // CheerpX's default cwd was invalid in the real inspection; never inherit it.
  return { uid: session.uid, gid: session.gid, cwd: "/" };
}

function criteria(target: GuestWindowTarget) {
  if (![target.containerId, target.windowId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error("Нужны реальные container/window ID из свежего i3 get_tree.");
  }
  return `[con_id=${target.containerId} id=${target.windowId}]`;
}

function ipc(session: GuestDesktopSession, args: string[]): GuestCommand {
  return { fileName: "/usr/bin/i3-msg", args: ["-s", session.socketPath, ...args],
    options: options(session), completion: "ipc-ack" };
}

const DESKTOP_PROBE = String.raw`
request_id = ""
try:
    import sys
    request_id = sys.argv[1]
    import glob, json, os, pwd, stat, subprocess

    def executable(path):
        return os.path.isfile(path) and os.access(path, os.X_OK)

    if not all(executable(path) for path in ("/usr/bin/python3", "/usr/bin/i3-msg")):
        raise RuntimeError()
    paths = set(glob.glob("/tmp/i3-*/ipc-socket.*") + glob.glob("/run/user/*/i3/ipc-socket.*"))
    live = {}
    for path in sorted(paths):
        try:
            info = os.stat(path)
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid <= 0:
                continue
            owner = pwd.getpwuid(info.st_uid)
            replies = []
            for query in ("get_version", "get_tree"):
                result = subprocess.run(["/usr/bin/i3-msg", "-s", path, "-t", query],
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        text=True, check=True, timeout=5)
                replies.append(json.loads(result.stdout))
            version, tree = replies
            if not isinstance(version, dict) or not isinstance(version.get("major"), int):
                continue
            if not isinstance(tree, dict) or tree.get("type") != "root" or not isinstance(tree.get("nodes"), list):
                continue
            live[(info.st_dev, info.st_ino)] = (path, owner)
        except (OSError, KeyError, ValueError, subprocess.SubprocessError):
            continue
    if len(live) != 1:
        raise RuntimeError()
    path, owner = next(iter(live.values()))
    apps = [app for app, binary in (
        ("launcher", "/usr/bin/rofi"), ("terminal", "/usr/bin/xterm"),
        ("files", "/usr/bin/thunar"), ("lightweight-files", "/usr/bin/pcmanfm"),
        ("windows", "/usr/bin/rofi"),
    ) if executable(binary)]
    print("[pocketosix-guest]" + json.dumps(dict(operation="probe", requestId=request_id, state="ready",
          session=dict(uid=owner.pw_uid, gid=owner.pw_gid, socketPath=path),
          user=owner.pw_name, apps=apps)), flush=True)
except Exception:
    print('[pocketosix-guest]{"operation":"probe","requestId":"%s","state":"error","error":"Guest desktop probe failed"}' % request_id, flush=True)
    raise SystemExit(1)
`;

function validateRequestId(requestId: string) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(requestId)) throw new Error("Некорректный request ID гостевой команды.");
  return requestId;
}

export function guestProbeCommand(requestId: string): GuestCommand {
  // Positional arguments, not shell interpolation. A missing Python still
  // emits the same generic protocol error; no tty redirect or status files.
  return { fileName: "/bin/sh", args: ["-c", [
    'if test -x /usr/bin/python3; then exec /usr/bin/python3 -B -c "$1" "$2"; fi',
    `printf '[pocketosix-guest]{"operation":"probe","requestId":"%s","state":"error","error":"Guest desktop probe failed"}\\n' "$2"`,
    "exit 1",
  ].join("\n"), "pocketosix-guest-probe", DESKTOP_PROBE, validateRequestId(requestId)],
  options: { uid: 0, gid: 0, cwd: "/" }, completion: "probe-exit" };
}

export function guestI3Query(session: GuestDesktopSession, query: "get_tree" | "get_version" | "get_config") {
  return ipc(session, ["-t", query]);
}

const DESKTOP_TREE = String.raw`
import json, subprocess, sys

request_id, socket = sys.argv[1:3]
try:
    result = subprocess.run(["/usr/bin/i3-msg", "-s", socket, "-t", "get_tree"],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, check=True, timeout=10)
    tree = json.loads(result.stdout)
    if not isinstance(tree, dict) or tree.get("type") != "root" or not isinstance(tree.get("nodes"), list):
        raise ValueError("Invalid i3 tree")
    sys.stdout.write("[pocketosix-tree:" + request_id + "]" + json.dumps(tree, separators=(",", ":")) + "\n")
    sys.stdout.flush()
except (OSError, ValueError, subprocess.SubprocessError):
    sys.stdout.write("[pocketosix-guest]" + json.dumps(dict(operation="tree", requestId=request_id,
                     state="error", error="Guest desktop tree query failed")) + "\n")
    sys.stdout.flush()
    raise SystemExit(1)
`;

export function guestTreeCommand(session: GuestDesktopSession, requestId: string): GuestCommand {
  // Capture and validate before printing the complete frame; never expose a
  // standalone prefix while i3-msg competes with the other guest writers.
  return { fileName: "/usr/bin/python3", args: ["-B", "-c", DESKTOP_TREE,
    validateRequestId(requestId), session.socketPath],
    options: options(session), completion: "ipc-ack" };
}

export function guestLaunchApp(session: GuestDesktopSession, app: GuestApp) {
  // These executables were found in the real pinned guest. i3 supplies the
  // session's real X11/D-Bus environment; Linux.run does not fabricate it.
  const commands: Record<GuestApp, string> = {
    launcher: "/usr/bin/rofi -normal-window -show drun",
    terminal: "/usr/bin/xterm",
    files: "/usr/bin/thunar",
    "lightweight-files": "/usr/bin/pcmanfm",
    windows: "/usr/bin/rofi -normal-window -show window",
  };
  return ipc(session, [`exec --no-startup-id ${commands[app]}`]);
}

export function guestWindowCommand(session: GuestDesktopSession, target: GuestWindowTarget, action: GuestWindowAction) {
  const commands: Record<GuestWindowAction, string> = {
    close: "kill", hide: "move scratchpad", restore: "scratchpad show",
    floating: "floating enable", tiling: "floating disable",
  };
  return ipc(session, [`${criteria(target)} ${commands[action]}`]);
}

export function guestFloatExistingWindows(session: GuestDesktopSession, targets: GuestWindowTarget[]) {
  if (!targets.length) throw new Error("Нет подтверждённых окон для переключения.");
  return ipc(session, [targets.map((target) => `${criteria(target)} floating enable`).join("; ")]);
}

function stopPayload(token: string) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(token)) throw new Error("Некорректный token floating-подписчика.");
  return `pocketosix-floating-stop:${token}`;
}

// No i3 config rewrite, tmp files, package installation, /proc/environ or X11
// credentials. The owner must start at most one subscriber per live session.
// Python 3 must be confirmed present before offering this optional action.
const FLOATING_SUBSCRIBER = String.raw`
import json, subprocess, sys, threading

socket, stop = sys.argv[1:3]
base = ["/usr/bin/i3-msg", "-s", socket]
saved = {}
monitor = None
tick_timer = None

def emit(state, **fields):
    print("[pocketosix-guest]" + json.dumps(dict(operation="floating", state=state, token=stop, **fields)), flush=True)

def request(args):
    result = subprocess.run(base + args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError("i3-msg failed")
    reply = json.loads(result.stdout)
    if args == ["-t", "get_tree"] and (not isinstance(reply, dict) or reply.get("type") != "root" or not isinstance(reply.get("nodes"), list)):
        raise RuntimeError("Invalid i3 tree")
    return reply

def command(text):
    replies = request([text])
    if not isinstance(replies, list) or not replies or not all(isinstance(reply, dict) and reply.get("success") is True for reply in replies):
        raise RuntimeError("i3 rejected command")

def windows(node):
    if node.get("type") == "dockarea":
        return
    if node.get("type") == "con" and node.get("window"):
        yield node
    for child in node.get("nodes", []) + node.get("floating_nodes", []):
        yield from windows(child)

def key(node):
    return (node["id"], node["window"])

def selector(target):
    return "[con_id=%d id=%d]" % target

def command_window(target, action):
    try:
        command(selector(target) + " " + action)
    except RuntimeError:
        # A queued event or snapshot can outlive its window. Only a fresh tree
        # proving both IDs absent lets us ignore failure; never retry mutation.
        if any(key(node) == target for node in windows(request(["-t", "get_tree"]))):
            raise
        return False
    return True

def float_window(node):
    if node.get("type") != "con" or not node.get("window"):
        return
    if node.get("window_type") not in (None, "normal", "undefined", "unknown"):
        return
    if node.get("scratchpad_state", "none") != "none" or node.get("floating") not in ("auto_off", "user_off"):
        return
    target = key(node)
    if command_window(target, "floating enable"):
        saved[target] = True
    else:
        saved.pop(target, None)

def restore():
    alive = {key(node): node for node in windows(request(["-t", "get_tree"]))}
    failed = 0
    for target in saved:
        node = alive.get(target)
        # Do not unhide scratchpad windows or disturb a user's later tiling.
        if node and node.get("scratchpad_state", "none") == "none" and node.get("floating") in ("auto_on", "user_on"):
            try:
                command_window(target, "floating disable")
            except (RuntimeError, subprocess.TimeoutExpired):
                failed += 1
    return failed

try:
    monitor = subprocess.Popen(base + ["-t", "subscribe", "-m", '["window","tick","shutdown"]'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    # Kill only the monitor if its initial tick never arrives. No select syscall
    # or deadline for the lifetime of the healthy floating subscriber is needed.
    tick_timer = threading.Timer(10, monitor.kill)
    tick_timer.daemon = True
    tick_timer.start()
    try:
        for line in monitor.stdout:
            event = json.loads(line)
            if event.get("first") is True:
                break
        else:
            raise RuntimeError("i3 subscription unavailable")
    finally:
        tick_timer.cancel()
    # The initial tick proves subscription precedes the initial tree snapshot.
    for node in windows(request(["-t", "get_tree"])):
        float_window(node)
    emit("enabled", changed=len(saved))
    for line in monitor.stdout:
        event = json.loads(line)
        if event.get("payload") == stop:
            failed = restore()
            emit("disabled" if not failed else "error", restoreFailures=failed)
            sys.exit(0 if not failed else 1)
        if event.get("change") in ("restart", "exit"):
            emit("session-ended")
            sys.exit(0)
        node = event.get("container")
        if node and event.get("change") == "new":
            float_window(node)
        elif node and event.get("change") == "close":
            saved.pop(key(node), None)
    raise RuntimeError("i3 subscription ended")
except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired):
    try:
        failed = restore()
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        failed = len(saved)
    emit("error", restoreFailures=failed)
    sys.exit(1)
finally:
    if tick_timer is not None:
        tick_timer.cancel()
    if monitor is not None:
        if monitor.poll() is None:
            monitor.terminate()
        try:
            monitor.wait(timeout=2)
        except subprocess.TimeoutExpired:
            monitor.kill()
            try:
                monitor.wait(timeout=2)
            except subprocess.TimeoutExpired:
                emit("error", cleanupFailed=True)
                sys.exit(1)
`;

export function guestStartFloatingSubscriber(session: GuestDesktopSession, token: string): GuestCommand {
  return { fileName: "/usr/bin/python3", args: ["-B", "-c", FLOATING_SUBSCRIBER, session.socketPath, stopPayload(token)],
    options: options(session), completion: "subscriber-exit" };
}

export function guestStopFloatingSubscriber(session: GuestDesktopSession, token: string) {
  return ipc(session, ["-t", "send_tick", stopPayload(token)]);
}

// "minimize" is the caller's action ID only: the UI must describe scratchpad
// hiding honestly, not claim native X11 iconification or titlebar buttons.
export function guestDesktopCommand(session: GuestDesktopSession, action: GuestDesktopAction): GuestCommand {
  switch (action.type) {
    case "launcher": case "terminal": case "files": return guestLaunchApp(session, action.type);
    case "floating-on": return guestStartFloatingSubscriber(session, action.token);
    case "floating-off": return guestStopFloatingSubscriber(session, action.token);
    case "close": case "restore": return guestWindowCommand(session, action.target, action.type);
    case "minimize": return guestWindowCommand(session, action.target, "hide");
  }
}
