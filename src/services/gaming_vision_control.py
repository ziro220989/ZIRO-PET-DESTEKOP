import ctypes
import ctypes.wintypes
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import winreg
from pathlib import Path

import cv2
import mss
import numpy as np
import psutil
import win32con
import win32gui

# Ensure UTF-8 stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


class User32Input:
    """Safe Windows UI mouse/focus helper using standard user32 API (no game memory access)."""

    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004

    @staticmethod
    def move_and_click(x: int, y: int) -> None:
        ctypes.windll.user32.SetCursorPos(int(x), int(y))
        time.sleep(0.06)
        ctypes.windll.user32.mouse_event(User32Input.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        time.sleep(0.05)
        ctypes.windll.user32.mouse_event(User32Input.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def find_steam_exe() -> str:
    reg_paths = [
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamExe"),
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
    ]
    for root, subkey, val_name in reg_paths:
        try:
            with winreg.OpenKey(root, subkey) as key:
                val, _ = winreg.QueryValueEx(key, val_name)
                if val:
                    p = Path(val)
                    if p.is_file() and p.name.lower() == "steam.exe":
                        return str(p)
                    exe = p / "steam.exe"
                    if exe.exists():
                        return str(exe)
        except OSError:
            continue

    for fallback in [
        r"C:\Program Files (x86)\Steam\steam.exe",
        r"C:\Program Files\Steam\steam.exe",
        r"D:\Steam\steam.exe",
    ]:
        if os.path.exists(fallback):
            return fallback
    return ""


def is_cs2_installed(steam_exe: str) -> bool:
    if not steam_exe:
        return False
    steam_dir = Path(steam_exe).parent
    steamapps = steam_dir / "steamapps"
    if (steamapps / "appmanifest_730.acf").exists():
        return True
    vdf = steamapps / "libraryfolders.vdf"
    if vdf.exists():
        try:
            content = vdf.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'"path"\s+"([^"]+)"', content):
                lib_path = Path(m.group(1).replace("\\\\", "\\"))
                if (lib_path / "steamapps" / "appmanifest_730.acf").exists():
                    return True
        except Exception:
            pass
    return False


def get_process_running(names) -> bool:
    target = {n.lower() for n in names}
    for proc in psutil.process_iter(["name"]):
        try:
            pname = (proc.info.get("name") or "").lower()
            if pname in target:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


def find_cs2_window():
    found = []

    def enum_cb(hwnd, _):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return True
            title = (win32gui.GetWindowText(hwnd) or "").lower()
            if "counter-strike" in title or "cs2" in title:
                rect = win32gui.GetWindowRect(hwnd)
                if win32gui.IsIconic(hwnd) or (rect[2] - rect[0] > 300 and rect[3] - rect[1] > 200):
                    found.append((hwnd, rect, win32gui.GetWindowText(hwnd)))
        except Exception:
            pass
        return True

    try:
        win32gui.EnumWindows(enum_cb, None)
    except Exception:
        pass
    return found[0] if found else None


def focus_cs2_window() -> bool:
    win = find_cs2_window()
    if not win:
        return False
    hwnd = win[0]
    try:
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(hwnd)
        time.sleep(0.25)
        return True
    except Exception:
        return False


def capture_region(rect=None):
    try:
        with mss.MSS() as sct:
            if rect:
                left, top, right, bottom = rect
                monitor = {
                    "left": max(0, left),
                    "top": max(0, top),
                    "width": max(100, right - left),
                    "height": max(100, bottom - top),
                }
            else:
                monitor = sct.monitors[1]
            shot = sct.grab(monitor)
            img = np.array(shot)[:, :, :3]  # BGR
            return img, monitor["left"], monitor["top"]
    except Exception:
        try:
            from PIL import ImageGrab
            bbox = rect if rect and (rect[2] - rect[0] > 100 and rect[3] - rect[1] > 100) else None
            pil_img = ImageGrab.grab(bbox=bbox)
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            ox, oy = (bbox[0], bbox[1]) if bbox else (0, 0)
            return img, ox, oy
        except Exception:
            return None, 0, 0


def run_windows_ocr(bgr_img) -> list:
    """Uses Windows built-in WinRT OcrEngine via PowerShell to return [{text, x, y, w, h}]."""
    if bgr_img is None or getattr(bgr_img, "size", 0) == 0:
        return []
    tmp_path = os.path.join(tempfile.gettempdir(), f"ziro_ocr_{os.getpid()}.png")
    cv2.imwrite(tmp_path, bgr_img)
    ps_script = f"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
function Await($WinRtTask, $ResultType) {{
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}}
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync('{tmp_path.replace("'", "''")}')) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$words = @()
foreach ($line in $result.Lines) {{
  foreach ($w in $line.Words) {{
    $r = $w.BoundingRect
    $words += [PSCustomObject]@{{ text = $w.Text; x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height }}
  }}
}}
$words | ConvertTo-Json -Compress
"""
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=12,
        )
        raw = (proc.stdout or "").strip()
        if not raw:
            return []
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return [parsed]
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


def find_ocr_target(words: list, keywords: list, offset_x: int, offset_y: int):
    low_keys = [k.lower() for k in keywords]
    for w in words:
        txt = (w.get("text") or "").strip().lower()
        for k in low_keys:
            if k == txt or k in txt:
                cx = offset_x + int(w["x"]) + int(w["w"]) // 2
                cy = offset_y + int(w["y"]) + int(w["h"]) // 2
                return {"text": w.get("text"), "x": cx, "y": cy, "bbox": w}
    return None


def detect_green_accept_button(bgr_img, offset_x: int, offset_y: int):
    """Detects CS2's bright green ACCEPT / ACEPTAR button in the central area via OpenCV HSV."""
    if bgr_img is None or getattr(bgr_img, "size", 0) == 0:
        return None
    h, w, _ = bgr_img.shape
    roi_x0, roi_x1 = int(w * 0.25), int(w * 0.75)
    roi_y0, roi_y1 = int(h * 0.25), int(h * 0.78)
    roi = bgr_img[roi_y0:roi_y1, roi_x0:roi_x1]

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    # CS2 Accept button is vibrant green
    lower_green = np.array([38, 90, 90])
    upper_green = np.array([85, 255, 255])
    mask = cv2.inRange(hsv, lower_green, upper_green)
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        # Rectangular button shape (wider than tall, meaningful size)
        if bw >= 110 and bh >= 35 and bw > bh * 1.6 and area > best_area:
            best_area = area
            best = (offset_x + roi_x0 + x + bw // 2, offset_y + roi_y0 + y + bh // 2, bw, bh)
    return best


def get_status():
    steam_exe = find_steam_exe()
    steam_running = get_process_running(["steam.exe"])
    cs2_running = get_process_running(["cs2.exe"])
    cs2_installed = is_cs2_installed(steam_exe)
    win = find_cs2_window()
    return {
        "success": True,
        "steamInstalled": bool(steam_exe),
        "steamPath": steam_exe,
        "steamRunning": steam_running,
        "cs2Installed": cs2_installed,
        "cs2Running": cs2_running,
        "cs2WindowFound": bool(win),
    }


def open_steam():
    if get_process_running(["steam.exe"]):
        return {"success": True, "alreadyRunning": True, "message": "Steam ya estaba abierto."}
    steam_exe = find_steam_exe()
    if not steam_exe:
        return {"success": False, "message": "No se encontró Steam instalado en el sistema."}
    subprocess.Popen([steam_exe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(15):
        time.sleep(1.0)
        if get_process_running(["steam.exe"]):
            return {"success": True, "message": "Steam se abrió correctamente."}
    return {"success": False, "message": "Se lanzó Steam, pero no se confirmó el proceso a tiempo."}


def close_steam():
    if not get_process_running(["steam.exe"]):
        return {"success": True, "alreadyClosed": True, "message": "Steam ya estaba cerrado."}
    steam_exe = find_steam_exe()
    if steam_exe:
        subprocess.Popen([steam_exe, "-shutdown"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(8):
            time.sleep(0.8)
            if not get_process_running(["steam.exe"]):
                return {"success": True, "message": "Steam se cerró correctamente."}
    for proc in psutil.process_iter(["name"]):
        if (proc.info.get("name") or "").lower() == "steam.exe":
            try:
                proc.terminate()
            except Exception:
                pass
    time.sleep(1.0)
    return {
        "success": not get_process_running(["steam.exe"]),
        "message": "Steam cerrado correctamente." if not get_process_running(["steam.exe"]) else "No se pudo cerrar Steam por completo.",
    }


def open_cs2(wait_window: bool = True):
    steam_exe = find_steam_exe()
    if not steam_exe:
        return {"success": False, "message": "Steam no está instalado."}
    if not is_cs2_installed(steam_exe):
        return {"success": False, "message": "Counter-Strike 2 (AppID 730) no está instalado en tus bibliotecas de Steam."}

    if get_process_running(["cs2.exe"]):
        focus_cs2_window()
        return {"success": True, "alreadyRunning": True, "message": "Counter-Strike 2 ya está abierto."}

    if not get_process_running(["steam.exe"]):
        st = open_steam()
        if not st.get("success"):
            return st
        time.sleep(2.0)

    os.startfile("steam://rungameid/730")
    if not wait_window:
        return {"success": True, "message": "Iniciando Counter-Strike 2 desde Steam."}

    for _ in range(45):
        time.sleep(1.5)
        if get_process_running(["cs2.exe"]) and find_cs2_window():
            return {"success": True, "message": "Counter-Strike 2 se inició correctamente."}
    if get_process_running(["cs2.exe"]):
        return {"success": True, "message": "Counter-Strike 2 está cargando en segundo plano."}
    return {"success": False, "message": "No se pudo confirmar el inicio de Counter-Strike 2."}


def close_cs2():
    if not get_process_running(["cs2.exe"]):
        return {"success": True, "alreadyClosed": True, "message": "Counter-Strike 2 ya estaba cerrado."}
    for proc in psutil.process_iter(["name"]):
        if (proc.info.get("name") or "").lower() == "cs2.exe":
            try:
                proc.terminate()
            except Exception:
                pass
    time.sleep(1.5)
    closed = not get_process_running(["cs2.exe"])
    return {
        "success": closed,
        "message": "Counter-Strike 2 cerrado correctamente." if closed else "No se pudo cerrar Counter-Strike 2.",
    }


def start_premier():
    if not get_process_running(["cs2.exe"]):
        launch = open_cs2(wait_window=True)
        if not launch.get("success"):
            return launch
        # Esperar carga del menú principal
        time.sleep(6.0)

    if not focus_cs2_window():
        return {"success": False, "message": "No se encontró la ventana visible de Counter-Strike 2."}

    win = find_cs2_window()
    rect = win[1] if win else None

    # Paso 1: Esperar y detectar el menú principal ("JUGAR" / "PLAY" o directamente "PREMIER")
    premier_btn = None
    play_btn = None
    for _ in range(8):
        img, ox, oy = capture_region(rect)
        words = run_windows_ocr(img)
        premier_btn = find_ocr_target(words, ["premier"], ox, oy)
        if premier_btn:
            break
        play_btn = find_ocr_target(words, ["jugar", "play"], ox, oy)
        if play_btn:
            User32Input.move_and_click(play_btn["x"], play_btn["y"])
            time.sleep(1.2)
            break
        time.sleep(1.2)

    # Paso 2: Localizar y seleccionar Premier
    if not premier_btn:
        img, ox, oy = capture_region(rect)
        words = run_windows_ocr(img)
        premier_btn = find_ocr_target(words, ["premier"], ox, oy)

    if not premier_btn:
        return {
            "success": False,
            "message": "No pude detectar visualmente el botón 'Premier' en la pantalla de Counter-Strike 2 (no haré clics a ciegas).",
        }

    User32Input.move_and_click(premier_btn["x"], premier_btn["y"])
    time.sleep(1.0)

    # Paso 3: Localizar botón de iniciar búsqueda ("INICIAR" / "GO" / "BUSCAR")
    img, ox, oy = capture_region(rect)
    words = run_windows_ocr(img)
    go_btn = find_ocr_target(words, ["iniciar", "buscar", "go", "start"], ox, oy)
    if not go_btn:
        return {
            "success": False,
            "message": "Seleccioné Premier, pero no detecté visualmente el botón 'INICIAR / GO' habilitado.",
        }

    User32Input.move_and_click(go_btn["x"], go_btn["y"])
    return {
        "success": True,
        "message": "Modo Premier seleccionado y búsqueda de partida iniciada en Counter-Strike 2.",
    }


def accept_match():
    if not get_process_running(["cs2.exe"]):
        return {"success": False, "message": "Counter-Strike 2 no está abierto."}
    if not focus_cs2_window():
        return {"success": False, "message": "No se pudo enfocar la ventana de Counter-Strike 2."}

    win = find_cs2_window()
    rect = win[1] if win else None
    img, ox, oy = capture_region(rect)

    # Comprobación visual combinada: botón verde OpenCV + texto OCR ("ACEPTAR" / "ACCEPT")
    words = run_windows_ocr(img)
    ocr_accept = find_ocr_target(words, ["aceptar", "accept"], ox, oy)
    green_btn = detect_green_accept_button(img, ox, oy)

    target_xy = None
    if ocr_accept and green_btn:
        # Verificar coincidencia espacial aproximada
        gx, gy, gw, gh = green_btn
        if abs(ocr_accept["x"] - gx) < gw and abs(ocr_accept["y"] - gy) < gh:
            target_xy = (gx, gy)
        else:
            target_xy = (ocr_accept["x"], ocr_accept["y"])
    elif ocr_accept:
        target_xy = (ocr_accept["x"], ocr_accept["y"])
    elif green_btn:
        target_xy = (green_btn[0], green_btn[1])

    if not target_xy:
        return {
            "success": False,
            "message": "No detecté el botón de 'ACEPTAR / ACCEPT' visible en Counter-Strike 2.",
        }

    # Pulsar una sola vez
    User32Input.move_and_click(target_xy[0], target_xy[1])
    time.sleep(1.5)

    # Verificación visual posterior
    img_after, ox2, oy2 = capture_region(rect)
    words_after = run_windows_ocr(img_after)
    still_ocr = find_ocr_target(words_after, ["aceptar", "accept"], ox2, oy2)
    still_green = detect_green_accept_button(img_after, ox2, oy2)

    if not still_ocr and not still_green:
        return {"success": True, "message": "¡Partida aceptada y verificada en Counter-Strike 2!"}
    return {
        "success": True,
        "message": "Botón de aceptación pulsado. Esperando confirmación de los demás jugadores.",
    }


def main():
    action = (sys.argv[1] if len(sys.argv) > 1 else "status").strip().lower()
    if action == "status":
        res = get_status()
    elif action == "open_steam":
        res = open_steam()
    elif action == "close_steam":
        res = close_steam()
    elif action == "open_cs2":
        res = open_cs2(wait_window=True)
    elif action == "close_cs2":
        res = close_cs2()
    elif action == "start_premier":
        res = start_premier()
    elif action == "accept_match":
        res = accept_match()
    elif action == "ocr_scan":
        win = find_cs2_window()
        img, ox, oy = capture_region(win[1] if win else None)
        words = run_windows_ocr(img)
        res = {"success": True, "wordCount": len(words), "sample": [w.get("text") for w in words[:25]]}
    else:
        res = {"success": False, "message": f"Acción desconocida: {action}"}

    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
