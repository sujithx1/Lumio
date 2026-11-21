// The mobile client core: relay connection, peers, presence, pairing events and effects in both directions.
//
// Incoming effects pass, in order: schema validation -> addressed to us -> freshness -> replay ->
// known paired sender -> Ed25519 signature -> trusted catalog -> not busy. Only then does the UI render.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../effects/catalog.dart';
import '../protocol/canonical.dart';
import '../protocol/message.dart' hide DeviceSummary;
import 'api.dart';
import 'identity.dart';

enum LumioConnection { connecting, online, offline, revoked }

class IncomingEffect {
  const IncomingEffect({
    required this.eventId,
    required this.fromDeviceId,
    required this.fromName,
    required this.effectId,
    required this.duration,
    required this.intensity,
    required this.sound,
  });
  final String eventId;
  final String fromDeviceId;
  final String fromName;
  final String effectId;
  final int duration;
  final double intensity;
  final bool sound;
}

sealed class CoreEvent {
  const CoreEvent();
}

final class PairRequestEvent extends CoreEvent {
  const PairRequestEvent(this.pairingId, this.claimant, this.sas);
  final String pairingId;
  final DeviceSummary claimant;
  final String sas;
}

final class PairApprovedEvent extends CoreEvent {
  const PairApprovedEvent(this.peer);
  final DeviceSummary peer;
}

final class PairRejectedEvent extends CoreEvent {
  const PairRejectedEvent(this.pairingId);
  final String pairingId;
}

final class PairRevokedEvent extends CoreEvent {
  const PairRevokedEvent(this.peerDeviceId, this.peerName);
  final String peerDeviceId;
  final String peerName;
}

final class EffectIncomingEvent extends CoreEvent {
  const EffectIncomingEvent(this.effect);
  final IncomingEffect effect;
}

final class EffectRejectedEvent extends CoreEvent {
  const EffectRejectedEvent(this.fromName, this.reason);
  final String fromName;
  final String reason;
}

final class DeliveryEvent extends CoreEvent {
  const DeliveryEvent(this.eventId, this.status, [this.detail]);
  final String eventId;
  final String status;
  final String? detail;
}

final class ErrorEvent extends CoreEvent {
  const ErrorEvent(this.message);
  final String message;
}

const _messageTtlMs = 30000;
const _clockSkewMs = 30000;
const _heartbeatInterval = Duration(seconds: 20);
const _heartbeatTimeout = Duration(seconds: 45);
const _closeReplaced = 4002;
const _closeRevoked = 4003;

class LumioEngine extends ChangeNotifier {
  LumioEngine({required this.api, required this.identity, required this.catalog});

  final ApiClient api;
  final Identity identity;
  final EffectCatalog catalog;

  DeviceSummary? me;
  LumioConnection connection = LumioConnection.connecting;
  String? connectionDetail;
  final Map<String, PeerRecord> _peers = {};
  List<RecentEffect> recent = const [];
  final Map<String, DeliveryEvent> deliveries = {};

  final _events = StreamController<CoreEvent>.broadcast();
  Stream<CoreEvent> get events => _events.stream;

  final Map<String, int> _seen = {};
  final Map<String, String> _sent = {};
  IncomingEffect? _active;

  WebSocket? _ws;
  bool _running = false;
  Completer<void>? _wake;

  List<PeerRecord> get peers =>
      _peers.values.toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  bool get isOnline => connection == LumioConnection.online;

  void _emit(CoreEvent e) {
    if (!_events.isClosed) _events.add(e);
  }

  void _setConnection(LumioConnection state, [String? detail]) {
    if (connection == state && connectionDetail == detail) return;
    connection = state;
    connectionDetail = detail;
    if (state != LumioConnection.online) {
      for (final p in _peers.values) {
        p.online = false;
      }
    }
    notifyListeners();
  }

  // ---------------------------------------------------------------- connection

  /// Starts the reconnecting relay loop. Runs until [dispose] or the device is revoked.
  void start() {
    if (_running) return;
    _running = true;
    unawaited(_loop());
  }

  /// Skips any pending backoff (e.g. when the app returns to the foreground).
  void reconnectNow() {
    final ws = _ws;
    if (ws != null && isOnline) {
      _sendRaw(_envelope('HEARTBEAT', 'server', {}));
      return;
    }
    _wake?.complete();
  }

