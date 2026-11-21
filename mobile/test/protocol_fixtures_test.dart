import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:synq/protocol/message.dart';

/// Runs the shared protocol fixtures (also used by the server and desktop) against the Dart parser.
void main() {
  final fixturesDir = Directory('../protocol/fixtures');

  List<(String, Object?)> load(String kind) {
    final files =
        Directory('${fixturesDir.path}/$kind')
            .listSync()
            .whereType<File>()
            .where((f) => f.path.endsWith('.json'))
            .toList()
          ..sort((a, b) => a.path.compareTo(b.path));
    return [
      for (final f in files)
        (f.uri.pathSegments.last, (jsonDecode(f.readAsStringSync()) as Map<String, dynamic>)['message']),
    ];
  }

  final valid = load('valid');
  final invalid = load('invalid');

  test('fixture sets are not empty', () {
    expect(valid, isNotEmpty);
    expect(invalid, isNotEmpty);
  });

  group('accepts valid fixtures', () {
    for (final (name, message) in valid) {
      test(name, () => expect(() => parseMessage(jsonEncode(message)), returnsNormally));
    }
  });

  group('rejects invalid fixtures', () {
    for (final (name, message) in invalid) {
      test(name, () => expect(() => parseMessage(jsonEncode(message)), throwsA(isA<ProtocolException>())));
    }
  });

  test('decodes an effect trigger', () {
    final (_, message) = valid.firstWhere((f) => f.$1 == 'effect-trigger.json');
    final parsed = parseMessage(jsonEncode(message));
    final body = parsed.body as EffectTriggerBody;
    expect(body.effectId, 'cosmic-portal');
    expect(body.duration, 6000);
    expect(body.intensity, 0.8);
    expect(body.sound, isTrue);
    expect(parsed.sig, isNotNull);
  });

  test('rejects oversized frames before decoding', () {
    expect(
      () => parseMessage(' ' * (maxFrameBytes + 1)),
      throwsA(isA<ProtocolException>().having((e) => e.code, 'code', ParseErrorCode.frameTooLarge)),
    );
  });

  test('rejects malformed JSON', () {
    expect(
      () => parseMessage('{nope'),
      throwsA(isA<ProtocolException>().having((e) => e.code, 'code', ParseErrorCode.malformedJson)),
    );
  });
}
