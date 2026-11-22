import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guestDesktopCommand, guestFloatExistingWindows, guestI3Query, guestLaunchApp,
  guestStartFloatingSubscriber, guestStopFloatingSubscriber, guestWindowCommand,
  guestProbeCommand, guestTreeCommand,
  type GuestApp, type GuestDesktopSession, type GuestWindowAction,
} from "../../lib/guest-desktop";

// Synthetic inputs for pure command construction, not a discovered live session
// or evidence of Linux.run / an i3 acknowledgement succeeding.
const SESSION: GuestDesktopSession = { uid: 1000, gid: 1000, socketPath: "/tmp/i3-unit/ipc-socket.529" };
const TARGET = { containerId: 1001, windowId: 2097153 };
const OPTIONS = { uid: 1000, gid: 1000, cwd: "/" };

test("i3 queries use explicit socket arguments and the verified non-root identity", () => {
  for (const query of ["get_tree", "get_version", "get_config"] as const) {
    assert.deepEqual(guestI3Query(SESSION, query), {
      fileName: "/usr/bin/i3-msg", args: ["-s", SESSION.socketPath, "-t", query],
      options: OPTIONS, completion: "ipc-ack",
    });
  }
  assert.deepEqual(guestI3Query({ ...SESSION, gid: 0 }, "get_tree").options, { uid: 1000, gid: 0, cwd: "/" });
});

test("socket paths containing spaces and quotes remain a single positional argument", () => {
  const socketPath = "/tmp/i3 unit/'quoted';$(not-a-command)/ipc-socket.529";
  const session = { ...SESSION, socketPath };
  const query = guestI3Query(session, "get_tree");
  assert.equal(query.fileName, "/usr/bin/i3-msg");
  assert.deepEqual(query.args, ["-s", socketPath, "-t", "get_tree"]);
  const subscriber = guestStartFloatingSubscriber(session, "unit-token_123");
  assert.equal(subscriber.fileName, "/usr/bin/python3");
  assert.equal(subscriber.args[3], socketPath);
  assert.deepEqual(subscriber.options, OPTIONS);
});

test("desktop actions reject root or invalid session metadata", () => {
  const invalidSessions: GuestDesktopSession[] = [
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((uid) => ({ ...SESSION, uid })),
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((gid) => ({ ...SESSION, gid })),
    ...["", "tmp/ipc-socket.529", "/tmp/socket\0", "/tmp/socket\r", "/tmp/socket\n"].map((socketPath) => ({ ...SESSION, socketPath })),
  ];
  for (const session of invalidSessions) {
    assert.throws(() => guestI3Query(session, "get_tree"), /UID\/GID/);
    assert.throws(() => guestLaunchApp(session, "terminal"), /UID\/GID/);
    assert.throws(() => guestWindowCommand(session, TARGET, "close"), /UID\/GID/);
    assert.throws(() => guestStartFloatingSubscriber(session, "unit-token_123"), /UID\/GID/);
    assert.throws(() => guestStopFloatingSubscriber(session, "unit-token_123"), /UID\/GID/);
  }
});

test("app launch commands ask i3 to supply the real guest environment", () => {
  const commands: Record<GuestApp, string> = {
    launcher: "/usr/bin/rofi -normal-window -show drun", terminal: "/usr/bin/xterm",
    files: "/usr/bin/thunar", "lightweight-files": "/usr/bin/pcmanfm",
    windows: "/usr/bin/rofi -normal-window -show window",
  };
  for (const app of Object.keys(commands) as GuestApp[]) {
    assert.deepEqual(guestLaunchApp(SESSION, app), {
      fileName: "/usr/bin/i3-msg", args: ["-s", SESSION.socketPath, `exec --no-startup-id ${commands[app]}`],
      options: OPTIONS, completion: "ipc-ack",
    });
  }
});

test("window actions require both the fresh i3 container ID and X11 window ID", () => {
  const commands: Record<GuestWindowAction, string> = {
    close: "kill", hide: "move scratchpad", restore: "scratchpad show",
    floating: "floating enable", tiling: "floating disable",
  };
  for (const action of Object.keys(commands) as GuestWindowAction[]) {
    assert.deepEqual(guestWindowCommand(SESSION, TARGET, action), {
      fileName: "/usr/bin/i3-msg",
      args: ["-s", SESSION.socketPath, `[con_id=1001 id=2097153] ${commands[action]}`],
      options: OPTIONS, completion: "ipc-ack",
    });
  }
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => guestWindowCommand(SESSION, { ...TARGET, containerId: id }, "close"), /container\/window ID/);
    assert.throws(() => guestWindowCommand(SESSION, { ...TARGET, windowId: id }, "restore"), /container\/window ID/);
  }
});

