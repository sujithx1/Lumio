//! File-sharing helpers that do not depend on Tauri: hashing, safe names on disk, MIME guesses and
//! a verifying streamed download.
//!
//! Names in a FILE_OFFER come from another device and are untrusted. They are only ever used as the
//! final path component inside the user's chosen folder, after `sanitize_file_name`.

use futures_util::{Stream, StreamExt};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Read/write chunk size for hashing and uploads.
pub const CHUNK: usize = 256 * 1024;
/// Longest file name we create (bytes; most file systems allow 255).
const MAX_NAME_BYTES: usize = 200;

/// Lowercase hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Streams a file through SHA-256. Returns (hex digest, size in bytes).
pub async fn hash_file(path: &Path) -> std::io::Result<(String, u64)> {
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK];
    let mut size = 0u64;
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok((hex(&hasher.finalize()), size))
}

/// Makes an untrusted name safe to use as a single path component on macOS, Windows and Linux:
/// no separators, control characters, leading dots (hidden files / `..`), reserved characters or
/// trailing dots and spaces; at most `MAX_NAME_BYTES`, keeping the extension. Falls back to "file".
pub fn sanitize_file_name(name: &str) -> String {
    let mut cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    cleaned = cleaned.trim().trim_start_matches(['.', ' ']).trim_end_matches(['.', ' ']).to_string();

    if cleaned.len() > MAX_NAME_BYTES {
        let (stem, ext) = split_ext(&cleaned);
        let ext = if ext.len() <= 16 { ext } else { "" };
        let budget = MAX_NAME_BYTES - ext.len();
        let mut cut = budget.min(stem.len());
        while !stem.is_char_boundary(cut) {
            cut -= 1;
        }
        cleaned = format!("{}{ext}", &stem[..cut]);
    }

    // Names Windows reserves for devices, whatever the extension.
    let (stem, _) = split_ext(&cleaned);
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "LPT1", "LPT2", "LPT3"];
    if reserved.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        cleaned = format!("_{cleaned}");
    }
    if cleaned.is_empty() { "file".into() } else { cleaned }
}

/// Splits "photo.tar.gz" into ("photo.tar", ".gz"); names without a dot have no extension.
fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

/// `dir/name`, or `dir/name (1).ext`, `dir/name (2).ext`, ... if taken.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = split_ext(name);
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .expect("an unused name always exists")
}

/// Like `unique_path`, but atomically reserves the name by creating an empty file there (`create_new`),
/// so two downloads finishing at the same moment with the same name can never overwrite each other.
pub fn claim_unique_path(dir: &Path, name: &str) -> std::io::Result<PathBuf> {
    let (stem, ext) = split_ext(name);
    let candidates = std::iter::once(dir.join(name)).chain((1..).map(|i| dir.join(format!("{stem} ({i}){ext}"))));
    for candidate in candidates.take(10_000) {
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(_) => return Ok(candidate),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::other("no free file name"))
}

/// A MIME type for display and for the offer; never used for security decisions.
pub fn guess_mime(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "heif" => "image/heif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "tif" | "tiff" => "image/tiff",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" => "application/gzip",
        "txt" | "md" | "log" => "text/plain",
        "csv" => "text/csv",
        "json" => "application/json",
        "html" | "htm" => "text/html",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "key" => "application/vnd.apple.keynote",
        "pages" => "application/vnd.apple.pages",
        "numbers" => "application/vnd.apple.numbers",
        _ => "application/octet-stream",
    }
}

/// A display name for a local file that satisfies the protocol's FileName rule.
pub fn offer_name(path: &Path) -> String {
    let raw = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let clean: String = raw.chars().filter(|c| !c.is_control() && *c != '/' && *c != '\\').take(255).collect();
    if clean.is_empty() || clean == "." || clean == ".." { "file".into() } else { clean }
}

/// Why a download could not be saved.
#[derive(Debug, PartialEq, Eq)]
pub enum SaveError {
    /// The relay sent more or fewer bytes than offered, or different bytes.
    Mismatch,
    /// The connection failed mid-way.
    Network(String),
    /// The folder or file could not be written.
    Storage(String),
}

