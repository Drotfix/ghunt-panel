import base64
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

CREDS_PATH = Path.home() / ".malfrats" / "ghunt" / "creds.m"

NOT_FOUND_HINT = (
    "The 'ghunt' command was not found on PATH. Install it with `pip install ghunt` "
    "in the same environment you're running ghunt-panel from, then restart the panel."
)


def find_ghunt_bin():
    """Locate the ghunt executable on PATH. Returns None if not installed."""
    return shutil.which("ghunt")


def run_ghunt(args, stdin_text=None, timeout=120):
    """Run the ghunt CLI and capture combined output. Raises FileNotFoundError if missing."""
    ghunt_bin = find_ghunt_bin()
    if not ghunt_bin:
        raise FileNotFoundError(NOT_FOUND_HINT)
    proc = subprocess.run(
        [ghunt_bin, *args],
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return proc.stdout, proc.stderr, proc.returncode


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status():
    if not find_ghunt_bin():
        return jsonify({"logged_in": False, "ghunt_installed": False, "error": NOT_FOUND_HINT})

    if not CREDS_PATH.is_file():
        return jsonify({"logged_in": False, "ghunt_installed": True})
    try:
        raw = CREDS_PATH.read_text(encoding="utf-8")
        data = json.loads(base64.b64decode(raw).decode())
        has_master = bool(data.get("android", {}).get("master_token"))
    except Exception:
        has_master = False
    return jsonify({
        "logged_in": has_master,
        "ghunt_installed": True,
        "creds_path": str(CREDS_PATH),
        "modified": CREDS_PATH.stat().st_mtime,
    })


@app.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(force=True)
    method = body.get("method")  # "2" (base64 companion), "3" (oauth_token) or "4" (master token)
    value = body.get("value", "").strip()

    if method not in ("2", "3", "4") or not value:
        return jsonify({"ok": False, "error": "Missing method or value."}), 400

    # Feed the interactive prompt: main choice, then the pasted value.
    stdin_text = f"{method}\n{value}\n"
    try:
        stdout, stderr, code = run_ghunt(["login"], stdin_text=stdin_text, timeout=90)
    except FileNotFoundError as e:
        return jsonify({"ok": False, "error": str(e)}), 503
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "Timed out talking to Google. Try again."}), 504

    ok = CREDS_PATH.is_file() and code == 0
    return jsonify({"ok": ok, "stdout": stdout, "stderr": stderr, "code": code})


@app.route("/api/logout", methods=["POST"])
def logout():
    try:
        stdout, stderr, code = run_ghunt(["login", "--clean"])
    except FileNotFoundError as e:
        return jsonify({"ok": False, "error": str(e)}), 503
    return jsonify({"ok": code == 0, "stdout": stdout, "stderr": stderr})


def run_json_module(cmd_args):
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        stdout, stderr, code = run_ghunt([*cmd_args, "--json", str(tmp_path)])
        data = None
        if tmp_path.is_file() and tmp_path.stat().st_size > 0:
            try:
                data = json.loads(tmp_path.read_text(encoding="utf-8"))
            except Exception:
                data = None
        return {"ok": code == 0, "data": data, "stdout": stdout, "stderr": stderr}
    finally:
        tmp_path.unlink(missing_ok=True)


def run_json_module_response(cmd_args):
    try:
        return jsonify(run_json_module(cmd_args))
    except FileNotFoundError as e:
        return jsonify({"ok": False, "error": str(e)}), 503


@app.route("/api/email", methods=["POST"])
def email_lookup():
    email = request.get_json(force=True).get("email", "").strip()
    if not email:
        return jsonify({"ok": False, "error": "Email is required."}), 400
    return run_json_module_response(["email", email])


@app.route("/api/gaia", methods=["POST"])
def gaia_lookup():
    gaia_id = request.get_json(force=True).get("gaia_id", "").strip()
    if not gaia_id:
        return jsonify({"ok": False, "error": "Gaia ID is required."}), 400
    return run_json_module_response(["gaia", gaia_id])


@app.route("/api/drive", methods=["POST"])
def drive_lookup():
    file_id = request.get_json(force=True).get("file_id", "").strip()
    if not file_id:
        return jsonify({"ok": False, "error": "File/folder ID is required."}), 400
    return run_json_module_response(["drive", file_id])


@app.route("/api/geolocate", methods=["POST"])
def geolocate_lookup():
    bssid = request.get_json(force=True).get("bssid", "").strip()
    if not bssid:
        return jsonify({"ok": False, "error": "BSSID is required."}), 400
    return run_json_module_response(["geolocate", "-b", bssid])


@app.route("/api/spiderdal", methods=["POST"])
def spiderdal_lookup():
    body = request.get_json(force=True)
    args = ["spiderdal"]
    if body.get("package"):
        args += ["-p", body["package"].strip()]
    if body.get("fingerprint"):
        args += ["-f", body["fingerprint"].strip()]
    if body.get("url"):
        args += ["-u", body["url"].strip()]
    if len(args) == 1:
        return jsonify({"ok": False, "error": "Provide a package, fingerprint or URL."}), 400
    return run_json_module_response(args)


def main():
    """Console-script entry point: `ghunt-panel`."""
    port = int(os.environ.get("PORT", 5151))
    if not find_ghunt_bin():
        print(f"[!] Warning: {NOT_FOUND_HINT}")
    print(f"[*] ghunt-panel starting on http://127.0.0.1:{port} (local only)")
    app.run(host="127.0.0.1", port=port, debug=False)


if __name__ == "__main__":
    main()
