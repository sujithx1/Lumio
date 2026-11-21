// Two real mobile cores talking through a real relay server.
// Runs only when LUMIO_TEST_SERVER_URL is set (see `make test-e2e`).
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lumio/core/api.dart';
import 'package:lumio/core/engine.dart';
import 'package:lumio/core/identity.dart';
import 'package:lumio/effects/catalog.dart';

Future<LumioEngine> startEngine(String base, String name, EffectCatalog catalog) async {
  final identity = await Identity.loadOrCreate(MemoryStore());
  final api = ApiClient(
    baseUrl: base,
    identity: identity,
    device: DeviceInfo(name: name, platform: 'ios', appVersion: '0.1.0-test'),
  );
  return LumioEngine(api: api, identity: identity, catalog: catalog)..start();
}

Future<T> next<T extends CoreEvent>(LumioEngine e, [bool Function(T)? where]) =>
    e.events.where((x) => x is T && (where?.call(x) ?? true)).cast<T>().first.timeout(const Duration(seconds: 10));

Future<void> until(LumioEngine e, bool Function() condition) async {
  final deadline = DateTime.now().add(const Duration(seconds: 10));
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) throw TimeoutException('condition not met');
    await Future<void>.delayed(const Duration(milliseconds: 25));
  }
}

void main() {
  final base = Platform.environment['LUMIO_TEST_SERVER_URL'];

  test(
    'pair, send both ways, busy rejection, completion, unpair',
    () async {
      final catalog = EffectCatalog.fromJson(File('assets/protocol/catalog.json').readAsStringSync());
      final phone = await startEngine(base!, 'Test iPhone', catalog);
      final tablet = await startEngine(base, 'Test Android', catalog);
      addTearDown(phone.dispose);
      addTearDown(tablet.dispose);
      await until(phone, () => phone.isOnline && tablet.isOnline);

      // Pairing with matching SAS.
      final created = await phone.api.createPairing();
      final request = next<PairRequestEvent>(phone);
      final claimed = await tablet.api.claimPairing(created.code);
      final req = await request;
      expect(req.sas, claimed.sas);
      await phone.api.approvePairing(req.pairingId);
      await until(phone, () => phone.peers.any((p) => p.deviceId == tablet.me!.deviceId && p.online));
      await until(tablet, () => tablet.peers.any((p) => p.deviceId == phone.me!.deviceId));

      // phone -> tablet
      final incoming = next<EffectIncomingEvent>(tablet);
      final received = next<DeliveryEvent>(phone, (d) => d.status == 'received');
      final eventId = await phone.sendEffect(tablet.me!.deviceId, 'fireworks', 4000, 0.876, true);
      final effect = (await incoming).effect;
      expect(effect.eventId, eventId);
      expect(effect.fromName, 'Test iPhone');
      expect(effect.intensity, 0.88);
      await received;

      // Busy while showing.
      final busy = next<DeliveryEvent>(phone, (d) => d.status == 'failed');
      final second = await phone.sendEffect(tablet.me!.deviceId, 'rainbow', 3000, 1, false);
      expect((await busy).eventId, second);

      final completed = next<DeliveryEvent>(phone, (d) => d.status == 'completed' && d.eventId == eventId);
      await tablet.finishIncoming(eventId, completed: true);
      await completed;

      // tablet -> phone
      final back = next<EffectIncomingEvent>(phone);
      final backId = await tablet.sendEffect(phone.me!.deviceId, 'aurora', 3000, 0.5, false);
      expect((await back).effect.eventId, backId);
      final backDone = next<DeliveryEvent>(tablet, (d) => d.status == 'completed');
      await phone.finishIncoming(backId, completed: true);
      await backDone;

      // Unpair reaches the other side.
      final revoked = next<PairRevokedEvent>(tablet);
      await phone.unpair(tablet.me!.deviceId);
      expect((await revoked).peerDeviceId, phone.me!.deviceId);
    },
    skip: base == null ? 'LUMIO_TEST_SERVER_URL not set' : false,
    timeout: const Timeout(Duration(seconds: 60)),
  );
}