test("floating existing windows uses bounded dual-ID selectors and rejects an empty target list", () => {
  const other = { containerId: 1002, windowId: 2097154 };
  assert.deepEqual(guestFloatExistingWindows(SESSION, [TARGET, other]), {
    fileName: "/usr/bin/i3-msg",
    args: ["-s", SESSION.socketPath, "[con_id=1001 id=2097153] floating enable; [con_id=1002 id=2097154] floating enable"],
    options: OPTIONS, completion: "ipc-ack",
  });
  assert.throws(() => guestFloatExistingWindows(SESSION, []), /Нет подтверждённых окон/);
  assert.throws(() => guestFloatExistingWindows(SESSION, [TARGET, { ...other, windowId: 0 }]), /container\/window ID/);
});

test("floating subscriber start and stop share the exact validated tick token", () => {
  for (const token of ["abcdefgh", "unit-token_123", "a".repeat(64)]) {
    const start = guestStartFloatingSubscriber(SESSION, token);
    assert.equal(start.fileName, "/usr/bin/python3");
    assert.deepEqual(start.args.slice(0, 2), ["-B", "-c"]);
    assert.equal(typeof start.args[2], "string");
    assert.ok(start.args[2].length > 0);
    assert.deepEqual(start.args.slice(3), [SESSION.socketPath, `pocketosix-floating-stop:${token}`]);
    assert.deepEqual(start.options, OPTIONS);
    assert.equal(start.completion, "subscriber-exit");
    assert.deepEqual(guestStopFloatingSubscriber(SESSION, token), {
      fileName: "/usr/bin/i3-msg", args: ["-s", SESSION.socketPath, "-t", "send_tick", start.args[4]],
      options: OPTIONS, completion: "ipc-ack",
    });
  }
  for (const token of ["", "a".repeat(7), "a".repeat(65), "token with spaces", "token;command", "token/segment", "token\nabc", "token\0abc"]) {
    assert.throws(() => guestStartFloatingSubscriber(SESSION, token), /Некорректный token/);
    assert.throws(() => guestStopFloatingSubscriber(SESSION, token), /Некорректный token/);
  }
});

