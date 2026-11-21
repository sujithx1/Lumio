// Device identity: an Ed25519 key pair whose private half never leaves the device.
import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the 32-byte private key seed and small settings are kept.
abstract interface class SecureStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

/// iOS Keychain / Android Keystore-backed storage.
class DeviceSecureStore implements SecureStore {
  DeviceSecureStore() : _storage = const FlutterSecureStorage();
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
}

/// In-memory storage for tests.
class MemoryStore implements SecureStore {
  final _values = <String, String>{};
  @override
  Future<String?> read(String key) async => _values[key];
  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}

final _ed25519 = Ed25519();

String b64url(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');
Uint8List b64urlDecode(String s) => base64Url.decode(base64Url.normalize(s));

class Identity {
  Identity._(this._keyPair, this.publicKey);

  final SimpleKeyPair _keyPair;

  /// Ed25519 public key, base64url without padding.
  final String publicKey;

  static const _seedKey = 'lumio.identity.seed';

  /// Loads the key, creating and storing a new one on first run.
  static Future<Identity> loadOrCreate(SecureStore store) async {
    final stored = await store.read(_seedKey);
    if (stored != null) return fromSeed(b64urlDecode(stored));
    final seed = SecretKeyData.random(length: 32).bytes;
    await store.write(_seedKey, b64url(seed));
    return fromSeed(seed);
  }

  static Future<Identity> fromSeed(List<int> seed) async {
    final keyPair = await _ed25519.newKeyPairFromSeed(seed);
    final pub = await keyPair.extractPublicKey();
    return Identity._(keyPair, b64url(pub.bytes));
  }

  /// Signs bytes; returns the signature as base64url without padding.
  Future<String> sign(List<int> data) async {
    final sig = await _ed25519.sign(data, keyPair: _keyPair);
    return b64url(sig.bytes);
  }
}

/// Verifies a base64url Ed25519 signature. Never throws.
Future<bool> verifySignature(String publicKey, List<int> data, String signature) async {
  try {
    final pk = b64urlDecode(publicKey);
    final sig = b64urlDecode(signature);
    if (pk.length != 32 || sig.length != 64) return false;
    return await _ed25519.verify(
      data,
      signature: Signature(sig, publicKey: SimplePublicKey(pk, type: KeyPairType.ed25519)),
    );
  } catch (_) {
    return false;
  }
}
