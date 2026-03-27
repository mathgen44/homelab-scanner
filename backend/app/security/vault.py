"""
AES-256 credential vault.
Credentials are stored encrypted at rest using a key derived from a local .key file.
The key file is generated on first run and never leaves the container volume.
"""
import os
import json
import base64
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
KEY_FILE = DATA_DIR / "vault.key"
VAULT_FILE = DATA_DIR / "vault.enc"


def _load_or_create_key() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists():
        return KEY_FILE.read_bytes()
    key = AESGCM.generate_key(bit_length=256)
    KEY_FILE.write_bytes(key)
    KEY_FILE.chmod(0o600)
    return key


def _get_cipher() -> AESGCM:
    return AESGCM(_load_or_create_key())


def _load_vault() -> dict:
    if not VAULT_FILE.exists():
        return {}
    try:
        raw = VAULT_FILE.read_bytes()
        nonce, ct = raw[:12], raw[12:]
        plaintext = _get_cipher().decrypt(nonce, ct, None)
        return json.loads(plaintext.decode())
    except Exception:
        return {}


def _save_vault(data: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    plaintext = json.dumps(data).encode()
    nonce = os.urandom(12)
    ct = _get_cipher().encrypt(nonce, plaintext, None)
    VAULT_FILE.write_bytes(nonce + ct)
    VAULT_FILE.chmod(0o600)


def store_credential(node_id: str, username: str, password: str, port: int = 22):
    vault = _load_vault()
    vault[node_id] = {"username": username, "password": password, "port": port}
    _save_vault(vault)


def get_credential(node_id: str) -> dict | None:
    vault = _load_vault()
    return vault.get(node_id)


def delete_credential(node_id: str):
    vault = _load_vault()
    vault.pop(node_id, None)
    _save_vault(vault)


def list_stored_ids() -> list[str]:
    return list(_load_vault().keys())