/// Writes `stream` to `<dir>/.lumio-<transfer_id>.part`, checking it against the signed size and
/// hash as it goes, then renames it to a unique, sanitised name in `dir`. The part file is removed
/// on any failure. `progress` receives the running byte count.
pub async fn save_verified<S, E>(
    mut stream: S,
    dir: &Path,
    transfer_id: &str,
    name: &str,
    size: u64,
    sha256: &str,
    mut progress: impl FnMut(u64),
) -> Result<PathBuf, SaveError>
where
    S: Stream<Item = Result<bytes::Bytes, E>> + Unpin,
    E: std::fmt::Display,
{
    tokio::fs::create_dir_all(dir).await.map_err(|e| SaveError::Storage(e.to_string()))?;
    // transfer_id is a validated UUID, so the part name cannot escape `dir`.
    let part = dir.join(format!(".lumio-{transfer_id}.part"));
    let result = async {
        let mut file = tokio::fs::File::create(&part).await.map_err(|e| SaveError::Storage(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut received = 0u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| SaveError::Network(e.to_string()))?;
            received += chunk.len() as u64;
            if received > size {
                return Err(SaveError::Mismatch);
            }
            hasher.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| SaveError::Storage(e.to_string()))?;
            progress(received);
        }
        file.flush().await.map_err(|e| SaveError::Storage(e.to_string()))?;
        file.sync_all().await.map_err(|e| SaveError::Storage(e.to_string()))?;
        drop(file);
        if received != size || hex(&hasher.finalize()) != sha256 {
            return Err(SaveError::Mismatch);
        }
        let target = claim_unique_path(dir, &sanitize_file_name(name)).map_err(|e| SaveError::Storage(e.to_string()))?;
        // Replaces only the empty placeholder this download just reserved, never someone else's file.
        if let Err(e) = tokio::fs::rename(&part, &target).await {
            let _ = tokio::fs::remove_file(&target).await;
            return Err(SaveError::Storage(e.to_string()));
        }
        Ok(target)
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lumio-files-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sanitises_hostile_names() {
        assert_eq!(sanitize_file_name("Beach day.jpg"), "Beach day.jpg");
        assert_eq!(sanitize_file_name("../../.ssh/authorized_keys"), "_.._.ssh_authorized_keys");
        assert_eq!(sanitize_file_name("..\\evil.exe"), "_evil.exe");
        assert_eq!(sanitize_file_name(".bashrc"), "bashrc");
        assert_eq!(sanitize_file_name(".."), "file");
        assert_eq!(sanitize_file_name("   "), "file");
        assert_eq!(sanitize_file_name("a:b*c?.txt"), "a_b_c_.txt");
        assert_eq!(sanitize_file_name("tab\there\u{7}.txt"), "tab_here_.txt");
        assert_eq!(sanitize_file_name("name. . "), "name");
        assert_eq!(sanitize_file_name("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_file_name("Résumé – 履歴書.pdf"), "Résumé – 履歴書.pdf");
    }

    #[test]
    fn long_names_keep_their_extension_and_char_boundaries() {
        let long = format!("{}.jpeg", "履".repeat(120));
        let s = sanitize_file_name(&long);
        assert!(s.len() <= MAX_NAME_BYTES, "{} bytes", s.len());
        assert!(s.ends_with(".jpeg"));
    }

    #[test]
    fn unique_names_count_up() {
        let dir = temp_dir();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a.txt"));
        std::fs::write(dir.join("a.txt"), "1").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (1).txt"));
        std::fs::write(dir.join("a (1).txt"), "2").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (2).txt"));
        std::fs::write(dir.join("README"), "x").unwrap();
        assert_eq!(unique_path(&dir, "README"), dir.join("README (1)"));

        // Reserving is atomic: each claim gets its own name even before anything is written to it.
        let first = claim_unique_path(&dir, "same.jpg").unwrap();
        let second = claim_unique_path(&dir, "same.jpg").unwrap();
        assert_eq!(first, dir.join("same.jpg"));
        assert_eq!(second, dir.join("same (1).jpg"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn guesses_common_mime_types() {
        assert_eq!(guess_mime(Path::new("/x/IMG_0001.HEIC")), "image/heic");
        assert_eq!(guess_mime(Path::new("clip.mov")), "video/quicktime");
        assert_eq!(guess_mime(Path::new("notes")), "application/octet-stream");
        for ext in ["jpg", "png", "mp4", "pdf", "docx", "svg", "zip", "unknown"] {
            assert!(crate::protocol::is_mime(guess_mime(Path::new(&format!("a.{ext}")))), "{ext}");
        }
    }

    #[test]
    fn offer_names_follow_the_protocol() {
        assert_eq!(offer_name(Path::new("/tmp/Beach day.jpg")), "Beach day.jpg");
        assert!(crate::protocol::is_file_name(&offer_name(Path::new(&"x".repeat(300)))));
        assert_eq!(offer_name(Path::new("/")), "file");
    }

    #[tokio::test]
    async fn hashes_files_in_chunks() {
        let dir = temp_dir();
        let path = dir.join("big.bin");
        let data: Vec<u8> = (0..(CHUNK * 2 + 17)).map(|i| (i % 251) as u8).collect();
        std::fs::write(&path, &data).unwrap();
        assert_eq!(hash_file(&path).await.unwrap(), (sha256_hex(&data), data.len() as u64));
        std::fs::remove_dir_all(dir).ok();
    }

    fn chunks(parts: &[&'static [u8]]) -> impl Stream<Item = Result<bytes::Bytes, String>> + Unpin {
        stream::iter(parts.iter().map(|p| Ok(bytes::Bytes::from_static(p))).collect::<Vec<_>>())
    }

    #[tokio::test]
    async fn saves_verified_downloads_under_a_safe_unique_name() {
        let dir = temp_dir();
        std::fs::write(dir.join("photo.jpg"), "existing").unwrap();
        let body = b"hello world";
        let id = "0193a2b7-0000-7000-8000-0000000000f1";
        let mut seen = 0;
        let path = save_verified(chunks(&[b"hello ", b"world"]), &dir, id, "../photo.jpg", 11, &sha256_hex(body), |n| seen = n)
            .await
            .unwrap();
        assert_eq!(path, dir.join("_photo.jpg"));
        assert_eq!(std::fs::read(&path).unwrap(), body);
        assert_eq!(seen, 11);
        let again = save_verified(chunks(&[b"hello world"]), &dir, id, "photo.jpg", 11, &sha256_hex(body), |_| {}).await.unwrap();
        assert_eq!(again, dir.join("photo (1).jpg"));
        assert_eq!(std::fs::read_to_string(dir.join("photo.jpg")).unwrap(), "existing");
        std::fs::remove_dir_all(dir).ok();
    }

    #[tokio::test]
    async fn rejects_wrong_bytes_and_cleans_up() {
        let dir = temp_dir();
        let id = "0193a2b7-0000-7000-8000-0000000000f2";
        let good = sha256_hex(b"abcd");
        let wrong = save_verified(chunks(&[b"abce"]), &dir, id, "a.txt", 4, &good, |_| {}).await;
        assert_eq!(wrong, Err(SaveError::Mismatch));
        let too_many = save_verified(chunks(&[b"abcd", b"e"]), &dir, id, "a.txt", 4, &good, |_| {}).await;
        assert_eq!(too_many, Err(SaveError::Mismatch));
        let too_few = save_verified(chunks(&[b"abc"]), &dir, id, "a.txt", 4, &good, |_| {}).await;
        assert_eq!(too_few, Err(SaveError::Mismatch));
        let broken = save_verified(
            stream::iter(vec![Ok(bytes::Bytes::from_static(b"ab")), Err("reset".to_string())]),
            &dir,
            id,
            "a.txt",
            4,
            &good,
            |_| {},
        )
        .await;
        assert_eq!(broken, Err(SaveError::Network("reset".into())));
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "part files must be removed");
        std::fs::remove_dir_all(dir).ok();
    }
}