  Future<void> _loop() async {
    var backoff = const Duration(seconds: 1);
    final rng = math.Random();
    while (_running) {
      _setConnection(LumioConnection.connecting);
      final started = DateTime.now();
      final outcome = await _connectOnce();
      if (DateTime.now().difference(started) > const Duration(seconds: 60)) backoff = const Duration(seconds: 1);
      if (!_running) return;
      Duration wait;
      switch (outcome) {
        case _Outcome.revoked:
          _setConnection(LumioConnection.revoked, 'This device was removed from Lumio.');
          _running = false;
          return;
        case _Outcome.replaced:
          _setConnection(LumioConnection.offline, 'Lumio is open elsewhere with this identity.');
          wait = const Duration(seconds: 30);
        case _Outcome.dropped:
          _setConnection(LumioConnection.offline, connectionDetail ?? 'Disconnected.');
          wait = backoff;
      }
      _wake = Completer<void>();
      await Future.any([Future<void>.delayed(wait + Duration(milliseconds: rng.nextInt(750))), _wake!.future]);
      _wake = null;
      backoff = Duration(milliseconds: math.min(backoff.inMilliseconds * 2, 30000));
    }
  }

  String _wsUrl() {
    final uri = Uri.parse(api.baseUrl);
    return uri.replace(scheme: uri.scheme == 'https' ? 'wss' : 'ws', path: '/v1/ws').toString();
  }

  Future<_Outcome> _connectOnce() async {
    final Session session;
    try {
      session = await api.session();
    } on ApiException catch (e) {
      if (e.isRevoked) return _Outcome.revoked;
      connectionDetail = e.message;
      return _Outcome.dropped;
    }
    if (me?.deviceId != session.device.deviceId || me?.name != session.device.name) {
      me = session.device;
      notifyListeners();
    }

    final WebSocket ws;
    try {
      ws = await WebSocket.connect(_wsUrl()).timeout(const Duration(seconds: 10));
    } catch (_) {
      connectionDetail = "Can't reach the relay.";
      return _Outcome.dropped;
    }
    _ws = ws;
    final done = Completer<void>();
    var authed = false;
    var lastFrame = DateTime.now();
    Timer? heartbeat;
    final authTimer = Timer(const Duration(seconds: 5), () {
      if (!authed) ws.close();
    });

    ws.listen(
      (data) async {
        lastFrame = DateTime.now();
        if (data is! String) return;
        if (!authed) {
          if (!data.contains('"AUTH_OK"')) {
            await ws.close();
            return;
          }
          authed = true;
          authTimer.cancel();
          _setConnection(LumioConnection.online);
          heartbeat = Timer.periodic(_heartbeatInterval, (_) {
            if (DateTime.now().difference(lastFrame) > _heartbeatTimeout) {
              connectionDetail = 'The relay stopped responding.';
              ws.close();
              return;
            }
            _sendRaw(_envelope('HEARTBEAT', 'server', {}));
          });
          unawaited(refreshPeers().catchError((_) {}));
          unawaited(refreshRecent());
          return;
        }
        await handleFrame(data);
      },
      onDone: () => done.isCompleted ? null : done.complete(),
      onError: (_) => done.isCompleted ? null : done.complete(),
      cancelOnError: true,
    );

    ws.add(
      jsonEncode({
        ..._envelope('AUTH', 'server', {'token': session.token}),
        'from': session.device.deviceId,
      }),
    );

    await done.future;
    authTimer.cancel();
    heartbeat?.cancel();
    _ws = null;
    final code = ws.closeCode;
    if (code == _closeRevoked) return _Outcome.revoked;
    if (code == _closeReplaced) return _Outcome.replaced;
    if (authed) connectionDetail = 'Connection lost.';
    return _Outcome.dropped;
  }

  // ---------------------------------------------------------------- API helpers

  Future<void> refreshPeers() async {
    final records = await api.devices();
    _peers
      ..clear()
      ..addEntries(records.map((r) => MapEntry(r.deviceId, r)));
    notifyListeners();
  }

  Future<void> refreshRecent() async {
    try {
      recent = await api.recentEffects();
      notifyListeners();
    } on ApiException {
      // Offline: keep what we have.
    }
  }

  Future<void> rename(String name) async {
    me = await api.rename(name.trim());
    notifyListeners();
  }

  Future<void> unpair(String deviceId) async {
    await api.unpair(deviceId);
    _peers.remove(deviceId);
    notifyListeners();
  }

