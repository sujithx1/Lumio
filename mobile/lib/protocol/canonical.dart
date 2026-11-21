// RFC 8785 (JCS) canonical JSON for the value shapes Synq uses.
// Must match server/src/protocol/canonical.ts and the Rust implementation byte for byte;
// protocol/fixtures/signing/vectors.json enforces that (test/signing_vectors_test.dart).
import 'dart:convert';
import 'dart:math' as math;

String canonicalize(Object? value) {
  final out = StringBuffer();
  _write(value, out);
  return out.toString();
}

void _write(Object? value, StringBuffer out) {
  switch (value) {
    case null:
      out.write('null');
    case bool b:
      out.write(b ? 'true' : 'false');
    case int i:
      out.write(i.toString());
    case double d:
      out.write(_number(d));
    case String s:
      out.write(jsonEncode(s));
    case List<dynamic> list:
      out.write('[');
      for (var i = 0; i < list.length; i++) {
        if (i > 0) out.write(',');
        _write(list[i], out);
      }
      out.write(']');
    case Map<String, dynamic> map:
      // Keys Synq uses are ASCII, where code-unit order equals UTF-16 order.
      final keys = map.keys.toList()..sort();
      out.write('{');
      for (var i = 0; i < keys.length; i++) {
        if (i > 0) out.write(',');
        out.write(jsonEncode(keys[i]));
        out.write(':');
        _write(map[keys[i]], out);
      }
      out.write('}');
    default:
      throw ArgumentError('cannot canonicalize ${value.runtimeType}');
  }
}

/// ECMAScript Number#toString semantics for finite doubles.
String _number(double d) {
  if (!d.isFinite) throw ArgumentError('non-finite numbers cannot be canonicalized');
  if (d == d.truncateToDouble() && d.abs() < 1e21) return d.toInt().toString();
  return d.toString(); // Dart's shortest round-trip form matches JS for the ranges Synq uses.
}

/// Bytes a sender signs: canonical JSON of the message with `sig` removed.
List<int> signingInput(Map<String, dynamic> message) {
  final copy = Map<String, dynamic>.of(message)..remove('sig');
  return utf8.encode(canonicalize(copy));
}

/// Rounds to two decimals so every implementation signs the same number.
double roundIntensity(double v) => (v.clamp(0.0, 1.0) * 100).round() / 100;

final _rng = math.Random.secure();

/// RFC 9562 UUIDv7: 48-bit Unix ms timestamp + random bits, lowercase hyphenated.
String uuidV7([DateTime? now]) {
  final ms = (now ?? DateTime.now()).millisecondsSinceEpoch;
  final bytes = List<int>.generate(16, (_) => _rng.nextInt(256));
  for (var i = 0; i < 6; i++) {
    bytes[i] = (ms >> (8 * (5 - i))) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
