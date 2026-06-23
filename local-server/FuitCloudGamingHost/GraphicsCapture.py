import argparse
import ctypes
import http.client
import os
import sys
import time
import urllib.parse
import urllib.request
from ctypes import wintypes

import cv2
from windows_capture import Frame, InternalCaptureControl, WindowsCapture


user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


class HelperPoster:
    def __init__(self, helper_url):
        parsed = urllib.parse.urlparse(helper_url)
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self.timeout = 2.0
        self.connection = None

    def close(self):
        if self.connection:
            try:
                self.connection.close()
            except Exception:
                pass
        self.connection = None

    def post(self, path, content_type, payload, timeout=None):
        if self.connection is None:
            self.connection = http.client.HTTPConnection(self.host, self.port, timeout=timeout or self.timeout)

        try:
            self.connection.request(
                "POST",
                path,
                body=payload,
                headers={
                    "Content-Type": content_type,
                    "Content-Length": str(len(payload)),
                    "Connection": "keep-alive",
                },
            )
            response = self.connection.getresponse()
            response.read()
            if response.status >= 400:
                raise RuntimeError(f"Helper returned HTTP {response.status}.")
        except Exception:
            self.close()
            raise

    def post_frame(self, payload):
        self.post("/api/frame", "image/jpeg", payload)

    def post_host_status(self):
        try:
            self.post("/api/host", "application/json", b"{}", timeout=1.0)
        except Exception:
            pass


def get_window_text(hwnd):
    length = user32.GetWindowTextLengthW(hwnd)
    if length <= 0:
        return ""
    buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buffer, length + 1)
    return buffer.value


def get_process_image_path(pid):
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return ""

    try:
        size = wintypes.DWORD(32768)
        buffer = ctypes.create_unicode_buffer(size.value)
        if kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return buffer.value
        return ""
    finally:
        kernel32.CloseHandle(handle)


def is_candidate_window(hwnd):
    if not user32.IsWindowVisible(hwnd):
        return False
    if user32.GetWindowTextLengthW(hwnd) <= 0:
        return False
    return True


def find_window_for_pid(pid):
    if pid <= 0:
        return 0

    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd, _lparam):
        window_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
        if window_pid.value == pid and is_candidate_window(hwnd):
            found.append(int(hwnd))
            return False
        return True

    user32.EnumWindows(enum_proc, 0)
    return found[0] if found else 0


def find_window_for_process_name(process_name):
    target = os.path.splitext(os.path.basename(process_name or "RMG"))[0].lower()
    found = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd, _lparam):
        if not is_candidate_window(hwnd):
            return True

        window_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
        image_path = get_process_image_path(window_pid.value)
        image_name = os.path.splitext(os.path.basename(image_path))[0].lower()
        title = get_window_text(hwnd).lower()

        if image_name == target or target in title:
            found.append(int(hwnd))
            return False
        return True

    user32.EnumWindows(enum_proc, 0)
    return found[0] if found else 0


def resolve_target_hwnd(process_id, process_name):
    hwnd = find_window_for_pid(process_id)
    if hwnd:
        return hwnd
    return find_window_for_process_name(process_name)


def encode_frame(frame, max_width, jpeg_quality):
    buffer = frame.frame_buffer
    if frame.width > max_width:
        scale = max_width / float(frame.width)
        target_size = (max(2, int(round(frame.width * scale))), max(2, int(round(frame.height * scale))))
        buffer = cv2.resize(buffer, target_size, interpolation=cv2.INTER_LINEAR)

    bgr = buffer[:, :, :3]
    ok, encoded = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), int(jpeg_quality)])
    if not ok:
        raise RuntimeError("Could not encode capture frame.")
    return encoded.tobytes()


def parse_args():
    parser = argparse.ArgumentParser(description="FUITS Windows Graphics Capture relay")
    parser.add_argument("--port", type=int, default=8175)
    parser.add_argument("--helper-url", default="")
    parser.add_argument("--process-id", type=int, default=0)
    parser.add_argument("--process-name", default="RMG")
    parser.add_argument("--max-width", type=int, default=448)
    parser.add_argument("--interval-ms", type=int, default=40)
    parser.add_argument("--jpeg-quality", type=int, default=35)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--output", default="")
    return parser.parse_args()


def main():
    args = parse_args()
    helper_url = args.helper_url.strip() or f"http://127.0.0.1:{args.port}"
    max_width = max(320, args.max_width)
    interval_ms = max(16, args.interval_ms)
    jpeg_quality = min(86, max(35, args.jpeg_quality))

    hwnd = resolve_target_hwnd(args.process_id, args.process_name)
    if not hwnd:
        raise RuntimeError(f"Could not find a visible {args.process_name} window.")

    next_frame_at = 0.0
    last_status_at = 0.0
    poster = HelperPoster(helper_url)
    interval_seconds = interval_ms / 1000.0

    capture = WindowsCapture(
        cursor_capture=False,
        draw_border=None,
        minimum_update_interval=interval_ms,
        window_hwnd=hwnd,
    )

    @capture.event
    def on_frame_arrived(frame: Frame, capture_control: InternalCaptureControl):
        nonlocal next_frame_at, last_status_at

        try:
            now = time.monotonic()
            if next_frame_at and now + 0.003 < next_frame_at:
                return
            if not next_frame_at or now - next_frame_at > 1.0:
                next_frame_at = now
            while next_frame_at <= now:
                next_frame_at += interval_seconds

            jpeg = encode_frame(frame, max_width, jpeg_quality)
            if args.output:
                with open(args.output, "wb") as output_file:
                    output_file.write(jpeg)
            if not args.once:
                poster.post_frame(jpeg)
                if now - last_status_at >= 2.0:
                    poster.post_host_status()
                    last_status_at = now
        except Exception:
            pass

        if args.once:
            capture_control.stop()

    @capture.event
    def on_closed():
        pass

    capture.start()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