  // ---------------------------------------------------------------- outgoing

  Map<String, dynamic> _envelope(String type, String to, Map<String, dynamic> payload) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return {
      'v': protocolVersion,
      'id': uuidV7(),
      'type': type,
      'from': me?.deviceId ?? '',
      'to': to,
      'createdAt': now,
      'expiresAt': now + _messageTtlMs,
      'payload': payload,
    };
  }

  Future<Map<String, dynamic>> _signed(String type, String to, Map<String, dynamic> payload) async {
    final msg = _envelope(type, to, payload);
    msg['sig'] = await identity.sign(signingInput(msg));
    return msg;
  }

  bool _sendRaw(Map<String, dynamic> msg) {
    final ws = _ws;
    if (ws == null) return false;
    ws.add(jsonEncode(msg));
    return true;
  }

  /// Signs and sends an effect to a paired device. Returns the event id.
  Future<String> sendEffect(String to, String effectId, int duration, double intensity, bool sound) async {
    final spec = catalog.byId(effectId);
    if (spec == null) throw StateError('Unknown effect.');
    if (!_peers.containsKey(to)) throw StateError('That device is not paired.');
    if (!isOnline) throw StateError("You're offline. Effects can be sent once Lumio reconnects.");
    final msg = await _signed('EFFECT_TRIGGER', to, {
      'effectId': effectId,
      'duration': duration.clamp(spec.minDuration, spec.maxDuration),
      'intensity': roundIntensity(intensity),
      'sound': sound,
    });
    final eventId = msg['id'] as String;
    _sent[eventId] = to;
    _sendRaw(msg);
    _delivery(DeliveryEvent(eventId, 'sending'));
    return eventId;
  }

  void _delivery(DeliveryEvent e) {
    deliveries[e.eventId] = e;
    _emit(e);
    if (const {'completed', 'failed', 'receiver_offline'}.contains(e.status)) unawaited(refreshRecent());
    notifyListeners();
  }

  Future<void> _ack(String type, String to, String eventId, [EffectFailureReason? reason]) async {
    final msg = await _signed(type, to, {'eventId': eventId, 'reason': ?reason?.wire});
    _sendRaw(msg);
  }

  /// Called when the effect screen closes. Acknowledges completion (or failure) to the sender.
  Future<void> finishIncoming(String eventId, {required bool completed}) async {
    final active = _active;
    if (active == null || active.eventId != eventId) return;
    _active = null;
    await _ack(
      completed ? 'EFFECT_COMPLETED' : 'EFFECT_FAILED',
      active.fromDeviceId,
      eventId,
      completed ? null : EffectFailureReason.renderError,
    );
    unawaited(refreshRecent());
  }

  // ---------------------------------------------------------------- incoming

  /// Handles one raw frame from the relay (or, later, a LAN peer).
  Future<void> handleFrame(String frame) async {
    final LumioMessage msg;
    final Map<String, dynamic> raw;
    try {
      msg = parseMessage(frame);
      raw = jsonDecode(frame) as Map<String, dynamic>;
    } on ProtocolException catch (e) {
      debugPrint('dropped invalid frame: $e');
      return;
    }

    switch (msg.body) {
      case AuthBody() || AuthOkBody() || HeartbeatBody():
        break;
      case DevicePairRequestBody(:final pairingId, :final claimant, :final sas):
        _emit(
          PairRequestEvent(
            pairingId,
            DeviceSummary(deviceId: claimant.deviceId, name: claimant.name, platform: claimant.platform.name),
            sas,
          ),
        );
      case DevicePairApprovedBody(:final peer):
        _emit(PairApprovedEvent(DeviceSummary(deviceId: peer.deviceId, name: peer.name, platform: peer.platform.name)));
        await refreshPeers().catchError((_) {});
      case DevicePairRejectedBody(:final pairingId):
        _emit(PairRejectedEvent(pairingId));
      case DevicePairRevokedBody(:final peerDeviceId):
        final removed = _peers.remove(peerDeviceId);
        _emit(PairRevokedEvent(peerDeviceId, removed?.name ?? 'A device'));
        notifyListeners();
      case DeviceOnlineBody(:final deviceId):
        _presence(deviceId, true, null);
      case DeviceOfflineBody(:final deviceId, :final lastSeenAt):
        _presence(deviceId, false, lastSeenAt);
      case EffectTriggerBody():
        await _handleTrigger(msg, raw);
      case EffectReceivedBody(:final eventId):
        await _handleAck(msg, raw, eventId, 'received');
      case EffectCompletedBody(:final eventId):
        await _handleAck(msg, raw, eventId, 'completed');
      case EffectFailedBody(:final eventId, :final reason):
        await _handleAck(msg, raw, eventId, 'failed', reason.wire);
      case EffectStatusBody(:final eventId, :final status):
        if (_sent.containsKey(eventId)) _delivery(DeliveryEvent(eventId, status.wire));
      case ErrorBody(:final message, :final refId):
        if (refId != null && _sent.remove(refId) != null) {
          _delivery(DeliveryEvent(refId, 'failed', message));
        } else {
          _emit(ErrorEvent(message));
        }
    }
  }

  void _presence(String deviceId, bool online, int? lastSeenAt) {
    final p = _peers[deviceId];
    if (p == null) {
      unawaited(refreshPeers().catchError((_) {}));
      return;
    }
    p.online = online;
    if (lastSeenAt != null) p.lastSeenAt = lastSeenAt;
    notifyListeners();
  }

  Future<PeerRecord?> _verifiedPeer(LumioMessage msg, Map<String, dynamic> raw) async {
    final peer = _peers[msg.from];
    final sig = msg.sig;
    if (peer == null || sig == null) return null;
    return await verifySignature(peer.publicKey, signingInput(raw), sig) ? peer : null;
  }

  bool _acceptOnce(String id, int expiresAt, int now) {
    _seen.removeWhere((_, until) => until < now);
    if (_seen.containsKey(id)) return false;
    if (_seen.length > 10000) _seen.remove(_seen.keys.first);
    _seen[id] = expiresAt + _clockSkewMs;
    return true;
  }

  Future<void> _handleTrigger(LumioMessage msg, Map<String, dynamic> raw) async {
    final body = msg.body as EffectTriggerBody;
    if (msg.to != me?.deviceId) return;
    final now = DateTime.now().millisecondsSinceEpoch;

    Future<void> reject(String name, EffectFailureReason reason, {bool ack = true}) async {
      debugPrint('rejected effect ${msg.id} from ${msg.from}: ${reason.wire}');
      _emit(EffectRejectedEvent(name, reason.wire));
      if (ack) await _ack('EFFECT_FAILED', msg.from, msg.id, reason);
    }

    if (msg.createdAt > now + _clockSkewMs || msg.expiresAt + _clockSkewMs < now) {
      return reject('A device', EffectFailureReason.expired);
    }
    if (!_acceptOnce(msg.id, msg.expiresAt, now)) return; // Duplicate delivery: already handled.
    if (!_peers.containsKey(msg.from)) await refreshPeers().catchError((_) {});
    final peer = await _verifiedPeer(msg, raw);
    if (peer == null) {
      final known = _peers.containsKey(msg.from);
      return reject(
        'Unknown device',
        known ? EffectFailureReason.invalidSignature : EffectFailureReason.notPaired,
        ack: known,
      );
    }
    final spec = catalog.byId(body.effectId);
    if (spec == null) return reject(peer.name, EffectFailureReason.unknownEffect);
    if (_active != null) return reject(peer.name, EffectFailureReason.busy);

    final effect = IncomingEffect(
      eventId: msg.id,
      fromDeviceId: peer.deviceId,
      fromName: peer.name,
      effectId: spec.id,
      duration: body.duration.clamp(spec.minDuration, spec.maxDuration),
      intensity: body.intensity,
      sound: body.sound,
    );
    _active = effect;
    await _ack('EFFECT_RECEIVED', peer.deviceId, msg.id);
    _emit(EffectIncomingEvent(effect));
  }

  Future<void> _handleAck(
    LumioMessage msg,
    Map<String, dynamic> raw,
    String eventId,
    String status, [
    String? detail,
  ]) async {
    if (_sent[eventId] != msg.from || await _verifiedPeer(msg, raw) == null) {
      debugPrint('ignored $status ack for unknown or unverifiable event $eventId');
      return;
    }
    if (status != 'received') _sent.remove(eventId);
    _delivery(DeliveryEvent(eventId, status, detail));
  }

  @override
  void dispose() {
    _running = false;
    _wake?.complete();
    _ws?.close();
    api.close();
    unawaited(_events.close());
    super.dispose();
  }
}

enum _Outcome { dropped, replaced, revoked }
