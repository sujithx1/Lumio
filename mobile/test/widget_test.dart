import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lumio/app.dart';
import 'package:lumio/core/api.dart';
import 'package:lumio/core/engine.dart';
import 'package:lumio/core/identity.dart';
import 'package:lumio/effects/catalog.dart';
import 'package:lumio/effects/handoff.dart';
import 'package:lumio/effects/renderers.dart';
import 'package:lumio/protocol/message.dart' show isEffectId;
import 'package:lumio/widgets/flick_card.dart';

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
    expect(catalog.effects, hasLength(19));
    for (final e in catalog.effects) {
      expect(isEffectId(e.id), isTrue, reason: e.id);
      expect(renderers.containsKey(e.id), isTrue, reason: 'no renderer for ${e.id}');
    }
    expect(renderers.keys.toSet(), catalog.effects.map((e) => e.id).toSet());
  });

  test('canvas simulations run a full timeline without throwing', () async {
    const canvasEffects = [
      'rainbow',
      'lightning',
      'celebration',
      'matrix',
      'fireworks',
      'cosmic-portal',
      'spiral-orb',
      'power-aura',
      'giants-wall',
      'pirate-voyage',
      'cartoon-parade',
      'tiny-ronin',
      'boing',
      'kaze',
      'pebble',
      'snooze',
    ];
    for (final id in canvasEffects) {
      for (final intensity in [0.0, 0.5, 1.0]) {
        final sim = await renderers[id]!(intensity, false);
        const size = Size(390, 844);
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        for (var i = 0; i <= 360; i++) {
          sim.update(i / 60, 1 / 60, i / 360, size);
          if (i % 30 == 0) sim.paint(canvas, size, i / 60, i / 360);
        }
        recorder.endRecording().dispose();
        sim.dispose();
      }
    }
  });

  testWidgets('shell renders the catalog and an empty device list before connecting', (tester) async {
    final identity = await Identity.fromSeed(List.filled(32, 3));
    final engine = LumioEngine(
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

    await tester.pumpWidget(LumioApp(engine: engine));
    await tester.pump();

    expect(find.text('Test Phone'), findsOneWidget);
    expect(find.text('Connecting…'), findsOneWidget);
    expect(find.text('No paired devices yet'), findsOneWidget);
    expect(find.text('Cosmic Portal'), findsOneWidget);

    await tester.tap(find.text('Effects'));
    await tester.pumpAndSettle();
    expect(find.text('Tap to send. Long-press to preview on this phone.'), findsOneWidget);

    engine.connection = LumioConnection.offline;
    engine.notifyListeners();
    await tester.tap(find.text('Devices'));
    await tester.pumpAndSettle();
    expect(find.text('Offline · retrying'), findsOneWidget);
  });

  testWidgets('flicking the card up sends; a short drag springs back', (tester) async {
    var sent = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 320,
              child: FlickCard(effect: catalog.effects.first, enabled: true, onFlick: () => sent++),
            ),
          ),
        ),
      ),
    );
    final card = find.byType(FlickCard);
    await tester.drag(card, const Offset(0, -30));
    await tester.pumpAndSettle();
    expect(sent, 0);
    expect(find.text('Flick up toward your computer'), findsOneWidget);

    await tester.fling(card, const Offset(0, -200), 1500);
    await tester.pumpAndSettle();
    expect(sent, 1);
    // The card flies away, then returns ready for another flick.
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('Flick up toward your computer'), findsOneWidget);
  });

  testWidgets('a disabled card explains why and ignores flicks', (tester) async {
    var sent = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FlickCard(
            effect: catalog.effects.first,
            enabled: false,
            hint: 'Studio PC is offline',
            onFlick: () => sent++,
          ),
        ),
      ),
    );
    await tester.fling(find.byType(FlickCard), const Offset(0, -200), 1500);
    await tester.pumpAndSettle();
    expect(sent, 0);
    expect(find.text('Studio PC is offline'), findsOneWidget);
  });

  test('departures and arrivals paint every frame without throwing', () {
    const size = Size(390, 844);
    for (final e in catalog.effects) {
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      for (var ms = 0; ms <= departureDuration.inMilliseconds; ms += 50) {
        final time = AlwaysStoppedAnimation<double>(ms / departureDuration.inMilliseconds);
        DeparturePainter(effect: e, time: time, origin: const Offset(195, 600)).paint(canvas, size);
        DeparturePainter(effect: e, time: time).paint(canvas, size);
        ArrivalPainter(effect: e, seconds: ms / 1000).paint(canvas, size);
      }
      recorder.endRecording().dispose();
    }
    for (final id in ['tiny-ronin', 'boing', 'kaze', 'pebble', 'snooze']) {
      expect(ArrivalPainter.appliesTo(catalog.byId(id)!), isFalse, reason: '$id makes their own entrance');
    }
    expect(ArrivalPainter.appliesTo(catalog.byId('aurora')!), isTrue);
  });

  testWidgets('the trigger is sent only once the departure crosses the top edge, without blocking taps', (
    tester,
  ) async {
    var sent = 0;
    var taps = 0;
    late BuildContext ctx;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              ctx = context;
              return Center(
                child: ElevatedButton(onPressed: () => taps++, child: const Text('Underneath')),
              );
            },
          ),
        ),
      ),
    );

    final result = departThen(ctx, catalog.byId('cosmic-portal')!, () async {
      sent++;
      return 'event-id';
    });
    await tester.pump();
    expect(find.byType(CustomPaint), findsWidgets);

    await tester.pump(departureSendDelay - const Duration(milliseconds: 50));
    expect(sent, 0, reason: 'still on its way to the top edge');

    // The departure is drawn over the app but never swallows touches.
    await tester.tap(find.text('Underneath'));
    expect(taps, 1);

    await tester.pump(const Duration(milliseconds: 60));
    expect(sent, 1);
    expect(await result, 'event-id');

    // A second send during a departure just goes (no queue, no lock).
    unawaited(departThen(ctx, catalog.byId('tiny-ronin')!, () async => sent++));
    await tester.pump(departureSendDelay + const Duration(milliseconds: 10));
    expect(sent, 2);

    // Both overlays remove themselves.
    await tester.pumpAndSettle();
    expect(find.byWidgetPredicate((w) => w is CustomPaint && w.painter is DeparturePainter), findsNothing);
  });
}
