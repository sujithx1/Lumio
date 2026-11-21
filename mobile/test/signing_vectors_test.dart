import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:synq/core/identity.dart';
import 'package:synq/protocol/canonical.dart';
import 'package:synq/protocol/message.dart';

/// The same vectors the server (TypeScript) and desktop (Rust) tests use.
void main() {
  final doc = jsonDecode(File('../protocol/fixtures/signing/vectors.json').readAsStringSync()) as Map<String, dynamic>;
  final seedHex = doc['seedHex'] as String;
  final seed = [for (var i = 0; i < seedHex.length; i += 2) int.parse(seedHex.substring(i, i + 2), radix: 16)];

  test('seed derives the published public key', () async {
    expect((await Identity.fromSeed(seed)).publicKey, doc['publicKey']);
  });

  for (final (i, c) in (doc['cases'] as List).cast<Map<String, dynamic>>().indexed) {
    test('case $i: canonical form, deterministic signature, verification, parsing', () async {
      final message = c['message'] as Map<String, dynamic>;
      final input = signingInput(message);
      expect(utf8.decode(input), c['canonical']);
      final identity = await Identity.fromSeed(seed);
      expect(await identity.sign(input), message['sig']);
      expect(await verifySignature(doc['publicKey'] as String, input, message['sig'] as String), isTrue);
      expect(() => parseMessage(jsonEncode(message)), returnsNormally);
    });
  }

  test('tampering breaks verification', () async {
    final message = Map<String, dynamic>.of((doc['cases'] as List).first['message'] as Map<String, dynamic>);
    message['payload'] = {...(message['payload'] as Map<String, dynamic>), 'intensity': 0.81};
    expect(await verifySignature(doc['publicKey'] as String, signingInput(message), message['sig'] as String), isFalse);
  });

  test('numbers follow ECMAScript formatting', () {
    expect(
      canonicalize({'b': 1.0, 'a': 0.35, 'c': 1e-7, 'd': -0.5, 'e': 12}),
      '{"a":0.35,"b":1,"c":1e-7,"d":-0.5,"e":12}',
    );
  });

  test('uuidV7 is a valid lowercase v7 UUID and time ordered', () {
    final a = uuidV7(DateTime.fromMillisecondsSinceEpoch(1763712000000));
    final b = uuidV7(DateTime.fromMillisecondsSinceEpoch(1763712000001));
    expect(isUuid(a), isTrue);
    expect(a[14], '7');
    expect(a.compareTo(b), lessThan(0));
  });
}