test("floating failure reports a fixed category instead of leaking exception arguments", () => {
  const script = guestStartFloatingSubscriber(SESSION, "unit-token_123").args[2];
  assert.match(script, /errorType=type\(error\)\.__name__/);
  assert.match(script, /errorCode=reasons\.get\(str\(error\), "unknown"\)/);
  assert.match(script, /"i3 rejected command": "command-rejected"/);
  assert.doesNotMatch(script, /emit\("error"[^\n]*error=str\(error\)/);
});

test("unrepresentable 32-bit container pointers use a guarded mark, never signed criteria", () => {
  const high = { containerId: 2937926608, windowId: 14680076 };
  const command = guestWindowCommand(SESSION, high, "floating");
  assert.equal(command.fileName, "/usr/bin/python3");
  assert.deepEqual(command.args.slice(3), [SESSION.socketPath, "[[2937926608,14680076]]", "floating enable"]);
  assert.deepEqual(command.options, OPTIONS);
  assert.equal(command.completion, "ipc-ack");
  assert.deepEqual(guestFloatExistingWindows(SESSION, [high]).args, command.args);
  for (const containerId of [0, -1, 0x100000000, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => guestWindowCommand(SESSION, { ...high, containerId }, "close"), /container\/window ID/);
  }
  // i3's actual parse_long rejects LONG_MAX and every negative value as well.
  for (const windowId of [0x7fffffff, 0x80000000, 0xffffffff, 0x100000000]) {
    assert.throws(() => guestWindowCommand(SESSION, { ...high, windowId }, "hide"), /container\/window ID/);
  }
  for (const containerId of [0x7fffffff, 0x80000000, 0xffffffff]) {
    assert.equal(guestWindowCommand(SESSION, { ...high, containerId }, "floating").fileName, "/usr/bin/python3");
  }
});

test("subscriber and finite controls share the dual-ID mark guard and preserve user marks", () => {
  const script = guestStartFloatingSubscriber(SESSION, "unit-token_123").args[2];
  assert.match(script, /not 0 < container <= 0xffffffff or not 0 < xid < 0x7fffffff/);
  assert.match(script, /command\("\[id=%d\] mark --add %s" % \(xid, mark\)\)/);
  assert.match(script, /if len\(marked\) != 1 or key\(marked\[0\]\) != target:\s+raise RuntimeError\("Window identity changed"\)/);
  assert.match(script, /con_mark="\^%s\$"/);
  assert.match(script, /finally:[\s\S]*command\("unmark " \+ mark\)/);
  assert.match(script, /def key\(node\):\s+return \(node\["id"\], node\["window"\]\)/);
  assert.match(script, /saved\[target\] = True/);
  const finite = guestWindowCommand(SESSION, { containerId: 2937926608, windowId: 501 }, "hide").args[2];
  const shared = (text: string) => text.slice(text.indexOf("def request(args):"), text.indexOf("    return True\n") + "    return True\n".length);
  assert.equal(shared(script), shared(finite));
});

test("public action mapping names scratchpad hiding honestly and preserves each target", () => {
  for (const type of ["launcher", "terminal", "files"] as const) {
    assert.deepEqual(guestDesktopCommand(SESSION, { type }), guestLaunchApp(SESSION, type));
  }
  assert.deepEqual(guestDesktopCommand(SESSION, { type: "close", target: TARGET }), guestWindowCommand(SESSION, TARGET, "close"));
  assert.deepEqual(guestDesktopCommand(SESSION, { type: "minimize", target: TARGET }), guestWindowCommand(SESSION, TARGET, "hide"));
  assert.deepEqual(guestDesktopCommand(SESSION, { type: "restore", target: TARGET }), guestWindowCommand(SESSION, TARGET, "restore"));
  assert.deepEqual(guestDesktopCommand(SESSION, { type: "floating-on", token: "unit-token_123" }), guestStartFloatingSubscriber(SESSION, "unit-token_123"));
  assert.deepEqual(guestDesktopCommand(SESSION, { type: "floating-off", token: "unit-token_123" }), guestStopFloatingSubscriber(SESSION, "unit-token_123"));
});

// Factory assertions only: no guest execution, SDK stdout or live Linux proof.
test("probe and tree commands validate request nonces at both length boundaries", () => {
  for (const requestId of ["abcdefgh", "Ab09_-Zx", "unit-request_123", "a".repeat(64)]) {
    assert.equal(guestProbeCommand(requestId).args[4], requestId);
    assert.equal(guestTreeCommand(SESSION, requestId).args[3], requestId);
  }
  for (const requestId of [
    "", "a".repeat(7), "a".repeat(65), " request_123", "request_123 ",
    "request with spaces", "request;command", "request/segment", "request%field",
    "request'quote", 'request"quote', "$(request_123)", "`request_123`",
    "request\n123", "request_123\n", "request_123\r", "request\0abc", "запрос_123",
  ]) {
    assert.throws(() => guestProbeCommand(requestId), /Некорректный request ID/);
    assert.throws(() => guestTreeCommand(SESSION, requestId), /Некорректный request ID/);
  }
});

test("only the discovery probe uses root and supplies an explicit root cwd", () => {
  const command = guestProbeCommand("unit-request_123");
  assert.equal(command.fileName, "/bin/sh");
  assert.deepEqual(command.options, { uid: 0, gid: 0, cwd: "/" });
  assert.equal(command.completion, "probe-exit");
  assert.deepEqual(command.args.slice(0, 2), ["-c", [
    'if test -x /usr/bin/python3; then exec /usr/bin/python3 -B -c "$1" "$2"; fi',
    'printf \'[pocketosix-guest]{"operation":"probe","requestId":"%s","state":"error","error":"Guest desktop probe failed"}\\n\' "$2"',
    "exit 1",
  ].join("\n")]);
  assert.equal(command.args[2], "pocketosix-guest-probe");
  assert.equal(command.args.length, 5);
});

test("probe nonce is positional data for Python and its fixed protocol error format", () => {
  const requestId = "unit-request_123";
  const command = guestProbeCommand(requestId);
  const other = guestProbeCommand("other-request_456");
  assert.deepEqual(command.args.slice(0, 4), other.args.slice(0, 4));
  assert.deepEqual(command.args.slice(4), [requestId]);
  assert.ok(!command.args[1].includes(requestId));
  assert.ok(!command.args[3].includes(requestId));
  assert.match(command.args[3], /request_id = sys\.argv\[1\]/);
  assert.match(command.args[3], /print\("\[pocketosix-guest\]" \+ json\.dumps\(dict\(operation="probe", requestId=request_id/);
  assert.match(command.args[3], /"requestId":"%s".*% request_id/);
});

test("discovery rejects stale or incomplete UNIX socket connections before invoking i3-msg", () => {
  const script = guestProbeCommand("unit-request_123").args[3];
  assert.match(script, /with socket\.socket\(socket\.AF_UNIX, socket\.SOCK_STREAM\) as connection:\s+connection\.setblocking\(False\)\s+connected = connection\.connect_ex\(path\)/);
  assert.match(script, /if connected != 0:\s+continue/);
  const preflight = script.indexOf("connection.connect_ex(path)");
  assert.ok(script.indexOf("info.st_uid <= 0") < preflight);
  assert.ok(preflight < script.indexOf('subprocess.run(["/usr/bin/i3-msg"'));
  assert.match(script, /if len\(live\) != 1:\s+raise RuntimeError\(\)/);
  assert.doesNotMatch(script, /os\.(unlink|remove|rmdir)|shell=True|settimeout/);
});

test("tree command preserves the verified user identity and safe positional Python arguments", () => {
  for (const session of [SESSION, { ...SESSION, uid: 2001, gid: 2002 }, { ...SESSION, gid: 0 }]) {
    const requestId = "unit-request_123";
    const command = guestTreeCommand(session, requestId);
    assert.equal(command.fileName, "/usr/bin/python3");
    assert.deepEqual(command.args.slice(0, 2), ["-B", "-c"]);
    assert.equal(typeof command.args[2], "string");
    assert.ok(command.args[2].length > 0);
    assert.deepEqual(command.args.slice(3), [requestId, session.socketPath]);
    assert.deepEqual(command.options, { uid: session.uid, gid: session.gid, cwd: "/" });
    assert.equal(command.completion, "ipc-ack");
  }
  const socketPath = "/tmp/i3 unit/'quoted';$(not-a-command)/%s`command`/ipc-socket.529";
  const command = guestTreeCommand({ ...SESSION, socketPath }, "other-request_456");
  assert.deepEqual(command.args.slice(0, 3), guestTreeCommand(SESSION, "unit-request_123").args.slice(0, 3));
  assert.deepEqual(command.args.slice(3), ["other-request_456", socketPath]);
  assert.ok(!command.args[2].includes(socketPath));
  assert.ok(!command.args[2].includes("other-request_456"));
  assert.match(command.args[2], /request_id, socket = sys\.argv\[1:3\]/);
  assert.deepEqual(command.options, OPTIONS);
});

test("tree wrapper captures bounded i3 output before emitting complete validated protocol frames", () => {
  const script = guestTreeCommand(SESSION, "unit-request_123").args[2];
  assert.match(script, /subprocess\.run\(\["\/usr\/bin\/i3-msg", "-s", socket, "-t", "get_tree"\],\s+stdout=subprocess\.PIPE, stderr=subprocess\.DEVNULL,\s+text=True, check=True, timeout=10\)/);
  assert.ok(!script.includes("shell=True"));
  assert.match(script, /tree = json\.loads\(result\.stdout\)\s+if not isinstance\(tree, dict\) or tree\.get\("type"\) != "root" or not isinstance\(tree\.get\("nodes"\), list\):\s+raise ValueError\("Invalid i3 tree"\)\s+sys\.stdout\.write\("\[pocketosix-tree:" \+ request_id \+ "\]" \+ json\.dumps\(tree, separators=\(",", ":"\)\) \+ "\\n"\)\s+sys\.stdout\.flush\(\)/);
  assert.match(script, /except \(OSError, ValueError, subprocess\.SubprocessError\):\s+sys\.stdout\.write\("\[pocketosix-guest\]" \+ json\.dumps\(dict\(operation="tree", requestId=request_id,\s+state="error", error="Guest desktop tree query failed"\)\) \+ "\\n"\)\s+sys\.stdout\.flush\(\)\s+raise SystemExit\(1\)/);
});

test("tree wrapper rejects root and invalid session metadata before constructing its command", () => {
  const invalidSessions: GuestDesktopSession[] = [
    ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((uid) => ({ ...SESSION, uid })),
    ...[-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((gid) => ({ ...SESSION, gid })),
    ...["", "tmp/ipc-socket.529", "/tmp/socket\0", "/tmp/socket\r", "/tmp/socket\n"].map((socketPath) => ({ ...SESSION, socketPath })),
  ];
  for (const session of invalidSessions) {
    assert.throws(() => guestTreeCommand(session, "unit-request_123"), /UID\/GID/);
  }
});
