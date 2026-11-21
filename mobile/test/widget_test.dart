import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:synq/app.dart';
import 'package:synq/core/api.dart';
import 'package:synq/core/engine.dart';
import 'package:synq/core/identity.dart';
import 'package:synq/effects/catalog.dart';
import 'package:synq/effects/renderers.dart';
import 'package:synq/protocol/message.dart' show isEffectId;

void main() {
  final catalog = EffectCatalog.fromJson(File('assets/protocol/catalog.json').readAsStringSync());

  test('bundled catalog is in sync with protocol/effects/catalog.json', () {
    expect(
      File('assets/protocol/catalog.json').readAsStringSync(),
      File('../protocol/effects/catalog.json').readAsStringSync(),
      reason: 'run `dart run tool/sync_protocol.dart`',
    );
  });

  test('catalog ids are valid and every effect has a mobile renderer', () {
    expect(catalog.effects, hasLength(8));
    for (final e in catalog.effects) {
      expect(isEffectId(e.id), isTrue, reason: e.id);
      expect(renderers.containsKey(e.id), isTrue, reason: 'no renderer for ${e.id}');
    }
    expect(renderers.keys.toSet(), catalog.effects.map((e) => e.id).toSet());
  });

  test('canvas simulations run a full timeline without throwing', () async {
    for (final id in ['rainbow', 'lightning', 'celebration', 'matrix', 'fireworks']) {
      for (final intensity in [0.0, 0.5, 1.0]) {
        final sim = await renderers[id]!(intensity, false);
        const size = Size(390, 844);
        for (var i = 0; i <= 360; i++) {
          sim.update(i / 60, 1 / 60, i / 360, size);
        }
        sim.dispose();
      }
    }
  });

  testWidgets('shell renders the catalog and an empty device list before connecting', (tester) async {
    final identity = await Identity.fromSeed(List.filled(32, 3));
    final engine = SynqEngine(
      api: ApiClient(
        baseUrl: 'http://127.0.0.1:9',
        identity: identity,
        device: const DeviceInfo(name: 'Test Phone', platform: 'ios', appVersion: '0'),
      ),
      identity: identity,
      catalog: catalog,
    );
    addTearDown(engine.dispose);
    // iPhone-sized viewport so the whole home screen is laid out.
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(SynqApp(engine: engine));
    await tester.pump();

    expect(find.text('Test Phone'), findsOneWidget);
    expect(find.text('Connecting…'), findsOneWidget);
    expect(find.text('No paired devices yet'), findsOneWidget);
    expect(find.text('Cosmic Portal'), findsOneWidget);

    await tester.tap(find.text('Effects'));
    await tester.pumpAndSettle();
    expect(find.text('Tap to send. Long-press to preview on this phone.'), findsOneWidget);

    engine.connection = SynqConnection.offline;
    engine.notifyListeners();
    await tester.tap(find.text('Devices'));
    await tester.pumpAndSettle();
    expect(find.text('Offline · retrying'), findsOneWidget);
  });
}
