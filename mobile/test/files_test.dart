import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lumio/app.dart';
import 'package:lumio/core/api.dart';
import 'package:lumio/core/engine.dart';
import 'package:lumio/core/files.dart';
import 'package:lumio/core/identity.dart';
import 'package:lumio/core/settings.dart';
import 'package:lumio/effects/catalog.dart';
import 'package:lumio/protocol/message.dart';
import 'package:lumio/screens/devices_screen.dart';
import 'package:lumio/widgets/flick_card.dart';
import 'package:lumio/widgets/send_files_sheet.dart';

void main() {
  final catalog = EffectCatalog.fromJson(File('assets/protocol/catalog.json').readAsStringSync());

  group('sanitizeFileName', () {
    test('keeps ordinary and unicode names', () {
      expect(sanitizeFileName('Beach day.jpg'), 'Beach day.jpg');
      expect(sanitizeFileName('Résumé – 履歴書.pdf'), 'Résumé – 履歴書.pdf');
    });
    test('drops paths, control and reserved characters and leading dots', () {
      expect(sanitizeFileName('../../.ssh/authorized_keys'), 'authorized_keys');
      expect(sanitizeFileName(r'..\evil.exe'), 'evil.exe');
      expect(sanitizeFileName('a\nb\u0000c.txt'), 'abc.txt');
      expect(sanitizeFileName('.hidden'), 'hidden');
      expect(sanitizeFileName('what?:*.txt'), 'what.txt');
    });
    test('never returns an empty or dot-only name', () {
      for (final bad in ['', '.', '..', '...', '/', '   ', '\u0001']) {
        expect(sanitizeFileName(bad), 'file', reason: jsonEncode(bad));
      }
    });
    test('caps long names but keeps the extension', () {
      final name = sanitizeFileName('${'a' * 300}.jpeg');
      expect(name.length, lessThanOrEqualTo(120));
      expect(name, endsWith('.jpeg'));
      expect(isFileName(name), isTrue);
    });
  });

  test('uniqueFileName numbers duplicates before the extension', () async {
    final dir = await Directory.systemTemp.createTemp('lumio-unique-');
    addTearDown(() => dir.delete(recursive: true));
    expect(uniqueFileName(dir, 'photo.jpg'), 'photo.jpg');
    File('${dir.path}/photo.jpg').writeAsStringSync('1');
    expect(uniqueFileName(dir, 'photo.jpg'), 'photo (1).jpg');
    File('${dir.path}/photo (1).jpg').writeAsStringSync('2');
    expect(uniqueFileName(dir, 'photo.jpg'), 'photo (2).jpg');
    File('${dir.path}/README').writeAsStringSync('3');
    expect(uniqueFileName(dir, 'README'), 'README (1)');
  });

  test('file and streaming hashes match the SHA-256 test vector', () async {
    final dir = await Directory.systemTemp.createTemp('lumio-hash-');
    addTearDown(() => dir.delete(recursive: true));
    const expected = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    final file = File('${dir.path}/t')..writeAsStringSync('test');
    expect(await sha256OfFile(file), expected);
    final streaming = StreamingSha256()
      ..add(utf8.encode('te'))
      ..add(utf8.encode('st'));
    expect(streaming.close(), expected);
    expect(StreamingSha256().close(), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('media detection and MIME types come from the extension', () {
    expect(isImageName('IMG_0001.HEIC'), isTrue);
    expect(isVideoName('clip.MOV'), isTrue);
    expect(isImageName('notes.txt') || isVideoName('notes.txt'), isFalse);
    expect(isImageName('jpg'), isFalse);
    expect(mimeForName('a.jpg'), 'image/jpeg');
    expect(mimeForName('a.unknown'), 'application/octet-stream');
    for (final n in ['a.jpg', 'b.docx', 'c', 'd.pptx']) {
      expect(isMimeType(mimeForName(n)), isTrue, reason: n);
    }
    expect(formatBytes(512), '512 B');
    expect(formatBytes(1536), '1.5 KB');
    expect(formatBytes(25 * 1024 * 1024), '25 MB');
  });

  group('settings', () {
    test('default to cosmic-portal and saving to Photos', () async {
      final s = await LumioSettings.load(MemoryStore());
      expect(s.fileEffectId, 'cosmic-portal');
      expect(s.savePhotos, isTrue);
    });
    test('persist changes', () async {
      final store = MemoryStore();
      final s = await LumioSettings.load(store);
      s
        ..fileEffectId = 'aurora'
        ..savePhotos = false;
      await Future<void>.delayed(Duration.zero);
      final again = await LumioSettings.load(store);
      expect(again.fileEffectId, 'aurora');
      expect(again.savePhotos, isFalse);
    });
    test('fall back to defaults when the stored value is corrupt', () async {
      final store = MemoryStore();
      await store.write('lumio.settings', '{not json');
      expect((await LumioSettings.load(store)).fileEffectId, 'cosmic-portal');
      await store.write('lumio.settings', '{"fileEffectId": 3, "savePhotos": "yes"}');
      final s = await LumioSettings.load(store);
      expect(s.fileEffectId, 'cosmic-portal');
      expect(s.savePhotos, isTrue);
    });
  });

  test('decodes a file offer and its failure reasons', () {
    final fixture = jsonDecode(File('../protocol/fixtures/valid/file-offer.json').readAsStringSync())['message'];
    final body = parseMessage(jsonEncode(fixture)).body as FileOfferBody;
    expect(body.name, 'Beach day.jpg');
    expect(body.size, 2481903);
    expect(body.effectId, 'pirate-voyage');
    expect(isFileName('a/b'), isFalse);
    expect(isFileName(r'a\b'), isFalse);
    expect(isFileName('a' * 256), isFalse);
    expect(FileFailureReason.values.map((r) => r.wire), contains('checksum_mismatch'));
  });

  group('widgets', () {
    late LumioEngine engine;
    late LumioSettings settings;

    setUp(() async {
      final identity = await Identity.fromSeed(List.filled(32, 5));
      settings = LumioSettings.memory(fileEffectId: 'pirate-voyage');
      engine = LumioEngine(
        api: ApiClient(
          baseUrl: 'http://127.0.0.1:9',
          identity: identity,
          device: const DeviceInfo(name: 'Test Phone', platform: 'ios', appVersion: '0'),
        ),
        identity: identity,
        catalog: catalog,
        settings: settings,
      );
      engine.debugSetPeers([
        PeerRecord(
          deviceId: '0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7b',
          name: 'Studio Mac',
          platform: 'macos',
          publicKey: 'A' * 43,
          online: true,
          lastSeenAt: null,
          pairedAt: 0,
        ),
      ]);
    });
    tearDown(() => engine.dispose());

    Widget host(Widget child) => LumioScope(
      engine: engine,
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child))),
    );

    testWidgets('send files sheet lists files, total and the default file effect', (tester) async {
      tester.view.physicalSize = const Size(1179, 2556);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        host(
          const SendFilesSheet(
            deviceId: '0193a2b4-5d6e-7f80-9a1b-2c3d4e5f6a7b',
            files: [
              PickedFile(path: '/tmp/a.jpg', name: 'Beach day.jpg', size: 2048),
              PickedFile(path: '/tmp/b.pdf', name: 'Plan.pdf', size: 1024),
            ],
          ),
        ),
      );
      expect(find.text('Send to Studio Mac'), findsOneWidget);
      expect(find.text('2 files · 3.0 KB'), findsOneWidget);
      expect(find.text('Beach day.jpg'), findsOneWidget);
      expect(find.text('Plan.pdf'), findsOneWidget);
      expect(find.text('Pirate Voyage'), findsOneWidget);
      expect(find.text('Plays on Studio Mac'), findsOneWidget);
      // Not connected to the relay in tests: sending is disabled and the card says why.
      expect(tester.widget<FlickCard>(find.byType(FlickCard)).enabled, isFalse);
      expect(find.text('Reconnecting…'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send 2 files')).onPressed, isNull);
    });

    testWidgets('file settings show the chosen effect and toggle Photos', (tester) async {
      await tester.pumpWidget(host(const FileSettingsCard()));
      expect(find.text('Effect when you send files'), findsOneWidget);
      expect(find.text('Pirate Voyage'), findsOneWidget);
      expect(find.textContaining('On My iPhone › Lumio › Received'), findsOneWidget);
      await tester.tap(find.byType(Switch));
      await tester.pump();
      expect(settings.savePhotos, isFalse);
      settings.fileEffectId = 'aurora';
      await tester.pump();
      expect(find.text('Aurora'), findsOneWidget);
    });
  });

  test('outgoing progress reflects bytes sent', () {
    final f = OutgoingFile(localId: 'x', to: 'y', name: 'a', size: 200)..sent = 50;
    expect(f.progress, 0.25);
    expect(f.finished, isFalse);
    f.status = OutgoingFileStatus.delivered;
    expect(f.finished, isTrue);
  });
}
