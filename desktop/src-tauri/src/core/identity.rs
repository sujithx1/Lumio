//! Device identity: an Ed25519 key pair whose private half never leaves this machine.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use std::path::PathBuf;
use std::sync::Mutex;

/// Where the 32-byte private key seed is kept.
pub trait KeyStore: Send + Sync {
    fn load(&self) -> Result<Option<[u8; 32]>, String>;
    fn save(&self, seed: &[u8; 32]) -> Result<(), String>;
    fn describe(&self) -> String;
}

/// OS credential store: macOS Keychain, Windows Credential Manager, Secret Service on Linux.
pub struct KeychainStore {
    service: String,
    account: String,
}

impl KeychainStore {
    pub fn new(service: &str, account: &str) -> Self {
        Self { service: service.into(), account: account.into() }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, &self.account).map_err(|e| format!("keychain unavailable: {e}"))
    }
}

impl KeyStore for KeychainStore {
    fn load(&self) -> Result<Option<[u8; 32]>, String> {
        match self.entry()?.get_password() {
            Ok(hex) => decode_seed(&hex).map(Some),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("keychain read failed: {e}")),
        }
    }

    fn save(&self, seed: &[u8; 32]) -> Result<(), String> {
        self.entry()?.set_password(&encode_hex(seed)).map_err(|e| format!("keychain write failed: {e}"))
    }

    fn describe(&self) -> String {
        "OS keychain".into()
    }
}

/// A file readable only by the current user. Used when no OS keychain is available, and for local multi-instance testing.
pub struct FileStore {
    path: PathBuf,
}

impl FileStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl KeyStore for FileStore {
    fn load(&self) -> Result<Option<[u8; 32]>, String> {
        match std::fs::read_to_string(&self.path) {
            Ok(hex) => decode_seed(hex.trim()).map(Some),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("cannot read {}: {e}", self.path.display())),
        }
    }

    fn save(&self, seed: &[u8; 32]) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        }
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        let mut file = options.open(&self.path).map_err(|e| format!("cannot write {}: {e}", self.path.display()))?;
        file.write_all(encode_hex(seed).as_bytes()).map_err(|e| e.to_string())
    }

    fn describe(&self) -> String {
        format!("file {}", self.path.display())
    }
}

/// In-memory store for tests.
#[derive(Default)]
pub struct MemoryStore(Mutex<Option<[u8; 32]>>);

impl KeyStore for MemoryStore {
    fn load(&self) -> Result<Option<[u8; 32]>, String> {
        Ok(*self.0.lock().unwrap())
    }
    fn save(&self, seed: &[u8; 32]) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(*seed);
        Ok(())
    }
    fn describe(&self) -> String {
        "memory".into()
    }
}

pub struct Identity {
    key: SigningKey,
    public_key: String,
}

impl Identity {
    /// Loads the key from the store, creating and saving a new one on first run.
    pub fn load_or_create(store: &dyn KeyStore) -> Result<Self, String> {
        if let Some(seed) = store.load()? {
            return Ok(Self::from_seed(&seed));
        }
        let mut seed = [0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut seed);
        store.save(&seed)?;
        log::info!("created a new device identity in {}", store.describe());
        Ok(Self::from_seed(&seed))
    }

    pub fn from_seed(seed: &[u8; 32]) -> Self {
        let key = SigningKey::from_bytes(seed);
        let public_key = URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes());
        Self { key, public_key }
    }

    /// Ed25519 public key, base64url without padding.
    pub fn public_key(&self) -> &str {
        &self.public_key
    }

    /// Signs bytes; returns the signature as base64url without padding.
    pub fn sign(&self, data: &[u8]) -> String {
        URL_SAFE_NO_PAD.encode(self.key.sign(data).to_bytes())
    }
}

/// Verifies a base64url Ed25519 signature against a base64url public key. Never panics.
pub fn verify(public_key: &str, data: &[u8], signature: &str) -> bool {
    let Ok(pk) = URL_SAFE_NO_PAD.decode(public_key) else { return false };
    let Ok(pk): Result<[u8; 32], _> = pk.try_into() else { return false };
    let Ok(vk) = VerifyingKey::from_bytes(&pk) else { return false };
    let Ok(sig) = URL_SAFE_NO_PAD.decode(signature) else { return false };
    let Ok(sig): Result<[u8; 64], _> = sig.try_into() else { return false };
    vk.verify(data, &Signature::from_bytes(&sig)).is_ok()
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_seed(hex: &str) -> Result<[u8; 32], String> {
    if hex.len() != 64 {
        return Err("stored identity is corrupt".into());
    }
    let mut out = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks(2).enumerate() {
        let s = std::str::from_utf8(chunk).map_err(|_| "stored identity is corrupt")?;
        out[i] = u8::from_str_radix(s, 16).map_err(|_| "stored identity is corrupt")?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_once_then_reloads_the_same_key() {
        let store = MemoryStore::default();
        let first = Identity::load_or_create(&store).unwrap();
        let second = Identity::load_or_create(&store).unwrap();
        assert_eq!(first.public_key(), second.public_key());
        assert_eq!(first.public_key().len(), 43);
    }

    #[test]
    fn signatures_verify_and_tampering_fails() {
        let id = Identity::from_seed(&[7u8; 32]);
        let sig = id.sign(b"hello");
        assert!(verify(id.public_key(), b"hello", &sig));
        assert!(!verify(id.public_key(), b"hellO", &sig));
        assert!(!verify(id.public_key(), b"hello", "garbage"));
    }

    #[test]
    fn file_store_round_trips_with_private_permissions() {
        let dir = std::env::temp_dir().join(format!("synq-test-{}", uuid::Uuid::now_v7()));
        let store = FileStore::new(dir.join("identity.key"));
        let id = Identity::load_or_create(&store).unwrap();
        assert_eq!(Identity::load_or_create(&store).unwrap().public_key(), id.public_key());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("identity.key")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        std::fs::remove_dir_all(dir).ok();
    }
}
